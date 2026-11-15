import { useCallback, useEffect, useState } from 'react'
import { request } from '../api'

type AiResult = { flagged?: boolean; flaggedCategories?: string[]; error?: string }

type Item = {
  id: string
  imageUrl: string
  status: string
  author: string | null
  hasEmail: boolean
  likeCount: number
  createdAt: string
  publishedAt: string | null
  isSample: boolean
  ai: AiResult | null
  reports: string[]
}

type QueueName = 'review' | 'hidden' | 'pending' | 'rejected' | 'approved'

type AdminData = {
  today: string
  pickedId: string | null
  queues: Record<QueueName, Item[]>
}

const TABS: { id: QueueName; label: string }[] = [
  { id: 'review', label: '승인 대기' },
  { id: 'hidden', label: '신고로 숨김' },
  { id: 'pending', label: 'AI 검수 대기' },
  { id: 'rejected', label: '거절됨' },
  { id: 'approved', label: '공개 중' },
]

const REASON_LABEL: Record<string, string> = { inappropriate: '선정·폭력', copyright: '저작권', other: '기타' }

function aiSummary(ai: AiResult | null): { text: string; warn: boolean } {
  if (!ai) return { text: 'AI 검수 전', warn: false }
  if (ai.error) return { text: `AI 검수 실패: ${ai.error}`, warn: true }
  if (ai.flaggedCategories?.length) return { text: `AI가 걸러낸 항목: ${ai.flaggedCategories.join(', ')}`, warn: true }
  return { text: 'AI 검수 통과', warn: false }
}

function reportSummary(reports: string[]): string {
  const counts = new Map<string, number>()
  for (const r of reports) counts.set(r, (counts.get(r) ?? 0) + 1)
  const parts = [...counts].map(([k, n]) => `${REASON_LABEL[k] ?? k} ${n}`)
  return `신고 ${reports.length}건${parts.length ? ` (${parts.join(', ')})` : ''}`
}

const MAIL_NOTE: Record<string, string> = {
  sent: ' 작가에게 결과 메일을 보냈어요.',
  failed: ' 다만 작가에게 보내는 결과 메일은 실패했어요. (작가 이메일/Resend 설정을 확인해 주세요)',
}

export default function AdminScreen() {
  const [data, setData] = useState<AdminData | null>(null)
  const [tab, setTab] = useState<QueueName>('review')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const meta = document.createElement('meta')
    meta.name = 'robots'
    meta.content = 'noindex'
    document.head.appendChild(meta)
    document.title = '관리자 · 오늘의 4컷'
    return () => meta.remove()
  }, [])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    request<AdminData>('/api/admin/comics').then(
      (res) => {
        if (cancelled) return
        // 로그인이 만료되어 로그인 페이지가 오는 등 예상한 형태가 아니면 빈 화면이 되지 않도록 안내한다
        if (!res?.queues) {
          setError('관리자 데이터를 읽지 못했어요. 로그인이 만료되었을 수 있어요. 페이지를 새로고침해 다시 로그인해 주세요.')
          return
        }
        setData(res)
        setError('')
      },
      (e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : '불러오지 못했어요.')
      },
    )
    return () => {
      cancelled = true
    }
  }, [attempt])

  // 한 번에 하나만 처리한다. 끝나면 목록을 다시 불러온다.
  async function run(id: string, action: () => Promise<string>) {
    setBusyId(id)
    setError('')
    setNotice('')
    try {
      setNotice(await action())
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리하지 못했어요.')
    } finally {
      setBusyId(null)
      reload()
    }
  }

  const decide = (item: Item, decision: 'approve' | 'reject', confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return
    void run(item.id, async () => {
      const res = await request<{ status: string; mail: string }>(`/api/admin/comics/${item.id}/decision`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      })
      return `${res.status === 'approved' ? '승인했어요.' : '거절했어요.'}${MAIL_NOTE[res.mail] ?? ''}`
    })
  }

  const recheck = (item: Item) =>
    void run(item.id, async () => {
      const res = await request<{ status: string; mail: string }>(`/api/admin/comics/${item.id}/recheck`, { method: 'POST' })
      const label = res.status === 'rejected' ? 'AI가 거절했어요.' : 'AI 검수를 통과해 승인 대기로 옮겼어요.'
      return `${label}${MAIL_NOTE[res.mail] ?? ''}`
    })

  const pick = (item: Item | null) =>
    void run(item?.id ?? 'pick', async () => {
      await request('/api/admin/daily-pick', {
        method: item ? 'PUT' : 'DELETE',
        body: item ? JSON.stringify({ comicId: item.id }) : undefined,
      })
      return item ? '오늘의 만화로 지정했어요.' : '지정을 풀었어요. 노출 점수 1위가 오늘의 만화가 돼요.'
    })

  const list = data?.queues[tab] ?? []

  return (
    <div className="mx-auto min-h-dvh w-full max-w-[560px] bg-surface px-margin py-space-lg">
      <h1 className="font-headline-lg text-headline-lg text-on-surface">관리자</h1>

      <div className="mt-space-md flex gap-space-xs overflow-x-auto pb-1" role="tablist" style={{ scrollbarWidth: 'none' }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 font-label-md text-label-md whitespace-nowrap transition ${
              tab === t.id ? 'bg-primary-container text-on-surface' : 'bg-surface-container-high text-on-surface-variant'
            }`}
          >
            {t.label}
            {data && <span className="ml-1 opacity-80">{data.queues[t.id].length}</span>}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="mt-space-md rounded-lg bg-error-container/40 px-space-md py-2 font-body text-body-sm text-on-error-container">
          {error}{' '}
          <button type="button" onClick={reload} className="underline">
            다시 불러오기
          </button>
        </p>
      )}
      {notice && (
        <p role="status" className="mt-space-md rounded-lg bg-surface-container-high px-space-md py-2 font-body text-body-sm text-on-surface">
          {notice}
        </p>
      )}

      {tab === 'approved' && data && (
        <div className="mt-space-md flex items-center justify-between gap-space-sm font-body text-body-sm text-on-surface-variant">
          <span>오늘({data.today}, 한국 시간)의 만화를 지정해요. 지정하지 않으면 노출 점수 1위가 오늘의 만화가 돼요.</span>
          <button
            type="button"
            disabled={busyId !== null || !data.pickedId}
            onClick={() => pick(null)}
            className="shrink-0 rounded-lg bg-surface-container-highest px-3 py-2 font-label-md text-label-md whitespace-nowrap text-on-surface disabled:opacity-40"
          >
            지정 풀기
          </button>
        </div>
      )}

      {data && !list.length && (
        <p className="mt-space-lg font-body text-body-md text-on-surface-variant">여기에는 아직 아무것도 없어요.</p>
      )}

      <ul className="mt-space-md flex flex-col gap-space-sm">
        {list.map((item) => {
          const ai = aiSummary(item.ai)
          const busy = busyId === item.id
          const picked = item.id === data?.pickedId
          const btn = 'rounded-lg px-3 py-2 font-label-md text-label-md whitespace-nowrap transition disabled:opacity-40'
          return (
            <li
              key={item.id}
              className={`flex gap-space-md rounded-xl bg-surface-container p-space-sm ${picked ? 'ring-2 ring-primary-container' : ''}`}
            >
              <a href={item.imageUrl} target="_blank" rel="noreferrer" className="shrink-0" aria-label="이미지 크게 보기">
                <img src={item.imageUrl} alt="" className="h-36 w-24 rounded bg-surface-container-lowest object-contain" />
              </a>
              <div className="flex min-w-0 flex-1 flex-col gap-1 font-body text-body-sm text-on-surface-variant">
                <span className="truncate text-on-surface">
                  {item.author ?? '작가 미상'}
                  {item.isSample && <span className="ml-1.5 rounded bg-surface-container-highest px-1 text-secondary-fixed">샘플</span>}
                  {picked && <span className="ml-1.5 rounded bg-primary-container/30 px-1 text-primary">오늘의 만화</span>}
                </span>
                <span>{new Date(item.createdAt).toLocaleString('ko-KR')}</span>
                <span className={ai.warn ? 'text-on-error-container' : undefined}>{ai.text}</span>
                {item.reports.length > 0 && <span className="text-on-error-container">{reportSummary(item.reports)}</span>}
                <span>
                  {tab === 'approved' ? `좋아요 ${item.likeCount} · ` : ''}
                  {item.hasEmail ? '이메일 있음' : '이메일 없음'}
                </span>

                <div className="mt-auto flex flex-wrap gap-space-xs pt-1">
                  {tab === 'review' && (
                    <>
                      <button type="button" disabled={busy} onClick={() => decide(item, 'approve')} className={`${btn} bg-primary-container text-on-surface`}>
                        승인
                      </button>
                      <button type="button" disabled={busy} onClick={() => decide(item, 'reject', '이 만화를 거절할까요?')} className={`${btn} bg-surface-container-highest text-on-surface`}>
                        거절
                      </button>
                    </>
                  )}
                  {tab === 'hidden' && (
                    <>
                      <button type="button" disabled={busy} onClick={() => decide(item, 'approve')} className={`${btn} bg-primary-container text-on-surface`}>
                        숨김 해제
                      </button>
                      <button type="button" disabled={busy} onClick={() => decide(item, 'reject', '이 만화를 거절할까요?')} className={`${btn} bg-surface-container-highest text-on-surface`}>
                        거절
                      </button>
                    </>
                  )}
                  {tab === 'pending' && (
                    <>
                      <button type="button" disabled={busy} onClick={() => recheck(item)} className={`${btn} bg-surface-container-highest text-on-surface`}>
                        다시 AI 검수
                      </button>
                      <button type="button" disabled={busy} onClick={() => decide(item, 'approve', 'AI 검수 없이 직접 보고 승인할까요?')} className={`${btn} bg-primary-container text-on-surface`}>
                        승인
                      </button>
                      <button type="button" disabled={busy} onClick={() => decide(item, 'reject', '이 만화를 거절할까요?')} className={`${btn} bg-surface-container-highest text-on-surface`}>
                        거절
                      </button>
                    </>
                  )}
                  {tab === 'rejected' && (
                    <button type="button" disabled={busy} onClick={() => decide(item, 'approve', '거절했던 만화를 승인해 공개할까요?')} className={`${btn} bg-primary-container text-on-surface`}>
                      승인으로 바꾸기
                    </button>
                  )}
                  {tab === 'approved' && (
                    <>
                      <button type="button" disabled={busyId !== null || picked} onClick={() => pick(item)} className={`${btn} bg-primary-container text-on-surface`}>
                        {picked ? '오늘의 만화' : '오늘의 만화로'}
                      </button>
                      <button type="button" disabled={busy} onClick={() => decide(item, 'reject', '공개 중인 만화를 내릴까요? (거절 상태가 돼요)')} className={`${btn} bg-surface-container-highest text-on-surface`}>
                        내리기
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
