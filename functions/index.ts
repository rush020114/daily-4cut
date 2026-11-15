import { getPublicComics } from './_lib/comics'
import type { Env } from './_lib/env'

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

// 홈(/)의 HTML 에 두 가지를 미리 넣어 보낸다:
//  1) 첫 만화 이미지의 preload → 브라우저가 JS 와 API 를 기다리지 않고 바로 이미지를 받기 시작한다 (LCP)
//  2) 만화 목록 → 화면이 /api/comics 응답을 기다리지 않고 바로 그려진다. (좋아요 표시는 화면이 뒤에서 따로 받아 합친다)
// 어떤 이유로든 실패하면 원래 index.html 을 그대로 돌려준다.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  // 조건부 요청 헤더는 빼고 받는다. 주입하는 내용이 바뀌었는데 낡은 304 로 응답하지 않게 하기 위해서다.
  const headers = new Headers(context.request.headers)
  headers.delete('if-none-match')
  headers.delete('if-modified-since')
  const asset = await context.next(new Request(context.request, { headers }))

  if (!asset.ok || !(asset.headers.get('content-type') ?? '').includes('text/html')) return asset

  let comics
  try {
    comics = await getPublicComics(context.env, context.waitUntil)
  } catch (e) {
    console.error('home data failed, serving plain page:', e)
    return asset
  }

  // JSON 안의 '<' 를 이스케이프해서 </script> 로 끝나 버리는 일을 막는다
  const data = JSON.stringify({ comics }).replace(/</g, '\\u003c')
  const first = comics[0]
  const injected =
    (first ? `<link rel="preload" as="image" href="${escapeAttr(first.imageUrl)}" fetchpriority="high" />` : '') +
    `<script>window.__COMICS__=${data}</script>`

  // <meta charset> 바로 뒤에 넣는다. (charset 은 계속 <head> 맨 위)
  const body = new HTMLRewriter()
    .on('meta[charset]', {
      element(el) {
        el.after(injected, { html: true })
      },
    })
    .transform(asset).body

  const res = new Response(body, asset)
  res.headers.delete('etag')
  res.headers.delete('content-length')
  res.headers.set('cache-control', 'no-cache')
  return res
}
