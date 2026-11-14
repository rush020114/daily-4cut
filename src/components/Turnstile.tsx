import { useEffect, useRef } from 'react'

type TurnstileApi = {
  render: (
    el: HTMLElement,
    options: {
      sitekey: string
      theme?: 'light' | 'dark' | 'auto'
      size?: 'normal' | 'compact' | 'flexible'
      language?: string
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    },
  ) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
let scriptPromise: Promise<TurnstileApi> | null = null

function loadScript(): Promise<TurnstileApi> {
  scriptPromise ??= new Promise((resolve, reject) => {
    const fail = () => {
      scriptPromise = null
      reject(new Error('load failed'))
    }
    const script = document.createElement('script')
    script.src = SCRIPT_SRC
    script.async = true
    script.onload = () => (window.turnstile ? resolve(window.turnstile) : fail())
    script.onerror = fail
    document.head.appendChild(script)
  })
  return scriptPromise
}

type Props = {
  siteKey: string
  onToken: (token: string | null) => void
  onError: (message: string) => void
}

// 부모가 key 를 바꿔 다시 그리면 새 토큰을 받는다. (토큰은 한 번만 쓸 수 있다)
export default function Turnstile({ siteKey, onToken, onError }: Props) {
  const box = useRef<HTMLDivElement>(null)
  const callbacks = useRef({ onToken, onError })
  useEffect(() => {
    callbacks.current = { onToken, onError }
  })

  useEffect(() => {
    let widgetId: string | undefined
    let cancelled = false
    loadScript().then(
      (api) => {
        if (cancelled || !box.current) return
        widgetId = api.render(box.current, {
          sitekey: siteKey,
          theme: 'dark',
          size: 'flexible',
          language: 'ko',
          callback: (token) => callbacks.current.onToken(token),
          'expired-callback': () => callbacks.current.onToken(null),
          'error-callback': () =>
            callbacks.current.onError('봇 확인을 불러오지 못했어요. 새로고침한 뒤 다시 시도해 주세요.'),
        })
      },
      () => {
        if (!cancelled) callbacks.current.onError('봇 확인을 불러오지 못했어요. 인터넷 연결을 확인하고 새로고침해 주세요.')
      },
    )
    return () => {
      cancelled = true
      if (widgetId) window.turnstile?.remove(widgetId)
    }
  }, [siteKey])

  return <div ref={box} className="min-h-[65px] w-full" />
}
