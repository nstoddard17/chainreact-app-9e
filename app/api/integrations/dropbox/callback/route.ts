import { type NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { getAbsoluteBaseUrl, parseOAuthState, upsertIntegration } from "@/lib/oauth/utils"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  const baseUrl = getAbsoluteBaseUrl(request)

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
    const clientId = process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID
    const clientSecret = process.env.DROPBOX_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      throw new Error("Dropbox OAuth credentials not configured")
    }

    const redirectUri = `${baseUrl}/api/integrations/dropbox/callback`

    const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
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
      throw new Error(`Dropbox OAuth error: ${tokenData.error_description || tokenData.error}`)
    }

    // Get user info
    const userResponse = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
    })

    const userData = await userResponse.json()

    // Calculate expiry (Dropbox tokens expire in 4 hours by default)
    const expiresAt = tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null

    // Upsert integration
    await upsertIntegration(supabase, {
      user_id: session.user.id,
      provider: "dropbox",
      provider_user_id: userData.account_id,
      status: "connected",
      scopes: ["files.content.write", "files.content.read"], // Dropbox doesn't return scopes in token response
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt,
      metadata: {
        account_id: userData.account_id,
        name: userData.name,
        email: userData.email,
        connected_at: new Date().toISOString(),
      },
    })

    return NextResponse.redirect(
      `${baseUrl}/integrations?success=true&provider=dropbox&message=Dropbox+connected+successfully`,
    )
  } catch (error: any) {
    console.error("Dropbox OAuth callback error:", error)
    return NextResponse.redirect(
      `${baseUrl}/integrations?error=callback_error&message=${encodeURIComponent(error.message)}`,
    )
  }
}
