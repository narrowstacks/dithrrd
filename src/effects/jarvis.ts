import type { CpuEffect } from '@/effects/types'
import { diffuse, KERNELS } from '@/worker/algorithms'

export const jarvis: CpuEffect = {
  kind: 'cpu',
  type: 'jarvis',
  name: 'Jarvis–Judice–Ninke',
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
      KERNELS.jarvis,
    ),
}
