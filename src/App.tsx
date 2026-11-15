import { lazy, Suspense, useEffect, useState } from 'react'
import BottomNav from './components/BottomNav'
import Footer from './components/Footer'
import Header from './components/Header'
import { legalPageFor } from './legal/constants'
import ViewerScreen from './screens/ViewerScreen'

// 첫 화면(만화 보기)에 필요 없는 화면은 따로 불러와서 처음 받는 JS 를 줄인다
const loadUpload = () => import('./screens/UploadScreen')
const UploadScreen = lazy(loadUpload)
const AdminScreen = lazy(() => import('./screens/AdminScreen'))
const LegalScreen = lazy(() => import('./screens/LegalScreen'))

export type Screen = 'viewer' | 'upload'

function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center" role="status" aria-label="불러오는 중">
      <span className="h-8 w-8 animate-spin rounded-full border-2 border-surface-container-highest border-t-primary-container" />
    </div>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('viewer')
  const isAdmin = location.pathname === '/admin' || location.pathname.startsWith('/admin/')
  const legalPage = legalPageFor(location.pathname)

  // 올리기 화면은 만화 화면이 다 뜬 뒤 한가할 때 미리 받아 둔다 (탭을 눌렀을 때 바로 열리도록)
  useEffect(() => {
    if (isAdmin || legalPage) return
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(() => void loadUpload(), { timeout: 5000 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(() => void loadUpload(), 3000)
    return () => window.clearTimeout(id)
  }, [isAdmin, legalPage])

  // 관리자 화면은 Cloudflare Access가 /admin 앞에서 막아 준다. 공개 화면과 헤더·탭을 나눈다.
  if (isAdmin) {
    return (
      <Suspense fallback={<Loading />}>
        <AdminScreen />
      </Suspense>
    )
  }

  // 이용약관·개인정보처리방침·문의는 각자 주소가 있다
  if (legalPage) {
    return (
      <Suspense fallback={<Loading />}>
        <LegalScreen page={legalPage} />
      </Suspense>
    )
  }

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-surface">
      <Header />
      <main className="flex min-h-0 flex-1 flex-col">
        {screen === 'viewer' ? (
          <ViewerScreen />
        ) : (
          <Suspense fallback={<Loading />}>
            <UploadScreen onBack={() => setScreen('viewer')} />
          </Suspense>
        )}
      </main>
      <BottomNav screen={screen} onChange={setScreen} />
      <Footer />
    </div>
  )
}
