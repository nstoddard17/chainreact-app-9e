import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { generateOAuthUrl } from "@/lib/oauth"

export async function POST(request: NextRequest) {
  try {
    const { provider, reconnect = false, integrationId } = await request.json()

    if (!provider) {
      return NextResponse.json({ error: "Provider is required" }, { status: 400 })
    }

    // Verify user session
    const supabase = createRouteHandlerClient({ cookies })
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    // Get base URL from headers
    const host = request.headers.get("host")
    const protocol = request.headers.get("x-forwarded-proto") || "https"
    const baseUrl = `${protocol}://${host}`

    try {
      const authUrl = generateOAuthUrl(provider, baseUrl, reconnect, integrationId)

      return NextResponse.json({
        success: true,
        authUrl,
        provider,
      })
    } catch (error: any) {
      console.error(`OAuth configuration error for ${provider}:`, error)

      // Check if it's a missing environment variable error
      if (error.message.includes("Missing") && error.message.includes("environment variable")) {
        return NextResponse.json(
          {
            error: `OAuth not configured for ${provider}. Missing environment variables.`,
            details: error.message,
          },
          { status: 500 },
        )
      }

      return NextResponse.json(
        {
          error: `OAuth not configured for ${provider}`,
          details: error.message,
        },
        { status: 500 },
      )
    }
  } catch (error: any) {
    console.error("Auth route error:", error)
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error.message,
      },
      { status: 500 },
    )
  }
}
