import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Slack OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Slack OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=slack", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in Slack callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=slack", request.url))
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    console.log("Decoded state data:", stateData)

    if (provider !== "slack") {
      throw new Error("Invalid provider in state")
    }

    // Exchange code for access token
    console.log("Exchanging code for access token...")
    const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_SLACK_CLIENT_ID!,
        client_secret: process.env.SLACK_CLIENT_SECRET!,
        code,
        redirect_uri: `${request.nextUrl.origin}/api/integrations/slack/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Slack token exchange failed:", errorData)
      throw new Error(`Failed to exchange code for token: ${errorData}`)
    }

    const tokenData = await tokenResponse.json()
    console.log("Token exchange successful:", { ok: tokenData.ok, hasAccessToken: !!tokenData.access_token })

    if (!tokenData.ok) {
      throw new Error(`Slack API error: ${tokenData.error}`)
    }

    const { access_token, refresh_token, expires_in } = tokenData
    const { team, authed_user } = tokenData

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
      provider: "slack",
      provider_user_id: authed_user.id,
      access_token,
      refresh_token,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status: "connected" as const,
      scopes: tokenData.scope ? tokenData.scope.split(",") : [],
      metadata: {
        team_id: team.id,
        team_name: team.name,
        user_id: authed_user.id,
        connected_at: new Date().toISOString(),
      },
    }

    console.log("Saving integration to database...", {
      userId: session.user.id,
      provider: "slack",
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

    console.log("Slack integration saved successfully")
    return NextResponse.redirect(new URL("/integrations?success=slack_connected", request.url))
  } catch (error: any) {
    console.error("Slack OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=slack&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
