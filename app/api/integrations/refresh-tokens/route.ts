import { NextResponse } from "next/server"
import { createAdminSupabaseClient } from "@/lib/oauth/utils"
import { refreshTokenIfNeeded } from "@/lib/integrations/tokenRefresher"

export async function POST(request: Request) {
  try {
    const supabase = createAdminSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ success: false, message: "Failed to initialize Supabase client" }, { status: 500 })
    }

    const { data: session } = await supabase.auth.getSession()
    const userId = session?.session?.user?.id

    if (!userId) {
      return NextResponse.json({ success: false, message: "Unauthorized" }, { status: 401 })
    }

    // Get all integrations for the user
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "connected")

    if (error) {
      console.error("Error fetching integrations:", error)
      return NextResponse.json({ success: false, message: "Failed to fetch integrations" }, { status: 500 })
    }

    if (!integrations || integrations.length === 0) {
      return NextResponse.json({ success: true, message: "No integrations to refresh", refreshed: [] })
    }

    // Try to refresh tokens for each integration
    const refreshResults = await Promise.all(
      integrations.map(async (integration) => {
        try {
          const result = await refreshTokenIfNeeded(integration)
          return {
            provider: integration.provider,
            refreshed: result.refreshed,
            success: result.success,
            message: result.message,
          }
        } catch (error) {
          console.error(`Error refreshing token for ${integration.provider}:`, error)
          return {
            provider: integration.provider,
            refreshed: false,
            success: false,
            message: "Failed to refresh token",
          }
        }
      }),
    )

    const refreshedCount = refreshResults.filter((r) => r.refreshed).length

    return NextResponse.json({
      success: true,
      message:
        refreshedCount > 0
          ? `Successfully refreshed ${refreshedCount} integration${refreshedCount > 1 ? "s" : ""}`
          : "No tokens needed refreshing",
      refreshed: refreshResults,
    })
  } catch (error) {
    console.error("Error in refresh-tokens route:", error)
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 })
  }
}
