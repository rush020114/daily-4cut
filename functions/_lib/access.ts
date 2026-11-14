// Cloudflare Access가 붙여 주는 JWT(Cf-Access-Jwt-Assertion)를 직접 검증한다.
// 헤더 존재만 믿으면 Access를 거치지 않은 요청이 통과하므로, 서명·대상·만료를 모두 확인한다.

type Jwk = JsonWebKey & { kid: string }
type Jwks = { keys: Jwk[] }

export type AccessClaims = { aud: string | string[]; iss: string; exp: number; email?: string }

function b64urlToBytes(input: string): Uint8Array {
  const b64 = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(input.length / 4) * 4, '=')
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
}

function decodeJson<T>(part: string): T {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(part))) as T
}

export async function verifyAccessJwt(
  token: string,
  jwks: Jwks,
  expected: { aud: string; iss: string; now?: number },
): Promise<AccessClaims> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('malformed token')
  const header = decodeJson<{ alg?: string; kid?: string }>(parts[0])
  if (header.alg !== 'RS256') throw new Error('unsupported alg')
  const jwk = jwks.keys.find((k) => k.kid === header.kid)
  if (!jwk) throw new Error('unknown key')

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  )
  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    b64urlToBytes(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  )
  if (!valid) throw new Error('bad signature')

  const claims = decodeJson<AccessClaims>(parts[1])
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!aud.includes(expected.aud)) throw new Error('wrong audience')
  if (claims.iss !== expected.iss) throw new Error('wrong issuer')
  if (!(claims.exp > (expected.now ?? Date.now() / 1000))) throw new Error('expired')
  return claims
}

let cached: { domain: string; jwks: Jwks; at: number } | null = null

export async function fetchJwks(teamDomain: string): Promise<Jwks> {
  if (cached && cached.domain === teamDomain && Date.now() - cached.at < 60 * 60 * 1000) return cached.jwks
  const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`)
  if (!res.ok) throw new Error(`certs ${res.status}`)
  const jwks = (await res.json()) as Jwks
  cached = { domain: teamDomain, jwks, at: Date.now() }
  return jwks
}
