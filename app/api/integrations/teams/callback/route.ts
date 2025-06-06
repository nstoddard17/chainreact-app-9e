import { type NextRequest, NextResponse } from "next/server"
import { TeamsOAuthService } from "@/lib/oauth/teams"
import { createAdminSupabaseClient, upsertIntegration, parseOAuthState } from "@/lib/oauth/utils"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Teams OAuth callback received:", { code: !!code, state: !!state, error })

  if (error) {
    console.error("Teams OAuth error:", error)
    const errorDescription = searchParams.get("error_description") || "Unknown error"
    return NextResponse.redirect(
      new URL(`/integrations?error=${encodeURIComponent(`Teams OAuth error: ${errorDescription}`)}`, request.url),
    )
  }

  if (!code || !state) {
    console.error("Missing code or state parameter")
    return NextResponse.redirect(new URL("/integrations?error=Missing+authorization+code+or+state", request.url))
  }

  try {
    // Parse the state parameter to get user information
    const stateData = parseOAuthState(state)
    console.log("Parsed state data:", stateData)

    if (!stateData.userId) {
      console.error("Missing user ID in state:", stateData)
      return NextResponse.redirect(new URL("/integrations?error=Teams%3A+Missing+user+ID+in+state", request.url))
    }

    const userId = stateData.userId
    const reconnect = stateData.reconnect || false
    const integrationId = stateData.integrationId

    console.log(`Processing Teams OAuth for user ${userId}, reconnect: ${reconnect}`)

    // Get redirect URI
    const redirectUri = TeamsOAuthService.getRedirectUri(request.url)
    console.log("Teams redirect URI:", redirectUri)

    // Exchange code for token
    console.log("Exchanging code for token...")
    const tokenResponse = await TeamsOAuthService.exchangeCodeForToken(code, redirectUri)
    console.log("Token exchange successful")

    // Get user info
    console.log("Getting user info...")
    const userInfo = await TeamsOAuthService.validateTokenAndGetUserInfo(tokenResponse.access_token)
    console.log("User info retrieved:", { id: userInfo.id, displayName: userInfo.displayName })

    // Parse scopes
    const grantedScopes = TeamsOAuthService.parseScopes(tokenResponse)
    console.log("Granted scopes:", grantedScopes)

    // Calculate token expiration
    const expiresAt = tokenResponse.expires_in
      ? new Date(Date.now() + tokenResponse.expires_in * 1000).toISOString()
      : null

    // Create admin Supabase client
    const supabase = createAdminSupabaseClient()
    if (!supabase) {
      throw new Error("Failed to create admin Supabase client")
    }

    // Prepare integration data
    const integrationData = {
      user_id: userId,
      provider: "teams",
      provider_user_id: userInfo.id,
      status: "connected" as const,
      scopes: grantedScopes,
      access_token: tokenResponse.access_token,
      refresh_token: tokenResponse.refresh_token,
      expires_at: expiresAt,
      metadata: {
        user_info: userInfo,
        token_type: tokenResponse.token_type,
        scope: tokenResponse.scope,
        connected_at: new Date().toISOString(),
        reconnect,
        integration_id: integrationId,
      },
    }

    // Save integration
    console.log("Saving Teams integration...")
    const savedIntegration = await upsertIntegration(supabase, integrationData)
    console.log("Teams integration saved:", savedIntegration?.id)

    // Redirect to integrations page with success
    const successUrl = new URL("/integrations", request.url)
    successUrl.searchParams.set("success", "teams")
    successUrl.searchParams.set("provider", "Microsoft Teams")

    return NextResponse.redirect(successUrl)
  } catch (error: any) {
    console.error("Teams OAuth callback error:", error)

    // Redirect with error
    const errorUrl = new URL("/integrations", request.url)
    errorUrl.searchParams.set("error", `Teams connection failed: ${error.message}`)

    return NextResponse.redirect(errorUrl)
  }
}
