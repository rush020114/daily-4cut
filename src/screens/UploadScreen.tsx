import { useEffect, useRef, useState } from 'react'

const MAX_BYTES = 15 * 1024 * 1024
const ACCEPT = ['image/png', 'image/jpeg', 'image/webp']
// 가로세로 비율이 이보다 극단적이면(1:3보다 긴 띠) 거절한다
const MAX_RATIO = 3

type Picked = { url: string; name: string; size: number }

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('load'))
    img.src = url
  })
}

type Props = { onBack: () => void }

export default function UploadScreen({ onBack }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [error, setError] = useState('')
  const [nickname, setNickname] = useState('')
  const [toast, setToast] = useState(false)

  useEffect(() => {
    return () => {
      if (picked) URL.revokeObjectURL(picked.url)
    }
  }, [picked])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  async function handleFile(file: File) {
    setError('')
    if (!ACCEPT.includes(file.type)) {
      setError('JPG, PNG, WebP 형식만 올릴 수 있어요. 다른 파일을 선택해 주세요.')
      return
    }
    if (file.size > MAX_BYTES) {
      setError(`파일이 너무 커요 (${formatSize(file.size)}). 15MB 이하로 줄여서 다시 선택해 주세요.`)
      return
    }
    const url = URL.createObjectURL(file)
    try {
      const img = await loadImage(url)
      const ratio = Math.max(img.naturalWidth / img.naturalHeight, img.naturalHeight / img.naturalWidth)
      if (ratio > MAX_RATIO) {
        URL.revokeObjectURL(url)
        setError('이미지 비율이 너무 길어요. 가로세로 비율이 1:3 이내인 이미지를 선택해 주세요.')
        return
      }
    } catch {
      URL.revokeObjectURL(url)
      setError('이미지를 읽지 못했어요. 파일이 손상되었는지 확인하고 다시 선택해 주세요.')
      return
    }
    setPicked({ url, name: file.name, size: file.size })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!picked) {
      setError('4컷 만화 이미지를 먼저 선택해 주세요.')
      return
    }
    // 1단계는 화면만 구현한다. 실제 업로드와 검수는 3단계에서 연결한다.
    setToast(true)
    toastTimer.current = window.setTimeout(() => setToast(false), 2500)
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto px-margin pb-space-xl">
      <button
        type="button"
        onClick={onBack}
        className="-ml-2 flex items-center gap-space-xs rounded-lg px-2 py-1.5 font-label-md text-label-md text-on-surface-variant transition-colors hover:text-on-surface"
      >
        <span className="material-symbols-outlined text-xl">arrow_back_ios_new</span>
        오늘의 컷으로 돌아가기
      </button>

      <div className="mt-space-sm mb-space-lg flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="font-headline-lg text-headline-lg tracking-tight text-on-surface">
            새 4컷 만화 등록
          </h1>
          <span className="rounded-full bg-primary-container/20 px-2 py-0.5 font-label-sm text-label-sm text-primary">
            TODAY
          </span>
        </div>
        <p className="font-body text-body-sm text-on-surface-variant">
          당신의 오늘 하루, 네 컷의 이야기로 독자들과 따뜻하게 공유해보세요.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-space-lg">
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-label-lg text-label-lg text-on-surface">
              <span className="material-symbols-outlined text-base text-primary-container">perm_media</span>
              4컷 만화 이미지 업로드
              <span className="font-label-sm text-label-sm text-primary">*필수</span>
            </span>
            <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-label-sm text-label-sm text-secondary-fixed">
              권장 비율 9:16
            </span>
          </div>

          <div className="flex flex-col items-center rounded-xl bg-surface-container-low p-space-md">
            {picked ? (
              <div className="flex w-full max-w-[280px] flex-col gap-2 rounded-lg bg-surface-container-lowest p-2 shadow-xl">
                <div className="flex max-h-[50dvh] w-full items-center justify-center overflow-hidden rounded bg-surface-container-highest">
                  <img
                    src={picked.url}
                    alt="4컷 만화 미리보기"
                    className="max-h-[50dvh] w-full object-contain"
                  />
                </div>
                <div className="flex items-center justify-between px-1 py-0.5">
                  <span className="max-w-[160px] truncate font-label-sm text-label-sm text-on-surface-variant">
                    {picked.name}
                  </span>
                  <span className="font-label-sm text-label-sm text-tertiary">{formatSize(picked.size)}</span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="flex aspect-[9/16] max-h-[40dvh] w-full max-w-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-4xl">add_photo_alternate</span>
                <span className="font-label-md text-label-md">이미지를 선택하세요</span>
              </button>
            )}

            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
                e.target.value = ''
              }}
            />

            <div className="mt-space-md flex w-full items-center justify-between rounded-lg bg-surface-container px-space-md py-2.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-on-surface-variant">image</span>
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-on-surface">JPG, PNG, WebP 지원</span>
                  <span className="font-body text-body-sm text-on-surface-variant">
                    이미지 한 장에 4컷 (최대 15MB)
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="rounded bg-surface-container-highest px-3 py-1.5 font-label-md text-label-md text-on-surface transition active:scale-95 hover:bg-surface-bright"
              >
                {picked ? '다시 선택' : '파일 선택'}
              </button>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="flex items-start gap-1.5 rounded-lg bg-error-container/40 px-space-md py-2 font-body text-body-sm text-on-error-container"
            >
              <span className="material-symbols-outlined text-base">error</span>
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label
              htmlFor="author-nickname"
              className="flex items-center gap-1.5 font-label-lg text-label-lg text-on-surface"
            >
              <span className="material-symbols-outlined text-base text-secondary">face</span>
              작가 닉네임
              <span className="font-label-sm text-label-sm text-primary">*필수</span>
            </label>
            <span className="font-label-sm text-label-sm text-on-surface-variant">{nickname.length}/15</span>
          </div>
          <input
            id="author-nickname"
            name="nickname"
            type="text"
            required
            maxLength={15}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="예) 냥이집사, 공감툰작가"
            className="w-full rounded-lg bg-surface-container-low px-space-md py-3 font-body text-body-md text-on-surface transition-colors placeholder:text-outline-variant focus:bg-surface-container-high focus:outline-none"
          />
        </div>

        <div className="flex items-start gap-space-sm rounded-xl bg-surface-container p-space-md">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-container-highest">
            <span className="material-symbols-outlined text-lg text-secondary">auto_stories</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="font-headline text-headline-sm text-on-surface">오늘의 4컷 가이드</span>
            <ul className="flex list-none flex-col gap-1 font-body text-body-sm text-on-surface-variant">
              <li className="flex items-start gap-1.5">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-secondary" />
                <span>
                  이미지 한 장에 <strong>4컷이 모두 담긴</strong> 만화를 올려주세요.
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-secondary" />
                <span>
                  모바일 최적화 권장 비율은 <strong>9:16</strong> (세로형) 입니다. 다른 비율도 너무 길지
                  않으면(1:3 이내) 올릴 수 있어요.
                </span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-secondary" />
                <span>선정적이거나 저작권을 침해하는 만화는 사전 고지 없이 숨김 처리될 수 있습니다.</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col gap-space-xs pt-space-xs">
          <button
            type="submit"
            className="group flex w-full items-center justify-center gap-2 rounded-lg bg-primary-container px-space-md py-3.5 font-headline text-headline-sm text-on-surface shadow-lg shadow-primary-container/25 transition-all hover:brightness-110 active:scale-[0.98]"
          >
            <span className="material-symbols-outlined transition-transform group-hover:translate-x-0.5">send</span>
            오늘의 4컷 등록하기
          </button>
          <p className="py-1 text-center font-label-sm text-label-sm text-on-surface-variant">
            검수 후 공개됩니다
          </p>
        </div>
      </form>

      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed inset-x-4 bottom-20 z-20 mx-auto flex max-w-[398px] items-center gap-3 rounded-xl bg-surface-container-high/95 p-space-md shadow-2xl backdrop-blur-xl transition-all duration-300 ${
          toast ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'
        }`}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-tertiary-container text-on-tertiary">
          <span className="material-symbols-outlined">info</span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-headline text-headline-sm text-on-surface">아직 샘플 화면이에요</span>
          <span className="font-body text-body-sm text-on-surface-variant">
            실제 업로드와 검수는 다음 단계에서 연결됩니다.
          </span>
        </div>
      </div>
    </div>
  )
}
