import createREGL from 'regl'
import type { Regl, Framebuffer2D, Texture2D } from 'regl'
import type { Effect, Palette, Params } from '@/effects/types'
import { quadCommand } from '@/engine/quad'

export interface TexHandle { readonly _tex?: never }
export interface FboHandle { readonly _fbo?: never; tex: TexHandle }

export interface DrawArgs {
  srcTex: TexHandle
  targetFbo: FboHandle
  params: Params
  resolution: [number, number]
  palettes: Record<string, Palette>
}

export interface Backend {
  size(): [number, number]
  sourceTexture(): TexHandle
  acquireFbo(): FboHandle
  drawEffect(effect: Effect, args: DrawArgs): void
  fboTexture(fbo: FboHandle): TexHandle
  readback(tex: TexHandle): { data: Uint8ClampedArray; width: number; height: number }
  uploadPixels(data: Uint8ClampedArray, width: number, height: number): TexHandle
  present(tex: TexHandle): void
}

export function createReglBackend(
  canvas: HTMLCanvasElement,
  source: ImageData,
  width: number,
  height: number,
): Backend & { dispose(): void } {
  const regl: Regl = createREGL({
    canvas,
    attributes: { preserveDrawingBuffer: true },
    extensions: [],
  })

  // NOTE(types): regl's bundled TextureImageData union doesn't include ImageData
  // (only ArrayBufferView/HTMLImageElement/etc. at the type level, even though the
  // runtime does accept anything with .data/.width/.height). Pass the underlying
  // Uint8ClampedArray + explicit dimensions instead — identical bytes, no behavior change.
  const sourceTex = regl.texture({
    data: source.data,
    width,
    height,
    flipY: true,
    min: 'linear',
    mag: 'linear',
  })

  // NOTE(types): Framebuffer2D's declared type doesn't expose `.color` (the runtime
  // object does, per regl's API docs), so we keep our own tex reference per fbo instead
  // of reading it back off the framebuffer object.
  const makeFbo = () => {
    const tex = regl.texture({ width, height, min: 'nearest', mag: 'nearest' })
    const fb = regl.framebuffer({ color: tex, depth: false })
    return { fb, tex }
  }
  const pool = [makeFbo(), makeFbo()]
  let acquired = 0

  const wrapTex = (t: Texture2D): TexHandle => ({ t } as unknown as TexHandle)
  const wrapFbo = (fb: Framebuffer2D, tex: TexHandle): FboHandle =>
    ({ fb, tex } as unknown as FboHandle)
  const rawTex = (h: TexHandle) => (h as unknown as { t: Texture2D }).t
  const rawFbo = (h: FboHandle) => (h as unknown as { fb: Framebuffer2D }).fb

  // Command to blit a texture to the screen (default framebuffer).
  const present = quadCommand(regl, `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
void main() { fragColor = texture(src, vUv); }`, [])

  return {
    size: () => [width, height],
    sourceTexture: () => wrapTex(sourceTex),
    acquireFbo: () => {
      const { fb, tex } = pool[acquired++ % 2]
      return wrapFbo(fb, wrapTex(tex))
    },
    drawEffect: (effect, args) => {
      if (effect.kind !== 'gpu') return
      const cmd = quadCommand(regl, effect.frag, effect.uniformKeys)
      cmd({
        framebuffer: rawFbo(args.targetFbo),
        src: rawTex(args.srcTex),
        resolution: args.resolution,
        ...effect.uniforms(args.params, { palettes: args.palettes }),
      })
    },
    fboTexture: (fbo) => (fbo as unknown as { tex: TexHandle }).tex,
    readback: (tex) => {
      // Find the fbo whose color texture is this handle; read its pixels.
      const t = rawTex(tex)
      const entry = pool.find((p) => p.tex === t)
      const data = regl.read({ framebuffer: entry?.fb }) as Uint8Array
      return { data: new Uint8ClampedArray(data.buffer), width, height }
    },
    uploadPixels: (data, w, h) =>
      wrapTex(regl.texture({ data, width: w, height: h, min: 'nearest', mag: 'nearest' })),
    present: (tex) => {
      regl.clear({ color: [0, 0, 0, 0], depth: 1 })
      present({ framebuffer: null, src: rawTex(tex), resolution: [width, height] })
    },
    dispose: () => regl.destroy(),
  }
}
