import { useEffect } from 'react'
import Footer from '../components/Footer'
import Header from '../components/Header'
import Contact from '../legal/Contact'
import { EFFECTIVE_DATE, LEGAL_TITLES, SITE_NAME, type LegalPage } from '../legal/constants'
import Privacy from '../legal/Privacy'
import Terms from '../legal/Terms'

const CONTENT: Record<LegalPage, () => React.JSX.Element> = {
  terms: Terms,
  privacy: Privacy,
  contact: Contact,
}

// 이용약관 · 개인정보처리방침 · 문의. 주소가 각각 있어서(/terms /privacy /contact) 링크로 열 수 있다.
export default function LegalScreen({ page }: { page: LegalPage }) {
  const Content = CONTENT[page]

  useEffect(() => {
    document.title = `${LEGAL_TITLES[page]} · ${SITE_NAME}`
  }, [page])

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-surface">
      <Header />
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-margin pb-space-xl break-keep [overflow-wrap:break-word]">
        <a
          href="/"
          className="-ml-2 flex w-fit items-center gap-space-xs rounded-lg px-2 py-1.5 font-label-md text-label-md text-on-surface-variant transition-colors hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-xl">arrow_back_ios_new</span>
          {SITE_NAME}으로 돌아가기
        </a>

        <h1 className="mt-space-sm font-headline-lg text-headline-lg tracking-tight text-on-surface">{LEGAL_TITLES[page]}</h1>
        {page !== 'contact' && (
          <p className="mt-1 font-label-md text-label-md text-on-surface-variant">시행일 {EFFECTIVE_DATE}</p>
        )}

        <div className="mt-space-md flex flex-col">
          <Content />
        </div>
      </main>
      <Footer />
    </div>
  )
}
