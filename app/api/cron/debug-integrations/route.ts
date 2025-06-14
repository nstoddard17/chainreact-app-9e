import { type NextRequest, NextResponse } from "next/server"
import { createAdminSupabaseClient } from "@/lib/oauth/utils"

export const dynamic = "force-dynamic"

// Debug endpoint to analyze integration data
// Access at: https://chainreact.app/api/cron/debug-integrations
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminSupabaseClient()
    if (!supabase) {
      return NextResponse.json({ error: "Failed to create Supabase client" }, { status: 500 })
    }

    // Get detailed integration data
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      return NextResponse.json(
        {
          error: "Database error",
          details: error.message,
        },
        { status: 500 },
      )
    }

    // Analyze the data
    const analysis = {
      totalIntegrations: integrations?.length || 0,
      byStatus: {} as Record<string, number>,
      byProvider: {} as Record<string, number>,
      withRefreshTokens: 0,
      withExpiryDates: 0,
      expiringSoon: 0,
      recentlyRefreshed: 0,
    }

    const now = Math.floor(Date.now() / 1000)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    integrations?.forEach((integration) => {
      // Count by status
      analysis.byStatus[integration.status] = (analysis.byStatus[integration.status] || 0) + 1

      // Count by provider
      analysis.byProvider[integration.provider] = (analysis.byProvider[integration.provider] || 0) + 1

      // Count refresh tokens
      if (integration.refresh_token) {
        analysis.withRefreshTokens++
      }

      // Count expiry dates
      if (integration.expires_at) {
        analysis.withExpiryDates++

        // Check if expiring soon (within 2 hours)
        const expiresAt = new Date(integration.expires_at).getTime() / 1000
        if (expiresAt - now < 7200) {
          analysis.expiringSoon++
        }
      }

      // Count recently refreshed
      if (integration.last_token_refresh && integration.last_token_refresh > oneDayAgo) {
        analysis.recentlyRefreshed++
      }
    })

    // Sample integrations for detailed view
    const sampleIntegrations = integrations?.slice(0, 10).map((integration) => ({
      id: integration.id,
      provider: integration.provider,
      status: integration.status,
      hasRefreshToken: !!integration.refresh_token,
      expiresAt: integration.expires_at,
      expiresIn: integration.expires_at
        ? `${Math.floor((new Date(integration.expires_at).getTime() / 1000 - now) / 60)} minutes`
        : "No expiry",
      lastRefresh: integration.last_token_refresh || "Never",
      createdAt: integration.created_at,
      tokenPreview: integration.access_token ? `${integration.access_token.substring(0, 15)}...` : "No token",
    }))

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      analysis,
      sampleIntegrations,
      rawCount: integrations?.length || 0,
    })
  } catch (error: any) {
    console.error("💥 Error in debug integrations:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Debug failed",
        details: error.message,
      },
      { status: 500 },
    )
  }
}
