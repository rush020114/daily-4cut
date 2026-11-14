import type { Env } from './env'
import { requireEnv } from './env'

export type Role = 'anon' | 'service'

export class SupabaseError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(`Supabase ${status}: ${detail}`)
    this.name = 'SupabaseError'
  }
}

// PostgREST 호출. 새 방식 키(sb_publishable_… / sb_secret_…)는 JWT가 아니므로 apikey 헤더로만 보낸다.
export async function rest<T = unknown>(
  env: Env,
  role: Role,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const keyName = role === 'anon' ? 'SUPABASE_ANON_KEY' : 'SUPABASE_SERVICE_ROLE_KEY'
  const vars = requireEnv(env, 'SUPABASE_URL', keyName)
  const headers = new Headers(init.headers)
  headers.set('apikey', vars[keyName])
  if (init.body && !headers.has('content-type')) headers.set('content-type', 'application/json')

  const res = await fetch(`${vars.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, { ...init, headers })
  const text = await res.text()
  if (!res.ok) throw new SupabaseError(res.status, text.slice(0, 500))
  return (text ? JSON.parse(text) : null) as T
}
