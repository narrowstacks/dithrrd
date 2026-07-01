import type { CpuEffect } from '@/effects/types'
import { diffuse, KERNELS } from '@/worker/algorithms'

export const atkinson: CpuEffect = {
  kind: 'cpu',
  type: 'atkinson',
  name: 'Atkinson',
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
      KERNELS.atkinson,
    ),
}
