/**
 * Cron job to check for timed-out waiting executions
 * Should be run periodically (e.g., every 5 minutes) via a cron service
 */

import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceRoleClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    // Verify this is a legitimate cron request (optional: add auth header check)
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createSupabaseServiceRoleClient()
    const now = new Date().toISOString()

    logger.info('[Timeout Checker] Checking for timed-out waiting executions')

    // Find waiting executions that have timed out
    const { data: timedOutExecutions, error } = await supabase
      .from('waiting_executions')
      .select('*')
      .eq('status', 'waiting')
      .not('timeout_at', 'is', null)
      .lte('timeout_at', now)

    if (error) {
      logger.error('[Timeout Checker] Error querying timed-out executions', { error })
      return NextResponse.json({ error: 'Failed to query timed-out executions' }, { status: 500 })
    }

    if (!timedOutExecutions || timedOutExecutions.length === 0) {
      logger.info('[Timeout Checker] No timed-out executions found')
      return NextResponse.json({
        success: true,
        message: 'No timed-out executions',
        processed: 0
      })
    }

    logger.info(`[Timeout Checker] Found ${timedOutExecutions.length} timed-out executions`)

    const processed = []
    const failed = []

    for (const waiting of timedOutExecutions) {
      try {
        const timeoutAction = waiting.event_config?.timeoutAction || 'fail'

        logger.info(`[Timeout Checker] Processing timeout for execution ${waiting.execution_id}`, {
          timeoutAction
        })

        // Mark waiting execution as timed out
        await supabase
          .from('waiting_executions')
          .update({
            status: 'timed_out',
            resumed_at: new Date().toISOString()
          })
          .eq('id', waiting.id)

        if (timeoutAction === 'fail') {
          // Mark execution as failed
          await supabase
            .from('workflow_executions')
            .update({
              status: 'failed',
              completed_at: new Date().toISOString(),
              error: `Timed out waiting for event (${waiting.event_type})`
            })
            .eq('id', waiting.execution_id)

          processed.push({
            executionId: waiting.execution_id,
            action: 'failed'
          })
        } else if (timeoutAction === 'continue' || timeoutAction === 'skip') {
          // For 'continue' or 'skip', we would need to resume the workflow
          // For now, just mark as completed (implement resume logic similar to events API if needed)
          await supabase
            .from('workflow_executions')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString()
            })
            .eq('id', waiting.execution_id)

          processed.push({
            executionId: waiting.execution_id,
            action: timeoutAction
          })
        }

      } catch (error: any) {
        logger.error(`[Timeout Checker] Error processing timeout for execution ${waiting.execution_id}`, {
          error: error.message
        })
        failed.push({
          executionId: waiting.execution_id,
          error: error.message
        })
      }
    }

    logger.info('[Timeout Checker] Timeout check complete', {
      processed: processed.length,
      failed: failed.length
    })

    return NextResponse.json({
      success: true,
      message: `Processed ${processed.length} timed-out executions`,
      processed: processed.length,
      failed: failed.length,
      details: {
        processed,
        failed
      }
    })

  } catch (error: any) {
    logger.error('[Timeout Checker] Error checking timeouts', { error: error.message, stack: error.stack })
    return NextResponse.json(
      { error: error.message || 'Failed to check timeouts' },
      { status: 500 }
    )
  }
}
