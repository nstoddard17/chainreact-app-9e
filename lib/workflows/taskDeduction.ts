/**
 * Task Deduction Service
 *
 * Deducts tasks from user's balance after workflow execution.
 * Only charges for nodes that actually executed (including failed ones that consumed API resources).
 * Never charges for test/sandbox mode executions.
 *
 * Uses the atomic increment_tasks_used RPC to prevent race conditions.
 */

import { logger } from '@/lib/utils/logger'
import { getNodeTaskCost } from '@/lib/workflows/cost-calculator'

export interface TaskDeductionResult {
  tasksDeducted: number
  newBalance: number | null
  breakdown: Record<string, number>
  error?: string
}

/**
 * Deduct tasks from user's balance after workflow execution.
 *
 * @param userId - The user who owns the workflow
 * @param executedNodes - Nodes that actually executed (completed or failed after running)
 * @param executionSessionId - The execution session ID for audit trail
 * @param isTestMode - If true, no tasks are deducted
 */
export async function deductExecutionTasks(
  userId: string,
  executedNodes: any[],
  executionSessionId: string,
  isTestMode: boolean
): Promise<TaskDeductionResult> {
  if (isTestMode) {
    return { tasksDeducted: 0, newBalance: null, breakdown: {} }
  }

  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // Calculate cost per executed node
    const breakdown: Record<string, number> = {}
    let totalCost = 0

    for (const node of executedNodes) {
      if (!node?.id) continue
      const cost = getNodeTaskCost(node)
      if (cost > 0) {
        breakdown[node.id] = cost
        totalCost += cost
      }
    }

    if (totalCost === 0) {
      return { tasksDeducted: 0, newBalance: null, breakdown }
    }

    // Atomic increment using RPC
    const { data: rpcResult, error: rpcError } = await supabase.rpc('increment_tasks_used', {
      p_user_id: userId,
      p_increment: totalCost
    })

    if (rpcError) {
      logger.error('[TaskDeduction] RPC increment_tasks_used failed', {
        userId,
        executionSessionId,
        error: rpcError.message
      })
      return { tasksDeducted: 0, newBalance: null, breakdown, error: rpcError.message }
    }

    // RPC returns array with one row: { new_tasks_used, current_tasks_limit }
    const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult
    const newTasksUsed = result?.new_tasks_used ?? 0
    const tasksLimit = result?.current_tasks_limit ?? 100
    const newBalance = tasksLimit === -1 ? Infinity : Math.max(0, tasksLimit - newTasksUsed)

    // Update execution session for audit trail (non-blocking)
    supabase
      .from('workflow_execution_sessions')
      .update({ tasks_used: totalCost })
      .eq('id', executionSessionId)
      .then(({ error }) => {
        if (error) {
          logger.warn('[TaskDeduction] Failed to update session tasks_used (non-blocking)', {
            executionSessionId,
            error: error.message
          })
        }
      })

    // Also update monthly_usage for billing page display (non-blocking)
    try {
      const currentDate = new Date()
      await supabase.rpc('increment_monthly_usage', {
        p_user_id: userId,
        p_year: currentDate.getFullYear(),
        p_month: currentDate.getMonth() + 1,
        p_field: 'execution_count',
        p_increment: totalCost
      })
    } catch (usageErr) {
      logger.warn('[TaskDeduction] monthly_usage update failed (non-blocking)', {
        error: usageErr instanceof Error ? usageErr.message : String(usageErr)
      })
    }

    logger.info('[TaskDeduction] Tasks deducted', {
      userId,
      executionSessionId,
      tasksDeducted: totalCost,
      newTasksUsed,
      remaining: newBalance === Infinity ? 'unlimited' : newBalance
    })

    return {
      tasksDeducted: totalCost,
      newBalance: newBalance === Infinity ? null : newBalance,
      breakdown
    }
  } catch (error: any) {
    logger.error('[TaskDeduction] Unexpected error', {
      userId,
      executionSessionId,
      error: error.message
    })
    // Fail open - don't block workflow results if deduction fails
    return { tasksDeducted: 0, newBalance: null, breakdown: {}, error: error.message }
  }
}

/**
 * Check if user has enough tasks to execute a workflow.
 * Used for pre-execution limit checking.
 */
export async function checkTaskBalance(
  userId: string,
  estimatedCost: number
): Promise<{ allowed: boolean; remaining: number; limit: number; used: number }> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('tasks_used, tasks_limit')
      .eq('id', userId)
      .single()

    if (error || !profile) {
      logger.warn('[TaskDeduction] Could not fetch profile for balance check, allowing execution', {
        userId,
        error: error?.message
      })
      // Fail open
      return { allowed: true, remaining: 100, limit: 100, used: 0 }
    }

    const used = profile.tasks_used ?? 0
    const limit = profile.tasks_limit ?? 100

    // Enterprise/unlimited users always pass
    if (limit === -1) {
      return { allowed: true, remaining: Infinity, limit: -1, used }
    }

    const remaining = Math.max(0, limit - used)
    const allowed = remaining >= estimatedCost

    return { allowed, remaining, limit, used }
  } catch (error: any) {
    logger.error('[TaskDeduction] Error checking task balance', { userId, error: error.message })
    // Fail open
    return { allowed: true, remaining: 100, limit: 100, used: 0 }
  }
}
