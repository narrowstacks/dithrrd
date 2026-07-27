import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

export default defineConfig({
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
