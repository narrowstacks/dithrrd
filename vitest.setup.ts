import '@testing-library/jest-dom/vitest'

// jsdom does not implement ResizeObserver, which react-resizable-panels
// (used by shadcn's `resizable` component) requires at mount time.
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? (ResizeObserver as any)

// jsdom does not implement Element.getAnimations, which @base-ui/react's
// `scroll-area` component (used by shadcn's `scroll-area`) calls on mount.
if (!Element.prototype.getAnimations) {
  Element.prototype.getAnimations = () => []
}
