import { useCallback, useEffect, useState } from 'react'
import { request } from '../api'

type AdminComic = {
  id: string
  imageUrl: string
  likeCount: number
  author: string | null
  publishedAt: string
  isSample: boolean
}

type AdminData = { today: string; pickedId: string | null; comics: AdminComic[] }

export default function AdminScreen() {
  const [data, setData] = useState<AdminData | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    document.title = '관리자 · 오늘의 4컷'
    return () => meta.remove()
  }, [])

  const [attempt, setAttempt] = useState(0)

  const load = useCallback(() => {
    setError('')
    setAttempt((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    request<AdminData>('/api/admin/comics').then(
      (res) => {
        if (!cancelled) setData(res)
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '불러오지 못했어요.')
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  async function pick(comicId: string | null) {
    setSaving(true)
    setError('')
    try {
      const res = await request<{ pickedId: string | null }>('/api/admin/daily-pick', {
        method: comicId ? 'PUT' : 'DELETE',
        body: comicId ? JSON.stringify({ comicId }) : undefined,
      })
      setData((prev) => (prev ? { ...prev, pickedId: res.pickedId } : prev))
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했어요.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[430px] bg-surface px-margin py-space-lg">
      <h1 className="font-headline-lg text-headline-lg text-on-surface">관리자</h1>
      <p className="mt-1 font-body text-body-sm text-on-surface-variant">
        오늘({data?.today ?? '…'}, 한국 시간)의 만화를 지정해요. 지정하지 않으면 노출 점수가 가장 높은 만화가 오늘의 만화가 돼요.
      </p>

      {error && (
        <p role="alert" className="mt-space-md rounded-lg bg-error-container/40 px-space-md py-2 font-body text-body-sm text-on-error-container">
          {error}{' '}
          <button type="button" onClick={load} className="underline">
            다시 불러오기
          </button>
        </p>
      )}

      {data && (
        <>
          <button
            type="button"
            disabled={saving || !data.pickedId}
            onClick={() => void pick(null)}
            className="mt-space-md rounded-lg bg-surface-container-highest px-space-md py-2 font-label-lg text-label-lg text-on-surface transition disabled:opacity-40"
          >
            지정 풀기 (점수 1위로)
          </button>

          {!data.comics.length && (
            <p className="mt-space-lg font-body text-body-md text-on-surface-variant">승인된 만화가 아직 없어요.</p>
          )}

          <ul className="mt-space-md flex flex-col gap-space-sm">
            {data.comics.map((c) => {
              const picked = c.id === data.pickedId
              return (
                <li
                  key={c.id}
                  className={`flex items-center gap-space-md rounded-xl bg-surface-container p-space-sm ${
                    picked ? 'ring-2 ring-primary-container' : ''
                  }`}
                >
                  <img src={c.imageUrl} alt="" className="h-24 w-16 shrink-0 rounded bg-surface-container-lowest object-contain" />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5 font-body text-body-sm text-on-surface-variant">
                    <span className="truncate text-on-surface">
                      {c.author ?? '작가 미상'}
                      {c.isSample && <span className="ml-1.5 rounded bg-surface-container-highest px-1 text-secondary-fixed">샘플</span>}
                    </span>
                    <span>좋아요 {c.likeCount}</span>
                    <span>{new Date(c.publishedAt).toLocaleString('ko-KR')}</span>
                  </div>
                  <button
                    type="button"
                    disabled={saving || picked}
                    onClick={() => void pick(c.id)}
                    className="shrink-0 rounded-lg bg-primary-container px-3 py-2 font-label-md text-label-md text-on-surface transition disabled:bg-surface-container-highest disabled:text-on-surface-variant"
                  >
                    {picked ? '오늘의 만화' : '지정'}
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
