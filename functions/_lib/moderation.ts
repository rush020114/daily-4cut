import { requireEnv, type Env } from './env'

// OpenAI 검수(moderation) 엔드포인트만 쓴다. 무료이며, 채팅·이미지 생성 같은 유료 모델은 호출하지 않는다.
// 이미지로는 sexual, violence, violence/graphic, self-harm 계열만 확인된다.
// hate, harassment, sexual/minors 는 텍스트 전용이라 이미지만 보내면 항상 0점이다. (그래서 관리자 승인과 신고가 필요하다)
const MODEL = 'omni-moderation-latest'

// 이 항목에 걸리면 자동으로 거절한다. 그 밖의 항목(자해 등)에 걸리면 관리자가 보도록 승인 대기로 보낸다.
const AUTO_REJECT = ['sexual', 'violence', 'violence/graphic'] as const

export type AiResult = {
  model: string
  flagged: boolean
  flaggedCategories: string[]
  scores: Record<string, number>
  error?: undefined
}
export type AiFailure = { error: string }

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

type ModerationResponse = {
  results?: { flagged: boolean; categories: Record<string, boolean>; category_scores: Record<string, number> }[]
}

export async function moderateImage(env: Env, webp: Uint8Array): Promise<AiResult> {
  const { OPENAI_API_KEY } = requireEnv(env, 'OPENAI_API_KEY')
  const res = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: { authorization: `Bearer ${OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      input: [{ type: 'image_url', image_url: { url: `data:image/webp;base64,${toBase64(webp)}` } }],
    }),
  })
  if (!res.ok) throw new Error(`OpenAI moderation ${res.status}: ${(await res.text()).slice(0, 300)}`)

  const result = ((await res.json()) as ModerationResponse).results?.[0]
  if (!result) throw new Error('OpenAI moderation: empty result')

  const scores: Record<string, number> = {}
  for (const key of ['sexual', 'violence', 'violence/graphic', 'self-harm', 'self-harm/intent', 'self-harm/instructions']) {
    scores[key] = Math.round((result.category_scores[key] ?? 0) * 1000) / 1000
  }
  return {
    model: MODEL,
    flagged: result.flagged,
    flaggedCategories: Object.keys(result.categories).filter((k) => result.categories[k]),
    scores,
  }
}

export function shouldAutoReject(r: AiResult): boolean {
  return AUTO_REJECT.some((c) => r.flaggedCategories.includes(c))
}
