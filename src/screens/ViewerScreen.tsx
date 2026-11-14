import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, fetchComics, setLike as saveLike, type Comic } from '../api'
import { usePullToRefresh } from '../lib/usePullToRefresh'

type Burst = { id: number; x: number; y: number }

function formatCount(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

function Notice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-space-md px-space-xl text-center">
      <span className="material-symbols-outlined text-4xl text-on-surface-variant">sentiment_dissatisfied</span>
      <p role="alert" className="font-body text-body-md text-on-surface-variant">
        {message}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-surface-container-highest px-space-md py-2 font-label-lg text-label-lg text-on-surface transition active:scale-95 hover:bg-surface-bright"
      >
        다시 불러오기
      </button>
    </div>
  )
}

export default function ViewerScreen() {
  const carouselRef = useRef<HTMLDivElement>(null)
  const lastTap = useRef(0)
  const burstId = useRef(0)
  const toastTimer = useRef<number | undefined>(undefined)
  const [comics, setComics] = useState<Comic[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [index, setIndex] = useState(0)
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [bursts, setBursts] = useState<Burst[]>([])
  const [toast, setToast] = useState('')
  const [attempt, setAttempt] = useState(0)

  const load = useCallback(() => {
    setLoadError('')
    setComics(null)
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchComics().then(
      (list) => {
        if (cancelled) return
        setComics(list)
        setIndex(0)
      },
      (e: unknown) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : '만화를 불러오지 못했어요.')
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  function showToast(message: string) {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), 3000)
  }

  // 당겨서 새로고침: 목록과 좋아요 수를 다시 받는다. 보던 만화가 아직 있으면 그 자리에 머문다.
  // 실패하면 화면의 기존 내용은 그대로 두고 이유만 알려 준다.
  const currentId = comics?.[index]?.id
  async function refresh() {
    try {
      const list = await fetchComics()
      const keep = currentId ? list.findIndex((c) => c.id === currentId) : -1
      const next = Math.max(keep, 0)
      setComics(list)
      setIndex(next)
      requestAnimationFrame(() => {
        const el = carouselRef.current
        if (el) el.scrollTo({ left: el.clientWidth * next, behavior: 'instant' })
      })
    } catch (e) {
      showToast(e instanceof Error ? e.message : '새로고침하지 못했어요. 다시 시도해 주세요.')
    }
  }
  const ptr = usePullToRefresh(refresh, Boolean(comics?.length))

  if (loadError) return <Notice message={loadError} onRetry={load} />
  if (!comics) {
    return (
      <div className="flex flex-1 items-center justify-center" role="status" aria-label="불러오는 중">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-surface-container-highest border-t-primary-container" />
      </div>
    )
  }
  if (!comics.length) {
    return <Notice message="아직 공개된 만화가 없어요. 잠시 후 다시 확인해 주세요." onRetry={load} />
  }

  const comic = comics[index]

  function goTo(next: number) {
    const el = carouselRef.current
    if (!el || !comics || next < 0 || next >= comics.length) return
    el.scrollTo({ left: el.clientWidth * next, behavior: 'smooth' })
  }

  function handleScroll() {
    const el = carouselRef.current
    if (!el || !comics) return
    const next = Math.round(el.scrollLeft / el.clientWidth)
    if (next !== index && next >= 0 && next < comics.length) setIndex(next)
  }

  // 먼저 화면에 반영하고, 서버가 거절하면 되돌린 뒤 이유를 알려 준다.
  async function toggleLike(target: Comic, like: boolean) {
    if (busy.has(target.id) || target.liked === like) return
    const patch = (liked: boolean, likeCount: number) =>
      setComics((prev) => prev?.map((c) => (c.id === target.id ? { ...c, liked, likeCount } : c)) ?? prev)

    setBusy((prev) => new Set(prev).add(target.id))
    patch(like, Math.max(target.likeCount + (like ? 1 : -1), 0))
    try {
      const res = await saveLike(target.id, like)
      patch(res.liked, res.likeCount)
    } catch (e) {
      if (e instanceof ApiError && typeof e.body?.likeCount === 'number') {
        patch(Boolean(e.body.liked), e.body.likeCount)
      } else {
        patch(target.liked, target.likeCount)
      }
      showToast(e instanceof Error ? e.message : '좋아요를 저장하지 못했어요.')
    } finally {
      setBusy((prev) => {
        const next = new Set(prev)
        next.delete(target.id)
        return next
      })
    }
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
      void toggleLike(comic, true)
      spawnBurst(e.clientX - rect.left, e.clientY - rect.top)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative min-h-0 flex-1 overflow-hidden" {...ptr.handlers}>
        {/* 당겨서 새로고침 표시. 만화가 아래로 내려오며 드러나는 자리에 보인다 */}
        <div
          aria-hidden={!ptr.refreshing}
          role={ptr.refreshing ? 'status' : undefined}
          className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center overflow-hidden"
          style={{ height: ptr.pull, transition: ptr.dragging ? 'none' : 'height 0.25s ease' }}
        >
          {ptr.refreshing && <span className="sr-only">새로고침 중</span>}
          <span
            className={`material-symbols-outlined text-3xl ${ptr.triggered || ptr.refreshing ? 'text-primary-container' : 'text-on-surface-variant'} ${
              ptr.refreshing ? 'animate-spin' : ''
            }`}
            style={{ opacity: Math.min(ptr.pull / 40, 1), transform: ptr.refreshing ? undefined : `rotate(${ptr.pull * 4}deg)` }}
          >
            refresh
          </span>
        </div>

        <div
          className="relative h-full"
          style={{ transform: `translateY(${ptr.pull}px)`, transition: ptr.dragging ? 'none' : 'transform 0.25s ease' }}
        >
          <div
            ref={carouselRef}
            onScroll={handleScroll}
            className="flex h-full w-full snap-x snap-mandatory overflow-x-auto overscroll-x-contain scroll-smooth select-none"
            // 세로 당기기는 브라우저가 가져가지 않고 화면이 처리한다. 가로 넘기기와 확대(핀치)는 그대로 브라우저가 처리한다.
            style={{ scrollbarWidth: 'none', touchAction: 'pan-x pinch-zoom' }}
          >
            {comics.map((c, i) => (
              <div
                key={c.id}
                onClick={handleTap}
                className="relative h-full w-full shrink-0 snap-center bg-surface-container-lowest"
              >
                <img
                  src={c.imageUrl}
                  alt={`오늘의 4컷 만화 ${i + 1}`}
                  draggable={false}
                  loading={i < 2 ? 'eager' : 'lazy'}
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
          {index < comics.length - 1 && (
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

        {toast && (
          <div
            role="alert"
            className="absolute inset-x-4 bottom-3 z-20 rounded-xl bg-surface-container-high/95 px-space-md py-3 text-center font-body text-body-sm text-on-surface shadow-2xl backdrop-blur-xl"
          >
            {toast}
          </div>
        )}
      </div>

      {/* 만화를 가리지 않도록 이미지 아래 별도 줄에 둔다 */}
      <div className="flex h-14 shrink-0 items-center justify-between bg-surface px-margin">
        <div className="flex items-center gap-1.5" aria-label={`${index + 1} / ${comics.length}`}>
          {comics.length <= 12 ? (
            comics.map((c, i) => (
              <span
                key={c.id}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === index ? 'w-2.5 bg-primary-container' : 'w-1.5 bg-on-surface-variant/40'
                }`}
              />
            ))
          ) : (
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {index + 1} / {comics.length}
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label="좋아요"
          aria-pressed={comic.liked}
          onClick={() => void toggleLike(comic, !comic.liked)}
          className={`flex items-center gap-1.5 rounded-full py-2 pr-4 pl-3 text-on-surface transition active:scale-95 ${
            comic.liked ? 'bg-surface-container-highest' : 'bg-surface-container-high'
          }`}
        >
          <span
            className={`material-symbols-outlined text-2xl ${
              comic.liked ? 'filled text-primary-container' : 'text-on-surface-variant'
            }`}
          >
            favorite
          </span>
          <span className="font-headline text-label-md tracking-tight">{formatCount(comic.likeCount)}</span>
        </button>
      </div>
    </div>
  )
}
