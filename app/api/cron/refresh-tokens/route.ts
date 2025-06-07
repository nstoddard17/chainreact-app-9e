import { NextResponse } from "next/server"
import { refreshExpiringTokens } from "@/lib/integrations/autoTokenRefresh"

export async function GET() {
  try {
    console.log("Starting scheduled token refresh job...")
    await refreshExpiringTokens()
    console.log("Token refresh job completed successfully")

    return NextResponse.json({
      success: true,
      message: "Token refresh job completed",
    })
  } catch (error: any) {
    console.error("Token refresh job failed:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Token refresh job failed",
      },
      { status: 500 },
    )
  }
}

// Verify this is a cron job (optional security measure)
export async function POST(request: Request) {
  try {
    // Verify cron secret if you're using Vercel Cron
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    await refreshExpiringTokens()

    return NextResponse.json({
      success: true,
      message: "Scheduled token refresh completed",
    })
  } catch (error: any) {
    console.error("Scheduled token refresh failed:", error)
    return NextResponse.json({ error: error.message || "Token refresh failed" }, { status: 500 })
  }
}
