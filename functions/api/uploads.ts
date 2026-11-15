import { json, requireBucket, type Env } from '../_lib/env'
import { TERMS_VERSION, UPLOAD_LIMITS as L } from '../_lib/limits'
import { errorResponse, hashIp, isSameOrigin, readDeviceId } from '../_lib/request'
import { afterUpload } from '../_lib/review'
import { rest } from '../_lib/supabase'
import { verifyTurnstile } from '../_lib/turnstile'
import { parseWebp } from '../_lib/webp'

const fail = (status: number, error: string, message: string) => json({ error, message }, status)

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// 누구나 만화를 올린다. 올린 만화는 '검수 대기(pending)'로만 저장되고 공개되지 않는다.
export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  if (!isSameOrigin(request)) return fail(403, 'forbidden', '허용되지 않은 요청이에요.')
  const deviceId = readDeviceId(request)
  if (!deviceId) {
    return fail(400, 'bad_device', '기기 정보를 확인하지 못했어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.')
  }
  if (Number(request.headers.get('content-length') ?? 0) > L.maxWebpBytes + 64 * 1024) {
    return fail(413, 'too_large', '파일이 너무 커요. 이미지를 줄여서 다시 올려 주세요.')
  }

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return fail(400, 'bad_request', '올린 내용을 읽지 못했어요. 다시 시도해 주세요.')
  }

  // 1) 입력 확인 (싼 것부터)
  if (form.get('terms') !== TERMS_VERSION) {
    return fail(400, 'terms_required', '약관에 동의해야 올릴 수 있어요.')
  }
  const nickname = String(form.get('nickname') ?? '').trim()
  const hasControlChar = Array.from(nickname).some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) === 127)
  if (!nickname || Array.from(nickname).length > L.nicknameMax || hasControlChar) {
    return fail(400, 'bad_nickname', `이름을 1~${L.nicknameMax}자로 입력해 주세요.`)
  }
  const email = String(form.get('email') ?? '').trim().toLowerCase()
  if (email && (email.length > L.emailMax || !EMAIL.test(email))) {
    return fail(400, 'bad_email', '이메일 형식이 올바르지 않아요. 비워 두어도 괜찮아요.')
  }

  const file = form.get('image')
  if (!(file instanceof File) || file.size === 0) {
    return fail(400, 'bad_image', '4컷 만화 이미지를 선택해 주세요.')
  }
  if (file.size > L.maxWebpBytes) {
    return fail(413, 'too_large', '파일이 너무 커요. 이미지를 줄여서 다시 올려 주세요.')
  }
  const bytes = new Uint8Array(await file.arrayBuffer())
  let info
  try {
    info = parseWebp(bytes)
  } catch {
    return fail(415, 'bad_image', '이미지를 확인하지 못했어요. 화면에서 이미지를 다시 선택해 주세요.')
  }
  const short = Math.min(info.width, info.height)
  const long = Math.max(info.width, info.height)
  if (info.animated) return fail(415, 'bad_image', '움직이는 이미지는 올릴 수 없어요.')
  if (short < L.minShortSide || long > L.maxLongSide) {
    return fail(400, 'bad_size', `이미지 크기가 맞지 않아요. 짧은 변 ${L.minShortSide}px 이상, 긴 변 ${L.maxLongSide}px 이하로 올려 주세요.`)
  }
  if (long / short > L.maxRatio) {
    return fail(400, 'bad_ratio', '이미지 비율이 너무 길어요. 가로세로 비율이 1:3 이내인 이미지를 올려 주세요.')
  }

  try {
    // 2) 봇 확인
    const token = String(form.get('cf-turnstile-response') ?? '')
    if (!token) return fail(403, 'captcha_required', '봇이 아닌지 확인하는 중이에요. 잠시 후 다시 눌러 주세요.')
    if (!(await verifyTurnstile(env, token, request.headers.get('cf-connecting-ip')))) {
      return fail(403, 'captcha_failed', '봇 확인에 실패했어요. 새로고침한 뒤 다시 시도해 주세요.')
    }

    // 3) 검수 대기로 저장 (하루 개수 제한 포함)
    const id = crypto.randomUUID()
    const imageKey = `comics/${id}.webp`
    const rows = await rest<{ out_created: boolean; out_rate_limited: boolean }[]>(env, 'service', 'rpc/create_pending_comic', {
      method: 'POST',
      body: JSON.stringify({
        p_id: id,
        p_image_key: imageKey,
        p_width: info.width,
        p_height: info.height,
        p_nickname: nickname,
        p_email: email || null,
        p_device_id: deviceId,
        p_ip_hash: await hashIp(request, env),
        p_terms_version: TERMS_VERSION,
        p_daily_limit: L.dailyPerIpAndDevice,
      }),
    })
    if (rows[0]?.out_rate_limited) {
      return new Response(
        JSON.stringify({
          error: 'daily_limit',
          message: `하루에 ${L.dailyPerIpAndDevice}개까지 올릴 수 있어요. 내일 다시 올려 주세요.`,
        }),
        { status: 429, headers: { 'content-type': 'application/json; charset=utf-8', 'retry-after': '3600' } },
      )
    }

    // 4) 이미지 저장. 실패하면 방금 만든 대기 건을 지워서 하루 개수에 세지 않는다.
    try {
      await requireBucket(env).put(imageKey, bytes, {
        httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=86400' },
      })
    } catch (e) {
      await rest(env, 'service', `comics?id=eq.${id}`, { method: 'DELETE', headers: { prefer: 'return=minimal' } }).catch(
        (cleanupError) => console.error('Failed to remove pending row after R2 failure:', id, cleanupError),
      )
      throw e
    }

    // 5) AI 검수와 알림 메일은 응답을 보낸 뒤 이어서 처리한다. 실패해도 업로드는 '검수 대기'로 남는다.
    waitUntil(
      afterUpload(env, { id, webp: bytes, nickname, email }).catch((e) => console.error('afterUpload failed:', id, e)),
    )

    return json({ id, status: 'pending' }, 201)
  } catch (e) {
    return errorResponse(e, '업로드하지 못했어요. 잠시 후 다시 시도해 주세요.')
  }
}
