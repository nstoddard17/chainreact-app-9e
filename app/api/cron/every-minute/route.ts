/**
 * Consolidated Cron: Every Minute
 *
 * Runs three sub-tasks in parallel with individual timeouts:
 * - Process scheduled executions
 * - Poll triggers
 * - Resume stuck workflows
 *
 * Each sub-task is isolated: one failure does not affect siblings.
 * Old individual cron routes remain available for manual/debug triggers only.
 */

import { NextRequest } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { runCronTasks } from '@/lib/utils/cron-helpers'
import { logger } from '@/lib/utils/logger'

import { processScheduledExecutionsCore } from '@/lib/cron/scheduled-executions-core'
import { runPollingCore } from '@/lib/cron/poll-triggers-core'
import { checkAndResumeStuckWorkflows } from '@/lib/workflows/resumeWorkflow'

export const dynamic = 'force-dynamic'
export const maxDuration = 55

function verifyCronAuth(request: NextRequest): boolean {
  const cronHeader = request.headers.get('x-vercel-cron')
  if (cronHeader === '1') return true

  const authHeader = request.headers.get('authorization')
  const expectedSecret = process.env.CRON_SECRET
  if (expectedSecret && authHeader === `Bearer ${expectedSecret}`) return true

  return false
}

export async function GET(request: NextRequest) {
  if (!verifyCronAuth(request)) {
    return errorResponse('Unauthorized', 401)
  }

  logger.info('[Cron:every-minute] Starting consolidated run')

  const { tasks, durationMs } = await runCronTasks([
    { label: 'scheduled-executions', fn: () => processScheduledExecutionsCore(), timeoutMs: 20_000 },
    { label: 'poll-triggers', fn: () => runPollingCore(), timeoutMs: 40_000 },
    { label: 'resume-stuck', fn: () => checkAndResumeStuckWorkflows(), timeoutMs: 15_000 },
  ])

  const failed = tasks.filter(t => t.status !== 'success')
  if (failed.length > 0) {
    logger.error('[Cron:every-minute] Some tasks failed', {
      failed: failed.map(t => ({ label: t.label, status: t.status, error: t.error })),
    })
  }

  return jsonResponse({
    success: failed.length === 0,
    tasks,
    durationMs,
    timestamp: new Date().toISOString(),
  })
}
