import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Browser-mode tests run under vitest.browser.config.ts, not here.
    exclude: ['**/node_modules/**', '**/dist/**', '**/*.browser.test.ts'],
    // Use worker_threads instead of the default forked child processes. Threads
    // live inside the main vitest process, so an interrupted/killed run can't
    // orphan a pool worker that keeps spinning at 100% CPU (which forks can).
    pool: 'threads',
  },
})
