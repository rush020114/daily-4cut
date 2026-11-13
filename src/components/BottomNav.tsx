import type { Screen } from '../App'

type Props = {
  screen: Screen
  onChange: (screen: Screen) => void
}

const items: { id: Screen; icon: string; label: string }[] = [
  { id: 'viewer', icon: 'view_stream', label: '오늘의 컷' },
  { id: 'upload', icon: 'edit_square', label: '만화 올리기' },
]

export default function BottomNav({ screen, onChange }: Props) {
  return (
    <nav className="z-10 shrink-0 bg-surface pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(0,0,0,0.45)]">
      <div className="flex h-16 items-center justify-around px-space-md">
        {items.map((item) => {
          const active = item.id === screen
          return (
            <button
              key={item.id}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => onChange(item.id)}
              className={`flex min-h-11 min-w-14 flex-col items-center justify-center gap-0.5 transition-colors duration-200 ${
                active
                  ? 'font-semibold text-primary-container'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-2xl">{item.icon}</span>
              <span className="font-label-sm text-label-sm">{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
