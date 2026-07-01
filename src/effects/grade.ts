import type { GpuEffect } from '@/effects/types'

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv; out vec4 fragColor;
uniform sampler2D src; uniform vec2 resolution;
uniform float uBrightness; uniform float uContrast; uniform float uGamma; uniform float uSaturation;
void main() {
  vec3 c = texture(src, vUv).rgb;
  c += uBrightness;
  c = (c - 0.5) * uContrast + 0.5;
  c = clamp(c, 0.0, 1.0);
  c = pow(c, vec3(1.0 / max(uGamma, 0.001)));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, uSaturation);
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`

export const grade: GpuEffect = {
  kind: 'gpu',
  type: 'grade',
  name: 'Grade',
  family: 'color',
  defaultParams: { brightness: 0, contrast: 1, gamma: 1, saturation: 1 },
  controls: [
    { type: 'slider', key: 'brightness', label: 'Brightness', min: -0.5, max: 0.5, step: 0.01 },
    { type: 'slider', key: 'contrast', label: 'Contrast', min: 0, max: 2, step: 0.01 },
    { type: 'slider', key: 'gamma', label: 'Gamma', min: 0.2, max: 3, step: 0.01 },
    { type: 'slider', key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.01 },
  ],
  frag: FRAG,
  uniformKeys: ['uBrightness', 'uContrast', 'uGamma', 'uSaturation'],
  uniforms: (p) => ({
    uBrightness: Number(p.brightness),
    uContrast: Number(p.contrast),
    uGamma: Number(p.gamma),
    uSaturation: Number(p.saturation),
  }),
}
