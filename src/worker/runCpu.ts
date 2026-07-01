import type { Params } from '@/effects/types'

export type RunCpu = (
  type: string,
  buf: Uint8ClampedArray,
  width: number,
  height: number,
  params: Params,
) => Promise<Uint8ClampedArray>

export function createRunCpu(): { runCpu: RunCpu; dispose: () => void } {
  const worker = new Worker(new URL('./dither.worker.ts', import.meta.url), { type: 'module' })
  let nextId = 1
  const pending = new Map<number, (buf: Uint8ClampedArray) => void>()

  worker.onmessage = (e: MessageEvent<{ id: number; buf: ArrayBuffer }>) => {
    const resolve = pending.get(e.data.id)
    if (resolve) {
      pending.delete(e.data.id)
      resolve(new Uint8ClampedArray(e.data.buf))
    }
  }

  const runCpu: RunCpu = (type, buf, width, height, params) =>
    new Promise((resolve) => {
      const id = nextId++
      pending.set(id, resolve)
      // Copy so the caller's buffer isn't detached by transfer.
      const copy = buf.slice()
      worker.postMessage({ id, type, buf: copy.buffer, width, height, params }, [copy.buffer])
    })

  return { runCpu, dispose: () => worker.terminate() }
}
