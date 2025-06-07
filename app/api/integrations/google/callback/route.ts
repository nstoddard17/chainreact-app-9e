import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { type NextRequest, NextResponse } from "next/server"
import { GoogleOAuthService } from "@/lib/oauth/google"
import { createAdminSupabaseClient, upsertIntegration, parseOAuthState } from "@/lib/oauth/utils"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    // Handle OAuth errors
    if (error) {
      console.error("OAuth error:", error)
      return NextResponse.redirect(
        `${getBaseUrl(request)}/integrations?error=true&message=${encodeURIComponent("OAuth authorization failed")}&provider=google`,
      )
    }

    if (!code) {
      return NextResponse.redirect(
        `${getBaseUrl(request)}/integrations?error=true&message=${encodeURIComponent("No authorization code received")}&provider=google`,
      )
    }

    // Parse state to get user ID
    let userId: string | null = null
    if (state) {
      try {
        const stateData = parseOAuthState(state)
        userId = stateData.userId
      } catch (error) {
        console.error("Failed to parse state:", error)
      }
    }

    // Exchange code for tokens
    const tokenData = await GoogleOAuthService.exchangeCodeForTokens(code)

    if (!tokenData.access_token) {
      throw new Error("No access token received")
    }

    // Get user info from Google
    const userInfo = await GoogleOAuthService.getUserInfo(tokenData.access_token)

    // Calculate expiry time
    const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null

    // Save integration to database
    const supabase = createAdminSupabaseClient()
    if (!supabase) {
      throw new Error("Failed to create Supabase client")
    }

    // If no userId from state, this is an error
    if (!userId) {
      throw new Error("No user ID found in OAuth state")
    }

    const integrationData = {
      user_id: userId,
      provider: "google",
      provider_user_id: userInfo.id,
      status: "connected" as const,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
      metadata: {
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
        verified_email: userInfo.verified_email,
      },
    }

    await upsertIntegration(supabase, integrationData)

    // Redirect back to integrations page with success
    return NextResponse.redirect(`${getBaseUrl(request)}/integrations?success=true&provider=google`)
  } catch (error: any) {
    console.error("Google OAuth callback error:", error)
    return NextResponse.redirect(
      `${getBaseUrl(request)}/integrations?error=true&message=${encodeURIComponent(error.message || "Integration failed")}&provider=google`,
    )
  }
}
