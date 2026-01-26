import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { findPollingHandler } from '@/lib/triggers/polling'
import { logger } from '@/lib/utils/logger'

const DEFAULT_POLL_INTERVAL_MS = 15 * 60 * 1000

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return errorResponse('Unauthorized', 401)
    }

    const supabase = getSupabase()
    const roleCache = new Map<string, string>()

    const { data: triggers, error } = await supabase
      .from('trigger_resources')
      .select('id, user_id, workflow_id, trigger_type, config, status')
      .eq('status', 'active')
      .eq('config->>pollingEnabled', 'true')

    if (error) {
      logger.error('[Poll] Failed to fetch pollable triggers:', error)
      return errorResponse('Failed to fetch pollable triggers', 500)
    }

    const now = Date.now()
    let processed = 0
    let skipped = 0
    let errors = 0

    for (const trigger of triggers || []) {
      const handler = findPollingHandler(trigger)
      if (!handler) {
        skipped += 1
        continue
      }

      const config = trigger.config || {}
      const lastPollAt = config.polling?.lastPolledAt
        ? new Date(config.polling.lastPolledAt).getTime()
        : 0

      let userRole = roleCache.get(trigger.user_id)
      if (!userRole) {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', trigger.user_id)
          .maybeSingle()
        userRole = profile?.role || 'free'
        roleCache.set(trigger.user_id, userRole)
      }

      const pollInterval = handler.getIntervalMs(userRole) || DEFAULT_POLL_INTERVAL_MS
      if (now - lastPollAt < pollInterval) {
        skipped += 1
        continue
      }

      try {
        await handler.poll({ trigger, userRole, now })
        processed += 1
      } catch (pollError) {
        errors += 1
        logger.warn('[Poll] Poll handler failed', {
          triggerId: trigger.id,
          handlerId: handler.id,
          error: pollError
        })
      }
    }

    return jsonResponse({
      success: true,
      processed,
      skipped,
      errors,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    logger.error('[Poll] Error:', error)
    return errorResponse(error.message || 'Poll failed', 500)
  }
}

export async function GET() {
  return jsonResponse({
    status: 'healthy',
    service: 'trigger-poll',
    timestamp: new Date().toISOString()
  })
}
