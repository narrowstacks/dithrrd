import { floydSteinberg, diffuse, KERNELS } from './algorithms'
import type { Params } from '@/effects/types'

interface Req { id: number; type: string; buf: ArrayBuffer; width: number; height: number; params: Params }

type Handler = (buf: Uint8ClampedArray, w: number, h: number, p: Params) => void

const handlers: Record<string, Handler> = {
  floyd: (buf, w, h, p) =>
    floydSteinberg(buf, w, h, { levels: Number(p.levels), serpentine: Boolean(p.serpentine) }),
}

// Every diffusion kernel shares the generic engine; register a handler per kernel.
for (const [type, kernel] of Object.entries(KERNELS)) {
  handlers[type] = (buf, w, h, p) =>
    diffuse(buf, w, h, { levels: Number(p.levels), serpentine: Boolean(p.serpentine) }, kernel)
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, type, buf, width, height, params } = e.data
  const pixels = new Uint8ClampedArray(buf)
  handlers[type]?.(pixels, width, height, params)
  ;(self as unknown as Worker).postMessage({ id, buf: pixels.buffer }, [pixels.buffer])
}
