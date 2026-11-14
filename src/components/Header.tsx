import logoUrl from '../../assets/logo/logo.svg'

export default function Header() {
  return (
    <header className="z-10 shrink-0 bg-surface pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center gap-space-sm px-margin">
        {/* 바로 옆에 사이트 이름이 있어서 로고는 장식으로 둔다 */}
        <img src={logoUrl} alt="" width={28} height={28} className="h-7 w-7 shrink-0 rounded-md" />
        <span className="font-headline text-headline-sm tracking-tight text-on-surface">
          오늘의 4컷
        </span>
        <span className="rounded bg-surface-container-highest px-1.5 py-0.5 font-label-sm text-label-sm text-secondary-fixed">
          DAILY
        </span>
      </div>
    </header>
  )
}
