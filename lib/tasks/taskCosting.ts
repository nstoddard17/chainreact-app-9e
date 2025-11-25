import { logger } from '@/lib/utils/logger'

export interface TaskCostBreakdown {
  nodeId: string
  nodeType: string
  nodeName?: string
  provider?: string
  cost: number
}

// Convert dollar costs to task units (1 task per $0.01)
const TASKS_PER_DOLLAR = 100
const DEFAULT_TASK_COST = 1

// Approximate USD costs per AI “style” call
const AI_COST_USD: Record<string, number> = {
  agent: 0.02,
  router: 0.015,
  toolbox: 0.015,
  generic: 0.01,
}

/**
 * Base task costs by provider/category.
 * These are intentionally conservative – everything has at least a cost of 1.
 */
const PROVIDER_BASE_COST: Record<string, number> = {
  ai: usdToTasks(AI_COST_USD.generic),
  ai_agent: usdToTasks(AI_COST_USD.agent),
  openai: usdToTasks(AI_COST_USD.generic),
  anthropic: usdToTasks(AI_COST_USD.generic),
  llm: usdToTasks(AI_COST_USD.generic),
  http: 3,
  webhook: 3,
  slack: 2,
  discord: 2,
  gmail: 2,
  outlook: 2,
  notion: 2,
  airtable: 2,
  sheets: 2,
  trello: 2,
  stripe: 2,
}

/**
 * Node-level overrides for known heavy/light operations.
 */
const NODE_TYPE_COSTS: Record<string, number> = {
  ai_agent_node: usdToTasks(AI_COST_USD.agent),
  ai_agent_action: usdToTasks(AI_COST_USD.agent),
  ai_router: usdToTasks(AI_COST_USD.router),
  ai_toolbox: usdToTasks(AI_COST_USD.toolbox),
  ai_router_action: usdToTasks(AI_COST_USD.router),
  ai_completion: usdToTasks(AI_COST_USD.generic),
  ai_extraction: usdToTasks(AI_COST_USD.generic),
  ai_embeddings: usdToTasks(0.008),
  http_request: 3,
  webhook_trigger: 3,
  delay: 0,
  path: 0,
  branch: 0,
}

function usdToTasks(usd: number): number {
  return Math.max(1, Math.ceil(usd * TASKS_PER_DOLLAR))
}

export function getNodeTaskCost(node: any): number {
  try {
    const nodeType = node?.data?.type || node?.type
    if (!nodeType) return DEFAULT_TASK_COST

    // Explicit node override
    if (NODE_TYPE_COSTS[nodeType] !== undefined) {
      return NODE_TYPE_COSTS[nodeType]
    }

    // Provider/category heuristic
    const provider = node?.data?.providerId || nodeType.split('_')[0]
    if (provider && PROVIDER_BASE_COST[provider] !== undefined) {
      return PROVIDER_BASE_COST[provider]
    }

    return DEFAULT_TASK_COST
  } catch (error) {
    logger.warn('[TaskCosting] Failed to calculate node cost, using default', { error })
    return DEFAULT_TASK_COST
  }
}

export function estimateWorkflowTasks(nodes: any[]): { total: number; breakdown: TaskCostBreakdown[] } {
  const breakdown: TaskCostBreakdown[] = []

  for (const node of nodes || []) {
    const cost = getNodeTaskCost(node)
    breakdown.push({
      nodeId: node?.id,
      nodeType: node?.data?.type || node?.type,
      nodeName: node?.data?.title,
      provider: node?.data?.providerId,
      cost,
    })
  }

  const total = breakdown.reduce((sum, entry) => sum + entry.cost, 0)
  return { total, breakdown }
}
