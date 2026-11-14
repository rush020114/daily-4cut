import { useRef, useState } from 'react'

const LOCK_DISTANCE = 8 // px. 이만큼 움직이면 가로/세로 방향을 정한다
const VERTICAL_BIAS = 1.5 // 세로 이동이 가로 이동의 이 배수보다 커야 '당기기'로 본다 (좌우 넘기기와 구분)
const RESISTANCE = 0.5 // 손가락이 움직인 거리 대비 화면이 따라 내려오는 비율
const TRIGGER = 56 // px. 이만큼 내려오면 놓았을 때 새로고침
const MAX_PULL = 96 // px
const HOLD = 48 // px. 불러오는 동안 머무는 위치

type Mode = 'idle' | 'pull' | 'ignore'

// 맨 위에서 아래로 당겨 새로고침. 좌우로 넘기는 동작은 방향이 가로로 정해지면 건드리지 않는다.
// 이 화면은 세로로 스크롤되지 않으므로 "맨 위"는 항상 참이다. 스크롤되는 화면에 쓰려면 scrollTop === 0 확인이 필요하다.
export function usePullToRefresh(onRefresh: () => Promise<void>, enabled: boolean) {
  const origin = useRef<{ x: number; y: number } | null>(null)
  const mode = useRef<Mode>('idle')
  const [pull, setPull] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  function reset() {
    origin.current = null
    mode.current = 'idle'
    setDragging(false)
  }

  async function finish() {
    const wasPulling = mode.current === 'pull'
    const reached = pull >= TRIGGER
    reset()
    if (!wasPulling) return
    if (!reached) return setPull(0)

    setRefreshing(true)
    setPull(HOLD)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
      setPull(0)
    }
  }

  const handlers = {
    onTouchStart(e: React.TouchEvent) {
      if (!enabled || refreshing || e.touches.length !== 1) {
        mode.current = 'ignore'
        return
      }
      origin.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      mode.current = 'idle'
    },
    onTouchMove(e: React.TouchEvent) {
      if (!origin.current || mode.current === 'ignore') return
      if (e.touches.length !== 1) {
        // 두 손가락(확대 등)이 되면 중단한다
        mode.current = 'ignore'
        setDragging(false)
        setPull(0)
        return
      }
      const dx = e.touches[0].clientX - origin.current.x
      const dy = e.touches[0].clientY - origin.current.y

      if (mode.current === 'idle') {
        if (Math.hypot(dx, dy) < LOCK_DISTANCE) return
        if (dy > 0 && dy > Math.abs(dx) * VERTICAL_BIAS) {
          mode.current = 'pull'
          setDragging(true)
        } else {
          mode.current = 'ignore'
          return
        }
      }
      setPull(Math.min(Math.max(dy, 0) * RESISTANCE, MAX_PULL))
    },
    onTouchEnd() {
      void finish()
    },
    onTouchCancel() {
      void finish()
    },
  }

  return { pull, dragging, refreshing, triggered: pull >= TRIGGER, handlers }
}
