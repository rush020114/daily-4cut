import { useRef, useState } from 'react'
import { sampleComics } from '../samples'

type Burst = { id: number; x: number; y: number }

function formatCount(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

export default function ViewerScreen() {
  const carouselRef = useRef<HTMLDivElement>(null)
  const lastTap = useRef(0)
  const burstId = useRef(0)
  const [index, setIndex] = useState(0)
  const [liked, setLiked] = useState<boolean[]>(() => sampleComics.map(() => false))
  const [bursts, setBursts] = useState<Burst[]>([])

  const comic = sampleComics[index]
  const isLiked = liked[index]
  const count = comic.likes + (isLiked ? 1 : 0)

  function goTo(next: number) {
    const el = carouselRef.current
    if (!el || next < 0 || next >= sampleComics.length) return
    el.scrollTo({ left: el.clientWidth * next, behavior: 'smooth' })
  }

  function handleScroll() {
    const el = carouselRef.current
    if (!el) return
    const next = Math.round(el.scrollLeft / el.clientWidth)
    if (next !== index && next >= 0 && next < sampleComics.length) setIndex(next)
  }

  function setLike(value: boolean) {
    setLiked((prev) => prev.map((v, i) => (i === index ? value : v)))
  }

  function spawnBurst(x: number, y: number) {
    const id = ++burstId.current
    setBursts((prev) => [...prev, { id, x, y }])
    window.setTimeout(() => setBursts((prev) => prev.filter((b) => b.id !== id)), 700)
  }

  function handleTap(e: React.MouseEvent<HTMLDivElement>) {
    const now = Date.now()
    const gap = now - lastTap.current
    lastTap.current = now
    if (gap > 0 && gap < 300) {
      const rect = e.currentTarget.getBoundingClientRect()
      if (!isLiked) setLike(true)
      spawnBurst(e.clientX - rect.left, e.clientY - rect.top)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1">
        <div
          ref={carouselRef}
          onScroll={handleScroll}
          className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth select-none"
          style={{ scrollbarWidth: 'none' }}
        >
          {sampleComics.map((c) => (
            <div
              key={c.id}
              onClick={handleTap}
              className="relative h-full w-full shrink-0 snap-center bg-surface-container-lowest"
            >
              <img
                src={c.src}
                alt={c.alt}
                draggable={false}
                className="pointer-events-none block h-full w-full object-contain"
              />
            </div>
          ))}
        </div>

        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {bursts.map((b) => (
            <span
              key={b.id}
              className="material-symbols-outlined filled animate-heart-burst absolute text-6xl text-primary-container drop-shadow-[0_4px_16px_rgba(255,84,70,0.6)]"
              style={{ left: b.x, top: b.y }}
            >
              favorite
            </span>
          ))}
        </div>

        {index > 0 && (
          <button
            type="button"
            aria-label="이전 만화"
            onClick={() => goTo(index - 1)}
            className="absolute top-1/2 left-2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-surface-container-lowest/40 text-on-surface opacity-70 backdrop-blur-md transition hover:opacity-100 active:scale-90"
          >
            <span className="material-symbols-outlined text-lg">chevron_left</span>
          </button>
        )}
        {index < sampleComics.length - 1 && (
          <button
            type="button"
            aria-label="다음 만화"
            onClick={() => goTo(index + 1)}
            className="absolute top-1/2 right-2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-surface-container-lowest/40 text-on-surface opacity-70 backdrop-blur-md transition hover:opacity-100 active:scale-90"
          >
            <span className="material-symbols-outlined text-lg">chevron_right</span>
          </button>
        )}
      </div>

      {/* 만화를 가리지 않도록 이미지 아래 별도 줄에 둔다 */}
      <div className="flex h-14 shrink-0 items-center justify-between bg-surface px-margin">
        <div className="flex items-center gap-1.5" aria-label={`${index + 1} / ${sampleComics.length}`}>
          {sampleComics.map((c, i) => (
            <span
              key={c.id}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === index ? 'w-2.5 bg-primary-container' : 'w-1.5 bg-on-surface-variant/40'
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          aria-label="좋아요"
          aria-pressed={isLiked}
          onClick={() => setLike(!isLiked)}
          className={`flex items-center gap-1.5 rounded-full py-2 pr-4 pl-3 text-on-surface transition active:scale-95 ${
            isLiked ? 'bg-surface-container-highest' : 'bg-surface-container-high'
          }`}
        >
          <span
            className={`material-symbols-outlined text-2xl ${
              isLiked ? 'filled text-primary-container' : 'text-on-surface-variant'
            }`}
          >
            favorite
          </span>
          <span className="font-headline text-label-md tracking-tight">{formatCount(count)}</span>
        </button>
      </div>
    </div>
  )
}
