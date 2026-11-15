import { LEGAL_PATHS, LEGAL_TITLES, type LegalPage } from '../legal/constants'

const LINKS: LegalPage[] = ['terms', 'privacy', 'contact']

// 모든 공개 화면 맨 아래의 약관·방침·문의 링크. (일반 링크라서 누르면 해당 페이지로 이동한다)
export default function Footer() {
  return (
    <footer className="shrink-0 bg-surface pb-[env(safe-area-inset-bottom)]">
      <nav aria-label="약관과 문의" className="flex items-center justify-center gap-4 px-margin pb-1.5 text-[11px] text-on-surface-variant/80">
        {LINKS.map((page) => (
          <a key={page} href={LEGAL_PATHS[page]} className="py-1 underline-offset-2 hover:text-on-surface hover:underline">
            {LEGAL_TITLES[page]}
          </a>
        ))}
      </nav>
    </footer>
  )
}
