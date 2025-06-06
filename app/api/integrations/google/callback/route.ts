import { type NextRequest, NextResponse } from "next/server"
import { GoogleOAuthService } from "@/lib/oauth/google"

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    // Handle OAuth errors from provider
    if (error) {
      console.error(`Google OAuth error:`, error)
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=oauth_denied&provider=google&message=${encodeURIComponent(error)}`,
      )
    }

    // Validate required parameters
    if (!code || !state) {
      console.error(`Missing code or state in Google callback`)
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=missing_params&provider=google&message=Authorization+code+or+state+not+received`,
      )
    }

    // Parse state to get user information
    let stateData
    try {
      stateData = JSON.parse(Buffer.from(state, "base64").toString())
    } catch (error) {
      console.error("Invalid state parameter:", error)
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=invalid_state&provider=google&message=Invalid+state+parameter`,
      )
    }

    // Get user ID from state
    const userId = stateData.userId

    // If no user ID in state, redirect to error
    if (!userId) {
      console.error(`No user ID found in Google OAuth callback`)
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=missing_user_id&provider=google&message=User+ID+not+found+in+state`,
      )
    }

    // Handle the OAuth callback
    const result = await GoogleOAuthService.handleCallback("google", code, state, userId)

    // Redirect based on result
    return NextResponse.redirect(result.redirectUrl)
  } catch (error: any) {
    console.error(`Google OAuth callback error:`, error)
    return NextResponse.redirect(
      `https://chainreact.app/integrations?error=callback_failed&provider=google&message=${encodeURIComponent(
        error.message || "An unexpected error occurred",
      )}`,
    )
  }
}
