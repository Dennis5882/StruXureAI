import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

// package.json 버전 읽기
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// 커밋 해시: Vercel 빌드는 VERCEL_GIT_COMMIT_SHA 제공, 로컬은 git에서 조회
const commit = (() => {
  const v = process.env.VERCEL_GIT_COMMIT_SHA
  if (v) return v.slice(0, 7)
  try { return execSync('git rev-parse --short HEAD').toString().trim() } catch { return 'local' }
})()

// 빌드 날짜 (UTC 기준 YYYY-MM-DD)
const buildDate = new Date().toISOString().slice(0, 10)

export default defineConfig({
  plugins: [react()],
  // DWG 변환용 LibreDWG WASM은 사전번들(.vite/deps)에 들어가면 dev에서 .wasm URL이 깨진다
  // (HTML 폴백 → "Incorrect MIME / magic word" 오류). 사전번들에서 제외하면 dev에서도 정상 로드.
  // 프로덕션 빌드에는 영향 없음(이 옵션은 dev 최적화 전용).
  optimizeDeps: { exclude: ['@mlightcad/libredwg-web'] },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_DEVELOPER__: JSON.stringify('Dennis'),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILD_DATE__: JSON.stringify(buildDate),
  },
})
