import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")

    if (!code) {
      const error = searchParams.get("error")
      const error_description = searchParams.get("error_description")
      console.error("Airtable OAuth Error:", error, error_description)
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=airtable_auth_failed`)
    }

    if (!state) {
      console.error("Missing state parameter")
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_state`)
    }

    const storedState = cookies().get("airtable_oauth_state")?.value

    if (state !== storedState) {
      console.error("State mismatch")
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=state_mismatch`)
    }

    cookies().delete("airtable_oauth_state")

    const redirectUri = "https://chainreact.app/api/integrations/airtable/callback"
    const clientId = process.env.AIRTABLE_CLIENT_ID
    const clientSecret = process.env.AIRTABLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error("Missing Airtable client ID or secret")
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_credentials`)
    }

    const tokenEndpoint = "https://airtable.com/oauth/v2/token"

    const params = new URLSearchParams({
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirectUri,
    })

    const authString = `${clientId}:${clientSecret}`
    const encodedAuth = Buffer.from(authString).toString("base64")

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${encodedAuth}`,
      },
      body: params,
    })

    if (!response.ok) {
      console.error("Failed to retrieve Airtable access token", response.status, await response.text())
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=token_retrieval_failed`)
    }

    const data = await response.json()
    const accessToken = data.access_token

    if (!accessToken) {
      console.error("Missing access token in response")
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_access_token`)
    }

    cookies().set("airtable_access_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    })

    return NextResponse.redirect(`https://chainreact.app/integrations?success=airtable_connected`)
  } catch (error) {
    console.error("Airtable OAuth Callback Error:", error)
    const baseUrl = "https://chainreact.app"
    return NextResponse.redirect(`${baseUrl}/integrations?error=airtable_callback_error`)
  }
}
