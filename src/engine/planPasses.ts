import type { Effect, Params } from '@/effects/types'

export interface StackNode {
  id: string
  type: string
  enabled: boolean
  params: Params
}

export interface PassStep {
  node: StackNode
  effect: Effect
}

export function planPasses(
  stack: StackNode[],
  reg: Record<string, Effect>,
): PassStep[] {
  const steps: PassStep[] = []
  for (const node of stack) {
    if (!node.enabled) continue
    const effect = reg[node.type]
    if (!effect) continue
    steps.push({ node, effect })
  }
  return steps
}
