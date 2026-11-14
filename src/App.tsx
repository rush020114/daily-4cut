import { useState } from 'react'
import BottomNav from './components/BottomNav'
import Header from './components/Header'
import AdminScreen from './screens/AdminScreen'
import UploadScreen from './screens/UploadScreen'
import ViewerScreen from './screens/ViewerScreen'

export type Screen = 'viewer' | 'upload'

export default function App() {
  const [screen, setScreen] = useState<Screen>('viewer')

  // 관리자 화면은 Cloudflare Access가 /admin 앞에서 막아 준다. 공개 화면과 헤더·탭을 나눈다.
  if (location.pathname === '/admin' || location.pathname.startsWith('/admin/')) {
    return <AdminScreen />
  }

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-surface">
      <Header />
      <main className="flex min-h-0 flex-1 flex-col">
        {screen === 'viewer' ? (
          <ViewerScreen />
        ) : (
          <UploadScreen onBack={() => setScreen('viewer')} />
        )}
      </main>
      <BottomNav screen={screen} onChange={setScreen} />
    </div>
  )
}
