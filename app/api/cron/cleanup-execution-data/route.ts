/**
 * Execution Data Retention Cleanup Cron
 *
 * Runs daily at 3 AM UTC. Deletes old execution data based on the
 * retention_class stamped at execution creation time.
 *
 * Retention policy:
 *   free: 7 days
 *   pro:  30 days
 *   team: 90 days
 *
 * Deletes in FK order to avoid constraint violations:
 *   execution_steps → execution_progress → loop_executions → workflow_execution_sessions
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabaseClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/utils/logger'
import { RETENTION_DAYS, type RetentionClass } from '@/lib/cron/retention-utils'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const BATCH_SIZE = 1000

export async function GET(request: NextRequest) {
  const cronHeader = request.headers.get('x-vercel-cron')
  const authHeader = request.headers.get('authorization')
  const expectedSecret = process.env.CRON_SECRET

  if (!expectedSecret) {
    return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
  }

  const isVercelCron = cronHeader === '1'
  const providedSecret = authHeader?.replace('Bearer ', '')

  if (!isVercelCron && (!providedSecret || providedSecret !== expectedSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()

  try {
    const supabase = getAdminSupabaseClient()
    if (!supabase) {
      throw new Error('Failed to create database client')
    }

    const now = new Date()
    const stats: Record<string, { sessions: number; progress: number; loops: number }> = {}

    for (const [retentionClass, days] of Object.entries(RETENTION_DAYS)) {
      const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString()

      logger.info(`[RetentionCleanup] Processing ${retentionClass}: cutoff=${cutoff} (${days} days)`)

      // Find expired session IDs
      const { data: expiredSessions, error: fetchError } = await supabase
        .from('workflow_execution_sessions')
        .select('id')
        .eq('retention_class', retentionClass)
        .lt('started_at', cutoff)
        .limit(BATCH_SIZE)

      if (fetchError) {
        logger.error(`[RetentionCleanup] Error fetching ${retentionClass} sessions:`, fetchError)
        stats[retentionClass] = { sessions: 0, progress: 0, loops: 0 }
        continue
      }

      if (!expiredSessions || expiredSessions.length === 0) {
        stats[retentionClass] = { sessions: 0, progress: 0, loops: 0 }
        continue
      }

      const sessionIds = expiredSessions.map(s => s.id)

      // Delete in FK order
      // 1. execution_progress (references session via workflow_id + user_id, but
      //    we delete by matching session IDs joined through workflow_execution_sessions)
      const { count: progressCount } = await supabase
        .from('execution_progress')
        .delete({ count: 'exact' })
        .in('id', sessionIds)

      // 2. loop_executions
      const { count: loopCount } = await supabase
        .from('loop_executions')
        .delete({ count: 'exact' })
        .in('id', sessionIds)

      // 3. workflow_execution_sessions
      const { count: sessionCount, error: deleteError } = await supabase
        .from('workflow_execution_sessions')
        .delete({ count: 'exact' })
        .in('id', sessionIds)

      if (deleteError) {
        logger.error(`[RetentionCleanup] Error deleting ${retentionClass} sessions:`, deleteError)
      }

      stats[retentionClass] = {
        sessions: sessionCount || 0,
        progress: progressCount || 0,
        loops: loopCount || 0,
      }

      logger.info(`[RetentionCleanup] ${retentionClass}: deleted ${sessionCount || 0} sessions, ${progressCount || 0} progress, ${loopCount || 0} loops`)
    }

    const durationMs = Date.now() - startTime

    logger.info('[RetentionCleanup] Completed', { stats, durationMs })

    return NextResponse.json({
      success: true,
      stats,
      durationMs,
      timestamp: now.toISOString(),
    })
  } catch (error: any) {
    logger.error('[RetentionCleanup] Job failed:', error)
    return NextResponse.json(
      { success: false, error: error.message, durationMs: Date.now() - startTime },
      { status: 500 }
    )
  }
}
