/**
 * Cost Tracker - Track AI/API costs for workflow execution
 */

export interface CostBreakdown {
  nodeId: string
  nodeName: string
  provider: string
  operation: string
  tokens?: {
    input: number
    output: number
    total: number
  }
  cost: number
  timestamp: string
}

export interface WorkflowCostEstimate {
  total: number
  breakdown: CostBreakdown[]
  currency: string
}

export class CostTracker {
  private breakdown: CostBreakdown[] = []

  /**
   * Add cost entry for a node execution
   */
  addEntry(entry: CostBreakdown): void {
    this.breakdown.push(entry)
  }

  /**
   * Calculate total cost
   */
  getTotalCost(): number {
    return this.breakdown.reduce((sum, entry) => sum + entry.cost, 0)
  }

  /**
   * Get cost breakdown by provider
   */
  getCostByProvider(): Record<string, number> {
    return this.breakdown.reduce((acc, entry) => {
      acc[entry.provider] = (acc[entry.provider] || 0) + entry.cost
      return acc
    }, {} as Record<string, number>)
  }

  /**
   * Get cost breakdown by node
   */
  getCostByNode(): Record<string, number> {
    return this.breakdown.reduce((acc, entry) => {
      acc[entry.nodeId] = (acc[entry.nodeId] || 0) + entry.cost
      return acc
    }, {} as Record<string, number>)
  }

  /**
   * Get total tokens used
   */
  getTotalTokens(): { input: number; output: number; total: number } {
    return this.breakdown.reduce(
      (acc, entry) => {
        if (entry.tokens) {
          acc.input += entry.tokens.input
          acc.output += entry.tokens.output
          acc.total += entry.tokens.total
        }
        return acc
      },
      { input: 0, output: 0, total: 0 }
    )
  }

  /**
   * Get full breakdown
   */
  getBreakdown(): CostBreakdown[] {
    return [...this.breakdown]
  }

  /**
   * Format cost for display
   */
  formatCost(cost: number): string {
    if (cost < 0.01) {
      return `< $0.01`
    }
    return `$${cost.toFixed(2)}`
  }

  /**
   * Clear all cost data
   */
  clear(): void {
    this.breakdown = []
  }
}

/**
 * Estimate cost for a workflow based on node types
 */
export function estimateWorkflowCost(nodes: any[]): WorkflowCostEstimate {
  const breakdown: CostBreakdown[] = []

  // Cost estimates per provider (rough averages)
  const COST_ESTIMATES: Record<string, number> = {
    'ai_agent': 0.01, // GPT-4 per call
    'openai': 0.01,
    'anthropic': 0.015,
    'gmail': 0,
    'slack': 0,
    'discord': 0,
    'notion': 0,
    'http': 0,
    'default': 0.001
  }

  nodes.forEach(node => {
    const provider = node.data?.providerId || node.type.split('_')[0] || 'default'
    const cost = COST_ESTIMATES[provider] || COST_ESTIMATES['default']

    if (cost > 0) {
      breakdown.push({
        nodeId: node.id,
        nodeName: node.data?.title || node.type,
        provider,
        operation: node.data?.type || node.type,
        cost,
        timestamp: new Date().toISOString()
      })
    }
  })

  return {
    total: breakdown.reduce((sum, entry) => sum + entry.cost, 0),
    breakdown,
    currency: 'USD'
  }
}
