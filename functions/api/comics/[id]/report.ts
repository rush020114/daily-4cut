import { notifyAdminHidden } from '../../../_lib/email'
import { json, type Env } from '../../../_lib/env'
import { errorResponse, hashIp, isSameOrigin, isUuid, readDeviceId } from '../../../_lib/request'
import { rest, SupabaseError } from '../../../_lib/supabase'

const REASONS = ['inappropriate', 'copyright', 'other']
// 서로 다른 기기·IP의 신고가 이만큼 쌓이면 자동으로 숨기고 관리자 확인을 기다린다
const HIDE_THRESHOLD = 3

type ReportResult = {
  out_reported: boolean
  out_already: boolean
  out_hidden: boolean
  out_rate_limited: boolean
}

export const onRequestPost: PagesFunction<Env, 'id'> = async ({ request, env, params, waitUntil }) => {
  if (!isSameOrigin(request)) return json({ error: 'forbidden', message: '허용되지 않은 요청이에요.' }, 403)
  if (!isUuid(params.id)) return json({ error: 'not_found', message: '만화를 찾을 수 없어요.' }, 404)
  const deviceId = readDeviceId(request)
  if (!deviceId) {
    return json({ error: 'bad_device', message: '기기 정보를 확인하지 못했어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.' }, 400)
  }
  const body = (await request.json().catch(() => null)) as { reason?: unknown } | null
  if (!body || typeof body.reason !== 'string' || !REASONS.includes(body.reason)) {
    return json({ error: 'bad_request', message: '신고 사유를 선택해 주세요.' }, 400)
  }

  try {
    const rows = await rest<ReportResult[]>(env, 'service', 'rpc/report_comic', {
      method: 'POST',
      body: JSON.stringify({
        p_comic_id: params.id,
        p_device_id: deviceId,
        p_ip_hash: await hashIp(request, env),
        p_reason: body.reason,
        p_threshold: HIDE_THRESHOLD,
      }),
    })
    const r = rows[0]
    if (r.out_rate_limited) {
      return json({ error: 'rate_limited', message: '신고를 너무 많이 보내셨어요. 내일 다시 시도해 주세요.' }, 429)
    }
    if (r.out_already) {
      return json({ error: 'already_reported', message: '이미 신고가 접수된 만화예요. 확인 후 조치할게요.' }, 409)
    }

    if (r.out_hidden) {
      waitUntil(notifyAdminHidden(env, { nickname: null }).catch((e) => console.error('Hidden mail failed:', params.id, e)))
    }
    return json({ reported: true, hidden: r.out_hidden })
  } catch (e) {
    if (e instanceof SupabaseError && e.detail.includes('comic_not_found')) {
      return json({ error: 'not_found', message: '이 만화는 더 이상 볼 수 없어요. 새로고침해 주세요.' }, 404)
    }
    return errorResponse(e, '신고를 보내지 못했어요. 잠시 후 다시 시도해 주세요.')
  }
}
