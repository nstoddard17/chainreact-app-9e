import { type NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import {
  getOAuthRedirectUri,
  parseOAuthState,
  upsertIntegration,
  validateScopes,
  getRequiredScopes,
} from "@/lib/oauth/utils"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  const baseUrl = "https://chainreact.app"

  try {
    // Handle OAuth errors
    if (error) {
      console.error("OAuth error:", error)
      return NextResponse.redirect(`${baseUrl}/integrations?error=oauth_error&message=${encodeURIComponent(error)}`)
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=missing_params&message=Missing+authorization+code+or+state`,
      )
    }

    // Parse and validate state
    let parsedState
    try {
      parsedState = parseOAuthState(state)
    } catch (error) {
      return NextResponse.redirect(`${baseUrl}/integrations?error=invalid_state&message=Invalid+state+parameter`)
    }

    // Validate session
    const supabase = createServerSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.redirect(`${baseUrl}/integrations?error=session_error&message=Please+log+in+again`)
    }

    // Verify state matches current user
    if (parsedState.userId !== session.user.id) {
      return NextResponse.redirect(`${baseUrl}/integrations?error=user_mismatch&message=Session+mismatch`)
    }

    // Exchange code for token
    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
    const clientSecret = process.env.DISCORD_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Discord OAuth credentials not configured")
    }

    const redirectUri = getOAuthRedirectUri("discord")

    const tokenResponse = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    })

    const tokenData = await tokenResponse.json()

    if (tokenData.error) {
      throw new Error(`Discord OAuth error: ${tokenData.error_description || tokenData.error}`)
    }

    // Validate scopes
    const requiredScopes = getRequiredScopes("discord")
    const grantedScopes = tokenData.scope ? tokenData.scope.split(" ") : []
    const scopeValidation = validateScopes(requiredScopes, grantedScopes)

    if (!scopeValidation.valid) {
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=insufficient_scopes&message=Missing+scopes:+${scopeValidation.missingScopes.join(",")}`,
      )
    }

    // Get user info
    const userResponse = await fetch("https://discord.com/api/users/@me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    const userData = await userResponse.json()

    // Calculate expiry
    const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString()

    // Upsert integration
    await upsertIntegration(supabase, {
      user_id: session.user.id,
      provider: "discord",
      provider_user_id: userData.id,
      status: "connected",
      scopes: grantedScopes,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      metadata: {
        user_id: userData.id,
        username: userData.username,
        discriminator: userData.discriminator,
        avatar: userData.avatar,
        scope: tokenData.scope,
        connected_at: new Date().toISOString(),
      },
    })

    return NextResponse.redirect(
      `${baseUrl}/integrations?success=true&provider=discord&message=Discord+connected+successfully`,
    )
  } catch (error: any) {
    console.error("Discord OAuth callback error:", error)
    return NextResponse.redirect(
      `${baseUrl}/integrations?error=callback_error&message=${encodeURIComponent(error.message)}`,
    )
  }
}
