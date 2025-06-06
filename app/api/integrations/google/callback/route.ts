import { type NextRequest, NextResponse } from "next/server"
import { createServerSupabaseClient } from "@/lib/supabase-server"
import { GoogleOAuthService } from "@/lib/oauth/google"
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
        `https://chainreact.app/integrations?error=provider_error&provider=google&message=${encodeURIComponent(
          `Google returned an error: ${error}`,
        )}`,
      )
    }

    if (!code) {
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=missing_code&provider=google&message=${encodeURIComponent(
          "Missing authorization code",
        )}`,
      )
    }

    if (!state) {
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=missing_state&provider=google&message=${encodeURIComponent(
          "Missing state parameter",
        )}`,
      )
    }

    // Parse state to get user ID and original provider
    let stateData
    try {
      stateData = parseOAuthState(state)
    } catch (error) {
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=invalid_state&provider=google&message=${encodeURIComponent(
          "Invalid state parameter",
        )}`,
      )
    }

    const { userId, provider: originalProvider } = stateData

    if (!userId) {
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=missing_user_id&provider=google&message=${encodeURIComponent(
          "Missing user ID in state",
        )}`,
      )
    }

    // Use the original provider (e.g., google-calendar, gmail) or default to google
    const providerToStore = originalProvider || "google"

    // Create Supabase client
    const supabase = createServerSupabaseClient()

    // Handle OAuth callback using the original provider name
    const result = await GoogleOAuthService.handleCallback(providerToStore, code, state, userId)

    // Redirect based on result
    return NextResponse.redirect(result.redirectUrl)
  } catch (error: any) {
    console.error("Google OAuth callback error:", error)
    return NextResponse.redirect(
      `https://chainreact.app/integrations?error=callback_failed&provider=google&message=${encodeURIComponent(
        error.message || "An unexpected error occurred",
      )}`,
    )
  }
}
