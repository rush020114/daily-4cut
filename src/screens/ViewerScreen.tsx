import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, fetchComics, reportComic, setLike as saveLike, type Comic, type ReportReason } from '../api'
import ReportSheet from '../components/ReportSheet'
import { useVerticalPager } from '../lib/useVerticalPager'

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
  const lastTap = useRef(0)
  const burstId = useRef(0)
  const toastTimer = useRef<number | undefined>(undefined)
  const [comics, setComics] = useState<Comic[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [index, setIndex] = useState(0)
  const [instant, setInstant] = useState(false) // true 인 동안은 넘기는 애니메이션 없이 바로 옮긴다
  const [busy, setBusy] = useState<Set<string>>(new Set())
  const [bursts, setBursts] = useState<Burst[]>([])
  const [toast, setToast] = useState('')
  const [reporting, setReporting] = useState(false)
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

  // 당겨서 새로고침(첫 편에서만): 목록과 좋아요 수를 다시 받는다. 오늘의 만화가 바뀌었으면 새 첫 편이 보인다.
  // 실패하면 화면의 기존 내용은 그대로 두고 이유만 알려 준다.
  async function refresh() {
    try {
      const list = await fetchComics()
      setComics(list)
      setIndex(0)
    } catch (e) {
      showToast(e instanceof Error ? e.message : '새로고침하지 못했어요. 다시 시도해 주세요.')
    }
  }

  const count = comics?.length ?? 0
  const {
    attachViewport,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    offset,
    dragging,
    pull,
    refreshing,
    triggered,
  } = useVerticalPager({
    count,
    index,
    onIndexChange: setIndex,
    onRefresh: refresh,
    enabled: count > 0 && !reporting,
  })

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
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const animate = !dragging && !instant && !reduceMotion

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

  // 신고를 보낸다. 성공하면 시트를 닫고, 신고가 쌓여 숨겨진 만화는 내 화면에서도 바로 뺀다.
  async function submitReport(target: Comic, reason: ReportReason) {
    try {
      const res = await reportComic(target.id, reason)
      setReporting(false)
      if (res.hidden) {
        const at = comics!.findIndex((c) => c.id === target.id)
        const list = comics!.filter((c) => c.id !== target.id)
        setInstant(true) // 사라진 자리에 다음 편이 애니메이션 없이 바로 온다
        setComics(list)
        setIndex(Math.max(Math.min(at, list.length - 1), 0))
        requestAnimationFrame(() => requestAnimationFrame(() => setInstant(false)))
      }
      showToast('신고가 접수되었어요. 확인 후 조치할게요.')
    } catch (e) {
      // 이미 신고한 경우는 시트를 닫고 안내만 한다. 그 밖의 오류는 시트 안에서 다시 시도할 수 있게 던진다.
      if (e instanceof ApiError && e.status === 409) {
        setReporting(false)
        showToast(e.message)
        return
      }
      throw e
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
      <div
        ref={attachViewport}
        className="relative min-h-0 flex-1 overflow-hidden select-none"
        // 한 손가락 이동은 브라우저가 아니라 화면이 처리한다(넘기기·당겨서 새로고침). 두 손가락 확대는 그대로 브라우저가 처리한다.
        style={{ touchAction: 'pinch-zoom' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
      >
        {/* 당겨서 새로고침 표시. 만화가 아래로 내려오며 드러나는 자리에 보인다 */}
        <div
          aria-hidden={!refreshing}
          role={refreshing ? 'status' : undefined}
          className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center overflow-hidden"
          style={{ height: pull, transition: dragging ? 'none' : 'height 0.25s ease' }}
        >
          {refreshing && <span className="sr-only">새로고침 중</span>}
          <span
            className={`material-symbols-outlined text-3xl ${triggered || refreshing ? 'text-primary-container' : 'text-on-surface-variant'} ${
              refreshing ? 'animate-spin' : ''
            }`}
            style={{ opacity: Math.min(pull / 40, 1), transform: refreshing ? undefined : `rotate(${pull * 4}deg)` }}
          >
            refresh
          </span>
        </div>

        <div
          className="h-full"
          style={{ transform: `translate3d(0, ${pull}px, 0)`, transition: dragging ? 'none' : 'transform 0.25s ease' }}
        >
          {/* 만화 한 편이 한 화면(이 영역 전체)을 채우는 세로 띠. 현재 편 번호만큼 위로 올려서 한 편씩 딱 맞게 보여 준다 */}
          <div
            style={{
              height: `${count * 100}%`,
              transform: `translate3d(0, calc(${-index * (100 / count)}% + ${offset}px), 0)`,
              transition: animate ? 'transform 350ms cubic-bezier(0.22, 0.8, 0.2, 1)' : 'none',
              willChange: 'transform',
            }}
          >
            {comics.map((c, i) => (
              <div
                key={c.id}
                aria-hidden={i !== index}
                onClick={handleTap}
                className="relative w-full overflow-hidden bg-surface-container-lowest"
                style={{ height: `${100 / count}%` }}
              >
                {/* 앞뒤 한 편씩만 미리 불러온다 */}
                {Math.abs(i - index) <= 1 && (
                  <img
                    src={c.imageUrl}
                    alt={`오늘의 4컷 만화 ${i + 1}`}
                    draggable={false}
                    decoding="async"
                    className="pointer-events-none block h-full w-full object-contain"
                  />
                )}
              </div>
            ))}
          </div>
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

        {toast && (
          <div
            role="alert"
            className="absolute inset-x-4 bottom-3 z-20 rounded-xl bg-surface-container-high/95 px-space-md py-3 text-center font-body text-body-sm text-on-surface shadow-2xl backdrop-blur-xl"
          >
            {toast}
          </div>
        )}
      </div>

      {/* 화면 아래에 고정. 만화가 넘어가도 움직이지 않고, 만화를 가리지도 않는다 */}
      <div className="relative flex h-14 shrink-0 items-center justify-between bg-surface px-margin">
        {/* 전체 중 어디쯤인지 보여 주는 가는 진행 막대 */}
        <div aria-hidden className="absolute inset-x-0 top-0 h-0.5 bg-surface-container-high">
          <div
            className="h-full bg-primary-container transition-[width] duration-300"
            style={{ width: `${((index + 1) / count) * 100}%` }}
          />
        </div>

        <div className="flex items-center gap-space-sm">
          {index === 0 && (
            <span className="rounded-full bg-primary-container/20 px-2 py-0.5 font-label-sm text-label-sm text-primary">
              오늘의 만화
            </span>
          )}
          <span
            className="font-label-md text-label-md text-on-surface-variant tabular-nums"
            aria-label={`${count}편 중 ${index + 1}번째`}
          >
            {index + 1} / {count}
          </span>
        </div>

        <div className="flex items-center gap-space-sm">
          <button
            type="button"
            aria-label="신고"
            onClick={() => setReporting(true)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant transition active:scale-95 hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-xl">flag</span>
          </button>
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

      {reporting && <ReportSheet onClose={() => setReporting(false)} onSubmit={(reason) => submitReport(comic, reason)} />}
    </div>
  )
}
