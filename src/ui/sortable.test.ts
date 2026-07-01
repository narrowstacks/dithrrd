import { describe, it, expect } from 'vitest'
import { dragEndIndices } from '@/ui/sortable'

describe('dragEndIndices', () => {
  const ids = ['a', 'b', 'c', 'd']

  it('maps active/over ids to from/to indices', () => {
    expect(dragEndIndices(ids, 'a', 'c')).toEqual({ from: 0, to: 2 })
    expect(dragEndIndices(ids, 'd', 'b')).toEqual({ from: 3, to: 1 })
  })

  it('returns null when the item is dropped on itself (no-op)', () => {
    expect(dragEndIndices(ids, 'b', 'b')).toBeNull()
  })

  it('returns null when an id is not found', () => {
    expect(dragEndIndices(ids, 'a', 'zzz')).toBeNull()
    expect(dragEndIndices(ids, 'zzz', 'a')).toBeNull()
  })
})
