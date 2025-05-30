import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code || !state) {
    return NextResponse.redirect(new URL("/integrations?error=missing_params", request.url))
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.redirect(new URL("/auth/login", request.url))
    }

    // Exchange code for access token
    const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_SLACK_CLIENT_ID!,
        client_secret: process.env.SLACK_CLIENT_SECRET!,
        code,
        redirect_uri: `${new URL(request.url).origin}/api/integrations/slack/callback`,
      }),
    })

    const tokenData = await tokenResponse.json()

    if (!tokenData.ok) {
      throw new Error(tokenData.error || "Failed to exchange code for token")
    }

    // Store integration in database
    const { error } = await supabase.from("integrations").upsert({
      user_id: session.user.id,
      provider: "slack",
      provider_user_id: tokenData.authed_user?.id,
      access_token: tokenData.access_token,
      scopes: tokenData.scope?.split(",") || [],
      metadata: {
        team_id: tokenData.team?.id,
        team_name: tokenData.team?.name,
        bot_user_id: tokenData.bot_user_id,
      },
      status: "connected",
    })

    if (error) {
      throw error
    }

    return NextResponse.redirect(new URL("/integrations?success=slack_connected", request.url))
  } catch (error) {
    console.error("Slack OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_failed", request.url))
  }
}
