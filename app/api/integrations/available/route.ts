import { NextResponse } from "next/server"
import { detectAvailableIntegrations } from "@/lib/integrations/availableIntegrations"

export async function GET() {
  try {
    console.log("🔍 Detecting available integrations...")

    const integrations = detectAvailableIntegrations()

    console.log(
      `✅ Found ${integrations.length} integrations:`,
      integrations.map((i) => i.id),
    )

    return NextResponse.json({
      success: true,
      providers: integrations,
      count: integrations.length,
    })
  } catch (error) {
    console.error("❌ Error detecting integrations:", error)
    return NextResponse.json(
      {
        error: "Failed to detect available integrations",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
