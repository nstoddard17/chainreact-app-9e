/**
 * Task Deduction Service
 *
 * CANONICAL CHARGING POLICY (v1) — Conservative Upfront Reservation
 *
 * 1. Workflow execution is charged upfront using conservative pre-execution cost estimation.
 * 2. No refunds in v1 — if actual usage is lower than estimate, accept overcharge.
 * 3. Retries are new charges — each execution attempt is independent.
 * 4. Loops are estimated conservatively — inner node cost x configured max iterations.
 * 5. AI workflow creation is charged atomically at request time (1-3 tasks).
 * 6. Cached AI workflows are free — template already paid for.
 * 7. Test/sandbox mode and node testing (ActionTester) are free.
 * 8. Enterprise (limit = -1) — unlimited bypass, but ledger rows are still written.
 * 9. Partial failure — no refund; the upfront reservation stands.
 * 10. Billing period: monthly (30 days free, Stripe period for paid).
 * 11. Period reset: automatic on next deduction if period expired; cron as safety net.
 *
 * Uses the atomic deduct_tasks_if_available RPC:
 * - SELECT ... FOR UPDATE serializes concurrent deductions
 * - Idempotency via (user_id, execution_id, event_type) unique constraint
 * - Auto-resets expired billing periods inline
 * - Returns result_type for callers to distinguish failure reasons
 */

import { logger } from '@/lib/utils/logger'
import { getNodeTaskCost } from '@/lib/workflows/cost-calculator'

export type TaskDeductionResultType =
  | 'deducted'
  | 'idempotent_replay'
  | 'insufficient_balance'
  | 'subscription_inactive'
  | 'billing_unavailable'

export interface TaskDeductionResult {
  tasksDeducted: number
  newBalance: number | null
  breakdown: Record<string, number>
  /** true = fresh charge applied, false = idempotent replay of prior charge or no charge */
  applied: boolean
  /** Distinguishes failure reasons for caller error mapping */
  resultType: TaskDeductionResultType
  error?: string
}

/**
 * Atomically deduct tasks from user's balance before workflow execution.
 * Uses the deduct_tasks_if_available RPC for serialized, idempotent billing.
 *
 * FAIL-CLOSED: if the RPC errors, execution is blocked (not silently allowed).
 *
 * Caller behavior for result:
 * - success=TRUE, applied=TRUE  (deducted)          → proceed with execution
 * - success=TRUE, applied=FALSE (idempotent_replay)  → proceed (already authorized)
 * - success=FALSE (insufficient_balance/subscription_inactive/billing_unavailable) → block
 *
 * @param userId - The user who owns the workflow
 * @param estimatedNodes - Nodes from workflow definition (for cost estimation, not executed nodes)
 * @param executionSessionId - The execution session ID (idempotency key)
 * @param isTestMode - If true, no tasks are deducted
 * @param options - Optional workflow_id and source for ledger tracking
 */
export async function deductTasksAtomic(
  userId: string,
  estimatedNodes: any[],
  executionSessionId: string,
  isTestMode: boolean,
  options?: { workflowId?: string; source?: string }
): Promise<TaskDeductionResult> {
  if (isTestMode) {
    return { tasksDeducted: 0, newBalance: null, breakdown: {}, applied: false, resultType: 'deducted' }
  }

  // Calculate conservative cost estimate from workflow definition
  const breakdown: Record<string, number> = {}
  let totalCost = 0

  for (const node of estimatedNodes) {
    if (!node?.id) continue
    const cost = getNodeTaskCost(node)
    if (cost > 0) {
      breakdown[node.id] = cost
      totalCost += cost
    }
  }

  if (totalCost === 0) {
    return { tasksDeducted: 0, newBalance: null, breakdown, applied: false, resultType: 'deducted' }
  }

  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    const supabase = createAdminClient()

    // Atomic deduction: check balance + deduct + write ledger in one transaction
    const { data: rpcResult, error: rpcError } = await supabase.rpc('deduct_tasks_if_available', {
      p_user_id: userId,
      p_amount: totalCost,
      p_execution_id: executionSessionId,
      p_event_type: 'workflow_execution',
      p_node_breakdown: breakdown,
      p_workflow_id: options?.workflowId,
      p_source: options?.source ?? 'execute_route'
    })

    if (rpcError) {
      logger.error('[TaskDeduction] Atomic deduction RPC failed', {
        userId,
        executionSessionId,
        error: rpcError.message
      })
      // FAIL CLOSED — do not silently allow execution
      return {
        tasksDeducted: 0,
        newBalance: null,
        breakdown,
        applied: false,
        resultType: 'billing_unavailable',
        error: 'Billing system temporarily unavailable. Please retry.'
      }
    }

    const result = Array.isArray(rpcResult) ? rpcResult[0] : rpcResult

    if (!result) {
      logger.error('[TaskDeduction] RPC returned empty result', { userId, executionSessionId })
      return {
        tasksDeducted: 0,
        newBalance: null,
        breakdown,
        applied: false,
        resultType: 'billing_unavailable',
        error: 'Billing system temporarily unavailable. Please retry.'
      }
    }

    const resultType = (result.result_type ?? 'billing_unavailable') as TaskDeductionResultType

    if (!result.success) {
      // Structured failure — caller maps result_type to HTTP status
      const errorMessages: Record<string, string> = {
        insufficient_balance: `Task limit reached. You need ${totalCost} task${totalCost !== 1 ? 's' : ''} but have ${result.remaining ?? 0} remaining. Upgrade your plan for more tasks.`,
        subscription_inactive: 'Your subscription is inactive. Please update your billing to continue.',
        billing_unavailable: 'Billing system temporarily unavailable. Please retry.',
      }

      logger.warn('[TaskDeduction] Deduction rejected', {
        userId,
        executionSessionId,
        resultType,
        tasksNeeded: totalCost,
        remaining: result.remaining
      })

      return {
        tasksDeducted: 0,
        newBalance: result.remaining ?? 0,
        breakdown,
        applied: false,
        resultType,
        error: errorMessages[resultType] ?? 'Billing error. Please retry.'
      }
    }

    // Success path
    const newBalance = result.current_tasks_limit === -1 ? null : (result.remaining ?? 0)

    if (result.applied) {
      logger.info('[TaskDeduction] Tasks deducted', {
        userId,
        executionSessionId,
        tasksDeducted: totalCost,
        newTasksUsed: result.new_tasks_used,
        remaining: newBalance ?? 'unlimited'
      })
    } else {
      logger.info('[TaskDeduction] Idempotent replay for execution', {
        userId,
        executionSessionId,
        tasksDeducted: totalCost
      })
    }

    // Non-blocking: update execution session for backward compatibility
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

    // Non-blocking: update monthly_usage for billing page display
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

    return {
      tasksDeducted: totalCost,
      newBalance,
      breakdown,
      applied: result.applied ?? true,
      resultType
    }
  } catch (error: any) {
    logger.error('[TaskDeduction] Unexpected error', {
      userId,
      executionSessionId,
      error: error.message
    })
    // FAIL CLOSED
    return {
      tasksDeducted: 0,
      newBalance: null,
      breakdown,
      applied: false,
      resultType: 'billing_unavailable',
      error: 'Billing system temporarily unavailable. Please retry.'
    }
  }
}

/**
 * @deprecated Use deductTasksAtomic() instead. This function uses a non-atomic
 * post-execution deduction pattern that has a race condition with concurrent executions.
 * Kept temporarily for callers not yet migrated.
 */
export async function deductExecutionTasks(
  userId: string,
  executedNodes: any[],
  executionSessionId: string,
  isTestMode: boolean
): Promise<TaskDeductionResult> {
  // Delegate to the new atomic function
  return deductTasksAtomic(userId, executedNodes, executionSessionId, isTestMode, {
    source: 'execute_route'
  })
}

/**
 * @deprecated Use deductTasksAtomic() instead. The atomic RPC handles both
 * balance checking and deduction in a single serialized transaction.
 * Kept temporarily for callers not yet migrated (e.g., usageTracking.ts).
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
      logger.warn('[TaskDeduction] Could not fetch profile for balance check', {
        userId,
        error: error?.message
      })
      // Fail closed (changed from fail-open)
      return { allowed: false, remaining: 0, limit: 0, used: 0 }
    }

    const used = profile.tasks_used ?? 0
    const limit = profile.tasks_limit ?? 100

    if (limit === -1) {
      return { allowed: true, remaining: Infinity, limit: -1, used }
    }

    const remaining = Math.max(0, limit - used)
    return { allowed: remaining >= estimatedCost, remaining, limit, used }
  } catch (error: any) {
    logger.error('[TaskDeduction] Error checking task balance', { userId, error: error.message })
    // Fail closed
    return { allowed: false, remaining: 0, limit: 0, used: 0 }
  }
}
