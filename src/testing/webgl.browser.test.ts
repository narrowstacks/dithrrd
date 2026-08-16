import { describe, it, expect } from 'vitest'

describe('browser test runner', () => {
  it('provides a WebGL2 context', () => {
    const canvas = document.createElement('canvas')
    canvas.width = 16
    canvas.height = 16
    const gl = canvas.getContext('webgl2')
    expect(gl).not.toBeNull()
  })

  it('compiles a #version 300 es fragment shader', () => {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')!
    const sh = gl.createShader(gl.FRAGMENT_SHADER)!
    gl.shaderSource(sh, `#version 300 es
precision highp float;
out vec4 fragColor;
void main() { fragColor = vec4(1.0); }`)
    gl.compileShader(sh)
    expect(gl.getShaderParameter(sh, gl.COMPILE_STATUS)).toBe(true)
  })
})
