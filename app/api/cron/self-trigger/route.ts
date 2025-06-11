import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    // Verify this is called from your own domain or with secret
    const authHeader = request.headers.get("authorization")
    const origin = request.headers.get("origin")

    if (!authHeader?.includes(process.env.CRON_SECRET!) && !origin?.includes(process.env.NEXT_PUBLIC_APP_URL!)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Call your actual cron job
    const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/refresh-tokens`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.CRON_SECRET}`,
      },
    })

    const result = await response.json()

    // Schedule next execution (this is a workaround)
    setTimeout(
      async () => {
        try {
          await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/cron/self-trigger`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${process.env.CRON_SECRET}`,
            },
          })
        } catch (error) {
          console.error("Failed to schedule next execution:", error)
        }
      },
      2 * 60 * 60 * 1000,
    ) // 2 hours

    return NextResponse.json({
      success: true,
      message: "Self-trigger executed",
      result,
    })
  } catch (error: any) {
    return NextResponse.json({ error: "Self-trigger failed", details: error.message }, { status: 500 })
  }
}
