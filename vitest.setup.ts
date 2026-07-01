import '@testing-library/jest-dom/vitest'

// jsdom does not implement ResizeObserver, which react-resizable-panels
// (used by shadcn's `resizable` component) requires at mount time.
class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver = globalThis.ResizeObserver ?? (ResizeObserver as any)
