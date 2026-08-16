import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// Node 25 turns the experimental Web Storage API on by default, which puts a global
// `localStorage` on every worker. Without --localstorage-file that global is an inert
// `{}` — no getItem/setItem/clear — and it shadows the working Storage-backed one jsdom
// installs, so every test touching localStorage dies with "localStorage.clear is not a
// function". Dropping Node's global lets jsdom's win.
//
// Gated on the global actually being present rather than applied unconditionally: the
// flag does not exist before Node 22.4, where passing it is a hard "bad option" startup
// error that would fail the entire run.
const disableNodeWebStorage =
  typeof globalThis.localStorage !== 'undefined' ? ['--no-experimental-webstorage'] : []

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
    poolOptions: { threads: { execArgv: disableNodeWebStorage } },
  },
})
