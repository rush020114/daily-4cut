import { requireEnv, type Env } from './env'

export const SUPPORT_EMAIL = 'support@seunglabs.com'
const FROM = '오늘의 4컷 <noreply@seunglabs.com>'
export const SITE = 'https://comic.seunglabs.com'

// Resend 로 메일을 보낸다. 본문은 일반 텍스트로만 보내 사용자가 입력한 값이 HTML 로 해석되지 않게 한다.
export async function sendEmail(env: Env, to: string, subject: string, text: string): Promise<void> {
  const { RESEND_API_KEY } = requireEnv(env, 'RESEND_API_KEY')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${RESEND_API_KEY}`,
      'content-type': 'application/json',
      'user-agent': 'daily-4cut/1.0',
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, text }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`)
}

const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').slice(0, 60)

export type UploadStatus = 'review' | 'rejected' | 'pending'

const STATUS_LABEL: Record<UploadStatus, string> = {
  review: 'AI 검수 통과 → 승인 대기',
  rejected: 'AI 검수에서 거절됨',
  pending: 'AI 검수를 끝내지 못함 (관리자 화면에서 다시 검수)',
}

// 운영자에게: 새 업로드 알림
export function notifyAdminUpload(env: Env, p: { nickname: string; status: UploadStatus; aiError?: string }) {
  const lines = [
    `새 만화가 올라왔어요.`,
    ``,
    `작가: ${oneLine(p.nickname)}`,
    `상태: ${STATUS_LABEL[p.status]}`,
    ...(p.aiError ? [`AI 검수 오류: ${p.aiError.slice(0, 200)}`] : []),
    ``,
    `관리자 화면: ${SITE}/admin`,
  ]
  return sendEmail(env, SUPPORT_EMAIL, `[오늘의 4컷] 새 업로드: ${oneLine(p.nickname)}`, lines.join('\n'))
}

// 운영자에게: 신고가 쌓여 숨겨진 만화
export function notifyAdminHidden(env: Env, p: { nickname: string | null }) {
  const lines = [
    `신고가 쌓여 만화가 자동으로 숨겨졌어요.`,
    ``,
    ...(p.nickname ? [`작가: ${oneLine(p.nickname)}`] : []),
    `관리자 확인 대기 상태예요. 관리자 화면의 '신고로 숨김'에서 확인해 주세요.`,
    ``,
    `관리자 화면: ${SITE}/admin`,
  ]
  return sendEmail(env, SUPPORT_EMAIL, `[오늘의 4컷] 신고 누적으로 숨겨진 만화`, lines.join('\n'))
}

const FOOTER = `\n문의는 ${SUPPORT_EMAIL}으로 보내 주세요.`

// 작가에게: 결과 안내 (이메일을 남긴 경우에만)
export function notifyAuthor(env: Env, to: string, p: { nickname: string; result: 'approved' | 'rejected' }) {
  const name = oneLine(p.nickname)
  if (p.result === 'approved') {
    return sendEmail(
      env,
      to,
      '[오늘의 4컷] 올려 주신 만화가 공개되었어요',
      [`${name}님, 안녕하세요.`, ``, `올려 주신 4컷 만화의 검수가 끝나 공개되었어요.`, `${SITE}`, FOOTER].join('\n'),
    )
  }
  return sendEmail(
    env,
    to,
    '[오늘의 4컷] 올려 주신 만화를 공개하지 못했어요',
    [`${name}님, 안녕하세요.`, ``, `올려 주신 4컷 만화가 검수 기준에 맞지 않아 공개되지 않았어요.`, FOOTER].join('\n'),
  )
}
