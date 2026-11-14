import { json, type Env } from '../../../_lib/env'
import { errorResponse, hashIp, isSameOrigin, isUuid, readDeviceId } from '../../../_lib/request'
import { rest, SupabaseError } from '../../../_lib/supabase'

type LikeResult = { out_liked: boolean; out_like_count: number; out_rate_limited: boolean }

async function setLike(request: Request, env: Env, id: unknown, like: boolean): Promise<Response> {
  if (!isSameOrigin(request)) return json({ error: 'forbidden', message: '허용되지 않은 요청이에요.' }, 403)
  if (!isUuid(id)) return json({ error: 'not_found', message: '만화를 찾을 수 없어요.' }, 404)
  const deviceId = readDeviceId(request)
  if (!deviceId) {
    return json({ error: 'bad_device', message: '기기 정보를 확인하지 못했어요. 페이지를 새로고침한 뒤 다시 시도해 주세요.' }, 400)
  }

  try {
    const rows = await rest<LikeResult[]>(env, 'service', 'rpc/set_comic_like', {
      method: 'POST',
      body: JSON.stringify({
        p_comic_id: id,
        p_device_id: deviceId,
        p_ip_hash: await hashIp(request, env),
        p_like: like,
      }),
    })
    const r = rows[0]
    if (r.out_rate_limited) {
      return new Response(
        JSON.stringify({
          error: 'rate_limited',
          message: '너무 자주 누르고 있어요. 잠시 후 다시 시도해 주세요.',
          liked: r.out_liked,
          likeCount: r.out_like_count,
        }),
        { status: 429, headers: { 'content-type': 'application/json; charset=utf-8', 'retry-after': '600' } },
      )
    }
    return json({ liked: r.out_liked, likeCount: r.out_like_count })
  } catch (e) {
    if (e instanceof SupabaseError && e.detail.includes('comic_not_found')) {
      return json({ error: 'not_found', message: '이 만화는 더 이상 볼 수 없어요. 새로고침해 주세요.' }, 404)
    }
    return errorResponse(e, '좋아요를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.')
  }
}

export const onRequestPost: PagesFunction<Env, 'id'> = ({ request, env, params }) =>
  setLike(request, env, params.id, true)

export const onRequestDelete: PagesFunction<Env, 'id'> = ({ request, env, params }) =>
  setLike(request, env, params.id, false)
