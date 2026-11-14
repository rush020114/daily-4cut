import { describeError, type Stage } from './diagnostics'
import { LIMITS } from './limits'

export class ImageError extends Error {
  stage: Stage
  detail: string

  constructor(message: string, stage: Stage, detail: string) {
    super(message)
    this.name = 'ImageError'
    this.stage = stage
    this.detail = detail
  }
}

export type WebpResult = { blob: Blob; width: number; height: number }

const hex = (b: Uint8Array, n = 12) => Array.from(b.slice(0, n), (x) => x.toString(16).padStart(2, '0')).join('')

// 파일 머리말에서 크기를 읽는다. (JPEG, PNG) 못 읽으면 null.
function sniffSize(b: Uint8Array): { w: number; h: number } | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b.length > 24) {
    const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
    return { w: dv.getUint32(16), h: dv.getUint32(20) }
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 < b.length && b[i] === 0xff) {
      const marker = b[i + 1]
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] }
      }
      i += 2 + ((b[i + 2] << 8) | b[i + 3])
    }
  }
  return null
}

function isHeic(b: Uint8Array): boolean {
  const s = String.fromCharCode(...b.slice(4, 12))
  return s.startsWith('ftyp') && /^(heic|heix|hevc|hevx|mif1|msf1|heim|heis)/.test(s.slice(4))
}

// 파일을 고르자마자 메모리로 복사한다. 안드로이드에서는 고른 파일의 참조가 나중에 읽히지 않는 경우가 있다.
export async function readFileBytes(file: File): Promise<Uint8Array> {
  try {
    return new Uint8Array(await file.arrayBuffer())
  } catch (e) {
    throw new ImageError(
      '선택한 파일을 읽지 못했어요. 파일을 다시 선택해 주세요. 계속되면 사진을 캡처하거나 다른 앱으로 저장한 뒤 올려 주세요.',
      'read',
      `${describeError(e)} | file=${file.type || '(type 없음)'} ${file.size}B`,
    )
  }
}

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void }

async function decode(blob: Blob, size: { w: number; h: number } | null): Promise<Decoded> {
  const errors: string[] = []

  try {
    const bitmap = await createImageBitmap(blob)
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
  } catch (e) {
    errors.push(`createImageBitmap=${describeError(e)}`)
  }

  const url = URL.createObjectURL(blob)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
  } catch (e) {
    URL.revokeObjectURL(url)
    errors.push(`Image.decode=${describeError(e)}`)
  }

  // 큰 사진은 휴대폰 메모리가 모자라 그대로는 열리지 않을 수 있다. 줄이면서 열어 본다.
  if (size && size.w > 0 && size.h > 0) {
    const scale = Math.min(1, LIMITS.uploadLongSide / Math.max(size.w, size.h))
    try {
      const bitmap = await createImageBitmap(blob, {
        resizeWidth: Math.max(1, Math.round(size.w * scale)),
        resizeHeight: Math.max(1, Math.round(size.h * scale)),
        resizeQuality: 'medium',
      })
      // 줄여서 열었으므로 원래 크기는 파일 머리말에서 읽은 값을 쓴다
      return { source: bitmap, width: size.w, height: size.h, close: () => bitmap.close() }
    } catch (e) {
      errors.push(`resize=${describeError(e)}`)
    }
  }

  throw new ImageError(
    '이미지를 열지 못했어요. 파일이 손상되었거나 이 기기에서 열 수 없는 형식일 수 있어요. 다른 이미지를 선택하거나 JPG·PNG로 저장해서 다시 시도해 주세요.',
    'decode',
    errors.join(' ; '),
  )
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
}

// Safari 는 canvas 로 WebP 를 만들지 못하고 PNG 를 돌려준다. 그때만 WebAssembly 인코더를 불러와 쓴다.
async function wasmWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  const { default: encode } = await import('@jsquash/webp/encode')
  const data = await encode(ctx.getImageData(0, 0, canvas.width, canvas.height), { quality: Math.round(quality * 100) })
  return new Blob([data], { type: 'image/webp' })
}

// 고른 이미지를 검사하고, 큰 이미지는 줄이고, WebP 로 바꾼다. 서버에는 이 결과만 올라간다.
// bytes 는 readFileBytes 로 미리 메모리에 복사해 둔 파일 내용이다.
export async function toWebp(bytes: Uint8Array, mime: string, opts: { forceWasm?: boolean } = {}): Promise<WebpResult> {
  const info = `sig=${hex(bytes)} mime=${mime || '(없음)'} bytes=${bytes.length}`

  if (isHeic(bytes)) {
    throw new ImageError(
      'HEIC/HEIF 사진은 올릴 수 없어요. 갤러리에서 JPG나 PNG로 저장한 뒤 다시 선택해 주세요.',
      'check',
      `HEIC ${info}`,
    )
  }
  const size = sniffSize(bytes)
  const sizeInfo = size ? `header=${size.w}x${size.h}` : 'header=?'

  const img = await decode(new Blob([bytes as BlobPart], { type: mime }), size)
  try {
    const { width: w, height: h } = img
    if (w * h > LIMITS.maxPixels) {
      throw new ImageError('이미지가 너무 커요. 크기를 줄여서 다시 선택해 주세요.', 'check', `${w}x${h} ${info}`)
    }
    if (Math.min(w, h) < LIMITS.minShortSide) {
      throw new ImageError(
        `이미지가 너무 작아요. 짧은 변이 ${LIMITS.minShortSide}px 이상인 이미지를 선택해 주세요.`,
        'check',
        `${w}x${h}`,
      )
    }
    if (Math.max(w, h) / Math.min(w, h) > LIMITS.maxRatio) {
      throw new ImageError('이미지 비율이 너무 길어요. 가로세로 비율이 1:3 이내인 이미지를 선택해 주세요.', 'check', `${w}x${h}`)
    }

    const scale = Math.min(1, LIMITS.uploadLongSide / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    try {
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('2d context unavailable')
      // 투명한 PNG 가 어두운 화면에서 안 보이지 않게 흰 바탕을 깐다
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img.source, 0, 0, canvas.width, canvas.height)
    } catch (e) {
      throw new ImageError(
        '이미지 크기를 조정하지 못했어요. 더 작은 이미지로 다시 시도해 주세요.',
        'canvas',
        `${describeError(e)} | src=${w}x${h} canvas=${canvas.width}x${canvas.height} ${sizeInfo}`,
      )
    }

    let usedWasm = Boolean(opts.forceWasm)
    for (const quality of [0.85, 0.7, 0.55]) {
      let blob: Blob | null = null
      try {
        if (!opts.forceWasm) blob = await canvasToWebp(canvas, quality)
        if (!blob || blob.type !== 'image/webp') {
          usedWasm = true
          blob = await wasmWebp(canvas, quality)
        }
      } catch (e) {
        throw new ImageError(
          '이미지를 WebP로 바꾸지 못했어요. 다른 이미지나 다른 브라우저로 시도해 주세요.',
          'encode',
          `${describeError(e)} | wasm=${usedWasm} canvas=${canvas.width}x${canvas.height}`,
        )
      }
      if (blob.size <= LIMITS.maxWebpBytes) return { blob, width: canvas.width, height: canvas.height }
    }
    throw new ImageError('이미지 용량이 너무 커요. 더 작은 이미지를 선택해 주세요.', 'encode', `still > ${LIMITS.maxWebpBytes}B at q0.55`)
  } finally {
    img.close()
  }
}
