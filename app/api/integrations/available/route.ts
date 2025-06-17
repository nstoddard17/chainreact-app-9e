import { NextResponse } from "next/server"
import { detectAvailableIntegrations, getIntegrationStats } from "@/lib/integrations/availableIntegrations"

export async function GET() {
  try {
    const integrations = detectAvailableIntegrations()
    const stats = getIntegrationStats()

    return NextResponse.json({
      success: true,
      data: {
        integrations,
        stats,
      },
    })
  } catch (error: any) {
    console.error("Failed to get available integrations:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to get available integrations",
      },
      { status: 500 },
    )
  }
}
