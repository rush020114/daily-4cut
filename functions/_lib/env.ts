// Cloudflare Pages Functions가 받는 환경 변수와 바인딩.
// 값은 Cloudflare 대시보드(Variables and Secrets, Bindings)에서 넣고, 코드는 이 이름으로만 읽는다.
export interface Env {
  COMIC_BUCKET: R2Bucket
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string

  // 관리자 API 보호. Cloudflare Access 애플리케이션을 만든 뒤 등록한다. 없으면 관리자 API는 닫혀 있다.
  ACCESS_TEAM_DOMAIN?: string // 예: myteam.cloudflareaccess.com
  ACCESS_AUD?: string // Access 애플리케이션의 Application Audience (AUD) 태그

  // 아래는 이후 단계에서 등록한다. 그 전에는 없을 수 있다.
  TURNSTILE_SITE_KEY?: string
  TURNSTILE_SECRET_KEY?: string
  OPENAI_API_KEY?: string
  RESEND_API_KEY?: string
  POLAR_ACCESS_TOKEN?: string
}

type StringKey = {
  [K in keyof Env]-?: Env[K] extends string | undefined ? K : never
}[keyof Env]

export class MissingEnvError extends Error {
  constructor(readonly names: string[]) {
    super(`Missing environment: ${names.join(', ')}`)
    this.name = 'MissingEnvError'
  }
}

// 필요한 문자열 변수가 모두 있는지 확인하고, 없으면 어떤 이름이 빠졌는지 알려 준다.
export function requireEnv<K extends StringKey>(env: Env, ...names: K[]): Record<K, string> {
  const missing = names.filter((n) => !env[n])
  if (missing.length) throw new MissingEnvError(missing)
  return Object.fromEntries(names.map((n) => [n, env[n] as string])) as Record<K, string>
}

export function requireBucket(env: Env): R2Bucket {
  if (!env.COMIC_BUCKET) throw new MissingEnvError(['COMIC_BUCKET'])
  return env.COMIC_BUCKET
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
