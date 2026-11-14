import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // WebAssembly 인코더는 미리 묶지 않고 그대로 불러와야 .wasm 경로가 맞는다 (Safari 용 WebP 변환)
  optimizeDeps: { exclude: ['@jsquash/webp'] },
})
