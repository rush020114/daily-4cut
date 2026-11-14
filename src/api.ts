export type Comic = {
  id: string
  imageUrl: string
  width: number | null
  height: number | null
  likeCount: number
  liked: boolean
}

export class ApiError extends Error {
  status: number
  body?: Record<string, unknown>

  constructor(status: number, message: string, body?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

// 이 브라우저를 구분하는 임의의 ID. 같은 기기에서 좋아요 중복을 막는 데 쓴다.
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem('deviceId')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('deviceId', id)
    }
    return id
  } catch {
    // 저장소를 못 쓰면 이번 방문에만 쓰는 ID로 대신한다.
    return (memoryId ??= crypto.randomUUID())
  }
}
let memoryId: string | undefined

export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  headers.set('x-device-id', getDeviceId())
  if (typeof init.body === 'string') headers.set('content-type', 'application/json')

  let res: Response
  try {
    res = await fetch(path, { ...init, headers })
  } catch {
    throw new ApiError(0, '인터넷 연결을 확인한 뒤 다시 시도해 주세요.')
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const message = typeof body.message === 'string' ? body.message : '문제가 생겼어요. 잠시 후 다시 시도해 주세요.'
    throw new ApiError(res.status, message, body)
  }
  return body as T
}

export const fetchComics = () => request<{ comics: Comic[] }>('/api/comics').then((r) => r.comics)

export const setLike = (id: string, like: boolean) =>
  request<{ liked: boolean; likeCount: number }>(`/api/comics/${id}/like`, {
    method: like ? 'POST' : 'DELETE',
  })

export const fetchConfig = () => request<{ turnstileSiteKey: string | null }>('/api/config')

export const uploadComic = (form: FormData) =>
  request<{ id: string; status: 'pending' }>('/api/uploads', { method: 'POST', body: form })
