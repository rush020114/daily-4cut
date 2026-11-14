// 업로드 제한. 화면(src/lib/limits.ts)과 값을 맞춘다.
export const UPLOAD_LIMITS = {
  maxWebpBytes: 5 * 1024 * 1024, // 변환 후 WebP 파일 크기
  minShortSide: 320, // px
  maxLongSide: 4096, // px
  maxRatio: 3, // 긴 변 : 짧은 변 이 1:3 보다 길면 거절
  dailyPerIpAndDevice: 3, // 같은 IP·기기 24시간당 개수
  nicknameMax: 15,
  emailMax: 254,
}

// 사용자가 동의한 약관의 버전. 문구를 바꾸면 올린다.
export const TERMS_VERSION = 'v1'
