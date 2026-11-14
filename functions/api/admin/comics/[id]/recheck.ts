import { notifyAuthor } from '../../../../_lib/email'
import { json, requireBucket, type Env } from '../../../../_lib/env'
import { errorResponse, isUuid } from '../../../../_lib/request'
import { runAiCheck } from '../../../../_lib/review'
import { rest } from '../../../../_lib/supabase'

// AI 검수를 끝내지 못한(검수 대기) 만화를 다시 검수한다.
export const onRequestPost: PagesFunction<Env, 'id'> = async ({ env, params }) => {
  if (!isUuid(params.id)) return json({ error: 'not_found', message: '만화를 찾을 수 없어요.' }, 404)

  try {
    const rows = await rest<{ image_key: string; status: string; author_nickname: string | null; contact_email: string | null }[]>(
      env,
      'service',
      `comics?select=image_key,status,author_nickname,contact_email&id=eq.${params.id}`,
    )
    const comic = rows[0]
    if (!comic) return json({ error: 'not_found', message: '만화를 찾을 수 없어요.' }, 404)
    if (comic.status !== 'pending') {
      return json({ error: 'invalid_state', message: '이미 다른 상태로 바뀌었어요. 목록을 새로고침해 주세요.' }, 409)
    }

    const object = await requireBucket(env).get(comic.image_key)
    if (!object) return json({ error: 'not_found', message: '이미지 파일을 찾을 수 없어요.' }, 404)

    const ai = await runAiCheck(env, params.id, new Uint8Array(await object.arrayBuffer()))
    if (ai.error) {
      // 502 는 Cloudflare 가 자체 오류 페이지로 바꿔 버려서 메시지가 사라진다. 503 을 쓴다.
      return json({ error: 'ai_failed', message: `AI 검수가 다시 실패했어요: ${ai.error.slice(0, 160)}` }, 503)
    }

    let mail: 'sent' | 'failed' | 'none' = 'none'
    if (ai.status === 'rejected' && comic.contact_email && !ai.superseded) {
      try {
        await notifyAuthor(env, comic.contact_email, { nickname: comic.author_nickname ?? '', result: 'rejected' })
        mail = 'sent'
      } catch (e) {
        console.error('Author mail failed:', params.id, e)
        mail = 'failed'
      }
    }
    return json({ status: ai.status, mail })
  } catch (e) {
    return errorResponse(e, '다시 검수하지 못했어요. 다시 시도해 주세요.')
  }
}
