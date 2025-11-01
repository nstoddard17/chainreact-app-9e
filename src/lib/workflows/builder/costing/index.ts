import { Flow, Node } from "../schema"

export interface CostBreakdownItem {
  nodeId: string
  nodeType: string
  estimated: number
  actual: number
  tokenCount?: number
}

export interface CostSummary {
  estimated: number
  actual: number
  breakdown: CostBreakdownItem[]
}

export interface NodeCostInput {
  node: Node
  actual?: number
  estimated?: number
  tokenCount?: number
}

export function calculateCostSummary(items: NodeCostInput[]): CostSummary {
  const breakdown: CostBreakdownItem[] = []
  let estimated = 0
  let actual = 0

  items.forEach((item) => {
    const est = item.estimated ?? item.node.costHint ?? 0
    const act = item.actual ?? 0
    estimated += est
    actual += act
    breakdown.push({
      nodeId: item.node.id,
      nodeType: item.node.type,
      estimated: est,
      actual: act,
      tokenCount: item.tokenCount,
    })
  })

  return { estimated, actual, breakdown }
}

const MODEL_TOKEN_RATES: Record<string, { costPer1K: number }> = {
  "gpt-4o-mini": { costPer1K: 0.15 },
  "gpt-4o": { costPer1K: 0.30 },
}

export function estimateAICost(node: Node, tokens = 750): number {
  const model = (node.config as any)?.model
  if (!model) return node.costHint ?? 0
  const rate = MODEL_TOKEN_RATES[model]
  if (!rate) return node.costHint ?? 0
  return (tokens / 1000) * rate.costPer1K
}

export function estimateFlowCost(flow: Flow): CostSummary {
  const items: NodeCostInput[] = flow.nodes.map((node) => {
    let estimated = node.costHint ?? 0
    if (node.type === "ai.generate") {
      estimated = estimateAICost(node)
    }
    return {
      node,
      estimated,
      actual: 0,
    }
  })
  return calculateCostSummary(items)
}
