import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { db } from "@/lib/db"
import { auth } from "@/lib/auth"

export const GET = async (req: NextRequest): Promise<NextResponse> => {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")

  if (!code || !state) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  const storedState = cookies().get("onedrive_oauth_state")?.value ?? null

  if (!storedState || storedState !== state) {
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }

  try {
    const tokenURL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    const client_id = process.env.ONEDRIVE_CLIENT_ID
    const client_secret = process.env.ONEDRIVE_CLIENT_SECRET
    const redirect_uri = process.env.ONEDRIVE_REDIRECT_URI

    if (!client_id || !client_secret || !redirect_uri) {
      throw new Error("Missing OneDrive environment variables")
    }

    const tokenParams = new URLSearchParams({
      client_id: client_id,
      client_secret: client_secret,
      grant_type: "authorization_code",
      code: code,
      redirect_uri: redirect_uri,
      scope: "offline_access files.readwrite.all",
    })

    const tokenResponse = await fetch(tokenURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenParams.toString(),
    })

    if (!tokenResponse.ok) {
      console.error("OneDrive token exchange failed:", tokenResponse.status, await tokenResponse.text())
      throw new Error("Failed to exchange code for token")
    }

    const tokenData = await tokenResponse.json()

    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token

    if (!accessToken || !refreshToken) {
      throw new Error("Missing access token or refresh token")
    }

    const user = await auth.validate()

    if (!user) {
      return NextResponse.redirect(new URL("/login", req.url))
    }

    const expiresIn = tokenData.expires_in
    const refreshExpiresIn = tokenData.refresh_expires_in || 90 * 24 * 60 * 60 // 90 days default for Microsoft
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null
    const refreshTokenExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000)

    await db.integration.create({
      data: {
        userId: user.user.userId,
        type: "onedrive",
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt?.toISOString() || null,
        refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
      },
    })

    return NextResponse.redirect(new URL("/dashboard", req.url))
  } catch (e) {
    console.error("OneDrive integration failed:", e)
    return NextResponse.redirect(new URL("/dashboard", req.url))
  }
}
