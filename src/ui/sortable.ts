/** Map a dnd-kit drag-end (active dragged id, over drop-target id) to the
 *  `{from, to}` indices for the store's `reorderNode`. Returns null when the
 *  drag is a no-op or an id is missing. `reorderNode(from, to)` has the same
 *  semantics as dnd-kit's `arrayMove(items, from, to)`. */
export function dragEndIndices(
  ids: string[],
  activeId: string,
  overId: string,
): { from: number; to: number } | null {
  if (activeId === overId) return null
  const from = ids.indexOf(activeId)
  const to = ids.indexOf(overId)
  if (from === -1 || to === -1) return null
  return { from, to }
}
