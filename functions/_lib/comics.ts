import type { Env } from './env'
import { imageUrl, kstToday } from './request'
import { rest } from './supabase'

type Ranked = {
  id: string
  image_key: string
  image_width: number | null
  image_height: number | null
  like_count: number
}

export type PublicComic = {
  id: string
  imageUrl: string
  width: number | null
  height: number | null
  likeCount: number
  isToday: boolean // 오늘의 만화(목록의 첫 번째)인지
}

const COLUMNS = 'id,image_key,image_width,image_height,like_count'
const PAGE_SIZE = 50
// 모두에게 같은 목록이라 짧게 엣지에 보관한다. 새 승인·오늘의 만화 변경은 이 시간 안에 반영된다.
const CACHE_SECONDS = 30
const CACHE_KEY = 'https://comic.seunglabs.com/__cache/public-comics'

function toPublic(c: Ranked, isToday: boolean): PublicComic {
  return {
    id: c.id,
    imageUrl: imageUrl(c.image_key),
    width: c.image_width,
    height: c.image_height,
    likeCount: c.like_count,
    isToday,
  }
}

// 승인된 만화를 순서대로: 1번째 = 오늘의 만화(관리자가 지정, 없으면 노출 점수 1위), 나머지는 노출 점수 순.
async function loadFromDb(env: Env): Promise<PublicComic[]> {
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

  return list.map((c, i) => toPublic(c, i === 0))
}

// 공개 목록. fresh 면 캐시를 건너뛰고 새로 읽는다(당겨서 새로고침). 캐시를 못 쓰는 환경에서는 항상 새로 읽는다.
export async function getPublicComics(
  env: Env,
  waitUntil: (p: Promise<unknown>) => void,
  opts: { fresh?: boolean } = {},
): Promise<PublicComic[]> {
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined
  const key = new Request(CACHE_KEY)

  if (cache && !opts.fresh) {
    try {
      const hit = await cache.match(key)
      if (hit) return (await hit.json()) as PublicComic[]
    } catch (e) {
      console.error('comics cache read failed:', e)
    }
  }

  const list = await loadFromDb(env)
  if (cache) {
    waitUntil(
      cache
        .put(key, new Response(JSON.stringify(list), { headers: { 'cache-control': `public, max-age=${CACHE_SECONDS}` } }))
        .catch((e) => console.error('comics cache write failed:', e)),
    )
  }
  return list
}

// 만화 한 편(공유 주소용). 공개 중인 만화(승인되고 공개일이 지난 것)만 찾는다. 승인 전·숨김·거절·없는 주소는 null.
export async function getSharedComic(env: Env, id: string): Promise<PublicComic | null> {
  const rows = await rest<Ranked[]>(env, 'anon', `ranked_comics?select=${COLUMNS}&id=eq.${id}`)
  return rows[0] ? toPublic(rows[0], false) : null
}

// 공유 주소로 들어왔을 때의 목록: 공유된 만화가 첫 번째, 나머지는 평소 순서. (오늘의 만화 표시는 평소 첫 번째 만화에만 남는다)
export function withSharedFirst(list: PublicComic[], shared: PublicComic): PublicComic[] {
  const inList = list.find((c) => c.id === shared.id)
  const first = inList ?? { ...shared, isToday: false }
  return [first, ...list.filter((c) => c.id !== shared.id)]
}
