import { logger } from '@/lib/utils/logger'

/**
 * Default rate limits for workflow execution.
 * These can be overridden per-workflow via the workflows table.
 */
export const DEFAULT_RATE_LIMITS = {
  maxExecutionsPerHour: 100,
  maxExecutionsPerMinute: 10,
  consecutiveFailureThreshold: 5,
} as const

export interface RateLimitResult {
  allowed: boolean
  reason?: string
  currentCount?: number
  limit?: number
}

export interface CircuitBreakerResult {
  tripped: boolean
  consecutiveFailures?: number
  trippedAt?: string
}

/**
 * Checks whether a workflow is within its execution rate limits.
 * Uses the workflow_execution_sessions table for distributed counting
 * (works across serverless invocations).
 */
export async function checkExecutionRateLimit(
  workflowId: string,
  supabase: any,
  limits?: {
    maxPerHour?: number
    maxPerMinute?: number
  }
): Promise<RateLimitResult> {
  const maxPerHour = limits?.maxPerHour ?? DEFAULT_RATE_LIMITS.maxExecutionsPerHour
  const maxPerMinute = limits?.maxPerMinute ?? DEFAULT_RATE_LIMITS.maxExecutionsPerMinute

  try {
    // Check per-minute burst limit first (cheaper query, smaller window)
    const oneMinuteAgo = new Date(Date.now() - 60_000).toISOString()
    const { count: minuteCount, error: minuteError } = await supabase
      .from('workflow_execution_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('workflow_id', workflowId)
      .gte('started_at', oneMinuteAgo)

    if (minuteError) {
      logger.error('Rate limit check failed (minute):', minuteError)
      // Fail open — don't block execution if the check itself fails
      return { allowed: true }
    }

    if ((minuteCount ?? 0) >= maxPerMinute) {
      logger.warn(`⚠️ Rate limit exceeded for workflow ${workflowId}: ${minuteCount}/${maxPerMinute} per minute`)
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${minuteCount} executions in the last minute (limit: ${maxPerMinute})`,
        currentCount: minuteCount ?? 0,
        limit: maxPerMinute,
      }
    }

    // Check per-hour limit
    const oneHourAgo = new Date(Date.now() - 3_600_000).toISOString()
    const { count: hourCount, error: hourError } = await supabase
      .from('workflow_execution_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('workflow_id', workflowId)
      .gte('started_at', oneHourAgo)

    if (hourError) {
      logger.error('Rate limit check failed (hour):', hourError)
      return { allowed: true }
    }

    if ((hourCount ?? 0) >= maxPerHour) {
      logger.warn(`⚠️ Rate limit exceeded for workflow ${workflowId}: ${hourCount}/${maxPerHour} per hour`)
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${hourCount} executions in the last hour (limit: ${maxPerHour})`,
        currentCount: hourCount ?? 0,
        limit: maxPerHour,
      }
    }

    return { allowed: true }
  } catch (error) {
    logger.error('Rate limit check error:', error)
    // Fail open
    return { allowed: true }
  }
}

/**
 * Checks the circuit breaker state for a workflow.
 * A circuit breaker trips after N consecutive failures and auto-pauses the workflow.
 */
export async function checkCircuitBreaker(
  workflowId: string,
  supabase: any,
  threshold?: number
): Promise<CircuitBreakerResult> {
  const failureThreshold = threshold ?? DEFAULT_RATE_LIMITS.consecutiveFailureThreshold

  try {
    // Get the last N execution sessions, ordered by most recent
    const { data: recentSessions, error } = await supabase
      .from('workflow_execution_sessions')
      .select('status, started_at')
      .eq('workflow_id', workflowId)
      .order('started_at', { ascending: false })
      .limit(failureThreshold)

    if (error || !recentSessions) {
      logger.error('Circuit breaker check failed:', error)
      return { tripped: false }
    }

    // If we don't have enough sessions to evaluate, circuit breaker can't trip
    if (recentSessions.length < failureThreshold) {
      return { tripped: false }
    }

    // Check if all recent sessions failed
    const allFailed = recentSessions.every(
      (s: any) => s.status === 'failed' || s.status === 'error'
    )

    if (allFailed) {
      logger.warn(`⚠️ Circuit breaker tripped for workflow ${workflowId}: ${failureThreshold} consecutive failures`)
      return {
        tripped: true,
        consecutiveFailures: failureThreshold,
        trippedAt: new Date().toISOString(),
      }
    }

    return { tripped: false }
  } catch (error) {
    logger.error('Circuit breaker check error:', error)
    return { tripped: false }
  }
}

/**
 * Pauses a workflow after a circuit breaker trip.
 * Updates the workflow status to 'inactive' and logs the reason.
 */
export async function pauseWorkflowForCircuitBreaker(
  workflowId: string,
  supabase: any,
  reason: string
): Promise<void> {
  try {
    await supabase
      .from('workflows')
      .update({
        status: 'inactive',
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId)

    logger.warn(`🔴 Workflow ${workflowId} auto-paused: ${reason}`)
  } catch (error) {
    logger.error('Failed to pause workflow for circuit breaker:', error)
  }
}

/**
 * Checks for execution chain loops (workflow A triggers workflow B triggers workflow A).
 * Uses an execution_chain header to track the chain of workflow IDs.
 */
export function checkExecutionLoop(
  workflowId: string,
  executionChain?: string[]
): { isLoop: boolean; chain: string[] } {
  const chain = executionChain ?? []

  if (chain.includes(workflowId)) {
    logger.warn(`🔄 Execution loop detected: ${[...chain, workflowId].join(' → ')}`)
    return { isLoop: true, chain: [...chain, workflowId] }
  }

  return { isLoop: false, chain: [...chain, workflowId] }
}
