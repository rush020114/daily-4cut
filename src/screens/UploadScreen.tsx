import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, fetchConfig, uploadComic } from '../api'
import Turnstile from '../components/Turnstile'
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

  const fail = useCallback((message: string, stage: Stage, detail = '') => {
    setCopied(false)
    setError({ message, stage, detail })
  }, [])
  const onCaptchaError = useCallback((message: string) => fail(message, 'captcha', 'turnstile widget'), [fail])

  async function handleFile(file: File) {
    setError(null)
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
      if (e instanceof ImageError) fail(e.message, e.stage, e.detail)
      else fail('이미지를 준비하지 못했어요. 다른 이미지로 시도해 주세요.', 'decode', String(e))
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
    } catch (err) {
      const message = err instanceof Error ? err.message : '업로드하지 못했어요. 잠시 후 다시 시도해 주세요.'
      const detail =
        err instanceof ApiError
          ? `HTTP ${err.status} ${String(err.body?.error ?? '')} | webp=${picked.webp.blob.size}B ${picked.webp.width}x${picked.webp.height}`
          : String(err)
      fail(message, 'upload', detail)
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
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-lg text-on-surface-variant">image</span>
                <div className="flex flex-col">
                  <span className="font-label-md text-label-md text-on-surface">JPG, PNG, WebP 지원</span>
                  <span className="font-body text-body-sm text-on-surface-variant">한 장에 4컷, 가로세로 1:3 이내 (최대 15MB)</span>
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={openPicker}
                className="rounded bg-surface-container-highest px-3 py-1.5 font-label-md text-label-md text-on-surface transition active:scale-95 hover:bg-surface-bright disabled:opacity-50"
              >
                {picked ? '다시 선택' : '파일 선택'}
              </button>
            </div>
          </div>
          <p className="font-body text-body-sm text-on-surface-variant">세로 9:16 한 장을 추천해요. 휴대폰에서 가장 크게 보여요.</p>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <label htmlFor="author-nickname" className="flex items-center gap-1.5 font-label-lg text-label-lg text-on-surface">
              <span className="material-symbols-outlined text-base text-secondary">face</span>
              작가 닉네임
              <span className="font-label-sm text-label-sm text-primary">*필수</span>
            </label>
            <span className="font-label-sm text-label-sm text-on-surface-variant">
              {Array.from(nickname).length}/{LIMITS.nicknameMax}
            </span>
          </div>
          <input
            id="author-nickname"
            type="text"
            required
            maxLength={LIMITS.nicknameMax}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="예) 냥이집사, 공감툰작가"
            className="w-full rounded-lg bg-surface-container-low px-space-md py-3 font-body text-body-md text-on-surface transition-colors placeholder:text-outline-variant focus:bg-surface-container-high focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="contact-email" className="flex items-center gap-1.5 font-label-lg text-label-lg text-on-surface">
            <span className="material-symbols-outlined text-base text-secondary">mail</span>
            연락받을 이메일
            <span className="font-label-sm text-label-sm text-on-surface-variant">선택</span>
          </label>
          <input
            id="contact-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="w-full rounded-lg bg-surface-container-low px-space-md py-3 font-body text-body-md text-on-surface transition-colors placeholder:text-outline-variant focus:bg-surface-container-high focus:outline-none"
          />
          <p className="font-body text-body-sm text-on-surface-variant">비워 두어도 돼요. 입력하면 이 만화에 대한 연락이 필요할 때 사용해요.</p>
        </div>

        <fieldset className="flex flex-col gap-space-sm rounded-xl bg-surface-container p-space-md">
          <legend className="sr-only">업로드 약관</legend>
          <ul className="flex list-none flex-col gap-1.5 font-body text-body-sm text-on-surface-variant">
            {[
              '내가 직접 그린 그림만 올립니다.',
              '선정적·폭력적·혐오·불법 콘텐츠와 타인의 저작권을 침해하는 그림은 올리지 않으며, 어기면 숨김 처리될 수 있습니다.',
              '저작권은 작가(나)에게 있고, 서비스는 이 만화를 보여주기 위한 권한만 가집니다.',
            ].map((text) => (
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
