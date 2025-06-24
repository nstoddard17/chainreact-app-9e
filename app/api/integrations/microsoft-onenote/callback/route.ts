import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { db } from "@/lib/db"
import { integrationTable } from "@/lib/db/schema"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const userId = cookies().get("userId")?.value

  if (!code || !userId) {
    return NextResponse.json({ error: "Missing code or userId" }, { status: 400 })
  }

  try {
    const tokenEndpoint = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
    const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID
    const clientSecret = process.env.MICROSOFT_ONENOTE_CLIENT_SECRET
    const redirectUri = process.env.MICROSOFT_ONENOTE_REDIRECT_URI

    if (!clientId || !clientSecret || !redirectUri) {
      console.error("Missing environment variables for Microsoft OneNote integration.")
      return NextResponse.json({ error: "Missing configuration" }, { status: 500 })
    }

    const tokenParams = new URLSearchParams()
    tokenParams.append("grant_type", "authorization_code")
    tokenParams.append("code", code)
    tokenParams.append("redirect_uri", redirectUri)
    tokenParams.append("client_id", clientId)
    tokenParams.append("client_secret", clientSecret)

    const tokenResponse = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: tokenParams,
    })

    if (!tokenResponse.ok) {
      console.error("Failed to retrieve tokens from Microsoft:", tokenResponse.status, await tokenResponse.text())
      return NextResponse.json({ error: "Failed to retrieve tokens from Microsoft" }, { status: 500 })
    }

    const tokenData = await tokenResponse.json()

    // After getting tokenData
    const expiresIn = tokenData.expires_in
    const refreshExpiresIn = tokenData.refresh_expires_in || 90 * 24 * 60 * 60 // 90 days default
    const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : null
    const refreshTokenExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000)

    const integrationData = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      refresh_token_expires_at: refreshTokenExpiresAt.toISOString(),
    }

    await db
      .insert(integrationTable)
      .values({
        userId: userId,
        type: "microsoft-onenote",
        data: integrationData,
      })
      .onConflictDoUpdate({
        target: [integrationTable.userId, integrationTable.type],
        set: { data: integrationData },
      })

    return NextResponse.redirect(new URL("/dashboard", request.url))
  } catch (error) {
    console.error("Error during Microsoft OneNote integration:", error)
    return NextResponse.json({ error: "Integration failed" }, { status: 500 })
  }
}
