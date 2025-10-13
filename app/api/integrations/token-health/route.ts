import { type NextRequest, NextResponse } from "next/server"
import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { getTokenHealthReport, getIntegrationsNeedingAttention } from "@/lib/integrations/tokenMonitor"

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  try {
    // Get user from session
    const supabase = await createSupabaseRouteHandlerClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse("Unauthorized" , 401)
    }

    const url = new URL(request.url)
    const detailed = url.searchParams.get("detailed") === "true"

    if (detailed) {
      // Return full health report
      const report = await getTokenHealthReport()
      const attention = await getIntegrationsNeedingAttention()

      return jsonResponse({
        report,
        attention,
        timestamp: new Date().toISOString(),
      })
    } 
      // Return summary only
      const report = await getTokenHealthReport()

      return jsonResponse({
        summary: report.summary,
        hasIssues: report.summary.expired > 0 || report.summary.failed > 0,
        timestamp: new Date().toISOString(),
      })
    
  } catch (error: any) {
    logger.error("Error getting token health:", error)
    return errorResponse("Failed to get token health", 500, { details: error.message  })
  }
}
