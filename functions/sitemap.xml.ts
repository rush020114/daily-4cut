import type { Env } from './_lib/env'
import { errorResponse } from './_lib/request'
import { rest } from './_lib/supabase'

const PAGES = ['/', '/terms', '/privacy', '/contact']
const MAX_COMICS = 5000
// 숨김·거절된 만화가 오래 남지 않도록 짧게만 보관한다
const CACHE_SECONDS = 60

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// sitemap.xml: 홈·안내 페이지와 공개 중인 만화(/c/<id>).
// 만화는 공개 중인 것만 조회하는 DB 뷰(ranked_comics: 승인되고 공개일이 지난 것)에서 읽으므로, 검수 대기·승인 전·신고로 숨겨진·거절된 만화는 들어가지 않는다.
export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const origin = new URL(request.url).origin
  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined
  const key = new Request(`${origin}/__cache/sitemap`)

  try {
    if (cache) {
      const hit = await cache.match(key)
      if (hit) return new Response(hit.body, hit)
    }

    const rows = await rest<{ id: string; published_at: string }[]>(
      env,
      'anon',
      `ranked_comics?select=id,published_at&order=published_at.desc&limit=${MAX_COMICS}`,
    )
    const urls = [
      ...PAGES.map((p) => `  <url><loc>${xml(origin + p)}</loc></url>`),
      ...rows.map((r) => `  <url><loc>${xml(`${origin}/c/${r.id}`)}</loc><lastmod>${xml(r.published_at.slice(0, 10))}</lastmod></url>`),
    ]
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
    const res = new Response(body, {
      headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': `public, max-age=${CACHE_SECONDS}` },
    })
    if (cache) waitUntil(cache.put(key, res.clone()).catch((e) => console.error('sitemap cache write failed:', e)))
    return res
  } catch (e) {
    // 빈 sitemap 을 내보내서 검색엔진이 모든 주소가 사라졌다고 오해하지 않도록 오류로 응답한다
    return errorResponse(e, 'sitemap 을 만들지 못했어요. 잠시 후 다시 시도해 주세요.')
  }
}
