import { type NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { Lucia } from "lucia"
import { db } from "@/db"
import { users } from "@/db/schema"
import { eq } from "drizzle-orm"

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const error = searchParams.get("error")

  const baseUrl = "https://chainreact.app"
  const redirectUri = "https://chainreact.app/api/integrations/dropbox/callback"

  if (error) {
    console.error("Dropbox authentication error:", error)
    return NextResponse.redirect(`${baseUrl}/integrations?error=dropbox_auth_failed`)
  }

  if (!code) {
    console.error("No code received from Dropbox")
    return NextResponse.redirect(`${baseUrl}/integrations?error=no_code_received`)
  }

  try {
    const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code: code,
        grant_type: "authorization_code",
        client_id: process.env.DROPBOX_CLIENT_ID!,
        client_secret: process.env.DROPBOX_CLIENT_SECRET!,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      console.error("Failed to retrieve token from Dropbox:", tokenResponse.status, await tokenResponse.text())
      return NextResponse.redirect(`${baseUrl}/integrations?error=dropbox_token_failed`)
    }

    const tokenData = await tokenResponse.json()
    const accessToken = tokenData.access_token
    const accountId = tokenData.account_id

    if (!accessToken) {
      console.error("No access token received from Dropbox")
      return NextResponse.redirect(`${baseUrl}/integrations?error=no_access_token`)
    }

    const sessionId = cookies().get("session")?.value

    if (!sessionId) {
      console.error("No session ID found")
      return NextResponse.redirect(`${baseUrl}/integrations?error=no_session_id`)
    }

    const lucia = new Lucia(undefined, {
      getSessionAttributes: (data) => data,
    })

    const { user } = await lucia.validateSession(sessionId)

    if (!user) {
      console.error("No user found")
      return NextResponse.redirect(`${baseUrl}/integrations?error=no_user_found`)
    }

    // Store the access token and account ID in the database
    await db
      .update(users)
      .set({ dropbox_access_token: accessToken, dropbox_account_id: accountId })
      .where(eq(users.id, user.id))

    return NextResponse.redirect(`https://chainreact.app/integrations?success=dropbox_connected`)
  } catch (e) {
    console.error("Error during Dropbox authentication:", e)
    return NextResponse.redirect(`${baseUrl}/integrations?error=dropbox_auth_error`)
  }
}
