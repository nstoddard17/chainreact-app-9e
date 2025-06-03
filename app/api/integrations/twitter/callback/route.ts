import { type NextRequest, NextResponse } from "next/server"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Twitter OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Twitter OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=twitter", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in Twitter callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=twitter", request.url))
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    console.log("Decoded state data:", stateData)

    if (provider !== "twitter") {
      throw new Error("Invalid provider in state")
    }

    // Use hardcoded redirect URI for Twitter
    const redirectUri = "https://chainreact.app/api/integrations/twitter/callback"
    console.log("Using redirect URI for token exchange:", redirectUri)

    // Exchange code for access token
    console.log("Exchanging code for access token...")
    const tokenResponse = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID + ":" + process.env.TWITTER_CLIENT_SECRET,
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID!,
        redirect_uri: redirectUri,
        code_verifier: "challenge",
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Twitter token exchange failed:", errorData)
      throw new Error(`Failed to exchange code for token: ${errorData}`)
    }

    const tokenData = await tokenResponse.json()
    console.log("Token exchange successful:", { hasAccessToken: !!tokenData.access_token })
    const { access_token, refresh_token, expires_in } = tokenData

    // Get user info from Twitter
    console.log("Fetching user info from Twitter...")
    const userResponse = await fetch("https://api.twitter.com/2/users/me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!userResponse.ok) {
      const errorData = await userResponse.text()
      console.error("Failed to get user info from Twitter:", errorData)
      throw new Error(`Failed to get user info: ${errorData}`)
    }

    const userData = await userResponse.json()
    const user = userData.data
    console.log("User info fetched successfully:", { userId: user.id })

    // Get session using server component client - this is the source of truth
    const supabase = createServerComponentClient({ cookies })
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

    if (sessionError) {
      console.error("Twitter: Error retrieving session:", sessionError)
      throw new Error(`Session error: ${sessionError.message}`)
    }

    if (!sessionData?.session) {
      console.error("Twitter: No session found")
      throw new Error("No session found")
    }

    console.log("Twitter: Session successfully retrieved for user:", sessionData.session.user.id)

    const integrationData = {
      user_id: sessionData.session.user.id,
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

    console.log("Saving integration to database...", {
      userId: sessionData.session.user.id,
      provider: "twitter",
      reconnect,
      integrationId,
    })

    if (reconnect && integrationId) {
      // Update existing integration
      const { error } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integrationId)

      if (error) {
        console.error("Error updating integration:", error)
        throw error
      }
      console.log("Integration updated successfully")
    } else {
      // Create new integration
      const { error } = await supabase.from("integrations").insert(integrationData)
      if (error) {
        console.error("Error inserting integration:", error)
        throw error
      }
      console.log("Integration created successfully")
    }

    console.log("Twitter integration saved successfully")
    return NextResponse.redirect(new URL("/integrations?success=twitter_connected", request.url))
  } catch (error: any) {
    console.error("Twitter OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=twitter&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
