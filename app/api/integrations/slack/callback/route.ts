import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const slackClientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID
const slackClientSecret = process.env.SLACK_CLIENT_SECRET

if (!slackClientId || !slackClientSecret) {
  throw new Error("NEXT_PUBLIC_SLACK_CLIENT_ID and SLACK_CLIENT_SECRET must be defined")
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined")
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
})

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
        connected_at: new Date().toISOString(),
      },
    }

    // Check if integration exists and update or insert
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "slack")
      .single()

    if (existingIntegration) {
      const { error } = await supabase
        .from("integrations")
        .update({ ...integrationData, updated_at: new Date().toISOString() })
        .eq("id", existingIntegration.id)

      if (error) throw error
    } else {
      const { error } = await supabase
        .from("integrations")
        .insert({ ...integrationData, created_at: new Date().toISOString() })

      if (error) throw error
    }

    return NextResponse.redirect(`https://chainreact.app/integrations?success=slack_connected&provider=slack`)
  } catch (error: any) {
    console.error("Error during Slack callback:", error)
    return NextResponse.redirect(
      `https://chainreact.app/integrations?error=slack_oauth_failed&message=${encodeURIComponent(error.message)}`,
    )
  }
}
