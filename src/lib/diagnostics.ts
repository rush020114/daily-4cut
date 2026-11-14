// 사용자가 문제를 알려 줄 때 원인을 찾을 수 있도록 오류가 난 단계와 환경 정보를 모은다.

export type Stage = 'read' | 'decode' | 'check' | 'canvas' | 'encode' | 'captcha' | 'upload'

export const STAGE_LABEL: Record<Stage, string> = {
  read: '파일 읽기',
  decode: '이미지 열기',
  check: '이미지 검사',
  canvas: '크기 조정',
  encode: 'WebP 변환',
  captcha: '봇 확인',
  upload: '업로드',
}

export type ErrorReport = { message: string; stage: Stage; detail: string }

export function describeError(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 200)
  return String(e).slice(0, 200)
}

export function deviceInfo(): string {
  const nav = navigator as Navigator & { deviceMemory?: number }
  return [
    nav.userAgent,
    `screen=${screen.width}x${screen.height}@${window.devicePixelRatio}`,
    nav.deviceMemory ? `memory=${nav.deviceMemory}GB` : null,
  ]
    .filter(Boolean)
    .join(' | ')
}

export function formatReport(r: ErrorReport): string {
  return `[${STAGE_LABEL[r.stage]}] ${r.detail}\n${deviceInfo()}`
}
