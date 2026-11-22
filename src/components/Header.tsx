import logoUrl from '../../assets/logo/logo.svg'

// onHome 이 있으면(앱 안) 눌렀을 때 만화 화면으로 돌아가고, 없으면(약관 등 별도 페이지) 첫 화면 주소로 이동한다
export default function Header({ onHome }: { onHome?: () => void }) {
  const inner = (
    <>
      {/* 바로 옆에 사이트 이름이 있어서 로고는 장식으로 둔다 */}
      <img src={logoUrl} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-md" />
      <span className="font-headline text-headline-sm tracking-tight text-on-surface">오늘의 4컷</span>
      <span className="rounded bg-surface-container-highest px-1.5 py-0.5 font-label-sm text-label-sm text-secondary-fixed">
        DAILY
      </span>
    </>
  )
  const cls = 'flex items-center gap-space-sm rounded-lg py-1 pr-2'
  return (
    <header className="z-10 shrink-0 bg-surface pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center px-margin">
        {onHome ? (
          <button type="button" onClick={onHome} aria-label="오늘의 4컷 첫 화면으로" className={cls}>
            {inner}
          </button>
        ) : (
          <a href="/" aria-label="오늘의 4컷 첫 화면으로" className={cls}>
            {inner}
          </a>
        )}
      </div>
    </header>
  )
}
