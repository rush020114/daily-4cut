import { json, type Env } from '../_lib/env'

// 화면이 런타임에 필요한 공개 설정. (Turnstile 사이트 키는 공개용 키다)
export const onRequestGet: PagesFunction<Env> = async ({ env }) =>
  json({ turnstileSiteKey: env.TURNSTILE_SITE_KEY ?? null })
