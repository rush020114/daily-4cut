import { json, type Env } from '../../../_lib/env'
import { adminImageUrl, errorResponse, kstToday } from '../../../_lib/request'
import { rest } from '../../../_lib/supabase'

type Row = {
  id: string
  image_key: string
  status: string
  like_count: number
  author_nickname: string | null
  contact_email: string | null
  created_at: string
  published_at: string | null
  hidden_at: string | null
  report_cleared_at: string | null
  is_sample: boolean
  ai_result: { flagged?: boolean; flaggedCategories?: string[]; scores?: Record<string, number>; error?: string } | null
}

const COLUMNS =
  'id,image_key,status,like_count,author_nickname,contact_email,created_at,published_at,hidden_at,report_cleared_at,is_sample,ai_result'

// 공유 미리보기 카드(comics/<id>-og.jpg)가 이미 만들어진 만화 ID 들. 저장소 목록을 한 번에 읽는다.
async function listCardIds(env: Env): Promise<Set<string>> {
  const ids = new Set<string>()
  let cursor: string | undefined
  for (let page = 0; page < 20; page++) {
    const res = await env.COMIC_BUCKET.list({ prefix: 'comics/', limit: 1000, cursor })
    for (const o of res.objects) {
      const m = o.key.match(/^comics\/([0-9a-f-]{36})-og\.jpg$/i)
      if (m) ids.add(m[1].toLowerCase())
    }
    if (!res.truncated) break
    cursor = res.cursor
  }
  return ids
}

// 검수 화면용 목록: 상태별로 나눠서 돌려준다.
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const query = (status: string, order: string, limit: number) =>
    rest<Row[]>(env, 'service', `comics?select=${COLUMNS}&status=eq.${status}&order=${order}&limit=${limit}`)

  try {
    const [review, pending, hidden, rejected, approved, picks, cardIds] = await Promise.all([
      query('review', 'created_at.asc', 100),
      query('pending', 'created_at.asc', 100),
      query('hidden', 'hidden_at.desc', 100),
      query('rejected', 'reviewed_at.desc.nullslast', 30),
      query('approved', 'published_at.desc', 100),
      rest<{ comic_id: string }[]>(env, 'service', `daily_picks?select=comic_id&pick_date=eq.${kstToday()}`),
      listCardIds(env).catch((e) => {
        console.error('og card list failed:', e)
        return null // 목록을 못 읽었으면 화면이 '모름'으로 보여 준다
      }),
    ])

    // 숨겨진 만화는 관리자가 확인한 시각 이후의 신고만 보여 준다
    const reportsByComic = new Map<string, { reason: string }[]>()
    if (hidden.length) {
      const reports = await rest<{ comic_id: string; reason: string; created_at: string }[]>(
        env,
        'service',
        `comic_reports?select=comic_id,reason,created_at&comic_id=in.(${hidden.map((h) => h.id).join(',')})&order=created_at.desc&limit=500`,
      )
      for (const h of hidden) {
        const since = h.report_cleared_at ? Date.parse(h.report_cleared_at) : 0
        reportsByComic.set(
          h.id,
          reports.filter((r) => r.comic_id === h.id && Date.parse(r.created_at) > since),
        )
      }
    }

    const shape = (r: Row) => ({
      id: r.id,
      imageUrl: adminImageUrl(r.image_key),
      status: r.status,
      author: r.author_nickname,
      hasEmail: Boolean(r.contact_email),
      likeCount: r.like_count,
      createdAt: r.created_at,
      publishedAt: r.published_at,
      isSample: r.is_sample,
      ai: r.ai_result,
      reports: reportsByComic.get(r.id)?.map((x) => x.reason) ?? [],
      hasCard: cardIds ? cardIds.has(r.id) : null,
    })

    return json({
      today: kstToday(),
      pickedId: picks[0]?.comic_id ?? null,
      queues: {
        review: review.map(shape),
        pending: pending.map(shape),
        hidden: hidden.map(shape),
        rejected: rejected.map(shape),
        approved: approved.map(shape),
      },
    })
  } catch (e) {
    return errorResponse(e, '목록을 불러오지 못했어요. 다시 시도해 주세요.')
  }
}
