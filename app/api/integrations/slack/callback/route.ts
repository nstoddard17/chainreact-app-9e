import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

const slackClientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID
const slackClientSecret = process.env.SLACK_CLIENT_SECRET

if (!slackClientId || !slackClientSecret) {
  throw new Error("NEXT_PUBLIC_SLACK_CLIENT_ID and SLACK_CLIENT_SECRET must be defined")
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error) {
    console.error("Slack OAuth error:", error)
    return NextResponse.redirect(`https://chainreact.app/integrations?error=slack_oauth_failed`)
  }

  if (!code || !state) {
    console.error("Missing code or state in Slack callback")
    return NextResponse.redirect(`https://chainreact.app/integrations?error=slack_oauth_failed`)
  }

  try {
    // Parse state to get user ID
    const stateData = JSON.parse(atob(state))
    const userId = stateData.userId

    if (!userId) {
      throw new Error("No user ID in state")
    }

    // Initialize Supabase client
    const supabase = createRouteHandlerClient({ cookies })

    // Exchange code for token
    const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: slackClientId,
        client_secret: slackClientSecret,
        code: code,
        redirect_uri: "https://chainreact.app/api/integrations/slack/callback",
      }),
    })

    const tokenData = await tokenResponse.json()

    if (!tokenData.ok) {
      console.error("Slack token exchange error:", tokenData)
      throw new Error(tokenData.error)
    }

    // Fetch user info
    const userInfoResponse = await fetch("https://slack.com/api/users.identity", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    const userData = await userInfoResponse.json()

    if (!userData.ok) {
      console.error("Slack user info error:", userData)
      throw new Error(userData.error)
    }

    const now = new Date().toISOString()
    const integrationData = {
      user_id: userId,
      provider: "slack",
      provider_user_id: userData.user.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
      status: "connected" as const,
      scopes: tokenData.scope ? tokenData.scope.split(",") : [],
      metadata: {
        team_name: userData.team.name,
        team_id: userData.team.id,
        user_name: userData.user.name,
        connected_at: now,
      },
      updated_at: now,
    }

    // Check if integration exists and update or insert
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "slack")
      .maybeSingle()

    if (existingIntegration) {
      const { error } = await supabase.from("integrations").update(integrationData).eq("id", existingIntegration.id)

      if (error) {
        console.error("Error updating Slack integration:", error)
        throw error
      }
    } else {
      const { error } = await supabase.from("integrations").insert({
        ...integrationData,
        created_at: now,
      })

      if (error) {
        console.error("Error inserting Slack integration:", error)
        throw error
      }
    }

    return NextResponse.redirect(`https://chainreact.app/integrations?success=slack_connected&provider=slack`)
  } catch (error: any) {
    console.error("Error during Slack callback:", error)
    return NextResponse.redirect(
      `https://chainreact.app/integrations?error=slack_oauth_failed&message=${encodeURIComponent(error.message)}`,
    )
  }
}
