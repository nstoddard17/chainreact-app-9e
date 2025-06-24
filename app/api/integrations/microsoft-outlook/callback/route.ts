import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { db } from "@/lib/db"
import { lucia } from "@/lib/auth"
import { generateId } from "lucia"

const microsoft = {
  clientId: process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID ?? "",
  clientSecret: process.env.MICROSOFT_CLIENT_SECRET ?? "",
  redirectUri: process.env.MICROSOFT_REDIRECT_URI ?? "",
}

export const GET = async (request: NextRequest): Promise<NextResponse> => {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code || !state) {
    return NextResponse.json({ error: "Missing code or state" }, { status: 400 })
  }

  const storedState = cookies().get("microsoft_oauth_state")?.value ?? null

  if (storedState !== state) {
    return NextResponse.json({ error: "Invalid state" }, { status: 400 })
  }

  try {
    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: microsoft.clientId,
        client_secret: microsoft.clientSecret,
        code: code,
        redirect_uri: microsoft.redirectUri,
        grant_type: "authorization_code",
      }),
    })

    const tokenData = await tokenResponse.json()

    if (tokenData.error) {
      console.error("Microsoft OAuth Error:", tokenData.error_description || tokenData.error)
      return NextResponse.json({ error: "Failed to retrieve tokens from Microsoft" }, { status: 500 })
    }

    const expiresIn = tokenData.expires_in
    const refreshExpiresIn = tokenData.refresh_expires_in || 90 * 24 * 60 * 60 // 90 days default
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null
    const refreshTokenExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000)

    const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    const profileData = await profileResponse.json()

    if (!profileData.id || !profileData.mail) {
      console.error("Microsoft Profile Error:", profileData)
      return NextResponse.json({ error: "Failed to retrieve profile from Microsoft" }, { status: 500 })
    }

    const userId = generateId(21)
    const integrationId = generateId(21)

    await db.user.create({
      data: {
        id: userId,
        email: profileData.mail,
        email_verified: true,
        accounts: {
          create: {
            id: integrationId,
            provider: "microsoft",
            providerAccountId: profileData.id,
          },
        },
      },
    })

    const session = await lucia.createSession(userId, {})
    const sessionCookie = lucia.createSessionCookie(session.id)
    cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)

    await db.integration.create({
      data: {
        id: integrationId,
        userId: userId,
        type: "microsoft-outlook",
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: expiresAt?.toISOString(),
        refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
        email: profileData.mail,
      },
    })

    return NextResponse.redirect(new URL("/", request.url), 302)
  } catch (error) {
    console.error("OAuth Error:", error)
    return NextResponse.json({ error: "OAuth failed" }, { status: 500 })
  }
}
