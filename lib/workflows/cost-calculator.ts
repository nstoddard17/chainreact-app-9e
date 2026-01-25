/**
 * Cost Calculator - Real-time workflow task cost calculation
 *
 * Converts estimated costs to tasks for display in the workflow builder.
 *
 * Pricing Strategy:
 * - Triggers: 0 tasks (they just listen)
 * - Standard actions (Gmail, Slack, etc.): 1 task each
 * - AI actions: Tiered by model (1-5 tasks based on model cost)
 * - Logic/transformers: 0 tasks (internal operations)
 */

// Task cost constant - 1 task = $0.01
export const TASK_COST = 0.01

// AI Model tiers - based on actual API costs
// Tier 1 (Budget): ~$0.01 per call
// Tier 2 (Standard): ~$0.03 per call
// Tier 3 (Premium): ~$0.05 per call
export const AI_MODEL_TASK_COSTS: Record<string, number> = {
  // OpenAI Models
  'gpt-3.5-turbo': 1,      // Budget - cheapest
  'gpt-4o-mini': 2,        // Standard - good balance
  'gpt-4-turbo': 3,        // Premium - fast with large context
  'gpt-4o': 4,             // Premium - most capable
  'gpt-4': 5,              // Premium - legacy but expensive

  // Anthropic Models
  'claude-3-haiku': 1,     // Budget - fastest, cheapest
  'claude-3-sonnet': 3,    // Standard - balanced
  'claude-3-opus': 5,      // Premium - best reasoning
  'claude-3.5-sonnet': 3,  // Standard - latest sonnet
  'claude-3.5-haiku': 1,   // Budget - latest haiku

  // Google Models
  'gemini-pro': 2,         // Standard
  'gemini-1.5-pro': 3,     // Premium
  'gemini-1.5-flash': 1,   // Budget

  // Default for unknown AI models
  'default': 2
}

// Provider costs in tasks
// - Triggers: 0 (they just listen, workflow hasn't "run" yet)
// - Actions: 1 (every action that does something costs 1 task)
// - AI: Based on model (see AI_MODEL_TASK_COSTS)
// - Logic/internal: 0 (no external API calls)
const PROVIDER_TASK_COSTS: Record<string, number> = {
  // === TRIGGERS (0 tasks - they just listen) ===
  // Triggers are handled separately - they're always 0

  // === STANDARD ACTIONS (1 task each) ===
  'gmail': 1,
  'slack': 1,
  'discord': 1,
  'notion': 1,
  'airtable': 1,
  'google_sheets': 1,
  'google_drive': 1,
  'google_calendar': 1,
  'microsoft_teams': 1,
  'microsoft_outlook': 1,
  'hubspot': 1,
  'salesforce': 1,
  'stripe': 1,
  'shopify': 1,
  'twitter': 1,
  'linkedin': 1,
  'facebook': 1,
  'instagram': 1,
  'youtube': 1,
  'twilio': 1,
  'sendgrid': 1,
  'mailchimp': 1,
  'zendesk': 1,
  'jira': 1,
  'asana': 1,
  'trello': 1,
  'monday': 1,
  'clickup': 1,
  'github': 1,
  'gitlab': 1,
  'bitbucket': 1,
  'dropbox': 1,
  'box': 1,
  'zoom': 1,
  'calendly': 1,
  'typeform': 1,
  'webflow': 1,
  'wordpress': 1,
  'http': 1,              // HTTP/webhook actions
  'webhook': 1,

  // === AI PROVIDERS (variable - based on model) ===
  // These use AI_MODEL_TASK_COSTS for actual cost
  'ai': -1,               // Special marker - look up by model
  'openai': -1,           // Special marker - look up by model
  'anthropic': -1,        // Special marker - look up by model
  'google_ai': -1,        // Special marker - look up by model

  // === LOGIC/INTERNAL (0 tasks) ===
  'logic': 0,
  'core': 0,
  'utility': 0,
  'transformer': 0,
  'filter': 0,
  'delay': 0,
  'schedule': 0,
  'manual': 0,            // Manual trigger

  // === DEFAULT ===
  'default': 1            // Unknown providers cost 1 task
}

/**
 * Get task cost for an AI node based on its configured model
 */
export function getAIModelTaskCost(model: string | undefined): number {
  if (!model) return AI_MODEL_TASK_COSTS['default']

  // Normalize model name (lowercase, handle variations)
  const normalizedModel = model.toLowerCase().trim()

  // Direct match
  if (AI_MODEL_TASK_COSTS[normalizedModel] !== undefined) {
    return AI_MODEL_TASK_COSTS[normalizedModel]
  }

  // Partial match for model families
  if (normalizedModel.includes('gpt-3.5')) return AI_MODEL_TASK_COSTS['gpt-3.5-turbo']
  if (normalizedModel.includes('gpt-4o-mini')) return AI_MODEL_TASK_COSTS['gpt-4o-mini']
  if (normalizedModel.includes('gpt-4o')) return AI_MODEL_TASK_COSTS['gpt-4o']
  if (normalizedModel.includes('gpt-4-turbo')) return AI_MODEL_TASK_COSTS['gpt-4-turbo']
  if (normalizedModel.includes('gpt-4')) return AI_MODEL_TASK_COSTS['gpt-4']
  if (normalizedModel.includes('haiku')) return AI_MODEL_TASK_COSTS['claude-3-haiku']
  if (normalizedModel.includes('sonnet')) return AI_MODEL_TASK_COSTS['claude-3-sonnet']
  if (normalizedModel.includes('opus')) return AI_MODEL_TASK_COSTS['claude-3-opus']
  if (normalizedModel.includes('gemini') && normalizedModel.includes('flash')) return AI_MODEL_TASK_COSTS['gemini-1.5-flash']
  if (normalizedModel.includes('gemini')) return AI_MODEL_TASK_COSTS['gemini-pro']

  return AI_MODEL_TASK_COSTS['default']
}

/**
 * Check if a node is a trigger (triggers cost 0 tasks)
 */
function isTriggerNode(node: any): boolean {
  if (!node) return false

  // Check explicit isTrigger flag
  if (node.data?.isTrigger === true) return true

  // Check node type for trigger patterns
  const nodeType = node.data?.type || node.type || ''
  if (nodeType.includes('trigger') || nodeType.includes('_trigger_')) return true

  return false
}

/**
 * Check if a node is an AI node
 */
function isAINode(node: any): boolean {
  if (!node) return false

  const providerId = node.data?.providerId || ''
  const nodeType = node.data?.type || node.type || ''

  // Check provider
  if (['ai', 'openai', 'anthropic', 'google_ai'].includes(providerId)) return true

  // Check node type
  if (nodeType.includes('ai_agent') || nodeType.includes('ai_')) return true
  if (nodeType.includes('openai') || nodeType.includes('anthropic')) return true

  return false
}

/**
 * Get task cost for a single node based on its type and configuration
 */
export function getNodeTaskCost(node: any): number {
  if (!node) return 0

  // Triggers are always free
  if (isTriggerNode(node)) return 0

  // AI nodes - use model-based pricing
  if (isAINode(node)) {
    const model = node.data?.config?.model || node.data?.model
    return getAIModelTaskCost(model)
  }

  const providerId = node.data?.providerId || ''
  const nodeType = node.data?.type || node.type || ''

  // Extract provider from node type if providerId is not set
  // e.g., 'gmail_action_send_email' -> 'gmail'
  const providerFromType = nodeType.split('_')[0] || ''
  const provider = providerId || providerFromType || 'default'

  // Get cost for this provider
  const cost = PROVIDER_TASK_COSTS[provider]

  // If cost is -1, it's an AI provider - shouldn't get here but handle it
  if (cost === -1) {
    const model = node.data?.config?.model || node.data?.model
    return getAIModelTaskCost(model)
  }

  // Return provider cost or default
  return cost ?? PROVIDER_TASK_COSTS['default']
}

/**
 * Convert a cost in dollars to task count
 * Uses Math.ceil to ensure any cost results in at least 1 task
 */
export function costToTasks(cost: number): number {
  if (cost <= 0) return 0
  return Math.ceil(cost / TASK_COST)
}

/**
 * Get provider cost in dollars (legacy, for backwards compatibility)
 */
export function getProviderCost(provider: string): number {
  const tasks = PROVIDER_TASK_COSTS[provider] ?? PROVIDER_TASK_COSTS['default']
  return tasks * TASK_COST
}

/**
 * Get task cost for a provider (without node context)
 */
export function getProviderTaskCost(provider: string): number {
  return PROVIDER_TASK_COSTS[provider] ?? PROVIDER_TASK_COSTS['default']
}

export interface WorkflowTaskCost {
  total: number
  byNode: Map<string, number>
  byProvider: Map<string, { tasks: number; count: number }>
}

/**
 * Calculate total task cost for a workflow
 */
export function getWorkflowTaskCost(nodes: any[]): WorkflowTaskCost {
  const byNode = new Map<string, number>()
  const byProvider = new Map<string, { tasks: number; count: number }>()
  let total = 0

  for (const node of nodes) {
    if (!node?.id) continue

    // Skip placeholder nodes
    if (node.data?.isPlaceholder) continue

    const taskCost = getNodeTaskCost(node)
    byNode.set(node.id, taskCost)
    total += taskCost

    // Track by provider
    const providerId = node.data?.providerId || node.data?.type?.split('_')[0] || 'unknown'
    const existing = byProvider.get(providerId) || { tasks: 0, count: 0 }
    byProvider.set(providerId, {
      tasks: existing.tasks + taskCost,
      count: existing.count + 1
    })
  }

  return { total, byNode, byProvider }
}

/**
 * Format task count for display
 */
export function formatTaskCount(tasks: number): string {
  if (tasks === 0) return '0 tasks'
  if (tasks === 1) return '1 task'
  return `${tasks} tasks`
}

/**
 * Check if workflow cost exceeds remaining tasks
 */
export function checkTaskBudget(
  estimatedTasks: number,
  remainingTasks: number
): { overBudget: boolean; excess: number } {
  const excess = estimatedTasks - remainingTasks
  return {
    overBudget: excess > 0,
    excess: Math.max(0, excess)
  }
}

/**
 * Get a human-readable description of task cost for a model
 */
export function getModelCostDescription(model: string): string {
  const cost = getAIModelTaskCost(model)
  if (cost === 1) return 'Budget (1 task)'
  if (cost === 2) return 'Standard (2 tasks)'
  if (cost <= 3) return 'Standard (3 tasks)'
  if (cost <= 4) return 'Premium (4 tasks)'
  return 'Premium (5 tasks)'
}
