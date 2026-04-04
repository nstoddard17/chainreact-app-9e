/**
 * Consolidated Cron: Every Five Minutes
 *
 * Runs three sub-tasks in parallel with individual timeouts:
 * - Refresh OAuth tokens
 * - Check HITL timeouts
 * - Renew webhook subscriptions
 *
 * Each sub-task is isolated: one failure does not affect siblings.
 * Old individual cron routes remain available for manual/debug triggers only.
 */

import { NextRequest } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { runCronTasks } from '@/lib/utils/cron-helpers'
import { logger } from '@/lib/utils/logger'

import { refreshAllTokensCore } from '@/lib/cron/token-refresh-core'
import { checkHitlTimeoutsCore } from '@/lib/cron/hitl-timeouts-core'
import { renewWebhookSubscriptionsCore } from '@/lib/cron/webhook-renewal-core'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

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

  logger.info('[Cron:every-five-minutes] Starting consolidated run')

  const { tasks, durationMs } = await runCronTasks([
    { label: 'token-refresh', fn: () => refreshAllTokensCore(), timeoutMs: 60_000 },
    { label: 'hitl-timeouts', fn: () => checkHitlTimeoutsCore(), timeoutMs: 30_000 },
    { label: 'webhook-renewal', fn: () => renewWebhookSubscriptionsCore(), timeoutMs: 60_000 },
  ])

  const failed = tasks.filter(t => t.status !== 'success')
  if (failed.length > 0) {
    logger.error('[Cron:every-five-minutes] Some tasks failed', {
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
