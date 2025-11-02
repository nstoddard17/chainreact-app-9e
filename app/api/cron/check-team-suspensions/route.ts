import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"
import { logger } from "@/lib/utils/logger"

/**
 * Cron Job: Check and enforce team suspensions
 *
 * This endpoint should be called by a cron service (Vercel Cron, etc.)
 * to check if any teams' grace periods have expired and suspend them.
 *
 * GET /api/cron/check-team-suspensions
 *
 * Authorization: Requires CRON_SECRET in headers or query params
 */

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    const providedSecret = authHeader?.replace("Bearer ", "") ||
                           request.nextUrl.searchParams.get("secret")

    if (!cronSecret || providedSecret !== cronSecret) {
      logger.warn("[Cron] Unauthorized attempt to run check-team-suspensions")
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Use service role to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    logger.info("[Cron] Starting team suspension check...")

    // ========================================================================
    // STEP 1: Find teams whose grace period has expired
    // ========================================================================

    const { data: teamsToSuspend, error: fetchError } = await supabase
      .from("teams")
      .select("*")
      .is("suspended_at", null) // Not already suspended
      .not("grace_period_ends_at", "is", null) // Has grace period set
      .lt("grace_period_ends_at", new Date().toISOString()) // Grace period expired

    if (fetchError) {
      logger.error("[Cron] Error fetching teams:", fetchError)
      return NextResponse.json(
        { error: "Failed to fetch teams" },
        { status: 500 }
      )
    }

    if (!teamsToSuspend || teamsToSuspend.length === 0) {
      logger.info("[Cron] No teams to suspend")
      return NextResponse.json({
        success: true,
        message: "No teams to suspend",
        suspendedCount: 0
      })
    }

    logger.info(`[Cron] Found ${teamsToSuspend.length} teams with expired grace periods`)

    // ========================================================================
    // STEP 2: Suspend each team
    // ========================================================================

    const suspendedTeams: string[] = []
    const errors: Array<{ teamId: string; error: string }> = []

    for (const team of teamsToSuspend) {
      try {
        logger.info(`[Cron] Suspending team ${team.name} (${team.id})...`)

        // Update team status
        const { error: updateError } = await supabase
          .from("teams")
          .update({
            suspended_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", team.id)

        if (updateError) {
          logger.error(`[Cron] Failed to suspend team ${team.id}:`, updateError)
          errors.push({ teamId: team.id, error: updateError.message })
          continue
        }

        // Create suspension notification
        const { error: notificationError } = await supabase.rpc(
          "create_suspension_notification",
          {
            p_team_id: team.id,
            p_user_id: team.created_by,
            p_notification_type: "team_suspended",
            p_metadata: {
              team_id: team.id,
              team_name: team.name,
              suspension_reason: team.suspension_reason,
              suspended_at: new Date().toISOString()
            }
          }
        )

        if (notificationError) {
          logger.warn(`[Cron] Failed to create notification for team ${team.id}:`, notificationError)
          // Don't fail the suspension if notification fails
        }

        suspendedTeams.push(team.id)
        logger.info(`[Cron] Successfully suspended team ${team.name} (${team.id})`)
      } catch (error: any) {
        logger.error(`[Cron] Error suspending team ${team.id}:`, error)
        errors.push({ teamId: team.id, error: error.message })
      }
    }

    // ========================================================================
    // STEP 3: Send reminder notifications (3 days and 1 day before)
    // ========================================================================

    const threeDaysFromNow = new Date()
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3)
    threeDaysFromNow.setHours(23, 59, 59, 999)

    const oneDayFromNow = new Date()
    oneDayFromNow.setDate(oneDayFromNow.getDate() + 1)
    oneDayFromNow.setHours(23, 59, 59, 999)

    // Find teams with grace period ending in ~3 days
    const { data: teams3DaysOut } = await supabase
      .from("teams")
      .select("*")
      .is("suspended_at", null)
      .not("grace_period_ends_at", "is", null)
      .gte("grace_period_ends_at", new Date().toISOString())
      .lte("grace_period_ends_at", threeDaysFromNow.toISOString())

    // Find teams with grace period ending in ~1 day
    const { data: teams1DayOut } = await supabase
      .from("teams")
      .select("*")
      .is("suspended_at", null)
      .not("grace_period_ends_at", "is", null)
      .gte("grace_period_ends_at", new Date().toISOString())
      .lte("grace_period_ends_at", oneDayFromNow.toISOString())

    // Send 3-day reminders
    if (teams3DaysOut && teams3DaysOut.length > 0) {
      for (const team of teams3DaysOut) {
        // Check if we've already sent this reminder
        const { data: existing } = await supabase
          .from("team_suspension_notifications")
          .select("id")
          .eq("team_id", team.id)
          .eq("notification_type", "grace_period_reminder_3_days")
          .single()

        if (!existing) {
          await supabase.rpc("create_suspension_notification", {
            p_team_id: team.id,
            p_user_id: team.created_by,
            p_notification_type: "grace_period_reminder_3_days",
            p_metadata: {
              team_name: team.name,
              grace_period_ends_at: team.grace_period_ends_at,
              days_remaining: 3
            }
          })
          logger.info(`[Cron] Sent 3-day reminder for team ${team.name}`)
        }
      }
    }

    // Send 1-day reminders
    if (teams1DayOut && teams1DayOut.length > 0) {
      for (const team of teams1DayOut) {
        const { data: existing } = await supabase
          .from("team_suspension_notifications")
          .select("id")
          .eq("team_id", team.id)
          .eq("notification_type", "grace_period_reminder_1_day")
          .single()

        if (!existing) {
          await supabase.rpc("create_suspension_notification", {
            p_team_id: team.id,
            p_user_id: team.created_by,
            p_notification_type: "grace_period_reminder_1_day",
            p_metadata: {
              team_name: team.name,
              grace_period_ends_at: team.grace_period_ends_at,
              days_remaining: 1
            }
          })
          logger.info(`[Cron] Sent 1-day reminder for team ${team.name}`)
        }
      }
    }

    // ========================================================================
    // STEP 4: Return summary
    // ========================================================================

    logger.info(`[Cron] Suspension check complete. Suspended: ${suspendedTeams.length}, Errors: ${errors.length}`)

    return NextResponse.json({
      success: true,
      suspendedCount: suspendedTeams.length,
      suspendedTeams,
      errors: errors.length > 0 ? errors : undefined,
      reminders: {
        threeDaySent: teams3DaysOut?.length || 0,
        oneDaySent: teams1DayOut?.length || 0
      }
    })
  } catch (error: any) {
    logger.error("[Cron] Fatal error in check-team-suspensions:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    )
  }
}
