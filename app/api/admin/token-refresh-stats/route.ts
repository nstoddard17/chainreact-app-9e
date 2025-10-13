import { NextResponse } from "next/server"
import { getAdminSupabaseClient } from "@/lib/supabase/admin"

import { logger } from '@/lib/utils/logger'

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const supabase = getAdminSupabaseClient()
    if (!supabase) {
      return errorResponse("Failed to create database client" , 500)
    }

    // Get overall integration health stats
    const { data: integrations, error: integrationsError } = await supabase
      .from("integrations")
      .select("status, provider, consecutive_failures, last_refresh_success, last_refresh_attempt, disconnect_reason")

    if (integrationsError) {
      throw integrationsError
    }

    // Calculate stats
    const stats = {
      total: integrations.length,
      by_status: {} as Record<string, number>,
      by_provider: {} as Record<string, { total: number; connected: number; failed: number }>,
      recent_failures: integrations.filter((i) => i.consecutive_failures > 0).length,
      needs_attention: integrations.filter(
        (i) => i.status === "needs_reauthorization" || i.status === "expired" || i.consecutive_failures >= 3,
      ).length,
      last_24h_refreshes: 0,
      failed_refreshes: integrations.filter((i) => i.consecutive_failures > 0),
    }

    // Count by status
    integrations.forEach((integration) => {
      stats.by_status[integration.status] = (stats.by_status[integration.status] || 0) + 1

      // Count by provider
      if (!stats.by_provider[integration.provider]) {
        stats.by_provider[integration.provider] = { total: 0, connected: 0, failed: 0 }
      }
      stats.by_provider[integration.provider].total++

      if (integration.status === "connected") {
        stats.by_provider[integration.provider].connected++
      } else if (integration.consecutive_failures > 0) {
        stats.by_provider[integration.provider].failed++
      }
    })

    // Count recent refreshes (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    stats.last_24h_refreshes = integrations.filter(
      (i) => i.last_refresh_success && i.last_refresh_success > yesterday,
    ).length

    return jsonResponse({
      success: true,
      stats,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    logger.error("Error fetching token refresh stats:", error)
    return jsonResponse(
      {
        success: false,
        error: "Failed to fetch token refresh stats",
        details: error.message,
      },
      { status: 500 },
    )
  }
}
