/**
 * Health Transition Engine
 *
 * The single decision-maker for integration health notifications.
 * All notification decisions flow through this engine — no cron job or callback
 * should write notification metadata directly.
 *
 * Core model: healthy → warning → action_required → disconnected → paused
 * Each transition notifies exactly once. Unchanged state never re-alerts.
 *
 * Internally split into: classify → persist → emit
 */

import { logger } from '@/lib/utils/logger'
import { type ClassifiedError, calculateUserActionDeadline } from './errorClassificationService'
import {
  deliverWarningNotification,
  deliverDisconnectionNotification,
  deliverRateLimitNotification,
  deliverRecoveredNotification,
} from './notificationService'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HealthState =
  | 'healthy'
  | 'warning'
  | 'action_required'
  | 'disconnected'
  | 'paused'

export type NotificationMilestone =
  | 'none'
  | 'warning'
  | 'action_required_initial'
  | 'reminder_day_2'
  | 'urgent_day_5'
  | 'paused_day_7'
  | 'recovered'

export type SignalSource = 'token_refresh' | 'proactive_health_check' | 'reconnect'

export interface ObservedSignal {
  /** The classified error from errorClassificationService, or null for healthy/recovery */
  classifiedError: ClassifiedError | null
  /** Where this signal originated */
  source: SignalSource
  /** Whether this is a recovery signal (successful reconnect or healthy check) */
  isRecovery: boolean
}

export interface Integration {
  id: string
  user_id: string
  provider: string
  health_check_status: HealthState | null
  last_notification_milestone: NotificationMilestone | null
  requires_user_action: boolean
  user_action_type: string | null
  user_action_deadline: string | null
}

export interface TransitionResult {
  stateChanged: boolean
  newState: HealthState
  previousState: HealthState | null
  notified: boolean
  milestone: NotificationMilestone
}

// ---------------------------------------------------------------------------
// 1. Classify: observed signal → target health state
// ---------------------------------------------------------------------------

function classifySignalToState(signal: ObservedSignal): HealthState {
  if (signal.isRecovery) {
    return 'healthy'
  }

  const error = signal.classifiedError
  if (!error) {
    return 'healthy'
  }

  // Transient/recoverable errors → warning (system will auto-retry)
  if (error.isRecoverable) {
    return 'warning'
  }

  // Non-recoverable errors requiring user action
  if (error.requiresUserAction) {
    return 'action_required'
  }

  // Fallback for non-recoverable errors without clear user action
  return 'disconnected'
}

function milestoneForTransition(
  previousState: HealthState | null,
  newState: HealthState
): NotificationMilestone | null {
  if (newState === 'healthy') {
    // Only emit 'recovered' if transitioning FROM an unhealthy state
    if (previousState && previousState !== 'healthy') {
      return 'recovered'
    }
    return null // Already healthy or first observation → no milestone change
  }

  if (newState === 'warning') return 'warning'
  if (newState === 'action_required') return 'action_required_initial'
  if (newState === 'disconnected') return 'action_required_initial'
  if (newState === 'paused') return 'paused_day_7'

  return null
}

// ---------------------------------------------------------------------------
// 2. Persist: atomic state transition
// ---------------------------------------------------------------------------

async function persistTransition(
  supabase: any,
  integrationId: string,
  previousState: HealthState | null,
  newState: HealthState,
  milestone: NotificationMilestone,
  signal: ObservedSignal
): Promise<boolean> {
  const now = new Date().toISOString()

  const updateData: Record<string, any> = {
    health_check_status: newState,
    last_notification_milestone: milestone,
    last_notified_at: now,
  }

  // On recovery, clear action fields
  if (newState === 'healthy') {
    updateData.requires_user_action = false
    updateData.user_action_type = null
    updateData.user_action_deadline = null
    updateData.last_error_code = null
    updateData.last_error_details = null
  }

  // On action_required or disconnected, populate user action fields
  if (
    (newState === 'action_required' || newState === 'disconnected') &&
    signal.classifiedError
  ) {
    const deadline = calculateUserActionDeadline(signal.classifiedError)
    updateData.requires_user_action = true
    updateData.user_action_type = signal.classifiedError.userActionType || 'reconnect'
    updateData.user_action_deadline = deadline.toISOString()
    updateData.last_error_code = signal.classifiedError.code
    updateData.last_error_details = signal.classifiedError.details || null
  }

  // Atomic update: only update if health_check_status still matches what we read.
  // This provides idempotency — if another process already transitioned, this is a no-op.
  let query = supabase
    .from('integrations')
    .update(updateData)
    .eq('id', integrationId)

  if (previousState === null) {
    query = query.is('health_check_status', null)
  } else {
    query = query.eq('health_check_status', previousState)
  }

  const { error, count } = await query

  if (error) {
    logger.error('[HealthTransition] Failed to persist transition:', {
      integrationId,
      previousState,
      newState,
      error,
    })
    return false
  }

  // If count is available and 0, another process already transitioned this integration
  if (count !== undefined && count !== null && count === 0) {
    logger.info('[HealthTransition] State already transitioned by another process:', {
      integrationId,
      previousState,
      newState,
    })
    return false
  }

  return true
}

// ---------------------------------------------------------------------------
// 3. Emit: send notification after successful persist
// ---------------------------------------------------------------------------

async function emitNotification(
  supabase: any,
  integration: Integration,
  newState: HealthState,
  milestone: NotificationMilestone,
  signal: ObservedSignal
): Promise<boolean> {
  try {
    switch (milestone) {
      case 'warning':
        await deliverWarningNotification(supabase, {
          userId: integration.user_id,
          provider: integration.provider,
          integrationId: integration.id,
          errorMessage: signal.classifiedError?.message,
        })
        return true

      case 'action_required_initial':
        await deliverDisconnectionNotification(supabase, {
          userId: integration.user_id,
          provider: integration.provider,
          integrationId: integration.id,
          errorMessage: signal.classifiedError?.message,
          sendEmail: true,
        })
        return true

      case 'paused_day_7':
        await deliverDisconnectionNotification(supabase, {
          userId: integration.user_id,
          provider: integration.provider,
          integrationId: integration.id,
          errorMessage: 'Workflows paused due to unresolved integration issue.',
          sendEmail: true,
        })
        return true

      case 'recovered':
        await deliverRecoveredNotification(supabase, {
          userId: integration.user_id,
          provider: integration.provider,
          integrationId: integration.id,
        })
        return true

      default:
        return false
    }
  } catch (error) {
    logger.error('[HealthTransition] Failed to emit notification:', {
      integrationId: integration.id,
      milestone,
      error,
    })
    return false
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * The single entry point for all health state transitions.
 *
 * Called by both token-refresh and proactive-health-check cron jobs.
 * Also called by OAuth reconnect callbacks via recovery signal.
 *
 * - Classifies the observed signal into a target health state
 * - Compares against current persisted state
 * - If state changed, persists atomically and emits notification
 * - If unchanged, returns early (no duplicate notification)
 */
export async function computeTransitionAndNotify(
  supabase: any,
  integration: Integration,
  signal: ObservedSignal
): Promise<TransitionResult> {
  const previousState = integration.health_check_status
  const previousMilestone = integration.last_notification_milestone || 'none'
  const targetState = classifySignalToState(signal)

  // ---------------------------------------------------------------------------
  // First-observation rule:
  // - NULL (unobserved) + proactive check → establish baseline, no notify
  // - NULL (unobserved) + live failure → notify immediately
  // ---------------------------------------------------------------------------
  if (previousState === null && signal.source === 'proactive_health_check') {
    // Establish baseline silently — write state but do not notify
    const now = new Date().toISOString()
    await supabase
      .from('integrations')
      .update({
        health_check_status: targetState,
        // Do NOT update last_notification_milestone or last_notified_at
      })
      .eq('id', integration.id)
      .is('health_check_status', null)

    logger.info('[HealthTransition] Baseline established silently:', {
      integrationId: integration.id,
      provider: integration.provider,
      baselineState: targetState,
    })

    return {
      stateChanged: true,
      newState: targetState,
      previousState: null,
      notified: false,
      milestone: previousMilestone as NotificationMilestone,
    }
  }

  // ---------------------------------------------------------------------------
  // No-op: state unchanged
  // ---------------------------------------------------------------------------
  if (targetState === previousState) {
    // State didn't change — update last_health_check_at if needed but no notification
    return {
      stateChanged: false,
      newState: targetState,
      previousState,
      notified: false,
      milestone: previousMilestone as NotificationMilestone,
    }
  }

  // ---------------------------------------------------------------------------
  // State changed — determine milestone and persist
  // ---------------------------------------------------------------------------
  const newMilestone = milestoneForTransition(previousState, targetState)

  if (!newMilestone) {
    // State changed but no notification warranted (e.g. healthy → healthy after null baseline)
    await supabase
      .from('integrations')
      .update({ health_check_status: targetState })
      .eq('id', integration.id)

    return {
      stateChanged: true,
      newState: targetState,
      previousState,
      notified: false,
      milestone: previousMilestone as NotificationMilestone,
    }
  }

  // Persist transition atomically
  const persisted = await persistTransition(
    supabase,
    integration.id,
    previousState,
    targetState,
    newMilestone,
    signal
  )

  if (!persisted) {
    // Another process already handled this transition
    return {
      stateChanged: false,
      newState: targetState,
      previousState,
      notified: false,
      milestone: previousMilestone as NotificationMilestone,
    }
  }

  // Emit notification after successful state write
  const notified = await emitNotification(
    supabase,
    integration,
    targetState,
    newMilestone,
    signal
  )

  logger.info('[HealthTransition] Transition complete:', {
    integrationId: integration.id,
    provider: integration.provider,
    previousState,
    newState: targetState,
    milestone: newMilestone,
    notified,
  })

  return {
    stateChanged: true,
    newState: targetState,
    previousState,
    notified,
    milestone: newMilestone,
  }
}

/**
 * Build an ObservedSignal for a successful refresh/health check (no error).
 */
export function buildHealthySignal(source: SignalSource): ObservedSignal {
  return {
    classifiedError: null,
    source,
    isRecovery: false,
  }
}

/**
 * Build an ObservedSignal for a failure.
 */
export function buildFailureSignal(
  classifiedError: ClassifiedError,
  source: SignalSource
): ObservedSignal {
  return {
    classifiedError,
    source,
    isRecovery: false,
  }
}

/**
 * Build an ObservedSignal for an explicit recovery (OAuth reconnect).
 */
export function buildRecoverySignal(): ObservedSignal {
  return {
    classifiedError: null,
    source: 'reconnect',
    isRecovery: true,
  }
}
