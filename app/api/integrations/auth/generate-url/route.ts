import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { generateOAuthState } from "@/lib/oauth/utils"
import { getOAuthProvider } from "@/lib/oauth/index"

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies })

    // Check authentication
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()
    if (sessionError || !session) {
      return NextResponse.json(
        {
          success: false,
          error: "Authentication required",
        },
        { status: 401 },
      )
    }

    const { provider, scopes } = await request.json()

    if (!provider) {
      return NextResponse.json(
        {
          success: false,
          error: "Provider is required",
        },
        { status: 400 },
      )
    }

    console.log(`Generating auth URL for provider: ${provider}`)

    // Generate state with user ID
    const state = generateOAuthState(provider, session.user.id)

    try {
      const oauthProvider = getOAuthProvider(provider)
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || request.nextUrl.origin
      const authUrl = oauthProvider.generateAuthUrl(baseUrl, false, undefined, session.user.id)

      console.log(`Auth URL generated for ${provider}:`, authUrl.substring(0, 100) + "...")

      return NextResponse.json({
        success: true,
        authUrl,
        state,
      })
    } catch (error: any) {
      console.error(`Error generating auth URL for ${provider}:`, error)

      if (error.message.includes("Missing") && error.message.includes("configuration")) {
        return NextResponse.json(
          {
            success: false,
            error: `${provider} is not configured. Please ensure the required environment variables are set.`,
          },
          { status: 400 },
        )
      }

      return NextResponse.json(
        {
          success: false,
          error: error.message || `Failed to generate auth URL for ${provider}`,
        },
        { status: 500 },
      )
    }
  } catch (error: any) {
    console.error("Error in auth URL generation:", error)
    return NextResponse.json(
      {
        success: false,
        error: "Internal server error",
      },
      { status: 500 },
    )
  }
}
