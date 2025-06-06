import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const slackClientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID
const slackClientSecret = process.env.SLACK_CLIENT_SECRET

if (!slackClientId || !slackClientSecret) {
  throw new Error("NEXT_PUBLIC_SLACK_CLIENT_ID and SLACK_CLIENT_SECRET must be defined")
}

// Use direct Supabase client with service role for reliable database operations
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
    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Failed to parse state:", e)
      return NextResponse.redirect(`https://chainreact.app/integrations?error=invalid_state`)
    }

    const userId = stateData.userId

    if (!userId) {
      console.error("No user ID in state")
      return NextResponse.redirect(`https://chainreact.app/integrations?error=missing_user_id`)
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
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=token_exchange_failed&message=${encodeURIComponent(tokenData.error || "Unknown error")}`,
      )
    }

    // Use authed_user.id from token response as provider_user_id
    const providerUserId = tokenData.authed_user?.id

    if (!providerUserId) {
      console.error("No user ID in token response:", tokenData)
      return NextResponse.redirect(`https://chainreact.app/integrations?error=missing_provider_user_id`)
    }

    const now = new Date().toISOString()
    const integrationData = {
      user_id: userId,
      provider: "slack",
      provider_user_id: providerUserId,
      access_token: tokenData.authed_user.access_token || tokenData.access_token,
      refresh_token: tokenData.authed_user.refresh_token || tokenData.refresh_token,
      expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
      status: "connected",
      scopes: tokenData.authed_user.scope
        ? tokenData.authed_user.scope.split(",")
        : tokenData.scope
          ? tokenData.scope.split(",")
          : [],
      metadata: {
        team_name: tokenData.team?.name || "Unknown Team",
        team_id: tokenData.team?.id || "unknown",
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
        return NextResponse.redirect(`https://chainreact.app/integrations?error=database_update_failed`)
      }
    } else {
      const { error } = await supabase.from("integrations").insert({
        ...integrationData,
        created_at: now,
      })

      if (error) {
        console.error("Error inserting Slack integration:", error)
        return NextResponse.redirect(`https://chainreact.app/integrations?error=database_insert_failed`)
      }
    }

    // Add a delay to ensure database operations complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    return NextResponse.redirect(
      `https://chainreact.app/integrations?success=slack_connected&provider=slack&t=${Date.now()}`,
    )
  } catch (error: any) {
    console.error("Error during Slack callback:", error)
    return NextResponse.redirect(
      `https://chainreact.app/integrations?error=slack_oauth_failed&message=${encodeURIComponent(error.message)}`,
    )
  }
}
