// 이용약관·개인정보처리방침·문의 페이지가 함께 쓰는 값.
// 숫자 제한은 서버 코드와 같아야 한다: functions/_lib/limits.ts, functions/api/comics/[id]/report.ts

export const SUPPORT_EMAIL = 'support@seunglabs.com'
export const SITE_NAME = '오늘의 4컷'
export const SITE_HOST = 'comic.seunglabs.com'
export const OPERATOR = 'seunglabs(운영자)'

// 약관·방침을 고쳐서 다시 올릴 때 이 날짜도 바꾼다
export const EFFECTIVE_DATE = '2026년 11월 15일'

export const FACTS = {
  dailyUploads: 3, // 같은 기기 또는 같은 IP, 24시간 (functions/_lib/limits.ts dailyPerIpAndDevice)
  reportsToHide: 3, // 서로 다른 기기·IP 신고가 이만큼 쌓이면 임시 비공개 (functions/api/comics/[id]/report.ts HIDE_THRESHOLD)
  maxFileMb: 15,
  minShortSidePx: 320,
  maxRatio: '1:3',
}

// 업로드 화면의 동의 문구. 이용약관 본문에도 그대로 실린다.
// 바꾸면 동의 버전 TERMS_VERSION(src/lib/limits.ts, functions/_lib/limits.ts)도 함께 올린다.
export const UPLOAD_CONSENT_ITEMS = [
  '내가 만들었거나 사용할 권리가 있는 작품입니다. AI 도구로 만든 경우 그 도구의 이용약관이 허용하는 범위에서 올립니다.',
  '선정적·폭력적·혐오·불법 콘텐츠와 타인의 저작권을 침해하는 그림은 올리지 않으며, 어기면 숨김 처리될 수 있습니다.',
  '저작권은 작가(나)에게 있고, 서비스는 이 만화를 보여주기 위한 권한만 가집니다.',
] as const

export type LegalPage = 'terms' | 'privacy' | 'contact'

export const LEGAL_TITLES: Record<LegalPage, string> = {
  terms: '이용약관',
  privacy: '개인정보처리방침',
  contact: '문의',
}

export const LEGAL_PATHS: Record<LegalPage, string> = {
  terms: '/terms',
  privacy: '/privacy',
  contact: '/contact',
}

// 주소(경로)에서 어떤 정책 페이지인지 찾는다. 끝의 '/' 는 무시한다.
export function legalPageFor(pathname: string): LegalPage | null {
  const clean = pathname.replace(/\/+$/, '') || '/'
  const entry = (Object.entries(LEGAL_PATHS) as [LegalPage, string][]).find(([, p]) => p === clean)
  return entry ? entry[0] : null
}
