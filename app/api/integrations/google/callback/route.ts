import { db } from "@/lib/db"
import { google } from "googleapis"
import { type NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")

    if (!code || !state) {
      throw new Error("Missing code or state")
    }

    const session = await getServerSession(authOptions)

    if (!session) {
      return new NextResponse("Unauthorized", { status: 403 })
    }

    // Decode the state parameter
    const decodedState = JSON.parse(decodeURIComponent(state))
    const { provider } = decodedState

    // Validate provider from state
    const validGoogleProviders = ["google-calendar", "google-sheets", "google-docs", "gmail", "youtube"]
    if (!validGoogleProviders.includes(provider)) {
      throw new Error("Invalid Google provider in state")
    }

    // Initialize Google OAuth client
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.NEXT_PUBLIC_GOOGLE_CALLBACK_URL,
    )

    // Exchange code for tokens
    const { tokens } = await oauth2Client.getToken(code)
    const { access_token, refresh_token, expiry_date } = tokens
    if (!access_token || !refresh_token || !expiry_date) {
      throw new Error("Failed to retrieve tokens from Google")
    }

    // Fetch user data from Google
    oauth2Client.setCredentials({ access_token })
    const oauth2 = google.oauth2({ version: "v2", auth: oauth2Client })
    const { data: userData } = await oauth2.userinfo.get()

    if (!userData.id || !userData.email || !userData.name) {
      throw new Error("Failed to retrieve user data from Google")
    }

    const expires_in = Math.floor((expiry_date - Date.now()) / 1000)

    // Map provider to correct scopes for validation
    const scopeMapping = {
      "google-calendar": ["https://www.googleapis.com/auth/calendar"],
      "google-sheets": ["https://www.googleapis.com/auth/spreadsheets"],
      "google-docs": ["https://www.googleapis.com/auth/documents"],
      gmail: ["https://www.googleapis.com/auth/gmail.modify"],
      youtube: ["https://www.googleapis.com/auth/youtube.upload"],
    }

    const integrationData = {
      user_id: session.user.id,
      provider: provider,
      provider_user_id: userData.id,
      access_token,
      refresh_token,
      expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      status: "connected" as const,
      scopes: scopeMapping[provider] || [],
      metadata: {
        user_name: userData.name,
        user_email: userData.email,
        connected_at: new Date().toISOString(),
        google_service: provider,
      },
    }

    // Save integration data to database
    await db.integration.create({
      data: integrationData,
    })

    // Redirect to success page
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/dashboard/integrations?success=true`)
  } catch (error: any) {
    console.error("Google callback error:", error)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/integrations?success=false&error=${error.message}`,
    )
  }
}
