import { json, requireBucket, type Env } from '../../../_lib/env'
import { parseJpegSize } from '../../../_lib/jpeg'
import { errorResponse, isUuid } from '../../../_lib/request'
import { rest } from '../../../_lib/supabase'

const OG_WIDTH = 1200
const OG_HEIGHT = 630
const MAX_BYTES = 800 * 1024

// 공유 미리보기용 JPEG 카드(1200x630)를 저장한다. 관리자가 만화를 승인할 때 관리자 화면(브라우저)이 만들어서 올린다.
// 서버(Pages Functions)는 이미지를 변환할 수 없어서 브라우저가 대신 만든다. 이 주소는 /api/admin/* 이라 운영자만 쓸 수 있다.
export const onRequestPut: PagesFunction<Env, 'id'> = async ({ request, env, params }) => {
  if (!isUuid(params.id)) return json({ error: 'not_found', message: '만화를 찾을 수 없어요.' }, 404)
  const id = params.id.toLowerCase()

  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.length === 0 || bytes.length > MAX_BYTES) {
    return json({ error: 'bad_image', message: '공유 이미지 크기가 맞지 않아요. (800KB 이하)' }, 413)
  }
  const size = parseJpegSize(bytes)
  if (!size || size.width !== OG_WIDTH || size.height !== OG_HEIGHT) {
    return json({ error: 'bad_image', message: `공유 이미지는 ${OG_WIDTH}x${OG_HEIGHT} JPEG 여야 해요.` }, 415)
  }

  try {
    const rows = await rest<{ id: string }[]>(env, 'service', `comics?select=id&id=eq.${id}`)
    if (!rows.length) return json({ error: 'not_found', message: '만화를 찾을 수 없어요.' }, 404)

    await requireBucket(env).put(`comics/${id}-og.jpg`, bytes, {
      httpMetadata: { contentType: 'image/jpeg', cacheControl: 'public, max-age=86400' },
    })
    return json({ ok: true })
  } catch (e) {
    return errorResponse(e, '공유 이미지를 저장하지 못했어요. 다시 시도해 주세요.')
  }
}
