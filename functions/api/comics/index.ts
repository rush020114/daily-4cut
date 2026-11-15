import { getPublicComics } from '../../_lib/comics'
import { json, type Env } from '../../_lib/env'
import { errorResponse, readDeviceId } from '../../_lib/request'
import { rest } from '../../_lib/supabase'

// 승인된 만화를 순서대로 돌려준다. 공개 목록(모두 같음)은 짧게 캐시하고, 이 기기의 좋아요 표시만 따로 읽는다.
// ?fresh=1 이면 캐시를 건너뛴다(당겨서 새로고침).
export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  try {
    const deviceId = readDeviceId(request)
    const fresh = new URL(request.url).searchParams.get('fresh') === '1'

    // 이 기기의 좋아요는 목록과 동시에 읽는다. (한 번의 왕복으로 끝나도록 만화 ID로 거르지 않고 최근 것을 받는다)
    const [list, likedRows] = await Promise.all([
      getPublicComics(env, waitUntil, { fresh }),
      deviceId
        ? rest<{ comic_id: string }[]>(env, 'service', `comic_likes?select=comic_id&device_id=eq.${deviceId}&order=created_at.desc&limit=500`)
        : Promise.resolve([] as { comic_id: string }[]),
    ])
    const likedIds = new Set(likedRows.map((r) => r.comic_id))

    return json({ comics: list.map((c) => ({ ...c, liked: likedIds.has(c.id) })) })
  } catch (e) {
    return errorResponse(e, '만화를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
  }
}
