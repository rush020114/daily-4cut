import { useCallback, useEffect, useRef, useState } from 'react'

// ── 넘기기
const PAGE_LOCK_MS = 380 // 한 편을 넘기는 동안 입력을 잠근다. 화면의 전환(350ms)보다 조금 길게.
const LOCK_DISTANCE = 8 // px. 이만큼 움직이면 세로 동작인지 정한다
const VERTICAL_BIAS = 1.2 // 세로 이동이 가로 이동의 이 배수보다 커야 세로 동작으로 본다
const SWIPE_RATIO = 0.18 // 화면 높이의 이 비율만큼 끌면 넘어간다
const SWIPE_MAX = 140 // px. 화면이 아주 커도 이 이상은 요구하지 않는다
const FLICK_VELOCITY = 0.45 // px/ms. 이보다 빠르게 밀면 짧아도 넘어간다
const FLICK_MIN_DISTANCE = 24 // px
const EDGE_RESISTANCE = 0.3 // 첫 편 위/마지막 편 아래로 끌 때 화면이 따라오는 비율
const WHEEL_STEP = 40 // 휠을 이만큼 굴리면 한 편 (트랙패드의 작은 값은 모아서 계산)
const WHEEL_QUIET_MS = 140 // 휠 이벤트가 이만큼 끊겨야 새 동작으로 본다 (관성으로 이어지는 이벤트는 같은 동작)

// ── 당겨서 새로고침 (첫 편에서 아래로 당길 때만)
const PULL_RESISTANCE = 0.5
const PULL_TRIGGER = 56 // px
const PULL_MAX = 96 // px
const PULL_HOLD = 48 // px. 불러오는 동안 머무는 위치

export type PageMethod = 'touch' | 'wheel' | 'key'

type Mode = 'idle' | 'pull' | 'drag' | 'ignore'
type Gesture = {
  x: number
  y: number
  lastY: number
  mode: Mode
  samples: { y: number; t: number }[]
}

type Options = {
  count: number
  index: number
  onIndexChange: (next: number, method: PageMethod) => void
  onRefresh: () => Promise<void>
  enabled: boolean
}

// 세로로 한 편씩 넘기는 화면의 입력 처리: 터치, 마우스 휠, 키보드(↑↓)가 모두 같은 규칙을 쓴다.
//  - 한 동작에는 항상 한 편만 넘어간다. (세게 밀어도, 휠을 오래 굴려도, 키를 꾹 눌러도)
//  - 첫 편에서 아래로 당기면 새로고침, 그 밖에서는 이전 편으로 넘어간다.
export function useVerticalPager(options: Options) {
  const opts = useRef(options)
  useEffect(() => {
    opts.current = options
  })

  const locked = useRef(false)
  const refreshing = useRef(false)
  const pullValue = useRef(0)
  const gesture = useRef<Gesture | null>(null)
  const viewport = useRef<HTMLDivElement | null>(null)
  const wheelCleanup = useRef<(() => void) | null>(null)

  const [offset, setOffset] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [pull, setPullState] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const setPull = (value: number) => {
    pullValue.current = value
    setPullState(value)
  }

  // 한 편 넘긴다. 잠겨 있거나 끝이면 아무것도 하지 않고 false.
  // 읽는 값이 모두 ref 라서 어느 렌더에서 만들어졌든 같게 동작한다.
  const go = useCallback((dir: 1 | -1, method: PageMethod): boolean => {
    const o = opts.current
    const next = o.index + dir
    if (!o.enabled || locked.current || refreshing.current || next < 0 || next >= o.count) return false
    locked.current = true
    window.setTimeout(() => {
      locked.current = false
    }, PAGE_LOCK_MS)
    o.onIndexChange(next, method)
    return true
  }, [])

  // 마우스 휠: 화면 요소가 나타날 때 붙이고 사라질 때 뗀다 (불러오는 중에는 요소가 없다)
  const attachViewport = useCallback(
    (el: HTMLDivElement | null) => {
      wheelCleanup.current?.()
      wheelCleanup.current = null
      viewport.current = el
      if (!el) return

      let acc = 0
      let last = -Infinity
      let consumed = false
      const onWheel = (e: WheelEvent) => {
        if (e.ctrlKey) return // 트랙패드 핀치 확대는 건드리지 않는다
        e.preventDefault()
        const now = performance.now()
        if (now - last >= WHEEL_QUIET_MS) {
          acc = 0
          consumed = false // 잠시 멈췄다가 다시 굴리면 새 동작
        }
        last = now
        if (consumed || locked.current || refreshing.current) return

        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1
        acc += e.deltaY * unit
        if (Math.abs(acc) >= WHEEL_STEP) {
          if (go(acc > 0 ? 1 : -1, 'wheel')) consumed = true // 같은 동작의 남은 관성 이벤트는 무시
          acc = 0
        }
      }
      el.addEventListener('wheel', onWheel, { passive: false })
      wheelCleanup.current = () => el.removeEventListener('wheel', onWheel)
    },
    [go],
  )

  // 키보드 ↑↓ (PageUp/PageDown 도 같이). 꾹 눌러도 한 번에 한 편.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      const dir = e.key === 'ArrowDown' || e.key === 'PageDown' ? 1 : e.key === 'ArrowUp' || e.key === 'PageUp' ? -1 : 0
      if (!dir) return
      const target = e.target as HTMLElement | null
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return
      if (!opts.current.enabled) return
      e.preventDefault()
      if (e.repeat) return
      go(dir, 'key')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  function releasePull(cancelled: boolean) {
    if (cancelled || pullValue.current < PULL_TRIGGER) return setPull(0)
    refreshing.current = true
    setIsRefreshing(true)
    setPull(PULL_HOLD)
    opts.current.onRefresh().finally(() => {
      refreshing.current = false
      setIsRefreshing(false)
      setPull(0)
    })
  }

  function endTouch(cancelled: boolean) {
    const g = gesture.current
    gesture.current = null
    if (!g || (g.mode !== 'pull' && g.mode !== 'drag')) return
    setDragging(false)

    if (g.mode === 'pull') return releasePull(cancelled)

    setOffset(0)
    if (cancelled) return
    const dy = g.lastY - g.y
    const first = g.samples[0]
    const last = g.samples[g.samples.length - 1]
    const velocity = last.t > first.t ? (last.y - first.y) / (last.t - first.t) : 0
    const height = viewport.current?.clientHeight ?? 600
    const far = Math.abs(dy) >= Math.min(height * SWIPE_RATIO, SWIPE_MAX)
    const flick = Math.abs(velocity) >= FLICK_VELOCITY && Math.abs(dy) >= FLICK_MIN_DISTANCE
    if (far || flick) go(dy < 0 ? 1 : -1, 'touch')
  }

  const handlers = {
    onTouchStart(e: React.TouchEvent) {
      const o = opts.current
      if (!o.enabled || locked.current || refreshing.current || e.touches.length !== 1) {
        gesture.current = null
        return
      }
      const t = e.touches[0]
      gesture.current = { x: t.clientX, y: t.clientY, lastY: t.clientY, mode: 'idle', samples: [{ y: t.clientY, t: performance.now() }] }
    },
    onTouchMove(e: React.TouchEvent) {
      const g = gesture.current
      if (!g || g.mode === 'ignore') return
      if (e.touches.length !== 1) {
        // 두 손가락(확대 등)이 되면 중단하고 제자리로
        g.mode = 'ignore'
        setDragging(false)
        setOffset(0)
        setPull(0)
        return
      }
      const t = e.touches[0]
      const dx = t.clientX - g.x
      const dy = t.clientY - g.y

      if (g.mode === 'idle') {
        if (Math.hypot(dx, dy) < LOCK_DISTANCE) return
        if (Math.abs(dy) <= Math.abs(dx) * VERTICAL_BIAS) {
          g.mode = 'ignore' // 가로로 움직이면 아무것도 하지 않는다
          return
        }
        // 첫 편에서 아래로 당기면 새로고침, 그 밖의 세로 동작은 넘기기
        g.mode = dy > 0 && opts.current.index === 0 ? 'pull' : 'drag'
        setDragging(true)
      }

      const now = performance.now()
      g.samples.push({ y: t.clientY, t: now })
      while (g.samples.length > 2 && now - g.samples[0].t > 100) g.samples.shift()
      g.lastY = t.clientY

      if (g.mode === 'pull') {
        setPull(Math.min(Math.max(dy, 0) * PULL_RESISTANCE, PULL_MAX))
      } else {
        const o = opts.current
        const atEdge = (o.index === o.count - 1 && dy < 0) || (o.index === 0 && dy > 0)
        setOffset(atEdge ? dy * EDGE_RESISTANCE : dy)
      }
    },
    onTouchEnd() {
      endTouch(false)
    },
    onTouchCancel() {
      endTouch(true)
    },
  }

  return { attachViewport, ...handlers, offset, dragging, pull, refreshing: isRefreshing, triggered: pull >= PULL_TRIGGER }
}
