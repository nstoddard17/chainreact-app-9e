/**
 * Entitlement service — canonical CRUD for user_entitlements.
 *
 * Transaction ownership:
 *   - Webhook handlers own the DB transaction and pass a supabase client in.
 *   - This module does NOT open its own transactions.
 *   - For standalone use (cron, safety-net), callers manage their own scope.
 *
 * Writer ownership:
 *   - Stripe sync    → syncFromStripe(), uses apply_stripe_period() SQL function
 *   - Free/grace     → transitionToFree(), uses compute_next_period() SQL function
 *   - Deduction      → handled by deduct_tasks_v2 RPC directly (not this module)
 */

import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'
import { getTierByCode } from '@/lib/entitlements/tier-cache'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── Types ───────────────────────────────────────────────────────────

export interface UserEntitlement {
  id: string
  user_id: string
  tier_id: string
  tier_code: string
  tier_name: string
  tasks_limit_snapshot: number
  tasks_used: number
  current_period_start: string
  current_period_end: string
  status: 'active' | 'grace_period' | 'expired'
  source: 'free' | 'stripe' | 'manual' | 'beta'
  last_stripe_event_at: string | null
  last_stripe_event_id: string | null
  updated_at: string
  feature_flags: Record<string, boolean | string | null>
}

export interface StripeSubscriptionData {
  subscriptionId: string
  customerId: string
  priceId: string
  tierId: string
  tierCode: string
  currentPeriodStart: Date
  currentPeriodEnd: Date
  status: string
  cancelAtPeriodEnd: boolean
}

export interface StripeEventMeta {
  eventId: string
  eventType: string
  eventCreated: Date
  customerId?: string
  subscriptionId?: string
}

// ─── Read ────────────────────────────────────────────────────────────

/**
 * Get a user's current entitlement, joined with tier data.
 * Returns null if no entitlement exists.
 */
export async function getEntitlement(userId: string): Promise<UserEntitlement | null> {
  const supabase = await createSupabaseServiceClient()
  // Note: user_entitlements is not yet in generated types (pre-migration push).
  // Using .from() with runtime table name; Supabase handles it at runtime.
  const { data, error } = await (supabase as any)
    .from('user_entitlements')
    .select('*, plans!inner(code, name, feature_flags)')
    .eq('user_id', userId)
    .single()

  if (error || !data) {
    if (error?.code !== 'PGRST116') { // PGRST116 = no rows
      logger.error('[entitlement-service] Failed to fetch entitlement', { userId, error: error?.message })
    }
    return null
  }

  const plan = data.plans as { code: string; name: string; feature_flags: Record<string, boolean | string | null> }
  return {
    id: data.id,
    user_id: data.user_id,
    tier_id: data.tier_id,
    tier_code: plan.code,
    tier_name: plan.name,
    tasks_limit_snapshot: data.tasks_limit_snapshot,
    tasks_used: data.tasks_used,
    current_period_start: data.current_period_start,
    current_period_end: data.current_period_end,
    status: data.status,
    source: data.source,
    last_stripe_event_at: data.last_stripe_event_at,
    last_stripe_event_id: data.last_stripe_event_id,
    updated_at: data.updated_at,
    feature_flags: plan.feature_flags || {},
  }
}

// ─── Stripe Sync Hardening ───────────────────────────────────────────

/**
 * Check if a Stripe event has already been processed (idempotency).
 * Returns true if the event should be SKIPPED.
 */
export async function isEventProcessed(
  supabase: SupabaseClient,
  eventId: string
): Promise<boolean> {
  const { data } = await (supabase as any)
    .from('stripe_processed_events')
    .select('event_id')
    .eq('event_id', eventId)
    .single()

  return !!data
}

/**
 * Mark a Stripe event as processed.
 */
export async function markEventProcessed(
  supabase: SupabaseClient,
  meta: StripeEventMeta
): Promise<void> {
  const { error } = await (supabase as any)
    .from('stripe_processed_events')
    .insert({
      event_id: meta.eventId,
      event_type: meta.eventType,
      event_created: meta.eventCreated.toISOString(),
      stripe_customer_id: meta.customerId ?? null,
      stripe_subscription_id: meta.subscriptionId ?? null,
    })

  if (error) {
    logger.warn('[entitlement-service] Failed to mark event processed', { eventId: meta.eventId, error: error.message })
  }
}

/**
 * Check if an event is stale relative to the user's last applied Stripe event.
 * Returns true if the event should be SKIPPED.
 */
export function isStaleEvent(
  entitlement: { last_stripe_event_at: string | null },
  eventCreated: Date
): boolean {
  if (!entitlement.last_stripe_event_at) return false
  return eventCreated < new Date(entitlement.last_stripe_event_at)
}

// ─── Stripe Sync ─────────────────────────────────────────────────────

/**
 * Sync entitlement from a Stripe subscription event.
 * Called within the webhook handler's transaction.
 *
 * Uses apply_stripe_period() SQL function for paid-tier period writes.
 */
export async function syncFromStripe(
  supabase: SupabaseClient,
  userId: string,
  sub: StripeSubscriptionData,
  meta: StripeEventMeta,
  resetTasks: boolean = false
): Promise<void> {
  // Call the SQL function for period + tier update
  const { error: rpcError } = await (supabase as any).rpc('apply_stripe_period', {
    p_user_id: userId,
    p_stripe_period_start: sub.currentPeriodStart.toISOString(),
    p_stripe_period_end: sub.currentPeriodEnd.toISOString(),
    p_tier_id: sub.tierId,
    p_reset_tasks: resetTasks,
  })

  if (rpcError) {
    logger.error('[entitlement-service] apply_stripe_period failed', {
      userId,
      error: rpcError.message,
    })
    throw rpcError
  }

  // Update Stripe event freshness markers
  const { error: updateError } = await (supabase as any)
    .from('user_entitlements')
    .update({
      last_stripe_event_at: meta.eventCreated.toISOString(),
      last_stripe_event_id: meta.eventId,
    })
    .eq('user_id', userId)

  if (updateError) {
    logger.error('[entitlement-service] Failed to update Stripe event markers', {
      userId,
      error: updateError.message,
    })
  }
}

/**
 * Set entitlement to grace_period on subscription cancellation.
 * Only valid if current status is 'active' AND source is 'stripe'.
 */
export async function setGracePeriod(
  supabase: SupabaseClient,
  userId: string,
  meta: StripeEventMeta
): Promise<boolean> {
  const { data: ent, error: fetchError } = await (supabase as any)
    .from('user_entitlements')
    .select('status, source')
    .eq('user_id', userId)
    .single()

  if (fetchError || !ent) {
    logger.error('[entitlement-service] Cannot set grace_period: no entitlement', { userId })
    return false
  }

  // State transition guard
  if (ent.status !== 'active' || ent.source !== 'stripe') {
    logger.warn('[entitlement-service] Invalid grace_period transition', {
      userId,
      currentStatus: ent.status,
      currentSource: ent.source,
    })
    return false
  }

  const { error } = await (supabase as any)
    .from('user_entitlements')
    .update({
      status: 'grace_period',
      last_stripe_event_at: meta.eventCreated.toISOString(),
      last_stripe_event_id: meta.eventId,
    })
    .eq('user_id', userId)

  if (error) {
    logger.error('[entitlement-service] Failed to set grace_period', { userId, error: error.message })
    return false
  }

  return true
}

// ─── Free Tier Transition ────────────────────────────────────────────

/**
 * Transition a user from grace_period to the free tier.
 * Canonical owner of all grace->free field updates.
 * Uses compute_next_period() for the new rolling period.
 */
export async function transitionToFree(userId: string): Promise<boolean> {
  const supabase = await createSupabaseServiceClient()

  // Get free tier ID and limit
  const freeTier = await getTierByCode('free')
  if (!freeTier) {
    logger.error('[entitlement-service] Free tier not found in plans table')
    return false
  }

  // Get the user's current entitlement to compute next period
  const { data: ent, error: fetchError } = await (supabase as any)
    .from('user_entitlements')
    .select('current_period_start, current_period_end, status')
    .eq('user_id', userId)
    .single()

  if (fetchError || !ent) {
    logger.error('[entitlement-service] Cannot transition to free: no entitlement', { userId })
    return false
  }

  if (ent.status !== 'grace_period') {
    logger.warn('[entitlement-service] Cannot transition to free: not in grace_period', {
      userId,
      currentStatus: ent.status,
    })
    return false
  }

  // Compute new free period using SQL function
  const { data: nextPeriod, error: periodError } = await (supabase as any)
    .rpc('compute_next_period', {
      p_current_period_start: ent.current_period_start,
      p_current_period_end: ent.current_period_end,
    })

  if (periodError || !nextPeriod || nextPeriod.length === 0) {
    logger.error('[entitlement-service] compute_next_period failed', { userId, error: periodError?.message })
    return false
  }

  const period = nextPeriod[0]

  const { error: updateError } = await (supabase as any)
    .from('user_entitlements')
    .update({
      tier_id: freeTier.id,
      tasks_used: 0,
      tasks_limit_snapshot: freeTier.tasks_per_month,
      current_period_start: period.next_period_start,
      current_period_end: period.next_period_end,
      status: 'active',
      source: 'free',
      last_stripe_event_at: null,
      last_stripe_event_id: null,
    })
    .eq('user_id', userId)

  if (updateError) {
    logger.error('[entitlement-service] Failed to transition to free', { userId, error: updateError.message })
    return false
  }

  logger.debug('[entitlement-service] Transitioned to free tier', { userId })
  return true
}

// ─── Safety Net ──────────────────────────────────────────────────────

/**
 * Ensure a user has an entitlement row. Creates a free-tier row if missing.
 * Safety net for pre-existing users who may not have been backfilled.
 */
export async function ensureEntitlement(userId: string): Promise<void> {
  const supabase = await createSupabaseServiceClient()

  const { data } = await (supabase as any)
    .from('user_entitlements')
    .select('id')
    .eq('user_id', userId)
    .single()

  if (data) return // Already exists

  const freeTier = await getTierByCode('free')
  if (!freeTier) {
    logger.error('[entitlement-service] Free tier not found, cannot create entitlement')
    return
  }

  const now = new Date()
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

  const { error } = await (supabase as any)
    .from('user_entitlements')
    .insert({
      user_id: userId,
      tier_id: freeTier.id,
      tasks_limit_snapshot: freeTier.tasks_per_month,
      tasks_used: 0,
      current_period_start: now.toISOString(),
      current_period_end: thirtyDaysLater.toISOString(),
      status: 'active',
      source: 'free',
    })

  if (error) {
    // ON CONFLICT DO NOTHING in case of race
    if (!error.message.includes('duplicate key')) {
      logger.error('[entitlement-service] Failed to create entitlement', { userId, error: error.message })
    }
  }
}
