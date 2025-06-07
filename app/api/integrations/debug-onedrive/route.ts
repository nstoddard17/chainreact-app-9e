import { type NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get("code")

  if (!code) {
    return NextResponse.json({ error: "No code provided" }, { status: 400 })
  }

  const clientId = process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID
  const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET
  const redirectUri = `${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/onedrive/callback`

  try {
    // Exchange code for token
    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId!,
        redirect_uri: redirectUri,
        client_secret: clientSecret!,
        code: code,
        grant_type: "authorization_code",
      }),
    })

    const tokenData = await tokenResponse.json()

    if (!tokenResponse.ok) {
      return NextResponse.json(
        {
          error: "Token exchange failed",
          details: tokenData,
        },
        { status: 400 },
      )
    }

    // Try to get user info
    const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "Content-Type": "application/json",
      },
    })

    const userResult = userResponse.ok ? await userResponse.json() : await userResponse.text()

    return NextResponse.json({
      tokenData: {
        scope: tokenData.scope,
        token_type: tokenData.token_type,
        expires_in: tokenData.expires_in,
        hasAccessToken: !!tokenData.access_token,
        hasRefreshToken: !!tokenData.refresh_token,
      },
      userApiStatus: userResponse.status,
      userApiResult: userResult,
      userApiHeaders: Object.fromEntries(userResponse.headers.entries()),
    })
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Debug failed",
        message: error.message,
      },
      { status: 500 },
    )
  }
}
