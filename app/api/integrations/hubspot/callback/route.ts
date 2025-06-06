import { type NextRequest, NextResponse } from "next/server"
import { getHubSpotClient } from "@/lib/hubspot"

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")
  const baseUrl = "https://chainreact.app"
  const redirectUri = "https://chainreact.app/api/integrations/hubspot/callback"

  if (!code) {
    console.error("No code received")
    return NextResponse.redirect(`${baseUrl}/integrations?error=hubspot_no_code`)
  }

  try {
    const hubspotClient = getHubSpotClient()
    const tokenData = await hubspotClient.oauth.defaultApi.createToken(
      "authorization_code",
      code,
      redirectUri,
      process.env.HUBSPOT_CLIENT_ID!,
      process.env.HUBSPOT_CLIENT_SECRET!,
    )

    if (!tokenData.accessToken || !tokenData.refreshToken) {
      console.error("Failed to retrieve tokens from HubSpot")
      return NextResponse.redirect(`${baseUrl}/integrations?error=hubspot_token_error`)
    }

    const accessToken = tokenData.accessToken
    const refreshToken = tokenData.refreshToken
    const expiresIn = tokenData.expiresIn

    // Store the tokens securely (e.g., in a database)
    // For demonstration purposes, we'll just log them
    console.log("HubSpot Access Token:", accessToken)
    console.log("HubSpot Refresh Token:", refreshToken)
    console.log("Expires In:", expiresIn)

    return NextResponse.redirect(`https://chainreact.app/integrations?success=hubspot_connected`)
  } catch (error: any) {
    console.error("HubSpot OAuth Error:", error)
    return NextResponse.redirect(`${baseUrl}/integrations?error=hubspot_oauth_error`)
  }
}
