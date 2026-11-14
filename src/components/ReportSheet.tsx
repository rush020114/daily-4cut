import { useState } from 'react'
import type { ReportReason } from '../api'

const REASONS: { id: ReportReason; label: string }[] = [
  { id: 'inappropriate', label: '선정적이거나 폭력적인 내용이에요' },
  { id: 'copyright', label: '저작권 침해가 의심돼요' },
  { id: 'other', label: '기타' },
]

type Props = {
  onClose: () => void
  // 실패하면 오류를 던진다. 메시지는 시트 안에 보여 준다.
  onSubmit: (reason: ReportReason) => Promise<void>
}

export default function ReportSheet({ onClose, onSubmit }: Props) {
  const [sending, setSending] = useState<ReportReason | null>(null)
  const [error, setError] = useState('')

  async function send(reason: ReportReason) {
    setSending(reason)
    setError('')
    try {
      await onSubmit(reason)
    } catch (e) {
      setError(e instanceof Error ? e.message : '신고를 보내지 못했어요. 잠시 후 다시 시도해 주세요.')
      setSending(null)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60" onClick={sending ? undefined : onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="만화 신고"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[430px] rounded-t-2xl bg-surface-container-high px-margin pt-space-md pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <h2 className="font-headline text-headline-sm text-on-surface">이 만화를 신고할까요?</h2>
        <p className="mt-1 font-body text-body-sm text-on-surface-variant">
          신고가 쌓이면 만화가 숨겨지고 운영자가 확인해요.
        </p>

        <div className="mt-space-md flex flex-col gap-space-sm">
          {REASONS.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={sending !== null}
              onClick={() => void send(r.id)}
              className="rounded-lg bg-surface-container-highest px-space-md py-3 text-left font-label-lg text-label-lg text-on-surface transition active:scale-[0.98] hover:bg-surface-bright disabled:opacity-50"
            >
              {sending === r.id ? '보내는 중…' : r.label}
            </button>
          ))}
        </div>

        {error && (
          <p role="alert" className="mt-space-sm rounded-lg bg-error-container/40 px-space-md py-2 font-body text-body-sm text-on-error-container">
            {error}
          </p>
        )}

        <button
          type="button"
          disabled={sending !== null}
          onClick={onClose}
          className="mt-space-sm w-full rounded-lg py-3 font-label-lg text-label-lg text-on-surface-variant disabled:opacity-50"
        >
          취소
        </button>
      </div>
    </div>
  )
}
