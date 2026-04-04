/**
 * Core polling logic, extracted from app/api/cron/poll-triggers/route.ts
 * for use by the consolidated cron endpoint.
 */

import { createClient } from '@supabase/supabase-js'
import { findPollingHandler } from '@/lib/triggers/polling'
import { logger } from '@/lib/utils/logger'

// Import triggers index to ensure all polling handlers are registered
import '@/lib/triggers'

const DEFAULT_POLL_INTERVAL_MS = 15 * 60 * 1000

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export interface PollResult {
  success: boolean
  processed: number
  skipped: number
  errors: number
}

export async function runPollingCore(): Promise<PollResult> {
  const supabase = getSupabase()
  const roleCache = new Map<string, string>()

  const { data: triggers, error } = await supabase
    .from('trigger_resources')
    .select('id, user_id, workflow_id, trigger_type, config, status')
    .eq('status', 'active')
    .contains('config', { pollingEnabled: true })

  if (error) {
    logger.error('[Poll] Failed to fetch pollable triggers:', error)
    throw new Error('Failed to fetch pollable triggers')
  }

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
      skipped += 1
      continue
    }

    const config = trigger.config || {} as any
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
      roleCache.set(trigger.user_id, userRole!)
    }

    const pollInterval = handler.getIntervalMs(userRole!) || DEFAULT_POLL_INTERVAL_MS
    if (now - lastPollAt < pollInterval) {
      skipped += 1
      continue
    }

    try {
      await handler.poll({ trigger, userRole: userRole!, now })
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

  logger.info('[Poll] Trigger poll cron completed', { processed, skipped, errors })
  return { success: true, processed, skipped, errors }
}
