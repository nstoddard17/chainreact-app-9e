import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"
import { logger } from "@/lib/utils/logger"

/**
 * API Route: Suspend or unsuspend a team
 *
 * POST /api/teams/[id]/suspend
 *
 * Body:
 * - action: 'suspend' | 'unsuspend'
 * - reason?: 'owner_downgraded' | 'payment_failed' | 'quota_exceeded' | 'manual_suspension'
 * - gracePeriodDays?: number (default: 5)
 */

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  cookies()
  const supabase = await createSupabaseRouteHandlerClient()

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { action, reason, gracePeriodDays = 5 } = body

    if (!action || !['suspend', 'unsuspend'].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'suspend' or 'unsuspend'" },
        { status: 400 }
      )
    }

    // Get team
    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("*")
      .eq("id", params.id)
      .single()

    if (teamError || !team) {
      logger.error("[Team Suspend] Team not found:", teamError)
      return NextResponse.json(
        { error: "Team not found" },
        { status: 404 }
      )
    }

    // Check permission: user must be team owner or admin
    const { data: membership, error: membershipError } = await supabase
      .from("team_members")
      .select("role")
      .eq("team_id", params.id)
      .eq("user_id", user.id)
      .single()

    // Also check if user is platform admin
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("admin")
      .eq("id", user.id)
      .single()

    const isAdmin = profile?.admin === true
    const isTeamOwnerOrAdmin = membership?.role === 'owner' || membership?.role === 'admin'

    if (!isAdmin && !isTeamOwnerOrAdmin) {
      return NextResponse.json(
        { error: "You must be a team owner or admin to suspend/unsuspend this team" },
        { status: 403 }
      )
    }

    if (action === 'suspend') {
      // Calculate grace period end date
      const gracePeriodEndsAt = new Date()
      gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + gracePeriodDays)

      // Update team with grace period
      const { error: updateError } = await supabase
        .from("teams")
        .update({
          grace_period_ends_at: gracePeriodEndsAt.toISOString(),
          suspension_reason: reason || 'manual_suspension',
          updated_at: new Date().toISOString()
        })
        .eq("id", params.id)

      if (updateError) {
        logger.error("[Team Suspend] Failed to set grace period:", updateError)
        return NextResponse.json(
          { error: "Failed to set grace period" },
          { status: 500 }
        )
      }

      logger.info(`[Team Suspend] Grace period set for team ${team.name} (${params.id}). Ends at: ${gracePeriodEndsAt.toISOString()}`)

      return NextResponse.json({
        success: true,
        message: `Grace period set for ${gracePeriodDays} days`,
        gracePeriodEndsAt: gracePeriodEndsAt.toISOString(),
        suspensionReason: reason || 'manual_suspension'
      })
    } else {
      // Unsuspend: clear suspension and grace period
      const { error: updateError } = await supabase
        .from("teams")
        .update({
          suspended_at: null,
          suspension_reason: null,
          grace_period_ends_at: null,
          suspension_notified_at: null,
          updated_at: new Date().toISOString()
        })
        .eq("id", params.id)

      if (updateError) {
        logger.error("[Team Suspend] Failed to unsuspend:", updateError)
        return NextResponse.json(
          { error: "Failed to unsuspend team" },
          { status: 500 }
        )
      }

      logger.info(`[Team Suspend] Team ${team.name} (${params.id}) unsuspended`)

      return NextResponse.json({
        success: true,
        message: "Team successfully reactivated"
      })
    }
  } catch (error: any) {
    logger.error("[Team Suspend] Error:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}
