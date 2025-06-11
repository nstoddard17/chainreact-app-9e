import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 60 // 60 seconds (maximum allowed)

export async function GET(request: NextRequest) {
  try {
    // Simple authentication - just check if the secret is in the URL
    const url = new URL(request.url)
    const secret = url.searchParams.get("secret")

    // Very simple check - if any secret is provided, allow access
    // This is just for testing - replace with proper auth later
    if (!secret) {
      return NextResponse.json({ error: "Missing secret parameter" }, { status: 401 })
    }

    console.log("Starting token refresh cron job...")

    // For testing, just return success without actually running the job
    // const stats = await refreshExpiringTokens()
    const stats = { message: "This is a test response" }

    return NextResponse.json({
      success: true,
      message: "Test successful",
      timestamp: new Date().toISOString(),
      stats,
    })
  } catch (error: any) {
    console.error("Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
