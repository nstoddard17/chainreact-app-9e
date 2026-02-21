import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { logger } from "@/lib/utils/logger"

/**
 * Monthly task usage reset for free users.
 *
 * Paid users get their tasks reset via Stripe's invoice.payment_succeeded webhook.
 * Free users have no Stripe subscription, so this cron handles their monthly reset.
 *
 * Runs daily at midnight UTC. Only resets users whose billing_period_start is 30+ days ago.
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

  logger.info("[Cron] Starting free user task usage reset check...")

  try {
    // Find free users whose billing period has expired (30+ days since billing_period_start)
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data: usersToReset, error: fetchError } = await supabase
      .from('user_profiles')
      .select('id, tasks_used, billing_period_start')
      .eq('plan', 'free')
      .gt('tasks_used', 0)
      .lt('billing_period_start', thirtyDaysAgo.toISOString())

    if (fetchError) {
      logger.error('[Cron] Failed to fetch users for task reset:', fetchError)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    if (!usersToReset || usersToReset.length === 0) {
      logger.info('[Cron] No free users need task reset')
      return NextResponse.json({ processed: 0 })
    }

    let resetCount = 0
    let errorCount = 0

    for (const user of usersToReset) {
      const { error: resetError } = await supabase
        .from('user_profiles')
        .update({
          tasks_used: 0,
          billing_period_start: new Date().toISOString()
        })
        .eq('id', user.id)

      if (resetError) {
        errorCount++
        logger.error('[Cron] Failed to reset tasks for user', { userId: user.id, error: resetError.message })
      } else {
        resetCount++
      }
    }

    logger.info('[Cron] Free user task reset completed', {
      resetCount,
      errorCount,
      totalFound: usersToReset.length
    })

    return NextResponse.json({ processed: resetCount, errors: errorCount })
  } catch (error: any) {
    logger.error('[Cron] Task reset cron failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
