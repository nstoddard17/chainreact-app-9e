import { type NextRequest, NextResponse } from "next/server"
import { TwitterOAuthService } from "@/lib/oauth/twitter-simple"
import { createAdminSupabaseClient, parseOAuthState, upsertIntegration } from "@/lib/oauth/utils"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    console.log("Twitter callback received:", { code: !!code, state: !!state, error })

    // Handle OAuth errors
    if (error) {
      console.error("Twitter OAuth error:", error)
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=oauth_error&provider=twitter&message=${encodeURIComponent(
          `Twitter authorization failed: ${error}`,
        )}`,
      )
    }

    if (!code) {
      console.error("No authorization code received from Twitter")
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=no_code&provider=twitter&message=${encodeURIComponent(
          "No authorization code received from Twitter",
        )}`,
      )
    }

    if (!state) {
      console.error("No state parameter received from Twitter")
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=no_state&provider=twitter&message=${encodeURIComponent(
          "No state parameter received from Twitter",
        )}`,
      )
    }

    // Parse state to get user ID
    let stateData
    try {
      stateData = parseOAuthState(state)
      console.log("Parsed state data:", { provider: stateData.provider, userId: !!stateData.userId })
    } catch (error) {
      console.error("Failed to parse Twitter OAuth state:", error)
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=invalid_state&provider=twitter&message=${encodeURIComponent(
          "Invalid state parameter",
        )}`,
      )
    }

    const { userId, provider } = stateData

    if (provider !== "twitter") {
      console.error("State provider mismatch:", provider)
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=provider_mismatch&provider=twitter&message=${encodeURIComponent(
          "Provider mismatch in state parameter",
        )}`,
      )
    }

    if (!userId) {
      console.error("No user ID in Twitter OAuth state")
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=no_user_id&provider=twitter&message=${encodeURIComponent(
          "No user ID found in OAuth state",
        )}`,
      )
    }

    console.log("Exchanging Twitter code for tokens...")

    // Exchange code for tokens using the redirect URI
    const redirectUri = `https://chainreact.app/api/integrations/twitter/callback`
    const tokenData = await TwitterOAuthService.exchangeCodeForTokens(code, redirectUri)

    if (!tokenData.access_token) {
      throw new Error("No access token received from Twitter")
    }

    console.log("Twitter tokens received, getting user info...")

    // Get user info from Twitter
    const userInfo = await TwitterOAuthService.getUserInfo(tokenData.access_token)
    console.log("Twitter user info received:", { id: userInfo.id, username: userInfo.username })

    // Calculate expiry time
    const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null

    // Save integration to database
    const supabase = createAdminSupabaseClient()
    if (!supabase) {
      throw new Error("Failed to create Supabase client")
    }

    const integrationData = {
      user_id: userId,
      provider: "twitter",
      provider_user_id: userInfo.id,
      status: "connected" as const,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
      metadata: {
        username: userInfo.username,
        name: userInfo.name,
        profile_image_url: userInfo.profile_image_url,
        verified: userInfo.verified,
        public_metrics: userInfo.public_metrics,
      },
    }

    console.log("Saving Twitter integration to database...")
    await upsertIntegration(supabase, integrationData)
    console.log("Twitter integration saved successfully")

    // Redirect back to integrations page with success
    return NextResponse.redirect(`https://chainreact.app/integrations?success=twitter_connected&provider=twitter`)
  } catch (error: any) {
    console.error("Twitter OAuth callback error:", error)
    return NextResponse.redirect(
      `https://chainreact.app/integrations?error=callback_failed&provider=twitter&message=${encodeURIComponent(
        error.message || "Twitter integration failed",
      )}`,
    )
  }
}
