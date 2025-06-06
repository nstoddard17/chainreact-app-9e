import { google } from "googleapis"
import { db } from "@/lib/db"
import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")

    if (!code) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=google_code_missing`)
    }

    if (!state) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=google_state_missing`)
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "https://chainreact.app/api/integrations/google/callback",
    )

    const { tokens } = await oauth2Client.getToken(code)

    if (!tokens.access_token || !tokens.refresh_token) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=google_tokens_missing`)
    }

    const decodedState = JSON.parse(decodeURIComponent(state))

    if (!decodedState?.userId) {
      const baseUrl = "https://chainreact.app"
      return NextResponse.redirect(`${baseUrl}/integrations?error=user_id_missing`)
    }

    await db.user.update({
      where: {
        id: decodedState.userId,
      },
      data: {
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token,
      },
    })

    return NextResponse.redirect(`https://chainreact.app/integrations?success=google_connected`)
  } catch (error) {
    console.error("Google callback error:", error)
    const baseUrl = "https://chainreact.app"
    return NextResponse.redirect(`${baseUrl}/integrations?error=google_callback_failed`)
  }
}
