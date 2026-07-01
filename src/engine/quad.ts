import type { Regl, DrawCommand } from 'regl'

export const QUAD_VERT = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
  vUv = 0.5 * (position + 1.0);
  gl_Position = vec4(position, 0.0, 1.0);
}`

const cache = new WeakMap<Regl, Map<string, DrawCommand>>()

export function quadCommand(regl: Regl, frag: string, uniformKeys: string[]): DrawCommand {
  let byFrag = cache.get(regl)
  if (!byFrag) {
    byFrag = new Map()
    cache.set(regl, byFrag)
  }
  let cmd = byFrag.get(frag)
  if (!cmd) {
    const uniforms: Record<string, unknown> = {
      src: regl.prop('src' as never),
      resolution: regl.prop('resolution' as never),
    }
    for (const k of uniformKeys) uniforms[k] = regl.prop(k as never)
    cmd = regl({
      vert: QUAD_VERT,
      frag,
      attributes: { position: [[-1, -1], [3, -1], [-1, 3]] },
      uniforms,
      count: 3,
      framebuffer: regl.prop('framebuffer' as never),
    })
    byFrag.set(frag, cmd)
  }
  return cmd
}
