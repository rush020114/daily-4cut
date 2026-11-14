import { json, requireBucket, type Env } from '../../../_lib/env'
import { errorResponse } from '../../../_lib/request'

// 관리자가 검수 대기·거절·숨김 상태의 이미지도 볼 수 있게 R2에서 바로 내보낸다. (/api/admin/* 전체가 Access로 보호된다)
export const onRequestGet: PagesFunction<Env, 'path'> = async ({ env, params }) => {
  const parts = (Array.isArray(params.path) ? params.path : [params.path]).filter(Boolean)
  const key = parts.join('/')
  if (!key.startsWith('comics/') || parts.some((p) => p === '..' || p === '.')) {
    return json({ error: 'not_found', message: '이미지를 찾을 수 없어요.' }, 404)
  }

  try {
    const object = await requireBucket(env).get(key)
    if (!object) return json({ error: 'not_found', message: '이미지를 찾을 수 없어요.' }, 404)

    const headers = new Headers()
    object.writeHttpMetadata(headers)
    headers.set('etag', object.httpEtag)
    headers.set('cache-control', 'private, no-store')
    headers.set('x-content-type-options', 'nosniff')
    return new Response(object.body, { headers })
  } catch (e) {
    return errorResponse(e, '이미지를 불러오지 못했어요. 다시 시도해 주세요.')
  }
}
