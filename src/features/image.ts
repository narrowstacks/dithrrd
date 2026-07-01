import type { SourceImage } from '@/store/store'

export const MAX_WORKING_EDGE = 4096

export function fitWorkingSize(
  w: number,
  h: number,
  max: number,
): { width: number; height: number } {
  const long = Math.max(w, h)
  if (long <= max) return { width: w, height: h }
  const scale = max / long
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

export async function decodeToWorkingImage(file: File): Promise<SourceImage> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = fitWorkingSize(bitmap.width, bitmap.height, MAX_WORKING_EDGE)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()
  return { image: ctx.getImageData(0, 0, width, height), width, height }
}
