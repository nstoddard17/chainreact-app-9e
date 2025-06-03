import { type NextRequest, NextResponse } from "next/server"
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { getSupabaseClient } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("GitLab OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("GitLab OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=gitlab", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in GitLab callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=gitlab", request.url))
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    console.log("Decoded state data:", stateData)

    if (provider !== "gitlab") {
      throw new Error("Invalid provider in state")
    }

    // Exchange code for access token
    console.log("Exchanging code for access token...")
    const tokenResponse = await fetch("https://gitlab.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID!,
        client_secret: process.env.GITLAB_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${request.nextUrl.origin}/api/integrations/gitlab/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("GitLab token exchange failed:", errorData)
      throw new Error(`Failed to exchange code for token: ${errorData}`)
    }

    const tokenData = await tokenResponse.json()
    console.log("Token exchange successful:", { hasAccessToken: !!tokenData.access_token })
    const { access_token, refresh_token, expires_in } = tokenData

    // Get user info from GitLab
    console.log("Fetching user info from GitLab...")
    const userResponse = await fetch("https://gitlab.com/api/v4/user", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!userResponse.ok) {
      const errorData = await userResponse.text()
      console.error("Failed to get user info from GitLab:", errorData)
      throw new Error(`Failed to get user info: ${errorData}`)
    }

    const userData = await userResponse.json()
    console.log("User info fetched successfully:", { userId: userData.id })

    // Get session using server component client
    console.log("Retrieving user session...")
    let session = null
    let supabase = null

    try {
      supabase = createServerComponentClient({ cookies })
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

      if (sessionError) {
        console.error("Server session error:", sessionError)
        throw sessionError
      }

      session = sessionData.session
      console.log("Server session retrieved:", { hasSession: !!session })
    } catch (serverError) {
      console.warn("Server session failed, trying fallback:", serverError)

      // Fallback to regular client
      supabase = getSupabaseClient()
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

      if (sessionError) {
        console.error("Fallback session error:", sessionError)
        throw new Error(`Session error: ${sessionError.message}`)
      }

      session = sessionData.session
      console.log("Fallback session retrieved:", { hasSession: !!session })
    }

    if (!session) {
      console.error("No session found after all attempts")
      throw new Error("No session found")
    }

    const integrationData = {
      user_id: session.user.id,
      provider: "gitlab",
      provider_user_id: userData.id.toString(),
      access_token,
      refresh_token,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status: "connected" as const,
      scopes: ["api", "read_repository", "write_repository"],
      metadata: {
        username: userData.username,
        user_name: userData.name,
        user_email: userData.email,
        avatar_url: userData.avatar_url,
        connected_at: new Date().toISOString(),
      },
    }

    console.log("Saving integration to database...", {
      userId: session.user.id,
      provider: "gitlab",
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

    console.log("GitLab integration saved successfully")
    return NextResponse.redirect(new URL("/integrations?success=gitlab_connected", request.url))
  } catch (error: any) {
    console.error("GitLab OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=gitlab&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
