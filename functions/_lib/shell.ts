import type { Env } from './env'

export const SITE_NAME = '오늘의 4컷'
export const SITE_TAGLINE = '하루 한 번, 피식 웃고 시작하는 4컷 만화'
export const HOME_TITLE = `${SITE_NAME} – ${SITE_TAGLINE}`

export type ShellMeta = {
  title: string
  description?: string
  // 이 페이지의 대표 주소(경로). 검색엔진용 canonical 과 공유용 og:url 로 쓴다. 없으면 넣지 않는다.
  canonicalPath?: string
  // 공유 미리보기 이미지. 없으면 index.html 의 기본 이미지(og-default.png)를 쓴다.
  image?: { url: string; width: number; height: number }
  noindex?: boolean
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

// 앱의 HTML 뼈대(index.html)를 가져온다. 조건부 요청 헤더는 뺀다: 바꿔서 보내는 내용이 달라졌는데 낡은 304 로 응답하지 않게.
export function fetchShell(request: Request, env: Env): Promise<Response> {
  const headers = new Headers(request.headers)
  headers.delete('if-none-match')
  headers.delete('if-modified-since')
  headers.delete('range')
  return env.ASSETS.fetch(new Request(new URL('/', request.url), { headers }))
}

// 뼈대의 제목·설명·공유 태그를 이 페이지에 맞게 바꾸고, 필요하면 canonical / noindex / 미리 받을 데이터를 넣어 돌려준다.
// injectedAfterCharset: <meta charset> 바로 뒤에 넣을 HTML (charset 은 계속 <head> 맨 위. 이미지 preload 와 데이터를 일찍 보이게 한다)
export function renderShell(shell: Response, origin: string, meta: ShellMeta, injectedAfterCharset = ''): Response {
  const description = meta.description ?? SITE_TAGLINE
  const setContent = (selector: string, value: string) => ({ selector, value })
  const contentTags = [
    setContent('meta[name="description"]', description),
    setContent('meta[property="og:title"]', meta.title),
    setContent('meta[property="og:description"]', description),
    setContent('meta[name="twitter:title"]', meta.title),
    setContent('meta[name="twitter:description"]', description),
    ...(meta.image
      ? [
          setContent('meta[property="og:image"]', meta.image.url),
          setContent('meta[property="og:image:width"]', String(meta.image.width)),
          setContent('meta[property="og:image:height"]', String(meta.image.height)),
          setContent('meta[name="twitter:image"]', meta.image.url),
        ]
      : []),
  ]

  let seo = ''
  if (meta.canonicalPath) {
    const url = escapeAttr(origin + meta.canonicalPath)
    seo += `<link rel="canonical" href="${url}" /><meta property="og:url" content="${url}" />`
  }
  if (meta.noindex) seo += '<meta name="robots" content="noindex" />'

  const rewriter = new HTMLRewriter().on('title', {
    element(el) {
      el.setInnerContent(meta.title)
    },
  })
  for (const { selector, value } of contentTags) {
    rewriter.on(selector, {
      element(el) {
        el.setAttribute('content', value)
      },
    })
  }
  rewriter.on('meta[charset]', {
    element(el) {
      if (injectedAfterCharset) el.after(injectedAfterCharset, { html: true })
    },
  })
  rewriter.on('head', {
    element(el) {
      if (seo) el.append(seo, { html: true })
    },
  })

  const res = new Response(rewriter.transform(shell).body, shell)
  res.headers.delete('etag')
  res.headers.delete('content-length')
  res.headers.set('cache-control', 'no-cache')
  return res
}

// 데이터를 HTML 안에 넣을 때: JSON 안의 '<' 를 이스케이프해서 </script> 로 끝나 버리는 일을 막는다
export function scriptData(name: string, value: unknown): string {
  return `<script>window.${name}=${JSON.stringify(value).replace(/</g, '\\u003c')}</script>`
}

export function preloadImage(url: string): string {
  return `<link rel="preload" as="image" href="${escapeAttr(url)}" fetchpriority="high" />`
}
