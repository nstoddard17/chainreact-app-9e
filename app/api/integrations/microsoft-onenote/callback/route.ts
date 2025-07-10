import { NextRequest, NextResponse } from "next/server"

const CLIENT_ID = process.env.MS_ONENOTE_CLIENT_ID
const CLIENT_SECRET = process.env.MS_ONENOTE_CLIENT_SECRET
const REDIRECT_URI = process.env.MS_ONENOTE_REDIRECT_URI

async function exchangeCodeForToken(code: string) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID!,
    client_secret: CLIENT_SECRET!,
    code,
    redirect_uri: REDIRECT_URI!,
    grant_type: "authorization_code",
  })
  const res = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  })
  return res.json()
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  if (!code) {
    return NextResponse.redirect("/integrations?error=missing_code")
  }
  try {
    const tokenData = await exchangeCodeForToken(code)
    if (!tokenData.access_token) {
      return NextResponse.redirect("/integrations?error=token_exchange_failed")
    }
    // TODO: Save tokens to DB for the user (use state to identify user/session)
    // await saveIntegrationTokens({ provider: "microsoft-onenote", ...tokenData, state })
    return NextResponse.redirect("/integrations?success=onenote_connected")
  } catch (e) {
    return NextResponse.redirect("/integrations?error=callback_exception")
  }
}
