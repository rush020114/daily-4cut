import { json, type Env } from '../../_lib/env'
import { errorResponse, imageUrl, kstToday, readDeviceId } from '../../_lib/request'
import { rest } from '../../_lib/supabase'

type Ranked = {
  id: string
  image_key: string
  image_width: number | null
  image_height: number | null
  like_count: number
}

const COLUMNS = 'id,image_key,image_width,image_height,like_count'
const PAGE_SIZE = 50

// 승인된 만화를 순서대로 돌려준다.
// 1번째 = 오늘의 만화(관리자가 지정, 없으면 노출 점수 1위), 나머지는 노출 점수 순.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const [ranked, picks] = await Promise.all([
      rest<Ranked[]>(env, 'anon', `ranked_comics?select=${COLUMNS}&order=score.desc,published_at.desc&limit=${PAGE_SIZE}`),
      rest<{ comic_id: string }[]>(env, 'anon', `daily_picks?select=comic_id&pick_date=eq.${kstToday()}`),
    ])

    let list = ranked
    const pickId = picks[0]?.comic_id
    if (pickId) {
      let picked = list.find((c) => c.id === pickId)
      if (!picked) {
        // 지정한 만화가 점수 상위 목록 밖이어도 맨 앞에 둔다. 승인 취소 등으로 안 보이면 건너뛴다.
        picked = (await rest<Ranked[]>(env, 'anon', `ranked_comics?select=${COLUMNS}&id=eq.${pickId}`))[0]
      }
      if (picked) list = [picked, ...list.filter((c) => c.id !== pickId)]
    }

    const likedIds = new Set<string>()
    const deviceId = readDeviceId(request)
    if (deviceId && list.length) {
      const rows = await rest<{ comic_id: string }[]>(
        env,
        'service',
        `comic_likes?select=comic_id&device_id=eq.${deviceId}&comic_id=in.(${list.map((c) => c.id).join(',')})`,
      )
      for (const r of rows) likedIds.add(r.comic_id)
    }

    return json({
      comics: list.map((c) => ({
        id: c.id,
        imageUrl: imageUrl(c.image_key),
        width: c.image_width,
        height: c.image_height,
        likeCount: c.like_count,
        liked: likedIds.has(c.id),
      })),
    })
  } catch (e) {
    return errorResponse(e, '만화를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
  }
}
