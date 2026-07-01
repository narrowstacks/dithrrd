export interface ClientToSourceArgs {
  clientX: number
  clientY: number
  rectLeft: number
  rectTop: number
  positionX: number
  positionY: number
  scale: number
  width: number
  height: number
}

// react-zoom-pan-pinch applies translate(positionX, positionY) scale(scale) to the
// content (the canvas at its natural pixel size, which equals the source size). Invert
// that transform to recover the source pixel under a client point.
export function clientToSourcePixel(a: ClientToSourceArgs): { x: number; y: number } | null {
  const x = Math.floor((a.clientX - a.rectLeft - a.positionX) / a.scale)
  const y = Math.floor((a.clientY - a.rectTop - a.positionY) / a.scale)
  if (x < 0 || y < 0 || x >= a.width || y >= a.height) return null
  return { x, y }
}
