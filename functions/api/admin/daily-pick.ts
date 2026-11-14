import { json, type Env } from '../../_lib/env'
import { errorResponse, isUuid, kstToday } from '../../_lib/request'
import { rest } from '../../_lib/supabase'

// 오늘(한국 시간)의 만화를 지정한다.
export const onRequestPut: PagesFunction<Env> = async ({ request, env }) => {
  const body = (await request.json().catch(() => null)) as { comicId?: unknown } | null
  if (!body || !isUuid(body.comicId)) {
    return json({ error: 'bad_request', message: '지정할 만화를 선택해 주세요.' }, 400)
  }

  try {
    const found = await rest<{ id: string }[]>(
      env,
      'service',
      `ranked_comics?select=id&id=eq.${body.comicId}`,
    )
    if (!found.length) {
      return json({ error: 'not_found', message: '승인되어 공개 중인 만화만 지정할 수 있어요.' }, 404)
    }
    await rest(env, 'service', 'daily_picks?on_conflict=pick_date', {
      method: 'POST',
      headers: { prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ pick_date: kstToday(), comic_id: body.comicId }),
    })
    return json({ pickedId: body.comicId })
  } catch (e) {
    return errorResponse(e, '지정하지 못했어요. 다시 시도해 주세요.')
  }
}

// 지정을 풀면 노출 점수 1위가 오늘의 만화가 된다.
export const onRequestDelete: PagesFunction<Env> = async ({ env }) => {
  try {
    await rest(env, 'service', `daily_picks?pick_date=eq.${kstToday()}`, {
      method: 'DELETE',
      headers: { prefer: 'return=minimal' },
    })
    return json({ pickedId: null })
  } catch (e) {
    return errorResponse(e, '지정을 풀지 못했어요. 다시 시도해 주세요.')
  }
}
