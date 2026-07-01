import { describe, it, expect } from 'vitest'
import { fitWorkingSize } from '@/features/image'

describe('fitWorkingSize', () => {
  it('leaves images within the cap unchanged', () => {
    expect(fitWorkingSize(800, 600, 4096)).toEqual({ width: 800, height: 600 })
  })
  it('scales down by the long edge, preserving aspect ratio', () => {
    expect(fitWorkingSize(8000, 4000, 4096)).toEqual({ width: 4096, height: 2048 })
  })
  it('handles portrait orientation', () => {
    expect(fitWorkingSize(4000, 8000, 4096)).toEqual({ width: 2048, height: 4096 })
  })
})
