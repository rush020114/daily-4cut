import { json, MissingEnvError, type Env } from './env'
import { SupabaseError } from './supabase'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

// 브라우저가 만든 기기 ID. 없거나 형식이 틀리면 null.
export function readDeviceId(request: Request): string | null {
  const id = request.headers.get('x-device-id')
  return isUuid(id) ? id.toLowerCase() : null
}

// 다른 사이트에서 몰래 보내는 쓰기 요청을 막는다.
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  return !origin || origin === new URL(request.url).origin
}

// 오늘 날짜(한국 시간) YYYY-MM-DD
export function kstToday(now = Date.now()): string {
  return new Date(now + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

// IP는 그대로 저장하지 않고 해시로만 남긴다. (키: SUPABASE_SERVICE_ROLE_KEY)
export async function hashIp(request: Request, env: Env): Promise<string> {
  const ip = request.headers.get('cf-connecting-ip') ?? 'unknown'
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(env.SUPABASE_SERVICE_ROLE_KEY ?? ''),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip))
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, '0')).join('')
}

export function imageUrl(imageKey: string): string {
  return imageKey.startsWith('/')
    ? imageKey
    : `/api/images/${imageKey.split('/').map(encodeURIComponent).join('/')}`
}

// 예외를 사람이 읽을 수 있는 JSON 응답으로 바꾼다. 원인은 서버 로그에만 남긴다.
export function errorResponse(e: unknown, fallbackMessage: string): Response {
  if (e instanceof MissingEnvError) {
    console.error(e.message)
    return json({ error: 'server_not_configured', message: '서버 설정이 아직 끝나지 않았어요. 잠시 후 다시 시도해 주세요.' }, 503)
  }
  if (e instanceof SupabaseError) console.error(e.message)
  else console.error(e)
  return json({ error: 'upstream_error', message: fallbackMessage }, 502)
}
