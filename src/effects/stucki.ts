import type { CpuEffect } from '@/effects/types'
import { diffuse, KERNELS } from '@/worker/algorithms'

export const stucki: CpuEffect = {
  kind: 'cpu',
  type: 'stucki',
  name: 'Stucki',
  family: 'diffusion',
  defaultParams: { levels: 2, serpentine: true },
  controls: [
    { type: 'slider', key: 'levels', label: 'Levels', min: 2, max: 8, step: 1 },
    { type: 'toggle', key: 'serpentine', label: 'Serpentine' },
  ],
  process: (buf, w, h, params) =>
    diffuse(
      buf,
      w,
      h,
      { levels: Number(params.levels), serpentine: Boolean(params.serpentine) },
      KERNELS.stucki,
    ),
}
