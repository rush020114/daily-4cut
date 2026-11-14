export type WebpInfo = { width: number; height: number; animated: boolean }

// WebP 파일의 머리말만 읽어 크기를 얻는다. WebP가 아니거나 구조가 이상하면 예외.
// 이미지를 해독하지 않으므로 Workers CPU 제한 안에서 항상 가볍다.
export function parseWebp(b: Uint8Array): WebpInfo {
  if (b.length < 30) throw new Error('too short')
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const tag = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])

  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') throw new Error('not webp')
  if (dv.getUint32(4, true) + 8 !== b.length) throw new Error('size mismatch')

  switch (tag(12)) {
    case 'VP8X':
      return {
        animated: (b[20] & 0x02) !== 0,
        width: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)),
        height: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)),
      }
    case 'VP8 ':
      if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) throw new Error('bad vp8')
      return { animated: false, width: dv.getUint16(26, true) & 0x3fff, height: dv.getUint16(28, true) & 0x3fff }
    case 'VP8L': {
      if (b[20] !== 0x2f) throw new Error('bad vp8l')
      const bits = dv.getUint32(21, true)
      return { animated: false, width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 }
    }
    default:
      throw new Error('unknown chunk')
  }
}
