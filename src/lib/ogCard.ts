// 공유 미리보기용 JPEG 카드(1200x630)를 만든다. 만화 전체가 잘리지 않게 가운데에 맞춰 넣고 남는 자리는 어두운 배경으로 채운다.
// 서버(Pages Functions)는 이미지를 변환할 수 없어서, 관리자가 승인할 때 관리자 화면(브라우저)이 대신 만들어 올린다.
const WIDTH = 1200
const HEIGHT = 630
const MAX_BYTES = 780 * 1024 // 서버 한도(800KB)보다 조금 작게

function toJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
}

export async function makeOgCard(imageUrl: string): Promise<Blob> {
  const res = await fetch(imageUrl)
  if (!res.ok) throw new Error(`이미지를 가져오지 못했어요 (${res.status})`)
  const bitmap = await createImageBitmap(await res.blob())
  try {
    const canvas = document.createElement('canvas')
    canvas.width = WIDTH
    canvas.height = HEIGHT
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('이 브라우저에서는 이미지를 만들 수 없어요')

    ctx.fillStyle = '#131315'
    ctx.fillRect(0, 0, WIDTH, HEIGHT)
    const scale = Math.min(WIDTH / bitmap.width, HEIGHT / bitmap.height)
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, Math.round((WIDTH - w) / 2), Math.round((HEIGHT - h) / 2), w, h)

    for (const quality of [0.88, 0.8, 0.7, 0.6]) {
      const blob = await toJpeg(canvas, quality)
      if (blob && blob.size <= MAX_BYTES) return blob
    }
    throw new Error('공유 이미지 용량이 너무 커요')
  } finally {
    bitmap.close()
  }
}
