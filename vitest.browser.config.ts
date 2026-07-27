import { defineConfig, type Plugin } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'
import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'

const fixturesDir = fileURLToPath(new URL('./fixtures/', import.meta.url))

/**
 * Serves /fixtures/<name>.png from the fixtures/ directory so golden images
 * are fetchable from browser test code.
 *
 * NOTE: this is deliberately NOT implemented via Vite's `publicDir` option.
 * `publicDir` at the project root would shadow every source module request
 * (its static-file middleware runs before the transform middleware, and
 * since publicDir would equal the project root, it intercepts requests like
 * /src/testing/goldens.browser.test.ts and serves the raw, untransformed
 * TypeScript instead of letting Vite compile it). That breaks module
 * loading for the whole browser-mode test harness (verified: curling a
 * source path returned unprocessed TS with bare `import ... from 'vitest'`
 * specifiers, and the full suite hangs indefinitely waiting on a browser
 * that never finishes bootstrapping). Scoping a middleware to the
 * /fixtures/ prefix avoids the collision entirely.
 */
function serveFixtures(): Plugin {
  return {
    name: 'serve-golden-fixtures',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/fixtures/')) return next()
        const relative = req.url.slice('/fixtures/'.length).split('?')[0]
        const filePath = path.join(fixturesDir, relative)
        if (!filePath.startsWith(fixturesDir) || !existsSync(filePath)) return next()
        res.setHeader('Content-Type', 'image/png')
        res.end(await readFile(filePath))
      })
    },
  }
}

export default defineConfig({
  plugins: [serveFixtures()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.browser.test.ts'],
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      instances: [{ browser: 'chromium' }],
      commands: {
        writeGolden: async (_ctx: unknown, name: string, base64: string) => {
          const dir = path.resolve(process.cwd(), 'fixtures')
          await mkdir(dir, { recursive: true })
          await writeFile(path.join(dir, `${name}.png`), Buffer.from(base64, 'base64'))
          return true
        },
      },
    },
  },
})
