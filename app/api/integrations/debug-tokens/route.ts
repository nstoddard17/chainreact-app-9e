import { NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { cookies } from "next/headers"
import type { Database } from "@/types/supabase"

export async function GET() {
  try {
    cookies()
    const supabase = await createSupabaseRouteHandlerClient()

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      console.error("Session error:", sessionError)
      return NextResponse.json({ error: "Authentication error" }, { status: 401 })
    }

    if (!session) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const userId = session.user.id

    // Get all integrations for the user
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "connected")

    if (error) {
      console.error("Database error:", error)
      return NextResponse.json({ error: "Database error" }, { status: 500 })
    }

    // Process each integration to extract status information only
    const results = integrations.map((integration) => {
      const { provider, id, status, access_token, refresh_token, expires_at } = integration

      // Check token storage without revealing details
      const hasAccessToken = !!access_token
      const hasRefreshToken = !!refresh_token

      // Check token expiration
      let tokenStatus = "Unknown"
      if (expires_at) {
        const expiryDate = new Date(expires_at * 1000)
        const now = new Date()
        tokenStatus = expiryDate < now ? "Expired" : "Valid"
      }

      return {
        provider,
        id,
        status,
        hasAccessToken,
        hasRefreshToken,
        tokenStatus
      }
    })

    return NextResponse.json({
      count: integrations.length,
      integrations: results,
    })
  } catch (error: any) {
    console.error("Error checking integrations:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
