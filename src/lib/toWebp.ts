import { LIMITS } from './limits'

export class ImageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ImageError'
  }
}

export type WebpResult = { blob: Blob; width: number; height: number }

async function decode(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  try {
    const bitmap = await createImageBitmap(file)
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
  } catch {
    // createImageBitmap 을 못 쓰는 환경
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.src = url
      await img.decode()
      return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => URL.revokeObjectURL(url) }
    } catch {
      URL.revokeObjectURL(url)
      throw new ImageError('이미지를 읽지 못했어요. 파일이 손상되었는지 확인하고 다시 선택해 주세요.')
    }
  }
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality))
}

// Safari 는 canvas 로 WebP 를 만들지 못하고 PNG 를 돌려준다. 그때만 WebAssembly 인코더를 불러와 쓴다.
async function wasmWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new ImageError('이미지를 변환하지 못했어요. 다른 브라우저로 시도해 주세요.')
  const { default: encode } = await import('@jsquash/webp/encode')
  const data = await encode(ctx.getImageData(0, 0, canvas.width, canvas.height), { quality: Math.round(quality * 100) })
  return new Blob([data], { type: 'image/webp' })
}

// 고른 이미지를 검사하고, 큰 이미지는 줄이고, WebP 로 바꾼다. 서버에는 이 결과만 올라간다.
export async function toWebp(file: File, opts: { forceWasm?: boolean } = {}): Promise<WebpResult> {
  const img = await decode(file)
  try {
    const { width: w, height: h } = img
    if (w * h > LIMITS.maxPixels) throw new ImageError('이미지가 너무 커요. 크기를 줄여서 다시 선택해 주세요.')
    if (Math.min(w, h) < LIMITS.minShortSide) {
      throw new ImageError(`이미지가 너무 작아요. 짧은 변이 ${LIMITS.minShortSide}px 이상인 이미지를 선택해 주세요.`)
    }
    if (Math.max(w, h) / Math.min(w, h) > LIMITS.maxRatio) {
      throw new ImageError('이미지 비율이 너무 길어요. 가로세로 비율이 1:3 이내인 이미지를 선택해 주세요.')
    }

    const scale = Math.min(1, LIMITS.uploadLongSide / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new ImageError('이미지를 변환하지 못했어요. 다른 브라우저로 시도해 주세요.')
    // 투명한 PNG 가 어두운 화면에서 안 보이지 않게 흰 바탕을 깐다
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img.source, 0, 0, canvas.width, canvas.height)

    for (const quality of [0.85, 0.7, 0.55]) {
      let blob = opts.forceWasm ? null : await canvasToWebp(canvas, quality)
      if (!blob || blob.type !== 'image/webp') blob = await wasmWebp(canvas, quality)
      if (blob.size <= LIMITS.maxWebpBytes) return { blob, width: canvas.width, height: canvas.height }
    }
    throw new ImageError('이미지 용량이 너무 커요. 더 작은 이미지를 선택해 주세요.')
  } finally {
    img.close()
  }
}
