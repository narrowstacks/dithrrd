import type { CpuEffect } from '@/effects/types'
import { floydSteinberg as fs } from '@/worker/algorithms'

export const floyd: CpuEffect = {
  kind: 'cpu',
  type: 'floyd',
  name: 'Floyd–Steinberg',
  family: 'diffusion',
  defaultParams: { levels: 2, serpentine: true },
  controls: [
    { type: 'slider', key: 'levels', label: 'Levels', min: 2, max: 8, step: 1 },
    { type: 'toggle', key: 'serpentine', label: 'Serpentine' },
  ],
  process: (buf, w, h, params) =>
    fs(buf, w, h, { levels: Number(params.levels), serpentine: Boolean(params.serpentine) }),
}
