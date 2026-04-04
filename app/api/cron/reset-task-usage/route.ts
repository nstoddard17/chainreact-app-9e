import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { logger } from "@/lib/utils/logger"
import { transitionToFree } from "@/lib/entitlements/entitlement-service"

/**
 * Billing period task usage reset — safety net for ALL users.
 *
 * Primary reset mechanisms:
 * - RPC inline auto-reset: resets expired periods during deduction calls
 * - Stripe webhook: resets paid users on invoice.payment_succeeded
 *
 * This cron is a SAFETY NET that catches users whose period expired but
 * weren't reset by the primary mechanisms (e.g., users who haven't executed
 * a workflow since their period expired, or webhook delivery failures).
 *
 * Runs daily at midnight UTC.
 *
 * Free/beta users: Reset tasks_used, advance billing period (rolling 30-day).
 * Paid users (active sub): Reset tasks_used, do NOT advance period (webhook handles that).
 * Paid users (non-active sub): Do NOT reset. Emit reconciliation alert.
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get("authorization")
  const cronSecret = process.env.CRON_SECRET
  const providedSecret = authHeader?.replace("Bearer ", "") ||
                         request.nextUrl.searchParams.get("secret")

  if (!cronSecret || providedSecret !== cronSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  )

  logger.info("[Cron] Starting task usage reset check (all users)...")

  try {
    const now = new Date()

    // Find ALL users with expired billing period and tasks_used > 0
    const { data: usersToReset, error: fetchError } = await supabase
      .from('user_profiles')
      .select('id, plan, tasks_used, tasks_limit, billing_period_start, billing_period_end')
      .gt('tasks_used', 0)
      .lt('billing_period_end', now.toISOString())

    if (fetchError) {
      logger.error('[Cron] Failed to fetch users for task reset:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    if (!usersToReset || usersToReset.length === 0) {
      logger.info('[Cron] No users need task reset')
      return NextResponse.json({ processed: 0 })
    }

    let freeResetCount = 0
    let paidResetCount = 0
    let paidSkippedCount = 0
    let errorCount = 0

    for (const user of usersToReset) {
      const isFreeOrBeta = user.plan === 'free' || user.plan === 'beta'

      if (isFreeOrBeta) {
        // Free/beta users: reset and advance period
        const newPeriodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

        const { data: updated, error: resetError } = await supabase
          .from('user_profiles')
          .update({
            tasks_used: 0,
            billing_period_start: now.toISOString(),
            billing_period_end: newPeriodEnd.toISOString()
          })
          .eq('id', user.id)
          .gt('tasks_used', 0) // Atomic guard: only reset if still > 0
          .select('id')

        if (resetError) {
          errorCount++
          logger.error('[Cron] Failed to reset tasks for free user', { userId: user.id, error: resetError.message })
          continue
        }

        // Only insert billing event if the update actually affected a row
        if (updated && updated.length > 0) {
          freeResetCount++
          // Insert period_reset billing event
          await supabase.from('task_billing_events').insert({
            user_id: user.id,
            event_type: 'period_reset',
            amount: 0,
            balance_after: 0,
            tasks_limit_snapshot: user.tasks_limit,
            period_start_snapshot: user.billing_period_start,
            period_end_snapshot: user.billing_period_end,
            source: 'cron_reset',
            metadata: { previous_tasks_used: user.tasks_used }
          }).then(({ error }) => {
            if (error) logger.warn('[Cron] Failed to log reset event (non-blocking)', { userId: user.id, error: error.message })
          })
        }
      } else {
        // Paid users: check subscription status before resetting
        const { data: subscription } = await supabase
          .from('subscriptions')
          .select('status')
          .eq('user_id', user.id)
          .in('status', ['active', 'trialing'])
          .order('current_period_end', { ascending: false, nullsFirst: false })
          .limit(1)
          .single()

        if (subscription) {
          // Active subscription — safe to reset tasks (webhook should have done this)
          const { data: updated, error: resetError } = await supabase
            .from('user_profiles')
            .update({ tasks_used: 0 })
            .eq('id', user.id)
            .gt('tasks_used', 0) // Atomic guard
            .select('id')

          if (resetError) {
            errorCount++
            logger.error('[Cron] Failed to reset tasks for paid user', { userId: user.id, error: resetError.message })
            continue
          }

          if (updated && updated.length > 0) {
            paidResetCount++

            // Insert billing event
            await supabase.from('task_billing_events').insert({
              user_id: user.id,
              event_type: 'period_reset',
              amount: 0,
              balance_after: 0,
              tasks_limit_snapshot: user.tasks_limit,
              period_start_snapshot: user.billing_period_start,
              period_end_snapshot: user.billing_period_end,
              source: 'cron_reset',
              metadata: {
                previous_tasks_used: user.tasks_used,
                subscription_status: subscription.status,
                reset_reason: 'expired_period_active_subscription'
              }
            }).then(({ error }) => {
              if (error) logger.warn('[Cron] Failed to log reset event (non-blocking)', { userId: user.id, error: error.message })
            })

            logger.warn('[Cron] ALERT: Paid user period expired but webhook did not reset. Subscription active. Resetting as safety net.', {
              userId: user.id,
              plan: user.plan,
              periodEnd: user.billing_period_end,
              subscriptionStatus: subscription.status
            })
          }
        } else {
          // Non-active subscription — do NOT reset, emit reconciliation alert
          paidSkippedCount++
          logger.error('[Cron] ALERT: Paid user period expired with non-active subscription status. Requires manual reconciliation.', {
            userId: user.id,
            plan: user.plan,
            periodEnd: user.billing_period_end,
            tasksUsed: user.tasks_used
          })
        }
      }
    }

    logger.info('[Cron] Task reset completed', {
      totalFound: usersToReset.length,
      freeResetCount,
      paidResetCount,
      paidSkippedCount,
      errorCount
    })

    // Phase 1 parallel path: also process user_entitlements
    let entitlementStats = { freeAdvanced: 0, graceTransitioned: 0, errors: 0 }
    if (process.env.ENTITLEMENTS_V2 === 'true') {
      entitlementStats = await resetEntitlementPeriods(supabase)
    }

    return NextResponse.json({
      processed: freeResetCount + paidResetCount,
      paidSkipped: paidSkippedCount,
      errors: errorCount,
      entitlements: entitlementStats,
    })
  } catch (error: any) {
    logger.error('[Cron] Task reset cron failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * Phase 1 parallel path: process user_entitlements table.
 * Cron NEVER touches source='stripe' active rows.
 * Only handles:
 *   1. Free/beta/manual users with expired periods -> advance via compute_next_period
 *   2. Grace period users with expired periods -> transition to free tier
 */
async function resetEntitlementPeriods(supabase: any) {
  const stats = { freeAdvanced: 0, graceTransitioned: 0, errors: 0 }
  const now = new Date().toISOString()

  try {
    // 1. Advance expired periods for free/beta/manual users
    const { data: expiredFree, error: freeErr } = await supabase
      .from('user_entitlements')
      .select('user_id, current_period_start, current_period_end, tier_id')
      .eq('status', 'active')
      .in('source', ['free', 'beta', 'manual'])
      .lt('current_period_end', now)

    if (freeErr) {
      logger.error('[Cron Entitlements] Failed to fetch expired free users', { error: freeErr.message })
      stats.errors++
    } else if (expiredFree && expiredFree.length > 0) {
      for (const ent of expiredFree) {
        try {
          // Use compute_next_period SQL function
          const { data: nextPeriod } = await supabase.rpc('compute_next_period', {
            p_current_period_start: ent.current_period_start,
            p_current_period_end: ent.current_period_end,
          })

          if (nextPeriod && nextPeriod.length > 0) {
            const period = nextPeriod[0]

            // Get fresh limit from tier
            const { data: tierData } = await supabase
              .from('plans')
              .select('tasks_per_month')
              .eq('id', ent.tier_id)
              .single()

            await supabase
              .from('user_entitlements')
              .update({
                tasks_used: 0,
                tasks_limit_snapshot: tierData?.tasks_per_month ?? 100,
                current_period_start: period.next_period_start,
                current_period_end: period.next_period_end,
              })
              .eq('user_id', ent.user_id)

            stats.freeAdvanced++
          }
        } catch (err: any) {
          stats.errors++
          logger.error('[Cron Entitlements] Failed to advance free user period', {
            userId: ent.user_id,
            error: err.message,
          })
        }
      }
    }

    // 2. Transition grace_period -> free for expired grace periods
    const { data: expiredGrace, error: graceErr } = await supabase
      .from('user_entitlements')
      .select('user_id')
      .eq('status', 'grace_period')
      .lt('current_period_end', now)

    if (graceErr) {
      logger.error('[Cron Entitlements] Failed to fetch expired grace users', { error: graceErr.message })
      stats.errors++
    } else if (expiredGrace && expiredGrace.length > 0) {
      for (const ent of expiredGrace) {
        try {
          const success = await transitionToFree(ent.user_id)
          if (success) {
            stats.graceTransitioned++
          } else {
            stats.errors++
          }
        } catch (err: any) {
          stats.errors++
          logger.error('[Cron Entitlements] Failed to transition grace user to free', {
            userId: ent.user_id,
            error: err.message,
          })
        }
      }
    }

    logger.info('[Cron Entitlements] Reset completed', stats)
  } catch (err: any) {
    logger.error('[Cron Entitlements] Unexpected error', { error: err.message })
    stats.errors++
  }

  return stats
}
