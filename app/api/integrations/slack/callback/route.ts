import { type NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { SlackOAuthService } from "@/lib/oauth/slack"
import { parseOAuthState } from "@/lib/oauth/utils"

export async function GET(request: NextRequest) {
  try {
    // Get code and state from query parameters
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    if (error) {
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=provider_error&provider=slack&message=${encodeURIComponent(
          `Slack returned an error: ${error}`,
        )}`,
      )
    }

    if (!code) {
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=missing_code&provider=slack&message=${encodeURIComponent(
          "Missing authorization code",
        )}`,
      )
    }

    if (!state) {
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=missing_state&provider=slack&message=${encodeURIComponent(
          "Missing state parameter",
        )}`,
      )
    }

    // Parse state to get user ID
    let stateData
    try {
      stateData = parseOAuthState(state)
    } catch (error) {
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=invalid_state&provider=slack&message=${encodeURIComponent(
          "Invalid state parameter",
        )}`,
      )
    }

    const { userId } = stateData

    if (!userId) {
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=missing_user_id&provider=slack&message=${encodeURIComponent(
          "Missing user ID in state",
        )}`,
      )
    }

    // Create Supabase client
    const supabase = createServerSupabaseClient()

    // Handle OAuth callback
    const result = await SlackOAuthService.handleCallback("slack", code, state, userId)

    // Redirect based on result
    return NextResponse.redirect(result.redirectUrl)
  } catch (error: any) {
    console.error("Slack OAuth callback error:", error)
    return NextResponse.redirect(
      `https://chainreact.app/integrations?error=callback_failed&provider=slack&message=${encodeURIComponent(
        error.message || "An unexpected error occurred",
      )}`,
    )
  }
}
