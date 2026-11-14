import { json, type Env } from '../_lib/env'

type Check = { ok: boolean; error?: string }

async function check(fn: () => Promise<void>): Promise<Check> {
  try {
    await fn()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'unknown error' }
  }
}

// 배포 설정 확인용. 값은 절대 내보내지 않고, 있는지와 연결되는지만 알려 준다.
export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  const configured = {
    COMIC_BUCKET: Boolean(env.COMIC_BUCKET),
    SUPABASE_URL: Boolean(env.SUPABASE_URL),
    SUPABASE_ANON_KEY: Boolean(env.SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(env.SUPABASE_SERVICE_ROLE_KEY),
  }

  const r2 = await check(async () => {
    if (!env.COMIC_BUCKET) throw new Error('COMIC_BUCKET binding is missing')
    await env.COMIC_BUCKET.list({ limit: 1 })
  })

  const supabase = await check(async () => {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error('Supabase variables are missing')
    const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/health`, {
      headers: { apikey: env.SUPABASE_ANON_KEY },
    })
    if (!res.ok) throw new Error(`Supabase responded ${res.status}`)
  })

  const ok = r2.ok && supabase.ok && Object.values(configured).every(Boolean)
  return json({ ok, configured, r2, supabase }, ok ? 200 : 503)
}
