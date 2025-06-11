import { type NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { refreshTokenIfNeeded } from "@/lib/integrations/tokenRefresher"
import { createAdminSupabaseClient } from "@/lib/oauth/utils"

export async function POST(request: NextRequest) {
  try {
    const { provider, integrationId } = await request.json()

    if (!provider && !integrationId) {
      return NextResponse.json({ error: "Either provider or integrationId is required" }, { status: 400 })
    }

    // Get user from session
    const supabase = createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const adminSupabase = createAdminSupabaseClient()
    if (!adminSupabase) {
      return NextResponse.json({ error: "Database connection failed" }, { status: 500 })
    }

    // Build query
    let query = adminSupabase.from("integrations").select("*").eq("user_id", user.id).eq("status", "connected")

    if (integrationId) {
      query = query.eq("id", integrationId)
    } else {
      query = query.eq("provider", provider)
    }

    const { data: integrations, error } = await query

    if (error) {
      return NextResponse.json({ error: "Failed to fetch integration" }, { status: 500 })
    }

    if (!integrations || integrations.length === 0) {
      return NextResponse.json({ error: "Integration not found" }, { status: 404 })
    }

    const results = []

    // Refresh each matching integration
    for (const integration of integrations) {
      try {
        const result = await refreshTokenIfNeeded(integration)

        results.push({
          integrationId: integration.id,
          provider: integration.provider,
          success: result.success,
          refreshed: result.refreshed,
          message: result.message,
        })

        // Update refresh timestamp
        if (result.success) {
          await adminSupabase
            .from("integrations")
            .update({
              last_token_refresh: new Date().toISOString(),
              consecutive_failures: 0,
            })
            .eq("id", integration.id)
        }
      } catch (error: any) {
        results.push({
          integrationId: integration.id,
          provider: integration.provider,
          success: false,
          refreshed: false,
          message: error.message,
        })
      }
    }

    const allSuccessful = results.every((r) => r.success)
    const anyRefreshed = results.some((r) => r.refreshed)

    return NextResponse.json({
      success: allSuccessful,
      refreshed: anyRefreshed,
      results,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("Error in manual token refresh:", error)
    return NextResponse.json({ error: "Internal server error", details: error.message }, { status: 500 })
  }
}
