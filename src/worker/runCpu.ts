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
  const pending = new Map<
    number,
    { resolve: (b: Uint8ClampedArray) => void; reject: (e: unknown) => void }
  >()

  worker.onmessage = (e: MessageEvent<{ id: number; buf: ArrayBuffer }>) => {
    const entry = pending.get(e.data.id)
    if (entry) {
      pending.delete(e.data.id)
      entry.resolve(new Uint8ClampedArray(e.data.buf))
    }
  }

  // Reject every in-flight request rather than hanging forever on a worker crash.
  worker.onerror = (e) => {
    const err = new Error(`dither worker error: ${e.message}`)
    for (const { reject } of pending.values()) reject(err)
    pending.clear()
  }

  const runCpu: RunCpu = (type, buf, width, height, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      // Copy so the caller's buffer isn't detached by transfer.
      const copy = buf.slice()
      worker.postMessage({ id, type, buf: copy.buffer, width, height, params }, [copy.buffer])
    })

  return {
    runCpu,
    dispose: () => {
      const err = new Error('dither worker disposed')
      for (const { reject } of pending.values()) reject(err)
      pending.clear()
      worker.terminate()
    },
  }
}
