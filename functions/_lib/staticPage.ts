import type { Env } from './env'
import { fetchShell, renderShell, SITE_NAME } from './shell'

// 이용약관·개인정보처리방침·문의 같은 안내 페이지: 검색·공유에서 올바른 제목과 대표 주소가 보이도록 서버가 HTML 의 메타 태그를 바꿔 준다.
// (화면 내용은 앱이 그린다. 제목은 앱이 정하는 것과 같다: src/screens/LegalScreen.tsx)
export function staticPage(path: string, name: string, description: string): PagesFunction<Env> {
  return async ({ request, env }) => {
    const shell = await fetchShell(request, env)
    if (!shell.ok || !(shell.headers.get('content-type') ?? '').includes('text/html')) return shell
    return renderShell(shell, new URL(request.url).origin, {
      title: `${name} · ${SITE_NAME}`,
      description,
      canonicalPath: path,
    })
  }
}
