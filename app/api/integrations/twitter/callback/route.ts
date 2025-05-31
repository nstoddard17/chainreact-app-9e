import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Twitter OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Twitter OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in Twitter callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params", request.url))
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    if (provider !== "twitter") {
      throw new Error("Invalid provider in state")
    }

    // Exchange code for access token
    const tokenResponse = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:
          "Basic " +
          Buffer.from(process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID + ":" + process.env.TWITTER_CLIENT_SECRET).toString(
            "base64",
          ),
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID!,
        redirect_uri: `${request.nextUrl.origin}/api/integrations/twitter/callback`,
        code_verifier: "challenge", // In production, this should be stored and retrieved
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Twitter token exchange failed:", errorData)
      throw new Error("Failed to exchange code for token")
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in } = tokenData

    // Get user info from Twitter
    const userResponse = await fetch("https://api.twitter.com/2/users/me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!userResponse.ok) {
      throw new Error("Failed to get user info")
    }

    const userData = await userResponse.json()
    const user = userData.data

    // Store integration in Supabase
    const supabase = getSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      throw new Error("No session found")
    }

    const integrationData = {
      user_id: session.user.id,
      provider: "twitter",
      provider_user_id: user.id,
      access_token,
      refresh_token,
      expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      status: "connected" as const,
      scopes: ["tweet.read", "tweet.write", "users.read"],
      metadata: {
        username: user.username,
        user_name: user.name,
        connected_at: new Date().toISOString(),
      },
    }

    if (reconnect && integrationId) {
      // Update existing integration
      const { error } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integrationId)

      if (error) throw error
    } else {
      // Create new integration
      const { error } = await supabase.from("integrations").insert(integrationData)
      if (error) throw error
    }

    console.log("Twitter integration saved successfully")
    return NextResponse.redirect(new URL("/integrations?success=twitter_connected", request.url))
  } catch (error: any) {
    console.error("Twitter OAuth callback error:", error)
    return NextResponse.redirect(new URL("/integrations?error=callback_failed", request.url))
  }
}
