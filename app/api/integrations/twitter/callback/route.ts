import { type NextRequest, NextResponse } from "next/server"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { getSupabaseClient } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Twitter OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Twitter OAuth error:", error)
    return NextResponse.redirect(
      new URL(`/integrations?error=oauth_error&message=${encodeURIComponent(error)}&provider=twitter`, request.url),
    )
  }

  if (!code || !state) {
    console.error("Missing code or state in Twitter callback")
    return NextResponse.redirect(
      new URL(
        "/integrations?error=missing_params&message=Missing authorization code or state&provider=twitter",
        request.url,
      ),
    )
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    console.log("Twitter state data:", stateData)

    if (provider !== "twitter") {
      throw new Error("Invalid provider in state")
    }

    // Use the correct redirect URI - must match exactly what was used in authorization
    const redirectUri = `${request.nextUrl.origin}/api/integrations/twitter/callback`
    console.log("Using redirect URI for token exchange:", redirectUri)

    // Exchange code for access token
    console.log("Exchanging code for token...")
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
        redirect_uri: redirectUri,
        code_verifier: "challenge", // In production, this should be stored and retrieved
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Twitter token exchange failed:", errorData)
      throw new Error("Failed to exchange code for token")
    }

    const tokenData = await tokenResponse.json()
    console.log("Twitter token exchange successful")
    const { access_token, refresh_token, expires_in } = tokenData

    // Get user info from Twitter
    console.log("Getting user info from Twitter...")
    const userResponse = await fetch("https://api.twitter.com/2/users/me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!userResponse.ok) {
      const errorData = await userResponse.text()
      console.error("Failed to get Twitter user info:", errorData)
      throw new Error("Failed to get user info")
    }

    const userData = await userResponse.json()
    const user = userData.data
    console.log("Twitter user info retrieved:", { id: user.id, username: user.username })

    // Get user session
    console.log("Getting user session...")
    let session = null

    try {
      const supabaseServer = createServerComponentClient({ cookies })
      const { data: sessionData } = await supabaseServer.auth.getSession()
      session = sessionData.session
      console.log("Server session retrieved:", !!session)
    } catch (serverError) {
      console.log("Server session failed, trying client session:", serverError)
      const supabase = getSupabaseClient()
      const { data: sessionData } = await supabase.auth.getSession()
      session = sessionData.session
      console.log("Client session retrieved:", !!session)
    }

    if (!session) {
      console.error("No session found after trying both methods")
      throw new Error("No session found")
    }

    console.log("Session user ID:", session.user.id)

    // Store integration in Supabase
    console.log("Saving integration to database...")
    const supabase = getSupabaseClient()

    const integrationData = {
      user_id: session.user.id,
      provider: "twitter",
      provider_user_id: user.id,
      access_token,
      refresh_token,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status: "connected" as const,
      scopes: ["tweet.read", "tweet.write", "users.read"],
      metadata: {
        username: user.username,
        user_name: user.name,
        connected_at: new Date().toISOString(),
      },
    }

    if (reconnect && integrationId) {
      console.log("Updating existing integration:", integrationId)
      const { error } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integrationId)

      if (error) {
        console.error("Database update error:", error)
        throw error
      }
    } else {
      console.log("Creating new integration")
      const { error } = await supabase.from("integrations").insert(integrationData)
      if (error) {
        console.error("Database insert error:", error)
        throw error
      }
    }

    console.log("Twitter integration saved successfully")

    // Clear any cached data
    try {
      await fetch(`${request.nextUrl.origin}/api/integrations/clear-cache`, { method: "POST" })
    } catch (cacheError) {
      console.log("Cache clear failed:", cacheError)
    }

    return NextResponse.redirect(new URL("/integrations?success=twitter_connected&provider=twitter", request.url))
  } catch (error: any) {
    console.error("Twitter OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&message=${encodeURIComponent(error.message)}&provider=twitter`,
        request.url,
      ),
    )
  }
}
