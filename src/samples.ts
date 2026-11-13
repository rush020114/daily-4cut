export type Comic = {
  id: string
  src: string
  alt: string
  likes: number
}

// 1단계 샘플 데이터. 3단계에서 서버 데이터로 바뀐다.
export const sampleComics: Comic[] = [
  { id: 'sample-1', src: '/samples/sample-1.svg', alt: '오늘의 4컷 만화 1', likes: 1284 },
  { id: 'sample-2', src: '/samples/sample-2.svg', alt: '오늘의 4컷 만화 2 (2×2)', likes: 892 },
  { id: 'sample-3', src: '/samples/sample-3.svg', alt: '오늘의 4컷 만화 3', likes: 37 },
]
