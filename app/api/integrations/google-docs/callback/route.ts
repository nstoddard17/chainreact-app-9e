import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase-server"
import { handleOAuthCallback } from "@/lib/oauth/handleOAuthCallback"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error) {
    console.error("Google Docs OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in Google Docs callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params", request.url))
  }

  try {
    // Parse state parameter
    const decodedState = JSON.parse(atob(state))
    const { userId, provider, reconnect, integrationId } = decodedState

    if (!userId || provider !== "google-docs") {
      console.error("Invalid state parameter in Google Docs callback")
      return NextResponse.redirect(new URL("/integrations?error=invalid_state", request.url))
    }

    const supabase = createClient()

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code,
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${new URL(request.url).origin}/api/integrations/google-docs/callback`,
        grant_type: "authorization_code",
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      console.error("Failed to exchange code for tokens:", errorData)
      return NextResponse.redirect(new URL("/integrations?error=token_exchange_failed", request.url))
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in, scope } = tokenData

    // Get user info from Google
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!userInfoResponse.ok) {
      console.error("Failed to get user info from Google")
      return NextResponse.redirect(new URL("/integrations?error=user_info_failed", request.url))
    }

    const userInfo = await userInfoResponse.json()

    // Calculate expiration time
    const expiresAt = new Date(Date.now() + expires_in * 1000).toISOString()

    // Save integration to database
    const result = await handleOAuthCallback({
      provider: "google-docs",
      userId,
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt,
      metadata: {
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
        scopes: scope.split(" "),
      },
      scopes: scope.split(" "),
      reconnect,
      integrationId,
      supabase,
    })

    if (!result.success) {
      console.error("Failed to save Google Docs integration:", result.error)
      return NextResponse.redirect(new URL(`/integrations?error=${result.error}`, request.url))
    }

    return NextResponse.redirect(new URL("/integrations?success=true&provider=google-docs", request.url))
  } catch (error: any) {
    console.error("Error in Google Docs callback:", error)
    return NextResponse.redirect(new URL(`/integrations?error=${encodeURIComponent(error.message)}`, request.url))
  }
}
