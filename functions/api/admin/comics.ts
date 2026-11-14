import { json, type Env } from '../../_lib/env'
import { errorResponse, imageUrl, kstToday } from '../../_lib/request'
import { rest } from '../../_lib/supabase'

type Row = {
  id: string
  image_key: string
  like_count: number
  author_nickname: string | null
  published_at: string
  is_sample: boolean
}

// 오늘의 만화를 고를 수 있도록 승인된 만화 목록과 현재 지정을 돌려준다.
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  try {
    const [rows, picks] = await Promise.all([
      rest<Row[]>(
        env,
        'service',
        'comics?select=id,image_key,like_count,author_nickname,published_at,is_sample&status=eq.approved&order=published_at.desc&limit=100',
      ),
      rest<{ comic_id: string }[]>(env, 'service', `daily_picks?select=comic_id&pick_date=eq.${kstToday()}`),
    ])
    return json({
      today: kstToday(),
      pickedId: picks[0]?.comic_id ?? null,
      comics: rows.map((r) => ({
        id: r.id,
        imageUrl: imageUrl(r.image_key),
        likeCount: r.like_count,
        author: r.author_nickname,
        publishedAt: r.published_at,
        isSample: r.is_sample,
      })),
    })
  } catch (e) {
    return errorResponse(e, '목록을 불러오지 못했어요. 다시 시도해 주세요.')
  }
}
