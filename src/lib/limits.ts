// 업로드 제한. 서버(functions/_lib/limits.ts)와 값을 맞춘다. 서버가 최종 판단하고 화면은 미리 알려 주는 용도다.
export const LIMITS = {
  maxInputBytes: 15 * 1024 * 1024, // 고른 원본 파일
  maxWebpBytes: 5 * 1024 * 1024, // 변환 후
  minShortSide: 320,
  maxRatio: 3,
  uploadLongSide: 2400, // 이보다 크면 줄여서 올린다
  maxPixels: 60_000_000, // 이보다 크면 기기 메모리가 모자랄 수 있어 거절
  nicknameMax: 15,
}

export const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp']

// 약관 문구를 바꾸면 서버의 TERMS_VERSION 도 함께 올린다.
export const TERMS_VERSION = 'v2'
