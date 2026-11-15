import { getPublicComics } from './_lib/comics'
import type { Env } from './_lib/env'
import { fetchShell, HOME_TITLE, preloadImage, renderShell, scriptData } from './_lib/shell'

// 홈(/)의 HTML 에 두 가지를 미리 넣어 보낸다:
//  1) 첫 만화 이미지의 preload → 브라우저가 JS 와 API 를 기다리지 않고 바로 이미지를 받기 시작한다 (LCP)
//  2) 만화 목록 → 화면이 /api/comics 응답을 기다리지 않고 바로 그려진다. (좋아요 표시는 화면이 뒤에서 따로 받아 합친다)
// 어떤 이유로든 실패하면 원래 index.html 을 그대로 돌려준다.
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const shell = await fetchShell(context.request, context.env)
  if (!shell.ok || !(shell.headers.get('content-type') ?? '').includes('text/html')) return shell

  let comics
  try {
    comics = await getPublicComics(context.env, context.waitUntil)
  } catch (e) {
    console.error('home data failed, serving plain page:', e)
    return shell
  }

  const first = comics[0]
  return renderShell(
    shell,
    new URL(context.request.url).origin,
    { title: HOME_TITLE, canonicalPath: '/' },
    (first ? preloadImage(first.imageUrl) : '') + scriptData('__COMICS__', { comics }),
  )
}
