import { type NextRequest, NextResponse } from "next/server"
import { handleOAuthCallback } from "@/lib/oauth/handleOAuthCallback"

export async function GET(request: NextRequest) {
  console.log("Gmail OAuth callback received")

  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    console.log("Gmail callback params:", {
      hasCode: !!code,
      hasState: !!state,
      error,
    })

    if (error) {
      console.error("Gmail OAuth error:", error)
      const errorDescription = searchParams.get("error_description")
      return NextResponse.redirect(
        new URL(
          `/integrations?error=${encodeURIComponent(error)}&description=${encodeURIComponent(errorDescription || "")}&provider=gmail`,
          request.url,
        ),
      )
    }

    if (!code || !state) {
      console.error("Missing code or state in Gmail callback")
      return NextResponse.redirect(new URL("/integrations?error=missing_parameters&provider=gmail", request.url))
    }

    // Parse state
    let stateData
    try {
      stateData = JSON.parse(atob(state))
      console.log("Gmail parsed state:", stateData)
    } catch (error) {
      console.error("Invalid state parameter in Gmail callback:", error)
      return NextResponse.redirect(new URL("/integrations?error=invalid_state&provider=gmail", request.url))
    }

    const { userId, reconnect, integrationId } = stateData

    if (!userId) {
      console.error("Missing userId in Gmail state")
      return NextResponse.redirect(new URL("/integrations?error=missing_user_id&provider=gmail", request.url))
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${new URL(request.url).origin}/api/integrations/gmail/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Gmail token exchange failed:", errorData)
      return NextResponse.redirect(new URL("/integrations?error=token_exchange_failed&provider=gmail", request.url))
    }

    const tokens = await tokenResponse.json()
    console.log("Gmail tokens received:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in,
    })

    // Get user info
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    })

    if (!userResponse.ok) {
      console.error("Failed to get Gmail user info")
      return NextResponse.redirect(new URL("/integrations?error=user_info_failed&provider=gmail", request.url))
    }

    const userInfo = await userResponse.json()
    console.log("Gmail user info:", {
      email: userInfo.email,
      name: userInfo.name,
    })

    // Handle the OAuth callback
    const result = await handleOAuthCallback({
      provider: "gmail",
      code,
      state: stateData,
      tokens,
      userInfo,
      request,
    })

    if (result.success) {
      console.log("Gmail integration saved successfully")
      return NextResponse.redirect(new URL("/integrations?success=true&provider=gmail", request.url))
    } else {
      console.error("Failed to save Gmail integration:", result.error)
      return NextResponse.redirect(
        new URL(`/integrations?error=${encodeURIComponent(result.error)}&provider=gmail`, request.url),
      )
    }
  } catch (error: any) {
    console.error("Gmail callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=${encodeURIComponent(error.message || "Unknown error")}&provider=gmail`,
        request.url,
      ),
    )
  }
}
