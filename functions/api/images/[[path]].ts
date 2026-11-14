import { json, requireBucket, type Env } from '../../_lib/env'
import { errorResponse } from '../../_lib/request'
import { rest } from '../../_lib/supabase'

// 승인된 만화의 R2 이미지만 내보낸다. 검수 대기·거절된 이미지는 404.
export const onRequestGet: PagesFunction<Env, 'path'> = async ({ env, params }) => {
  const parts = Array.isArray(params.path) ? params.path : [params.path]
  const key = parts.filter(Boolean).join('/')
  if (!key || key.split('/').some((p) => p === '..' || p === '.')) {
    return json({ error: 'not_found', message: '이미지를 찾을 수 없어요.' }, 404)
  }

  try {
    const rows = await rest<{ id: string }[]>(
      env,
      'anon',
      `comics?select=id&image_key=eq.${encodeURIComponent(key)}&limit=1`,
    )
    if (!rows.length) return json({ error: 'not_found', message: '이미지를 찾을 수 없어요.' }, 404)

    const object = await requireBucket(env).get(key)
    if (!object) return json({ error: 'not_found', message: '이미지를 찾을 수 없어요.' }, 404)

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    headers.set('cache-control', 'public, max-age=86400')
    headers.set('x-content-type-options', 'nosniff')
    return new Response(object.body, { headers })
  } catch (e) {
    return errorResponse(e, '이미지를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
  }
}
