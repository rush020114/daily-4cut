import { notifyAuthor } from '../../../../_lib/email'
import { json, type Env } from '../../../../_lib/env'
import { errorResponse, isUuid } from '../../../../_lib/request'
import { rest, SupabaseError } from '../../../../_lib/supabase'

type Decided = { out_prev: string; out_status: 'approved' | 'rejected'; out_nickname: string | null; out_email: string | null }

// 처음 내리는 결정(검수 대기·승인 대기)이거나, 거절했던 것을 승인으로 바꿀 때만 작가에게 알린다.
// 숨김을 풀거나 공개된 것을 내리는 경우는 알리지 않는다.
function shouldNotifyAuthor(prev: string, next: 'approved' | 'rejected') {
  return next === 'approved' ? ['pending', 'review', 'rejected'].includes(prev) : ['pending', 'review'].includes(prev)
}

// 승인 또는 거절. body: { decision: 'approve' | 'reject' }
export const onRequestPost: PagesFunction<Env, 'id'> = async ({ request, env, params }) => {
  if (!isUuid(params.id)) return json({ error: 'not_found', message: '만화를 찾을 수 없어요.' }, 404)
  const body = (await request.json().catch(() => null)) as { decision?: unknown } | null
  if (!body || (body.decision !== 'approve' && body.decision !== 'reject')) {
    return json({ error: 'bad_request', message: '승인 또는 거절을 선택해 주세요.' }, 400)
  }

  try {
    const rows = await rest<Decided[]>(env, 'service', 'rpc/admin_decide_comic', {
      method: 'POST',
      body: JSON.stringify({ p_id: params.id, p_decision: body.decision }),
    })
    const d = rows[0]

    // 결과 메일은 결정을 저장한 뒤에 보낸다. 메일이 실패해도 결정은 그대로 두고, 화면에 실패를 알린다.
    let mail: 'sent' | 'failed' | 'none' = 'none'
    if (d.out_email && shouldNotifyAuthor(d.out_prev, d.out_status)) {
      try {
        await notifyAuthor(env, d.out_email, { nickname: d.out_nickname ?? '', result: d.out_status })
        mail = 'sent'
      } catch (e) {
        console.error('Author mail failed:', params.id, e)
        mail = 'failed'
      }
    }
    return json({ status: d.out_status, mail })
  } catch (e) {
    if (e instanceof SupabaseError) {
      if (e.detail.includes('comic_not_found')) return json({ error: 'not_found', message: '만화를 찾을 수 없어요.' }, 404)
      if (e.detail.includes('invalid_state')) {
        return json({ error: 'invalid_state', message: '이미 다른 상태로 바뀌었어요. 목록을 새로고침해 주세요.' }, 409)
      }
    }
    return errorResponse(e, '처리하지 못했어요. 다시 시도해 주세요.')
  }
}
