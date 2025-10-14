import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createAdminClient } from "@/lib/supabase/admin"

import { logger } from '@/lib/utils/logger'

export const dynamic = "force-dynamic"

interface Integration {
  id: string
  provider: string
  status: string
  refresh_token: string | null
  expires_at: string | null
  last_token_refresh: string | null
  created_at: string
  access_token: string | null
}

// Debug endpoint to analyze integration data
// Access at: https://chainreact.app/api/cron/debug-integrations
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    if (!supabase) {
      return errorResponse("Failed to create Supabase client" , 500)
    }

    // Get detailed integration data
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .order("created_at", { ascending: false })

    if (error) {
      return jsonResponse(
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

    integrations?.forEach((integration: Integration) => {
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
    const sampleIntegrations = integrations?.slice(0, 10).map((integration: Integration) => ({
      id: integration.id,
      provider: integration.provider,
      status: integration.status,
      hasRefreshToken: !!integration.refresh_token,
      expires_at: integration.expires_at,
      expiresIn: integration.expires_at
        ? `${Math.floor((new Date(integration.expires_at).getTime() / 1000 - now) / 60)} minutes`
        : "No expiry",
      lastRefresh: integration.last_token_refresh || "Never",
      createdAt: integration.created_at,
      hasAccessToken: !!integration.access_token
    }))

    return jsonResponse({
      success: true,
      timestamp: new Date().toISOString(),
      analysis,
      sampleIntegrations,
      rawCount: integrations?.length || 0,
    })
  } catch (error: any) {
    logger.error("💥 Error in debug integrations:", error)
    return jsonResponse(
      {
        success: false,
        error: "Debug failed",
        details: error.message,
      },
      { status: 500 },
    )
  }
}
