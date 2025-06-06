import { db } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { google } from "googleapis"
import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { generateId } from "lucia"
import { lucia } from "@/lib/auth"

async function getGoogleOAuthClient() {
  const redirectUri = process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI

  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !redirectUri) {
    throw new Error("Missing Google OAuth credentials")
  }

  const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri,
  )

  return oAuth2Client
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")

    if (!code) {
      return NextResponse.json({ error: "Missing authorization code" }, { status: 400 })
    }

    const oAuth2Client = await getGoogleOAuthClient()

    const { tokens } = await oAuth2Client.getToken(code)
    oAuth2Client.setCredentials(tokens)

    const oauth2 = google.oauth2({
      auth: oAuth2Client,
      version: "v2",
    })

    const googleUser = await oauth2.userinfo.get()

    if (!googleUser.data.email) {
      return NextResponse.json({ error: "Failed to retrieve email from Google" }, { status: 400 })
    }

    const existingUser = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, googleUser.data.email!),
    })

    if (existingUser) {
      const session = await lucia.createSession(existingUser.id, {})
      const sessionCookie = lucia.createSessionCookie(session.id)
      cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)
      return NextResponse.redirect(new URL("/", request.url))
    }

    const userId = generateId(15)
    await db.insert(users).values({
      id: userId,
      email: googleUser.data.email!,
      name: googleUser.data.name,
    })

    const session = await lucia.createSession(userId, {})
    const sessionCookie = lucia.createSessionCookie(session.id)
    cookies().set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes)
    return NextResponse.redirect(new URL("/", request.url))
  } catch (error) {
    console.error("Google OAuth callback error:", error)
    return NextResponse.json({ error: "Failed to authenticate with Google" }, { status: 500 })
  }
}
