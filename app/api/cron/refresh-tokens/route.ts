import { type NextRequest, NextResponse } from "next/server"
import { refreshExpiringTokens } from "@/lib/integrations/autoTokenRefresh"

export const dynamic = "force-dynamic"
export const maxDuration = 60 // 60 seconds (maximum allowed)

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret for security
    const authHeader = request.headers.get("authorization")
    if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    console.log("Starting token refresh cron job...")

    // Run the token refresh job
    await refreshExpiringTokens()

    return NextResponse.json({
      success: true,
      message: "Token refresh job completed",
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    console.error("Error in token refresh cron job:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Token refresh job failed",
        details: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
