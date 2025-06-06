import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { db } from "@/lib/db"
import { onedrive_auth_state } from "@/lib/db/schema"

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const error_description = searchParams.get("error_description")

  const baseUrl = "https://chainreact.app"
  const redirectUri = "https://chainreact.app/api/integrations/onedrive/callback"

  if (error) {
    console.error("OneDrive Auth Error:", error, error_description)
    return NextResponse.redirect(`${baseUrl}/integrations?error=onedrive_auth_failed`)
  }

  if (!code || !state) {
    console.error("Missing code or state")
    return NextResponse.redirect(`${baseUrl}/integrations?error=missing_code_or_state`)
  }

  try {
    const storedState = cookies().get("onedrive_auth_state")?.value

    if (!storedState || state !== storedState) {
      console.error("State mismatch")
      return NextResponse.redirect(`${baseUrl}/integrations?error=state_mismatch`)
    }

    const userId = cookies().get("user_id")?.value

    if (!userId) {
      console.error("Missing user ID")
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_user_id`)
    }

    const tokenEndpoint = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    const clientId = process.env.ONEDRIVE_CLIENT_ID
    const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error("Missing OneDrive client ID or secret")
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_client_credentials`)
    }

    const body = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      client_secret: clientSecret,
      code: code,
      grant_type: "authorization_code",
    })

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    })

    if (!response.ok) {
      console.error("Token request failed", response)
      return NextResponse.redirect(`${baseUrl}/integrations?error=token_request_failed`)
    }

    const data = await response.json()
    const accessToken = data.access_token
    const refreshToken = data.refresh_token
    const expires_in = data.expires_in

    if (!accessToken || !refreshToken) {
      console.error("Missing access token or refresh token")
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_tokens`)
    }

    // Store the tokens in the database
    await db
      .insert(onedrive_auth_state)
      .values({
        userId: userId,
        accessToken: accessToken,
        refreshToken: refreshToken,
        expiresIn: expires_in,
      })
      .onConflictDoUpdate({
        target: onedrive_auth_state.userId,
        set: {
          accessToken: accessToken,
          refreshToken: refreshToken,
          expiresIn: expires_in,
        },
      })

    return NextResponse.redirect(`https://chainreact.app/integrations?success=onedrive_connected`)
  } catch (e: any) {
    console.error("Error during OneDrive auth:", e)
    return NextResponse.redirect(`${baseUrl}/integrations?error=onedrive_auth_failed`)
  }
}
