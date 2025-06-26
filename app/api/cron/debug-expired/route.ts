import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: "Failed to create database client" }, { status: 500 })
    }

    console.log("🔍 Debugging expired integrations...")

    // Get ALL integrations to see their current status
    const { data: allIntegrations, error: allError } = await supabase
      .from("integrations")
      .select("*")
      .order("updated_at", { ascending: false })

    if (allError) {
      return NextResponse.json({ error: `Database error: ${allError.message}` }, { status: 500 })
    }

    // Analyze each integration
    const analysis = {
      total: allIntegrations?.length || 0,
      byStatus: {} as Record<string, number>,
      byProvider: {} as Record<string, number>,
      expiredCount: 0,
      recoveryJobCriteria: {
        statusExpired: 0,
        statusDisconnected: 0,
        statusNeedsReauth: 0,
        hasRefreshToken: 0,
        within7Days: 0,
        meetsAllCriteria: 0
      }
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const now = new Date()

    allIntegrations?.forEach(integration => {
      // Count by status
      const status = integration.status || 'unknown'
      analysis.byStatus[status] = (analysis.byStatus[status] || 0) + 1

      // Count by provider
      const provider = integration.provider || 'unknown'
      analysis.byProvider[provider] = (analysis.byProvider[provider] || 0) + 1

      // Check if it's considered "expired" by frontend logic
      let isExpiredByFrontend = false
      let expiryReason = ""

      if (integration.expires_at) {
        const expiresAt = new Date(integration.expires_at)
        if (expiresAt < now) {
          isExpiredByFrontend = true
          expiryReason = `Token expired at ${expiresAt.toISOString()}`
        }
      } else if (integration.status === 'expired') {
        isExpiredByFrontend = true
        expiryReason = "Status is 'expired'"
      }

      // Check recovery job criteria
      const meetsStatusCriteria = ["expired", "disconnected", "needs_reauthorization"].includes(status)
      const hasRefreshToken = !!integration.refresh_token
      const within7Days = new Date(integration.updated_at) >= new Date(sevenDaysAgo)

      if (meetsStatusCriteria) {
        if (status === 'expired') analysis.recoveryJobCriteria.statusExpired++
        if (status === 'disconnected') analysis.recoveryJobCriteria.statusDisconnected++
        if (status === 'needs_reauthorization') analysis.recoveryJobCriteria.statusNeedsReauth++
      }
      if (hasRefreshToken) analysis.recoveryJobCriteria.hasRefreshToken++
      if (within7Days) analysis.recoveryJobCriteria.within7Days++

      const meetsAllCriteria = meetsStatusCriteria && hasRefreshToken && within7Days
      if (meetsAllCriteria) analysis.recoveryJobCriteria.meetsAllCriteria++

      // Count expired integrations without storing sensitive data
      if (isExpiredByFrontend) {
        analysis.expiredCount++;
      }
    })

    return NextResponse.json({
      success: true,
      analysis,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    console.error("Error debugging expired integrations:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Failed to debug expired integrations",
        details: error.message
      },
      { status: 500 }
    )
  }
}
