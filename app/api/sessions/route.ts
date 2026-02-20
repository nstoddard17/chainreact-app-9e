import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/utils/supabase/server"
import { logger } from "@/lib/utils/logger"

/**
 * GET /api/sessions
 * Get all active sessions for the current user
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get current session
    const {
      data: { session: currentSession },
    } = await supabase.auth.getSession()

    // Note: Supabase doesn't expose all user sessions directly through the API
    // We can only get the current session. For a complete session management,
    // you would need to track sessions in a custom table.
    // For now, we'll show the current session and any refresh tokens.

    // Get user's auth activity from auth.users if accessible
    // For now, we'll provide session info based on what we can access
    const sessionInfo = {
      current: {
        id: currentSession?.access_token?.slice(-8) || "current",
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at,
        user_agent: request.headers.get("user-agent") || "Unknown",
        ip_address: request.headers.get("x-forwarded-for")?.split(",")[0] ||
                    request.headers.get("x-real-ip") ||
                    "Unknown",
        is_current: true,
        expires_at: currentSession?.expires_at
          ? new Date(currentSession.expires_at * 1000).toISOString()
          : null,
      },
    }

    // Get session history from our tracking table if it exists
    const { data: sessionHistory, error: historyError } = await supabase
      .from("user_sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(10)

    const sessions = sessionHistory || [sessionInfo.current]

    return NextResponse.json({ sessions, current: sessionInfo.current })
  } catch (error: any) {
    logger.error("[sessions] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/sessions
 * Revoke a session (sign out from that device)
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const sessionId = searchParams.get("sessionId")
    const revokeAll = searchParams.get("all") === "true"

    if (revokeAll) {
      // Sign out from all devices
      const { error } = await supabase.auth.signOut({ scope: "global" })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ success: true, message: "All sessions revoked" })
    }

    if (!sessionId) {
      return NextResponse.json(
        { error: "sessionId or all=true is required" },
        { status: 400 }
      )
    }

    // For individual session revocation, we'd need to track sessions in a custom table
    // Since Supabase doesn't expose individual session revocation,
    // we'll mark it in our tracking table if it exists
    const { error } = await supabase
      .from("user_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("user_id", user.id)

    if (error) {
      logger.error("[sessions] Error revoking session:", error)
      return NextResponse.json({ success: false, error: 'Failed to revoke session' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    logger.error("[sessions] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
