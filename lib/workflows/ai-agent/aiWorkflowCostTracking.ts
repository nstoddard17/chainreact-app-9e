/**
 * AI Workflow Creation Cost Tracking
 *
 * Tracks the cost of AI-generated workflows and deducts tasks from user balance.
 *
 * Cost Calculation:
 * - Base cost for AI planning: 1 task
 * - Additional cost based on complexity (nodes generated):
 *   - 1-3 nodes: 0 additional tasks
 *   - 4-6 nodes: 1 additional task
 *   - 7+ nodes: 2 additional tasks
 * - LLM usage: Included in base cost
 *
 * Total range: 1-3 tasks per AI workflow creation
 */

import { logger } from '@/lib/utils/logger'

// Cost configuration
const AI_WORKFLOW_COST = {
  BASE_TASK_COST: 1,       // Base cost for any AI planning
  MEDIUM_COMPLEXITY: 4,    // Threshold for medium complexity (4-6 nodes)
  HIGH_COMPLEXITY: 7,      // Threshold for high complexity (7+ nodes)
  MEDIUM_ADDITIONAL: 1,    // Additional tasks for medium complexity
  HIGH_ADDITIONAL: 2,      // Additional tasks for high complexity
}

export interface AIWorkflowCostResult {
  tasksUsed: number
  breakdown: {
    base: number
    complexity: number
    total: number
  }
  newBalance: number | null
  limitExceeded: boolean
  errorMessage?: string
}

/**
 * Calculate the task cost based on workflow complexity
 */
export function calculateAIWorkflowTaskCost(nodeCount: number): number {
  let cost = AI_WORKFLOW_COST.BASE_TASK_COST

  if (nodeCount >= AI_WORKFLOW_COST.HIGH_COMPLEXITY) {
    cost += AI_WORKFLOW_COST.HIGH_ADDITIONAL
  } else if (nodeCount >= AI_WORKFLOW_COST.MEDIUM_COMPLEXITY) {
    cost += AI_WORKFLOW_COST.MEDIUM_ADDITIONAL
  }

  return cost
}

/**
 * Check if user has enough tasks available for AI workflow creation
 */
export async function checkAIWorkflowTaskBalance(
  userId: string
): Promise<{ hasBalance: boolean; tasksUsed: number; tasksLimit: number }> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // Get user's current task balance
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('tasks_used, tasks_limit')
      .eq('id', userId)
      .single()

    if (error || !profile) {
      logger.warn('[AIWorkflowCost] Could not fetch user profile', { userId, error: error?.message })
      // Allow if we can't check (fail open for now)
      return { hasBalance: true, tasksUsed: 0, tasksLimit: 100 }
    }

    const tasksUsed = profile.tasks_used ?? 0
    const tasksLimit = profile.tasks_limit ?? 100

    return {
      hasBalance: tasksUsed < tasksLimit,
      tasksUsed,
      tasksLimit
    }
  } catch (error) {
    logger.error('[AIWorkflowCost] Error checking task balance', { userId, error })
    return { hasBalance: true, tasksUsed: 0, tasksLimit: 100 }
  }
}

/**
 * Deduct tasks from user's balance for AI workflow creation
 */
export async function deductAIWorkflowTasks(
  userId: string,
  nodeCount: number,
  flowId: string,
  planningMethod: 'llm' | 'pattern' | 'cache'
): Promise<AIWorkflowCostResult> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // Calculate cost based on complexity
    const baseCost = AI_WORKFLOW_COST.BASE_TASK_COST
    let complexityCost = 0

    if (nodeCount >= AI_WORKFLOW_COST.HIGH_COMPLEXITY) {
      complexityCost = AI_WORKFLOW_COST.HIGH_ADDITIONAL
    } else if (nodeCount >= AI_WORKFLOW_COST.MEDIUM_COMPLEXITY) {
      complexityCost = AI_WORKFLOW_COST.MEDIUM_ADDITIONAL
    }

    // Cache hits are free (template already paid for)
    if (planningMethod === 'cache') {
      logger.info('[AIWorkflowCost] Template cache hit - no cost', { userId, flowId })
      return {
        tasksUsed: 0,
        breakdown: { base: 0, complexity: 0, total: 0 },
        newBalance: null,
        limitExceeded: false
      }
    }

    const totalCost = baseCost + complexityCost

    // Get current balance
    const { data: profile, error: fetchError } = await supabase
      .from('profiles')
      .select('tasks_used, tasks_limit')
      .eq('id', userId)
      .single()

    if (fetchError || !profile) {
      logger.error('[AIWorkflowCost] Could not fetch profile for deduction', { userId, error: fetchError?.message })
      return {
        tasksUsed: 0,
        breakdown: { base: baseCost, complexity: complexityCost, total: totalCost },
        newBalance: null,
        limitExceeded: false,
        errorMessage: 'Could not verify task balance'
      }
    }

    const currentUsed = profile.tasks_used ?? 0
    const limit = profile.tasks_limit ?? 100
    const newUsed = currentUsed + totalCost

    // Check if limit would be exceeded
    if (newUsed > limit) {
      logger.warn('[AIWorkflowCost] Task limit would be exceeded', {
        userId,
        currentUsed,
        limit,
        costToDeduct: totalCost
      })
      return {
        tasksUsed: 0,
        breakdown: { base: baseCost, complexity: complexityCost, total: totalCost },
        newBalance: limit - currentUsed,
        limitExceeded: true,
        errorMessage: `Task limit exceeded. You have ${limit - currentUsed} tasks remaining, but this operation requires ${totalCost} tasks.`
      }
    }

    // Deduct tasks from profile
    const { data: updatedProfile, error: updateError } = await supabase
      .from('profiles')
      .update({ tasks_used: newUsed })
      .eq('id', userId)
      .select('tasks_used, tasks_limit')
      .single()

    if (updateError) {
      logger.error('[AIWorkflowCost] Failed to deduct tasks', { userId, error: updateError.message })
      return {
        tasksUsed: 0,
        breakdown: { base: baseCost, complexity: complexityCost, total: totalCost },
        newBalance: null,
        limitExceeded: false,
        errorMessage: 'Failed to deduct tasks'
      }
    }

    // Log the cost for analytics
    await supabase.from('ai_workflow_cost_logs').insert({
      user_id: userId,
      flow_id: flowId,
      tasks_used: totalCost,
      node_count: nodeCount,
      planning_method: planningMethod,
      breakdown: { base: baseCost, complexity: complexityCost },
      created_at: new Date().toISOString()
    }).then(({ error }) => {
      if (error) {
        // Non-blocking - just log the error
        logger.warn('[AIWorkflowCost] Failed to log cost (non-blocking)', { error: error.message })
      }
    })

    logger.info('[AIWorkflowCost] Tasks deducted successfully', {
      userId,
      flowId,
      tasksDeducted: totalCost,
      nodeCount,
      planningMethod,
      newBalance: limit - newUsed
    })

    return {
      tasksUsed: totalCost,
      breakdown: { base: baseCost, complexity: complexityCost, total: totalCost },
      newBalance: limit - newUsed,
      limitExceeded: false
    }

  } catch (error: any) {
    logger.error('[AIWorkflowCost] Unexpected error', { userId, flowId, error: error.message })
    return {
      tasksUsed: 0,
      breakdown: { base: 0, complexity: 0, total: 0 },
      newBalance: null,
      limitExceeded: false,
      errorMessage: error.message
    }
  }
}

/**
 * Track AI workflow creation for usage analytics
 */
export async function trackAIWorkflowUsage(
  userId: string,
  flowId: string,
  nodeCount: number,
  planningMethod: string,
  durationMs: number
): Promise<void> {
  try {
    const { trackUsage } = await import('@/lib/usageTracking')

    await trackUsage(userId, 'ai_agent', 'workflow_created', 1, {
      flow_id: flowId,
      node_count: nodeCount,
      planning_method: planningMethod,
      duration_ms: durationMs
    })
  } catch (error) {
    logger.warn('[AIWorkflowCost] Failed to track usage (non-blocking)', { error })
  }
}
