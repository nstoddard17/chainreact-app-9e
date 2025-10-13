import { NextResponse } from "next/server"
import { detectAvailableIntegrations, getIntegrationStats } from "@/lib/integrations/availableIntegrations"

import { logger } from '@/lib/utils/logger'

export async function GET() {
  try {
    const integrations = detectAvailableIntegrations()
    const stats = getIntegrationStats()

    return jsonResponse({
      success: true,
      data: {
        integrations,
        stats,
      },
    })
  } catch (error: any) {
    logger.error("Failed to get available integrations:", error)
    return jsonResponse(
      {
        success: false,
        error: error.message || "Failed to get available integrations",
      },
      { status: 500 },
    )
  }
}
