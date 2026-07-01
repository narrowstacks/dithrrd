import { floydSteinberg } from './algorithms'
import type { Params } from '@/effects/types'

interface Req { id: number; type: string; buf: ArrayBuffer; width: number; height: number; params: Params }

const handlers: Record<string, (buf: Uint8ClampedArray, w: number, h: number, p: Params) => void> = {
  floyd: (buf, w, h, p) =>
    floydSteinberg(buf, w, h, { levels: Number(p.levels), serpentine: Boolean(p.serpentine) }),
}

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, type, buf, width, height, params } = e.data
  const pixels = new Uint8ClampedArray(buf)
  handlers[type]?.(pixels, width, height, params)
  ;(self as unknown as Worker).postMessage({ id, buf: pixels.buffer }, [pixels.buffer])
}
