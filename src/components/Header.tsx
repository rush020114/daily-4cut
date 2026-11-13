export default function Header() {
  return (
    <header className="z-10 shrink-0 bg-surface pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 items-center gap-space-sm px-margin">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary-container" />
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
