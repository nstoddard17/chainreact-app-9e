import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
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
  const userId = cookies().get("user_id")?.value

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 })
  }

  if (!userId) {
    return NextResponse.json({ error: "No user ID provided" }, { status: 400 })
  }

  try {
    // Exchange code for token
    const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: slackClientId,
        client_secret: slackClientSecret,
        code: code!,
        redirect_uri: "https://chainreact.app/api/integrations/slack/callback", // Replace with your actual redirect URI
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
