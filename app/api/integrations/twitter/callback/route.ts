import { type NextRequest, NextResponse } from "next/server"
import { TwitterOAuthService } from "@/lib/oauth/twitter"
import { createAdminSupabaseClient, parseOAuthState, upsertIntegration } from "@/lib/oauth/utils"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    console.log("🐦 Twitter callback received:", { code: !!code, state: !!state, error })

    // Handle OAuth errors
    if (error) {
      console.error("🐦 Twitter OAuth error:", error)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "https://chainreact.app"}/integrations?error=oauth_error&provider=twitter&message=${encodeURIComponent(
          `Twitter authorization failed: ${error}`,
        )}`,
      )
    }

    if (!code || !state) {
      console.error("🐦 Missing code or state parameter")
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "https://chainreact.app"}/integrations?error=missing_params&provider=twitter`,
      )
    }

    // Parse state to get user ID
    let stateData
    try {
      stateData = parseOAuthState(state)
      console.log("🐦 Parsed state data:", { provider: stateData.provider, userId: !!stateData.userId })
    } catch (error) {
      console.error("🐦 Failed to parse OAuth state:", error)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "https://chainreact.app"}/integrations?error=invalid_state&provider=twitter`,
      )
    }

    const { userId, provider } = stateData

    if (provider !== "twitter") {
      console.error("🐦 Provider mismatch:", provider)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "https://chainreact.app"}/integrations?error=provider_mismatch&provider=twitter`,
      )
    }

    if (!userId) {
      console.error("🐦 No user ID in OAuth state")
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || "https://chainreact.app"}/integrations?error=no_user_id&provider=twitter`,
      )
    }

    console.log("🐦 Exchanging Twitter code for tokens...")

    // Exchange code for tokens
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || "https://chainreact.app"}/api/integrations/twitter/callback`
    const tokenData = await TwitterOAuthService.exchangeCodeForTokens(code, redirectUri)

    if (!tokenData.access_token) {
      throw new Error("No access token received from Twitter")
    }

    console.log("🐦 Twitter tokens received, getting user info...")

    // Get user info from Twitter
    const userInfo = await TwitterOAuthService.getUserInfo(tokenData.access_token)
    console.log("🐦 Twitter user info received:", { id: userInfo.id, username: userInfo.username })

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
        connected_at: new Date().toISOString(),
      },
    }

    console.log("🐦 Saving Twitter integration to database...")
    await upsertIntegration(supabase, integrationData)
    console.log("🐦 Twitter integration saved successfully")

    // For popup flow, close the window with a success message
    const isPopup = request.headers.get("referer")?.includes("twitter-oauth") || searchParams.get("popup") === "true"

    if (isPopup) {
      return new NextResponse(
        `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Twitter Connected</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .success { color: #10b981; font-size: 18px; }
            .loading { color: #6b7280; }
          </style>
        </head>
        <body>
          <div class="success">✅ Twitter connected successfully!</div>
          <div class="loading">Closing window...</div>
          <script>
            setTimeout(() => {
              window.close();
            }, 2000);
          </script>
        </body>
        </html>
      `,
        {
          headers: { "Content-Type": "text/html" },
        },
      )
    }

    // Regular redirect flow
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "https://chainreact.app"}/integrations?success=twitter_connected&provider=twitter`,
    )
  } catch (error: any) {
    console.error("🐦 Twitter OAuth callback error:", error)

    const isPopup = request.headers.get("referer")?.includes("twitter-oauth")

    if (isPopup) {
      return new NextResponse(
        `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Twitter Connection Failed</title>
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
            .error { color: #ef4444; font-size: 18px; }
            .message { color: #6b7280; margin-top: 10px; }
          </style>
        </head>
        <body>
          <div class="error">❌ Twitter connection failed</div>
          <div class="message">${error.message}</div>
          <script>
            setTimeout(() => {
              window.close();
            }, 3000);
          </script>
        </body>
        </html>
      `,
        {
          headers: { "Content-Type": "text/html" },
        },
      )
    }

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || "https://chainreact.app"}/integrations?error=callback_failed&provider=twitter&message=${encodeURIComponent(
        error.message || "Twitter integration failed",
      )}`,
    )
  }
}
