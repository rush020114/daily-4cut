// GA4 이벤트 기록. gtag 는 index.html 이 만든다. 관리자 화면(/admin)이나 차단된 환경에서는 gtag 가 없어서 아무 일도 하지 않는다.
// 개인정보(이메일, 이름, 기기 ID)는 절대 보내지 않는다. 숫자·짧은 코드·만화 ID 만 보낸다.

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void
  }
}

type Params = Record<string, string | number | boolean>

export function track(event: string, params: Params = {}): void {
  try {
    window.gtag?.('event', event, params)
  } catch {
    // 분석이 실패해도 화면은 그대로 동작해야 한다
  }
}
