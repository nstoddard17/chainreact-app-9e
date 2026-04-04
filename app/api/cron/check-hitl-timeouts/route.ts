/**
 * HITL Timeout Enforcement Cron Job
 * Runs every 5 minutes to check for expired HITL conversations
 * Handles timeout actions: cancel workflow or proceed automatically
 *
 * Scheduled execution goes through the consolidated /api/cron/every-five-minutes endpoint.
 * This route remains available for manual/debug triggers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkHitlTimeoutsCore } from '@/lib/cron/hitl-timeouts-core'
import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    const result = await checkHitlTimeoutsCore()

    return NextResponse.json({
      ...result,
      message: `Processed ${result.checked} expired conversations: ${result.cancelled} cancelled, ${result.proceeded} proceeded, ${result.errors} errors`
    })
  } catch (error: any) {
    logger.error('[HITL Timeout] Cron job error', { error: error.message })
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }
}
