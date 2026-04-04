/**
 * Cron Job Consolidation Helpers
 *
 * Provides per-task isolation for consolidated cron endpoints.
 * Each sub-task gets its own timeout and error boundary.
 */

import { logger } from '@/lib/utils/logger'

export interface CronTaskResult<T = unknown> {
  label: string
  status: 'success' | 'timeout' | 'error'
  durationMs: number
  result?: T
  error?: string
}

/**
 * Run a promise with a timeout guard.
 *
 * Timeout semantics: stops *awaiting*, does NOT cancel underlying work.
 * Sub-tasks that are not abort-aware may continue running in the background.
 * This is acceptable — the goal is to prevent one slow task from blocking
 * siblings or exceeding the route-level duration limit.
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<CronTaskResult<T>> {
  const start = Date.now()

  try {
    const result = await Promise.race([
      promise.then(r => ({ type: 'result' as const, value: r })),
      new Promise<{ type: 'timeout' }>(resolve =>
        setTimeout(() => resolve({ type: 'timeout' }), ms)
      ),
    ])

    const durationMs = Date.now() - start

    if (result.type === 'timeout') {
      logger.error(`[Cron:${label}] Task timed out after ${durationMs}ms (limit: ${ms}ms)`)
      return { label, status: 'timeout', durationMs, error: `Timed out after ${ms}ms` }
    }

    logger.debug(`[Cron:${label}] Task completed in ${durationMs}ms`)
    return { label, status: 'success', durationMs, result: result.value }
  } catch (err: any) {
    const durationMs = Date.now() - start
    const message = err?.message || 'Unknown error'
    logger.error(`[Cron:${label}] Task failed after ${durationMs}ms: ${message}`)
    return { label, status: 'error', durationMs, error: message }
  }
}

/**
 * Run multiple cron sub-tasks in parallel with individual timeouts.
 * Returns a summary suitable for JSON response.
 */
export async function runCronTasks(
  tasks: Array<{ label: string; fn: () => Promise<unknown>; timeoutMs: number }>
): Promise<{ tasks: CronTaskResult[]; durationMs: number }> {
  const start = Date.now()

  const results = await Promise.allSettled(
    tasks.map(t => withTimeout(t.fn(), t.timeoutMs, t.label))
  )

  const taskResults = results.map(r =>
    r.status === 'fulfilled'
      ? r.value
      : { label: 'unknown', status: 'error' as const, durationMs: 0, error: r.reason?.message }
  )

  return { tasks: taskResults, durationMs: Date.now() - start }
}
