import { describe, it, expect } from 'vitest'

describe('smoke', () => {
  it('runs the test runner', () => {
    expect(1 + 1).toBe(2)
  })

  // Guards the --no-experimental-webstorage escape hatch in vitest.config.ts. Node 25+
  // installs its own inert `localStorage` global that shadows jsdom's; when that happens
  // every storage-touching suite fails with an opaque "clear is not a function" far from
  // the actual cause. Failing here instead points straight at the environment.
  it('exposes jsdom Storage-backed localStorage, not Node’s inert global', () => {
    expect(localStorage).toBeInstanceOf(Storage)
    expect(typeof localStorage.getItem).toBe('function')
    expect(typeof localStorage.setItem).toBe('function')
    expect(typeof localStorage.clear).toBe('function')
  })
})
