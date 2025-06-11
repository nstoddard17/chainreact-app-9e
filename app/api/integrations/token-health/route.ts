import { type NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { getTokenHealthReport, getIntegrationsNeedingAttention } from "@/lib/integrations/tokenMonitor"

export async function GET(request: NextRequest) {
  try {
    // Get user from session
    const supabase = createServerSupabaseClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const url = new URL(request.url)
    const detailed = url.searchParams.get("detailed") === "true"

    if (detailed) {
      // Return full health report
      const report = await getTokenHealthReport()
      const attention = await getIntegrationsNeedingAttention()

      return NextResponse.json({
        report,
        attention,
        timestamp: new Date().toISOString(),
      })
    } else {
      // Return summary only
      const report = await getTokenHealthReport()

      return NextResponse.json({
        summary: report.summary,
        hasIssues: report.summary.expired > 0 || report.summary.failed > 0,
        timestamp: new Date().toISOString(),
      })
    }
  } catch (error: any) {
    console.error("Error getting token health:", error)
    return NextResponse.json({ error: "Failed to get token health", details: error.message }, { status: 500 })
  }
}
