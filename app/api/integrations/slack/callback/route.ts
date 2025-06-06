import { type NextRequest, NextResponse } from "next/server"
import { SlackOAuthService } from "@/lib/oauth/slack"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error) {
    console.error("Error during Slack OAuth:", error)
    return NextResponse.redirect(`https://chainreact.app/integrations?error=slack_oauth_failed&provider=slack`)
  }

  if (!code || !state) {
    console.error("No code or state provided in Slack OAuth callback")
    return NextResponse.redirect(`https://chainreact.app/integrations?error=slack_oauth_failed&provider=slack`)
  }

  try {
    const stateData = JSON.parse(atob(state))
    const { userId } = stateData

    if (!userId) {
      throw new Error("Missing user ID in state")
    }

    const redirectUri = "https://chainreact.app/api/integrations/slack/callback"
    const tokenData = await SlackOAuthService.exchangeCodeForToken(code, redirectUri)

    if (!tokenData.ok) {
      console.error("Slack OAuth failed:", tokenData.error)
      return NextResponse.redirect(`https://chainreact.app/integrations?error=slack_oauth_failed&provider=slack`)
    }

    const accessToken = tokenData.access_token
    const teamId = tokenData.team?.id
    const slackUserId = tokenData.authed_user?.id
    const scopes = tokenData.authed_user?.scope ? tokenData.authed_user.scope.split(",") : []

    // Get user info
    const userInfo = await SlackOAuthService.validateTokenAndGetUserInfo(accessToken)

    const integrationData = {
      user_id: userId,
      provider: "slack",
      provider_user_id: slackUserId,
      access_token: accessToken,
      refresh_token: tokenData.refresh_token,
      status: "connected" as const,
      scopes: scopes,
      metadata: {
        team_id: teamId,
        team_name: tokenData.team?.name,
        user_name: userInfo.user?.name,
        connected_at: new Date().toISOString(),
      },
    }

    const { error: dbError } = await supabase.from("integrations").insert(integrationData)
    if (dbError) {
      console.error("Error saving Slack integration:", dbError)
      throw dbError
    }

    console.log("Slack OAuth successful")
    return NextResponse.redirect(`https://chainreact.app/integrations?success=slack_connected&provider=slack`)
  } catch (e: any) {
    console.error("Error during Slack OAuth:", e)
    return NextResponse.redirect(
      `https://chainreact.app/integrations?error=slack_oauth_failed&provider=slack&message=${encodeURIComponent(e.message)}`,
    )
  }
}
