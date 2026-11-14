import { requireEnv, type Env } from './env'

// Cloudflare Turnstile 토큰을 서버에서 확인한다. 토큰은 한 번만 쓸 수 있다.
export async function verifyTurnstile(env: Env, token: string, ip: string | null): Promise<boolean> {
  const { TURNSTILE_SECRET_KEY } = requireEnv(env, 'TURNSTILE_SECRET_KEY')
  const body = new FormData()
  body.set('secret', TURNSTILE_SECRET_KEY)
  body.set('response', token)
  if (ip) body.set('remoteip', ip)

  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body })
  if (!res.ok) throw new Error(`turnstile siteverify ${res.status}`)
  const result = (await res.json()) as { success: boolean; 'error-codes'?: string[] }
  if (!result.success) console.warn('Turnstile rejected:', result['error-codes']?.join(','))
  return result.success
}
