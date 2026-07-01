import type { Backend } from '@/engine/backend'
import type { PassStep } from '@/engine/planPasses'
import type { Palette } from '@/effects/types'
import type { RunCpu } from '@/worker/runCpu'
import type { TexHandle } from '@/engine/backend'

export async function execute(
  steps: PassStep[],
  backend: Backend,
  opts: { runCpu: RunCpu; palettes: Record<string, Palette> },
): Promise<TexHandle> {
  let current = backend.sourceTexture()
  const ping = backend.acquireFbo()
  const pong = backend.acquireFbo()
  let target = ping

  for (const step of steps) {
    if (step.effect.kind === 'cpu') {
      const { data, width, height } = backend.readback(current)
      const out = await opts.runCpu(step.effect.type, data, width, height, step.node.params)
      current = backend.uploadPixels(out, width, height)
    } else {
      backend.drawEffect(step.effect, {
        srcTex: current,
        targetFbo: target,
        params: step.node.params,
        resolution: backend.size(),
        palettes: opts.palettes,
      })
      current = backend.fboTexture(target)
      target = target === ping ? pong : ping
    }
  }

  // Does NOT present. Caller presents (preview) or reads back (export).
  return current
}
