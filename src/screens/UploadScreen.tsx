import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, fetchConfig, uploadComic } from '../api'
import Turnstile from '../components/Turnstile'
import { UPLOAD_CONSENT_ITEMS } from '../legal/constants'
import { track } from '../lib/analytics'
import { formatReport, STAGE_LABEL, type ErrorReport, type Stage } from '../lib/diagnostics'
import { ACCEPTED_TYPES, LIMITS, TERMS_VERSION } from '../lib/limits'
import { ImageError, readFileBytes, toWebp, type WebpResult } from '../lib/toWebp'

type Picked = { previewUrl: string; name: string; originalSize: number; webp: WebpResult | null }

function formatSize(bytes: number) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

type Props = { onBack: () => void }

export default function UploadScreen({ onBack }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const pickSeq = useRef(0)
  const errorRef = useRef<HTMLDivElement>(null)
  const [picked, setPicked] = useState<Picked | null>(null)
  const [converting, setConverting] = useState(false)
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [agreed, setAgreed] = useState(false)
  const [error, setError] = useState<ErrorReport | null>(null)
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [dragOver, setDragOver] = useState(false) // 파일을 끌어다 화면 위에 올려 둔 동안
  const [pickerOpen, setPickerOpen] = useState(false) // 윈도우 파일 선택 창이 열려 있는 동안
  const [dropNotice, setDropNotice] = useState('')
  const blockedRef = useRef(false) // 올리는 중이거나 완료 화면이면 끌어다 놓기를 받지 않는다
  const dropRef = useRef<(files: File[]) => void>(() => {})

  const [siteKey, setSiteKey] = useState<string | null | undefined>(undefined)
  const [configError, setConfigError] = useState('')
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaRun, setCaptchaRun] = useState(0)

  useEffect(() => {
    fetchConfig().then(
      (c) => setSiteKey(c.turnstileSiteKey),
      (e: unknown) => {
        setSiteKey(null)
        setConfigError(e instanceof Error ? e.message : '설정을 불러오지 못했어요.')
      },
    )
  }, [])

  useEffect(() => {
    const url = picked?.previewUrl
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [picked?.previewUrl])

  // 오류가 화면 밖(아래쪽)에 뜨면 못 보고 지나치므로 보이는 곳으로 스크롤한다
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [error])

  // 끌어다 놓기가 쓸 최신 상태와 동작 (창 전체 이벤트는 한 번만 붙이므로 ref 로 최신 값을 읽는다)
  useEffect(() => {
    blockedRef.current = submitting || done
    dropRef.current = (files) => {
      if (!files[0]) return
      void handleFile(files[0])
      if (files.length > 1) setDropNotice('여러 장을 놓았어요. 첫 번째 이미지만 올릴 수 있어요.')
    }
  })

  // 사진 끌어다 놓기: 화면 어디에 놓아도 올릴 이미지로 선택된다.
  // 엉뚱한 곳에 놓았을 때 브라우저가 그 사진을 열면서 페이지를 떠나 버리지 않도록 파일 끌기는 항상 이 화면이 받는다.
  useEffect(() => {
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    let depth = 0
    const reset = () => {
      depth = 0
      setDragOver(false)
    }
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      depth++
      if (!blockedRef.current) setDragOver(true)
    }
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = blockedRef.current ? 'none' : 'copy'
    }
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      depth = Math.max(0, depth - 1)
      if (depth === 0) setDragOver(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      reset()
      if (!blockedRef.current) dropRef.current(Array.from(e.dataTransfer?.files ?? []))
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    // 끌기가 끝났는데 안내가 남아 있는 경우를 대비한다 (끄는 동안에는 마우스 움직임 이벤트가 오지 않는다)
    window.addEventListener('mousemove', reset)
    window.addEventListener('keydown', reset)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('mousemove', reset)
      window.removeEventListener('keydown', reset)
    }
  }, [])

  // 파일 선택 창이 열려 있는 동안 화면을 덮어 다른 곳을 누르지 못하게 하고, 창이 닫히면(취소 포함) 덮개를 걷는다.
  // 파일을 고르면 handleFile 이 걷고, 취소하면 input 의 cancel 이벤트나 창으로 돌아오는 순간(focus)에 걷는다.
  useEffect(() => {
    if (!pickerOpen) return
    const input = inputRef.current
    const close = () => setPickerOpen(false)
    let timer: number | undefined
    // 고른 파일의 change 가 먼저 오면 이미 닫혀 있다. 아무 일 없이 돌아왔다면 취소로 본다.
    const onFocus = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(close, 800)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    input?.addEventListener('cancel', close)
    window.addEventListener('focus', onFocus)
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(timer)
      input?.removeEventListener('cancel', close)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('keydown', onKey)
    }
  }, [pickerOpen])

  const fail = useCallback((message: string, stage: Stage, detail = '') => {
    setCopied(false)
    setError({ message, stage, detail })
  }, [])
  const onCaptchaError = useCallback((message: string) => fail(message, 'captcha', 'turnstile widget'), [fail])

  async function handleFile(file: File) {
    setError(null)
    setDropNotice('')
    setPickerOpen(false)
    // 먼저 파일 내용을 메모리로 복사한다. (안드로이드에서는 고른 파일 참조가 나중에 읽히지 않는 경우가 있다)
    const seq = ++pickSeq.current
    setConverting(true)
    let previewUrl = ''
    try {
      const bytes = await readFileBytes(file)
      if (seq !== pickSeq.current) return
      if (!ACCEPTED_TYPES.includes(file.type)) {
        throw new ImageError('JPG, PNG, WebP 형식만 올릴 수 있어요. 다른 파일을 선택해 주세요.', 'check', `type=${file.type || '(없음)'} name=${file.name}`)
      }
      if (bytes.length > LIMITS.maxInputBytes) {
        throw new ImageError(`파일이 너무 커요 (${formatSize(bytes.length)}). 15MB 이하로 줄여서 다시 선택해 주세요.`, 'check', `size=${bytes.length}`)
      }

      previewUrl = URL.createObjectURL(new Blob([bytes as BlobPart], { type: file.type }))
      setPicked({ previewUrl, name: file.name, originalSize: bytes.length, webp: null })
      const webp = await toWebp(bytes, file.type)
      if (seq !== pickSeq.current) return
      setPicked((p) => (p ? { ...p, webp } : p))
    } catch (e) {
      if (seq !== pickSeq.current) return
      setPicked(null)
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      const stage = e instanceof ImageError ? e.stage : 'decode'
      if (e instanceof ImageError) fail(e.message, e.stage, e.detail)
      else fail('이미지를 준비하지 못했어요. 다른 이미지로 시도해 주세요.', 'decode', String(e))
      // 어느 단계에서 막히는지만 센다. 파일 이름·내용·기기 정보(detail)는 보내지 않는다.
      track('comic_upload_error', { stage, status: 0, code: 'image_prepare' })
    } finally {
      if (seq === pickSeq.current) setConverting(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!picked?.webp) {
      return fail(converting ? '이미지를 준비하는 중이에요. 잠시만 기다려 주세요.' : '4컷 만화 이미지를 먼저 선택해 주세요.', 'check', 'no image')
    }
    if (!agreed) return fail('약관에 동의해야 올릴 수 있어요.', 'check', 'terms not checked')
    if (!captchaToken) return fail('봇이 아닌지 확인하는 중이에요. 잠시 후 다시 눌러 주세요.', 'captcha', 'no token yet')

    const form = new FormData()
    form.set('image', picked.webp.blob, 'comic.webp')
    form.set('nickname', nickname)
    form.set('email', email)
    form.set('terms', TERMS_VERSION)
    form.set('cf-turnstile-response', captchaToken)

    setSubmitting(true)
    try {
      await uploadComic(form)
      setDone(true)
      track('comic_upload', {
        width: picked.webp.width,
        height: picked.webp.height,
        size_kb: Math.round(picked.webp.blob.size / 1024),
        has_email: email.trim() !== '',
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : '업로드하지 못했어요. 잠시 후 다시 시도해 주세요.'
      const detail =
        err instanceof ApiError
          ? `HTTP ${err.status} ${String(err.body?.error ?? '')} | webp=${picked.webp.blob.size}B ${picked.webp.width}x${picked.webp.height}`
          : String(err)
      fail(message, 'upload', detail)
      track('comic_upload_error', {
        stage: 'upload',
        status: err instanceof ApiError ? err.status : 0,
        code: err instanceof ApiError ? String(err.body?.error ?? '') : 'network',
      })
    } finally {
      // 봇 확인 토큰은 한 번만 쓸 수 있어서 결과와 상관없이 새로 받는다
      setCaptchaToken(null)
      setCaptchaRun((n) => n + 1)
      setSubmitting(false)
    }
  }

  // 같은 파일을 다시 골라도 change 가 일어나도록, 열기 직전에 이전 선택을 비운다
  function openPicker() {
    if (inputRef.current) inputRef.current.value = ''
    setPickerOpen(true)
    inputRef.current?.click()
  }

  async function copyReport() {
    if (!error) return
    try {
      await navigator.clipboard.writeText(formatReport(error))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  // 고른 이미지를 빼고 처음 상태로 돌아간다. 변환 중이면 그것도 멈춘다.
  function removeImage() {
    pickSeq.current++
    setConverting(false)
    setPicked(null)
    setError(null)
    setDropNotice('')
    if (inputRef.current) inputRef.current.value = ''
  }

  function reset() {
    setPicked(null)
    setNickname('')
    setEmail('')
    setAgreed(false)
    setError(null)
    setDone(false)
  }

  if (done) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-space-md px-space-xl text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-tertiary-container text-on-tertiary">
          <span className="material-symbols-outlined text-3xl">check</span>
        </div>
        <h1 className="font-headline text-headline-sm text-on-surface">만화를 받았어요</h1>
        <p role="status" className="font-body text-body-md text-on-surface-variant">
          검수 후 공개됩니다.
        </p>
        <div className="flex gap-space-sm pt-space-sm">
          <button
            type="button"
            onClick={reset}
            className="rounded-lg bg-surface-container-highest px-space-md py-2.5 font-label-lg text-label-lg text-on-surface transition active:scale-95 hover:bg-surface-bright"
          >
            하나 더 올리기
          </button>
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg bg-primary-container px-space-md py-2.5 font-label-lg text-label-lg text-on-surface transition active:scale-95 hover:brightness-110"
          >
            오늘의 컷 보기
          </button>
        </div>
      </div>
    )
  }

  const busy = converting || submitting

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto px-margin pb-space-xl">
      {/* 파일을 끌어다 화면 위에 올려 둔 동안 보이는 안내. 놓는 일은 창 전체가 받는다 */}
      {dragOver && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-margin">
          <div className="flex max-w-[360px] flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary-container bg-surface-container-high px-space-xl py-space-xl text-center">
            <span className="material-symbols-outlined text-5xl text-primary-container">add_photo_alternate</span>
            <p className="font-headline text-headline-sm text-on-surface">여기에 놓으면 올릴 이미지로 선택돼요</p>
            <p className="font-body text-body-sm text-on-surface-variant">JPG, PNG, WebP · 한 장</p>
          </div>
        </div>
      )}

      {/* 파일 선택 창이 떠 있는 동안: 다른 곳을 누르지 못하게 화면을 덮는다. (끌어다 놓기는 창이 뜨지 않으므로 해당 없음) */}
      {pickerOpen && (
        <div role="dialog" aria-modal="true" aria-label="파일 선택 중" className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-margin">
          <div className="flex w-full max-w-[320px] flex-col items-center gap-3 rounded-2xl bg-surface-container-high px-space-xl py-space-lg text-center shadow-2xl">
            <span className="material-symbols-outlined text-4xl text-primary-container">add_photo_alternate</span>
            <p className="font-headline text-headline-sm text-on-surface">파일 선택 창에서 이미지를 골라 주세요</p>
            <button
              type="button"
              onClick={() => setPickerOpen(false)}
              className="rounded-lg bg-surface-container-highest px-space-md py-2 font-label-lg text-label-lg text-on-surface transition active:scale-95 hover:bg-surface-bright"
            >
              선택 취소
            </button>
          </div>
        </div>
      )}

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
          <h1 className="font-headline-lg text-headline-lg tracking-tight text-on-surface">새 4컷 만화 등록</h1>
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
              4컷 만화 이미지
              <span className="font-label-sm text-label-sm text-primary">*필수</span>
            </span>
            <span className="rounded-full bg-surface-container-high px-2 py-0.5 font-label-sm text-label-sm text-secondary-fixed">
              권장 비율 9:16
            </span>
          </div>

          <div className="flex flex-col items-center rounded-xl bg-surface-container-low p-space-md">
            {picked ? (
              <div className="flex w-full max-w-[280px] flex-col gap-2 rounded-lg bg-surface-container-lowest p-2 shadow-xl">
                <div className="relative flex max-h-[50dvh] w-full items-center justify-center overflow-hidden rounded bg-surface-container-highest">
                  <img src={picked.previewUrl} alt="4컷 만화 미리보기" className="max-h-[50dvh] w-full object-contain" />
                  <button
                    type="button"
                    aria-label="이미지 빼기"
                    title="이미지 빼기"
                    disabled={submitting}
                    onClick={removeImage}
                    className="absolute top-1.5 right-1.5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/65 text-white backdrop-blur transition active:scale-90 hover:bg-black/80 disabled:opacity-50"
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                  {converting && (
                    <div role="status" className="absolute inset-0 flex items-center justify-center bg-surface/70 font-label-md text-label-md text-on-surface">
                      이미지 준비 중…
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between px-1 py-0.5">
                  <span className="max-w-[150px] truncate font-label-sm text-label-sm text-on-surface-variant">{picked.name}</span>
                  <span className="font-label-sm text-label-sm text-tertiary">
                    {picked.webp ? `WebP ${formatSize(picked.webp.blob.size)}` : formatSize(picked.originalSize)}
                  </span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={openPicker}
                className="flex aspect-[9/16] max-h-[40dvh] w-full max-w-[200px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-outline-variant bg-surface-container-lowest text-on-surface-variant transition-colors hover:bg-surface-container"
              >
                <span className="material-symbols-outlined text-4xl">add_photo_alternate</span>
                <span className="font-label-md text-label-md">이미지를 선택하세요</span>
                {/* 마우스가 있는 기기(컴퓨터)에서만 보인다 */}
                <span className="hidden font-body text-body-sm [@media(hover:hover)]:block">또는 끌어다 놓기</span>
              </button>
            )}

            <input
              ref={inputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                // 값을 여기서 비우지 않는다: 안드로이드에서 고른 파일이 읽히지 않게 될 수 있다. 다시 고를 때 openPicker 가 비운다.
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
              }}
            />

            <div className="mt-space-md flex w-full items-center justify-between rounded-lg bg-surface-container px-space-md py-2.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="material-symbols-outlined shrink-0 text-lg text-on-surface-variant">image</span>
                <div className="flex min-w-0 flex-col">
                  <span className="font-label-md text-label-md text-on-surface">JPG, PNG, WebP 지원</span>
                  <span className="font-body text-body-sm text-on-surface-variant">한 장에 4컷, 가로세로 1:3 이내 (최대 15MB)</span>
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={openPicker}
                className="ml-2 shrink-0 rounded bg-surface-container-highest px-3 py-1.5 font-label-md whitespace-nowrap text-label-md text-on-surface transition active:scale-95 hover:bg-surface-bright disabled:opacity-50"
              >
                {picked ? '다시 선택' : '파일 선택'}
              </button>
            </div>
          </div>
          <p className="font-body text-body-sm text-on-surface-variant">세로 9:16 한 장을 추천해요. 휴대폰에서 가장 크게 보여요.</p>
          {dropNotice && (
            <p role="status" className="font-body text-body-sm text-secondary-fixed">
              {dropNotice}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="author-nickname" className="flex items-center gap-1.5 font-label-lg text-label-lg text-on-surface">
              <span className="material-symbols-outlined text-base text-secondary">face</span>
              닉네임
              <span className="font-label-sm text-label-sm text-primary">*필수</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">공개되지 않아요</span>
            </label>
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {Array.from(nickname).length}/{LIMITS.nicknameMax}
            </span>
          </div>
          <input
            id="author-nickname"
            aria-describedby="author-name-help"
            type="text"
            required
            maxLength={LIMITS.nicknameMax}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="예) 냥이집사, 공감툰작가"
            className="w-full rounded-lg bg-surface-container-low px-space-md py-3 font-body text-body-md text-on-surface transition-colors placeholder:text-outline-variant focus:bg-surface-container-high focus:outline-none"
          />
          <p id="author-name-help" className="font-body text-body-sm text-on-surface-variant">
            운영자만 볼 수 있고, 결과 안내 메일의 호칭에 쓰여요.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="contact-email" className="flex items-center gap-1.5 font-label-lg text-label-lg text-on-surface">
            <span className="material-symbols-outlined text-base text-secondary">mail</span>
            이메일
            <span className="font-label-sm text-label-sm text-on-surface-variant">선택</span>
            <span className="font-label-sm text-label-sm text-on-surface-variant">검수 결과를 메일로 알려 드려요</span>
          </label>
          <input
            id="contact-email"
            // Clarity 화면 녹화에서 이메일 입력값을 가린다
            data-clarity-mask="True"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-full rounded-lg bg-surface-container-low px-space-md py-3 font-body text-body-md text-on-surface transition-colors placeholder:text-outline-variant focus:bg-surface-container-high focus:outline-none"
          />
          <p className="font-body text-body-sm text-on-surface-variant">비워 두어도 돼요. 입력하면 검수가 끝났을 때 승인 또는 거절 결과를 메일로 보내 드려요.</p>
        </div>

        <fieldset className="flex flex-col gap-space-sm rounded-xl bg-surface-container p-space-md">
          <legend className="sr-only">업로드 약관</legend>
          <ul className="flex list-none flex-col gap-1.5 font-body text-body-sm text-on-surface-variant">
            {UPLOAD_CONSENT_ITEMS.map((text) => (
              <li key={text} className="flex items-start gap-1.5">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-secondary" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <label className="flex cursor-pointer items-center gap-2 pt-1 font-label-lg text-label-lg text-on-surface">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="h-5 w-5 shrink-0 accent-primary-container"
            />
            위 내용에 동의합니다
            <span className="font-label-sm text-label-sm text-primary">*필수</span>
          </label>
          <p className="font-body text-body-sm text-on-surface-variant">
            올리면 닉네임과 (입력했다면) 이메일, 만화 이미지가 저장돼요. 자세한 내용은{' '}
            <a href="/privacy" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
              개인정보처리방침
            </a>
            과{' '}
            <a href="/terms" target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
              이용약관
            </a>
            에서 확인할 수 있어요.
          </p>
        </fieldset>

        {siteKey ? (
          <Turnstile key={captchaRun} siteKey={siteKey} onToken={setCaptchaToken} onError={onCaptchaError} />
        ) : (
          siteKey === null && (
            <p role="alert" className="font-body text-body-sm text-on-error-container">
              {configError || '봇 확인 설정이 아직 끝나지 않아 지금은 올릴 수 없어요.'}
            </p>
          )
        )}

        {error && (
          <div
            ref={errorRef}
            role="alert"
            className="flex flex-col gap-2 rounded-lg bg-error-container/40 px-space-md py-2 font-body text-body-sm text-on-error-container"
          >
            <p className="flex items-start gap-1.5">
              <span className="material-symbols-outlined text-base">error</span>
              <span>
                {error.message}
                <span className="mt-0.5 block font-label-sm text-label-sm opacity-80">실패한 단계: {STAGE_LABEL[error.stage]}</span>
              </span>
            </p>
            <details className="font-label-sm text-label-sm opacity-90">
              <summary className="cursor-pointer">자세한 정보</summary>
              <p className="mt-1 font-mono break-all whitespace-pre-wrap">{formatReport(error)}</p>
              <button
                type="button"
                onClick={() => void copyReport()}
                className="mt-1.5 rounded bg-surface-container-highest px-2 py-1 text-on-surface"
              >
                {copied ? '복사했어요' : '복사하기'}
              </button>
            </details>
          </div>
        )}

        <div className="flex flex-col gap-space-xs pt-space-xs">
          <button
            type="submit"
            disabled={busy || !siteKey}
            className="group flex w-full items-center justify-center gap-2 rounded-lg bg-primary-container px-space-md py-3.5 font-headline text-headline-sm text-on-surface shadow-lg shadow-primary-container/25 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            <span className="material-symbols-outlined transition-transform group-hover:translate-x-0.5">send</span>
            {submitting ? '올리는 중…' : '오늘의 4컷 등록하기'}
          </button>
          <p className="py-1 text-center font-label-sm text-label-sm text-on-surface-variant">검수 후 공개됩니다</p>
        </div>
      </form>
    </div>
  )
}
