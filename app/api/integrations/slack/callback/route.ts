import { getBaseUrl } from "@/lib/utils/getBaseUrl"
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
    return NextResponse.redirect(`${getBaseUrl(request)}/integrations?error=slack_oauth_failed&message=${error}`)
  }

  if (!code || !state) {
    console.error("Missing code or state in Slack callback")
    return NextResponse.redirect(`${getBaseUrl(request)}/integrations?error=slack_oauth_failed`)
  }

  try {
    // Parse state to get user ID
    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Failed to parse state:", e)
      return NextResponse.redirect(`${getBaseUrl(request)}/integrations?error=invalid_state`)
    }

    const userId = stateData.userId

    if (!userId) {
      console.error("No user ID in state")
      return NextResponse.redirect(`${getBaseUrl(request)}/integrations?error=missing_user_id`)
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
        redirect_uri: `${getBaseUrl(request)}/api/integrations/slack/callback`,
      }),
    })

    const tokenData = await tokenResponse.json()
    console.log("Token response:", JSON.stringify(tokenData, null, 2))

    if (!tokenData.ok) {
      console.error("Slack token exchange error:", tokenData)
      return NextResponse.redirect(
        `${getBaseUrl(request)}/integrations?error=token_exchange_failed&message=${encodeURIComponent(tokenData.error || "Unknown error")}`,
      )
    }

    // Slack OAuth v2 returns different token structure
    const botToken = tokenData.access_token // Bot token
    const userToken = tokenData.authed_user?.access_token // User token
    const teamInfo = tokenData.team
    const authedUser = tokenData.authed_user
    const botUserId = tokenData.bot_user_id

    if (!botToken) {
      console.error("No bot token in response")
      return NextResponse.redirect(`${getBaseUrl(request)}/integrations?error=missing_bot_token`)
    }

    // Use bot token to get team/workspace info
    const teamInfoResponse = await fetch("https://slack.com/api/team.info", {
      headers: {
        Authorization: `Bearer ${botToken}`,
      },
    })

    const teamInfoData = await teamInfoResponse.json()

    // Get bot info
    const botInfoResponse = await fetch("https://slack.com/api/auth.test", {
      headers: {
        Authorization: `Bearer ${botToken}`,
      },
    })

    const botInfoData = await botInfoResponse.json()

    if (!botInfoData.ok) {
      console.error("Bot info error:", botInfoData)
      return NextResponse.redirect(
        `${getBaseUrl(request)}/integrations?error=bot_info_failed&message=${encodeURIComponent(botInfoData.error || "Unknown error")}`,
      )
    }

    const now = new Date().toISOString()

    // Extract all granted scopes
    const botScopes = tokenData.scope ? tokenData.scope.split(",") : []
    const userScopes = authedUser?.scope ? authedUser.scope.split(",") : []
    const allScopes = [...botScopes, ...userScopes]

    const integrationData = {
      user_id: userId,
      provider: "slack",
      provider_user_id: authedUser?.id || botInfoData.user_id,
      access_token: botToken, // Store bot token as primary
      refresh_token: tokenData.refresh_token,
      expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
      status: "connected",
      scopes: allScopes,
      metadata: {
        team_name: teamInfo?.name || teamInfoData?.team?.name || "Unknown Team",
        team_id: teamInfo?.id || teamInfoData?.team?.id || "unknown",
        user_token: userToken, // Store user token in metadata
        bot_user_id: botUserId || botInfoData.user_id,
        connected_at: now,
        app_id: tokenData.app_id,
        is_enterprise_install: tokenData.is_enterprise_install,
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
        return NextResponse.redirect(`${getBaseUrl(request)}/integrations?error=database_update_failed`)
      }
    } else {
      const { error } = await supabase.from("integrations").insert({
        ...integrationData,
        created_at: now,
      })

      if (error) {
        console.error("Error inserting Slack integration:", error)
        return NextResponse.redirect(`${getBaseUrl(request)}/integrations?error=database_insert_failed`)
      }
    }

    // Add a delay to ensure database operations complete
    await new Promise((resolve) => setTimeout(resolve, 1000))

    return NextResponse.redirect(
      `${getBaseUrl(request)}/integrations?success=slack_connected&provider=slack&t=${Date.now()}`,
    )
  } catch (error: any) {
    console.error("Error during Slack callback:", error)
    return NextResponse.redirect(
      `${getBaseUrl(request)}/integrations?error=slack_oauth_failed&message=${encodeURIComponent(error.message)}`,
    )
  }
}
