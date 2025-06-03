import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const scope = searchParams.get("scope")

  console.log("Google OAuth callback:", { code: !!code, state, error, scope })

  if (error) {
    console.error("Google OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=google", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in Google callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=google", request.url))
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    console.log("Decoded state data:", stateData)

    if (!provider || (!provider.startsWith("google") && provider !== "gmail" && provider !== "youtube")) {
      throw new Error("Invalid provider in state")
    }

    // Use the correct redirect URI that matches what we're using in the OAuth flow
    const redirectUri = "https://chainreact.app/api/integrations/google/callback"

    // Exchange code for access token
    console.log("Exchanging code for access token...")
    console.log("Using redirect URI:", redirectUri)

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
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Google token exchange failed:", errorData)
      throw new Error(`Failed to exchange code for token: ${errorData}`)
    }

    const tokenData = await tokenResponse.json()
    console.log("Token exchange successful:", { hasAccessToken: !!tokenData.access_token })
    const { access_token, refresh_token, expires_in, scope: grantedScope } = tokenData

    // Get user info from Google
    console.log("Fetching user info from Google...")
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!userResponse.ok) {
      const errorData = await userResponse.text()
      console.error("Failed to get user info from Google:", errorData)
      throw new Error(`Failed to get user info: ${errorData}`)
    }

    const userData = await userResponse.json()
    console.log("User info fetched successfully:", { userId: userData.id, email: userData.email })

    // Store integration in Supabase
    const supabase = getSupabaseClient()
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      console.error("Session error:", sessionError)
      throw new Error(`Session error: ${sessionError.message}`)
    }

    if (!session) {
      console.error("No session found")
      throw new Error("No session found")
    }

    const integrationData = {
      user_id: session.user.id,
      provider: provider,
      provider_user_id: userData.id,
      status: "connected" as const,
      metadata: {
        access_token,
        refresh_token,
        expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
        user_name: userData.name,
        user_email: userData.email,
        picture: userData.picture,
        scopes: grantedScope ? grantedScope.split(" ") : [],
        connected_at: new Date().toISOString(),
      },
    }

    console.log("Saving integration to database...", {
      userId: session.user.id,
      provider: provider,
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

    console.log("Google integration saved successfully")
    return NextResponse.redirect(new URL(`/integrations?success=${provider}_connected`, request.url))
  } catch (error: any) {
    console.error("Google OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=google&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
