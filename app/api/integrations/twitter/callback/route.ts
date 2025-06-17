import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")

  const redirectUrl = new URL("/integrations", getBaseUrl())

  if (error) {
    console.error(`Error with Twitter OAuth: ${error}`)
    redirectUrl.searchParams.set("error", "Failed to connect Twitter account.")
    return NextResponse.redirect(redirectUrl)
  }

  if (!code) {
    redirectUrl.searchParams.set("error", "No code provided for Twitter OAuth.")
    return NextResponse.redirect(redirectUrl)
  }

  if (!state) {
    redirectUrl.searchParams.set("error", "No state provided for Twitter OAuth.")
    return NextResponse.redirect(redirectUrl)
  }

  try {
    const { userId, codeVerifier } = JSON.parse(atob(state))
    if (!userId) {
      redirectUrl.searchParams.set("error", "Missing userId in Twitter state.")
      return NextResponse.redirect(redirectUrl)
    }
    if (!codeVerifier) {
      redirectUrl.searchParams.set("error", "Missing code_verifier in Twitter state.")
      return NextResponse.redirect(redirectUrl)
    }

    const tokenUrl = new URL("https://api.twitter.com/2/oauth2/token")
    const body = new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID!,
      redirect_uri: `${getBaseUrl()}/api/integrations/twitter/callback`,
      code_verifier: codeVerifier,
    })

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error("Failed to exchange Twitter code for token:", errorData)
      redirectUrl.searchParams.set("error", "Failed to get Twitter access token.")
      return NextResponse.redirect(redirectUrl)
    }

    const tokens = await response.json()
    const accessToken = tokens.access_token
    const refreshToken = tokens.refresh_token
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const userInfoResponse = await fetch("https://api.twitter.com/2/users/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userInfoResponse.ok) {
      console.error("Failed to fetch Twitter user info")
      redirectUrl.searchParams.set("error", "Failed to fetch Twitter user info.")
      return NextResponse.redirect(redirectUrl)
    }

    const userInfo = await userInfoResponse.json()
    const providerAccountId = userInfo.data.id

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { error: dbError } = await supabase.from("integrations").upsert(
      {
        user_id: userId,
        provider: "twitter",
        provider_user_id: providerAccountId,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        scopes: tokens.scope.split(" "),
        status: "connected",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id, provider" },
    )

    if (dbError) {
      console.error("Error saving Twitter integration to DB:", dbError)
      redirectUrl.searchParams.set("error", "Failed to save Twitter integration.")
      return NextResponse.redirect(redirectUrl)
    }

    redirectUrl.searchParams.set("success", "Twitter account connected successfully.")
    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    console.error("Error during Twitter OAuth callback:", error)
    redirectUrl.searchParams.set("error", "An unexpected error occurred.")
    return NextResponse.redirect(redirectUrl)
  }
}
