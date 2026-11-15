import { getPublicComics, getSharedComic, withSharedFirst, type PublicComic } from '../_lib/comics'
import type { Env } from '../_lib/env'
import { isUuid } from '../_lib/request'
import { fetchShell, preloadImage, renderShell, scriptData, SITE_NAME, SITE_TAGLINE } from '../_lib/shell'

const OG_WIDTH = 1200
const OG_HEIGHT = 630

// 만화별 주소 /c/<id>. 이 주소를 카카오톡·SNS에 공유하면 그 만화가 미리보기로 뜬다.
//  - 공개 중인 만화(승인되고 공개일이 지난 것)만 열린다. 승인 전·숨김·거절·없는 주소는 404 이고 미리보기 정보도 넣지 않는다.
//  - 열리면 이 만화가 첫 번째로 보이고, 위아래로 넘기면 나머지 만화가 이어진다.
export const onRequestGet: PagesFunction<Env, 'id'> = async (context) => {
  const { request, env, params, waitUntil } = context
  const origin = new URL(request.url).origin
  const shell = await fetchShell(request, env)
  if (!shell.ok || !(shell.headers.get('content-type') ?? '').includes('text/html')) return shell

  const id = String(params.id)
  let comic: PublicComic | null
  try {
    comic = isUuid(id) ? await getSharedComic(env, id.toLowerCase()) : null
  } catch (e) {
    // 데이터베이스 문제로 확인하지 못했다. 없는 만화로 단정하지 않고 일반 화면으로 보낸다.
    console.error('shared comic lookup failed:', id, e)
    return shell
  }

  if (!comic) {
    const res = renderShell(
      shell,
      origin,
      { title: `만화를 찾을 수 없어요 · ${SITE_NAME}`, noindex: true },
      scriptData('__COMICS__', { comics: [], notFound: true }),
    )
    return new Response(res.body, { status: 404, headers: res.headers })
  }

  let list: PublicComic[] = []
  try {
    list = await getPublicComics(env, waitUntil)
  } catch (e) {
    console.error('list for shared page failed:', e)
  }
  const comics = withSharedFirst(list, comic)

  // 미리보기 이미지: 관리자가 승인할 때 만들어 둔 JPEG 카드(1200x630)가 있으면 그것을, 없으면 만화 이미지 자체를 쓴다.
  // (카카오톡 등 일부 서비스는 WebP 를 못 받을 수 있어 JPEG 를 우선한다)
  // (저장소의 이미지는 /api/images/ 로 시작한다. 그 밖의 정적 이미지는 SVG 일 수 있어 미리보기에 쓰지 않고 기본 이미지를 둔다)
  let image: { url: string; width: number; height: number } | undefined
  if (comic.imageUrl.startsWith('/api/images/')) {
    const hasCard = await env.COMIC_BUCKET?.head(`comics/${comic.id}-og.jpg`).then(
      (o) => o !== null,
      () => false,
    )
    image = hasCard
      ? { url: `${origin}/api/images/comics/${comic.id}-og.jpg`, width: OG_WIDTH, height: OG_HEIGHT }
      : { url: origin + comic.imageUrl, width: comic.width ?? OG_WIDTH, height: comic.height ?? OG_HEIGHT }
  }

  return renderShell(
    shell,
    origin,
    {
      title: `${SITE_NAME}에서 만난 4컷 만화`,
      description: SITE_TAGLINE,
      canonicalPath: `/c/${comic.id}`,
      image,
    },
    preloadImage(comics[0].imageUrl) + scriptData('__COMICS__', { comics, sharedId: comic.id }),
  )
}
