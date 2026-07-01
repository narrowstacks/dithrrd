import { describe, it, expect, vi } from 'vitest'
import { execute } from '@/engine/execute'
import type { Backend, TexHandle, FboHandle } from '@/engine/backend'
import type { PassStep } from '@/engine/planPasses'
import type { Effect } from '@/effects/types'

const gpu = (type: string): Effect => ({
  kind: 'gpu', type, name: type, family: 'ordered', defaultParams: {}, controls: [],
  frag: '', uniformKeys: [], uniforms: () => ({}),
})
const cpu = (type: string): Effect => ({
  kind: 'cpu', type, name: type, family: 'diffusion', defaultParams: {}, controls: [],
  process: () => {},
})

function fakeBackend() {
  const log: string[] = []
  const src = { __tex: 'src' } as unknown as TexHandle
  const ping = { __fbo: 'ping', tex: { __tex: 'ping' } as unknown as TexHandle } as unknown as FboHandle
  const pong = { __fbo: 'pong', tex: { __tex: 'pong' } as unknown as TexHandle } as unknown as FboHandle
  const fbos = [ping, pong]
  let acquired = 0
  const backend: Backend = {
    size: () => [4, 4],
    sourceTexture: () => src,
    acquireFbo: () => fbos[acquired++ % 2],
    drawEffect: (effect, args) => log.push(`draw:${effect.type}->${(args.targetFbo as any).__fbo}`),
    fboTexture: (fbo) => (fbo as any).tex,
    readback: () => ({ data: new Uint8ClampedArray(4 * 4 * 4), width: 4, height: 4 }),
    uploadPixels: () => ({ __tex: 'uploaded' } as unknown as TexHandle),
    present: (tex) => log.push(`present:${(tex as any).__tex}`),
  }
  return { backend, log }
}

describe('execute', () => {
  it('ping-pongs GPU passes and returns the final texture (without presenting)', async () => {
    const steps: PassStep[] = [
      { node: { id: '1', type: 'a', enabled: true, params: {} }, effect: gpu('a') },
      { node: { id: '2', type: 'b', enabled: true, params: {} }, effect: gpu('b') },
    ]
    const { backend, log } = fakeBackend()
    const final = await execute(steps, backend, { runCpu: async (_t, b) => b, palettes: {} })
    expect(log).toEqual(['draw:a->ping', 'draw:b->pong'])
    expect((final as unknown as { __tex: string }).__tex).toBe('pong')
  })

  it('routes CPU effects through readback + runCpu + uploadPixels', async () => {
    const steps: PassStep[] = [
      { node: { id: '1', type: 'a', enabled: true, params: {} }, effect: gpu('a') },
      { node: { id: '2', type: 'f', enabled: true, params: { levels: 2 } }, effect: cpu('f') },
    ]
    const { backend, log } = fakeBackend()
    const runCpu = vi.fn(async (_t: string, b: Uint8ClampedArray) => b)
    const final = await execute(steps, backend, { runCpu, palettes: {} })
    expect(runCpu).toHaveBeenCalledOnce()
    expect(log).toEqual(['draw:a->ping'])
    expect((final as unknown as { __tex: string }).__tex).toBe('uploaded')
  })

  it('returns the source texture untouched when the stack is empty', async () => {
    const { backend, log } = fakeBackend()
    const final = await execute([], backend, { runCpu: async (_t, b) => b, palettes: {} })
    expect(log).toEqual([])
    expect((final as unknown as { __tex: string }).__tex).toBe('src')
  })
})
