import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { findPollingHandler } from '@/lib/triggers/polling'
import { logger } from '@/lib/utils/logger'

// Import triggers index to ensure all polling handlers are registered
import '@/lib/triggers'

const DEFAULT_POLL_INTERVAL_MS = 15 * 60 * 1000

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

async function runPolling(authHeader: string | null) {
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return errorResponse('Unauthorized', 401)
  }

  const supabase = getSupabase()
  logger.info('[Poll] Trigger poll cron started')
  const roleCache = new Map<string, string>()

  // Use contains() to properly match boolean pollingEnabled in JSONB config
  const { data: triggers, error } = await supabase
    .from('trigger_resources')
    .select('id, user_id, workflow_id, trigger_type, config, status')
    .eq('status', 'active')
    .contains('config', { pollingEnabled: true })

  if (error) {
    logger.error('[Poll] Failed to fetch pollable triggers:', error)
    return errorResponse('Failed to fetch pollable triggers', 500)
  }

  // Debug: Log what triggers were found
  logger.info('[Poll] Found pollable triggers:', {
    count: triggers?.length || 0,
    triggerTypes: triggers?.map(t => t.trigger_type) || []
  })

  const now = Date.now()
  let processed = 0
  let skipped = 0
  let errors = 0

  for (const trigger of triggers || []) {
    const handler = findPollingHandler(trigger)
    if (!handler) {
      logger.debug('[Poll] No handler found for trigger:', {
        triggerId: trigger.id,
        triggerType: trigger.trigger_type
      })
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
      logger.debug('[Poll] Skipping - interval not elapsed:', {
        triggerId: trigger.id,
        triggerType: trigger.trigger_type,
        lastPollAt: lastPollAt ? new Date(lastPollAt).toISOString() : 'never',
        nextPollAt: new Date(lastPollAt + pollInterval).toISOString(),
        intervalMs: pollInterval
      })
      skipped += 1
      continue
    }

    try {
      logger.info('[Poll] Executing poll handler:', {
        triggerId: trigger.id,
        triggerType: trigger.trigger_type,
        handlerId: handler.id,
        userRole
      })
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

  logger.info('[Poll] Trigger poll cron completed', {
    processed,
    skipped,
    errors
  })

  return jsonResponse({
    success: true,
    processed,
    skipped,
    errors,
    timestamp: new Date().toISOString()
  })
}

// Vercel crons use GET requests
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    return await runPolling(authHeader)
  } catch (error: any) {
    logger.error('[Poll] Error:', error)
    return errorResponse(error.message || 'Poll failed', 500)
  }
}

// Keep POST for manual/external triggers
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    return await runPolling(authHeader)
  } catch (error: any) {
    logger.error('[Poll] Error:', error)
    return errorResponse(error.message || 'Poll failed', 500)
  }
}
