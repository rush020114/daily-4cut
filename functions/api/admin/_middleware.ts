import { fetchJwks, verifyAccessJwt } from '../../_lib/access'
import { json, type Env } from '../../_lib/env'
import { isSameOrigin } from '../../_lib/request'

// /api/admin/* 전체를 운영자만 쓰게 한다. 설정이 없거나 검증이 실패하면 항상 닫는다.
// 관리자 API 응답은 검색에 나오지 않게 한다 (성공·오류 모두)
export const onRequest: PagesFunction<Env> = async (context) => {
  const res = await guard(context)
  const out = new Response(res.body, res)
  out.headers.set('x-robots-tag', 'noindex, nofollow')
  return out
}

async function guard(context: EventContext<Env, string, Record<string, unknown>>): Promise<Response> {
  const { request, env } = context

  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    return json(
      { error: 'admin_not_configured', message: '관리자 보호(Cloudflare Access)가 아직 설정되지 않아 관리자 기능이 닫혀 있어요.' },
      503,
    )
  }

  const token = request.headers.get('cf-access-jwt-assertion')
  if (!token) return json({ error: 'forbidden', message: '관리자만 사용할 수 있어요.' }, 403)

  try {
    await verifyAccessJwt(token, await fetchJwks(env.ACCESS_TEAM_DOMAIN), {
      aud: env.ACCESS_AUD,
      iss: `https://${env.ACCESS_TEAM_DOMAIN}`,
    })
  } catch (e) {
    console.error('Access JWT rejected:', e instanceof Error ? e.message : e)
    return json({ error: 'forbidden', message: '관리자 확인에 실패했어요. 다시 로그인해 주세요.' }, 403)
  }

  if (request.method !== 'GET' && !isSameOrigin(request)) {
    return json({ error: 'forbidden', message: '허용되지 않은 요청이에요.' }, 403)
  }

  return context.next()
}
