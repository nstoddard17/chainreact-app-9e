import { type NextRequest, NextResponse } from "next/server"
import { getSlackClient } from "@/app/api/integrations/slack/slack-client"

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get("code")
  const error = searchParams.get("error")

  const baseUrl = "https://chainreact.app"

  if (error) {
    console.error("Error during Slack OAuth:", error)
    return NextResponse.redirect(`${baseUrl}/integrations?error=slack_oauth_failed`)
  }

  if (!code) {
    console.error("No code provided in Slack OAuth callback")
    return NextResponse.redirect(`${baseUrl}/integrations?error=slack_oauth_failed`)
  }

  try {
    const redirectUri = "https://chainreact.app/api/integrations/slack/callback"
    const slackClient = await getSlackClient()
    const result = await slackClient.oauth.v2.access({
      client_id: process.env.SLACK_CLIENT_ID,
      client_secret: process.env.SLACK_CLIENT_SECRET,
      code: code,
      redirect_uri: redirectUri,
    })

    if (!result.ok) {
      console.error("Slack OAuth failed:", result.error)
      return NextResponse.redirect(`${baseUrl}/integrations?error=slack_oauth_failed`)
    }

    // TODO: Store the access token and other relevant information in your database
    // You can access the team ID, user ID, and access token from the result object.
    // Example:
    const accessToken = result.access_token
    const teamId = result.team?.id
    const userId = result.authed_user?.id

    console.log("Slack OAuth successful:", { accessToken, teamId, userId })

    return NextResponse.redirect(`https://chainreact.app/integrations?success=slack_connected`)
  } catch (e: any) {
    console.error("Error during Slack OAuth:", e)
    return NextResponse.redirect(`${baseUrl}/integrations?error=slack_oauth_failed`)
  }
}
