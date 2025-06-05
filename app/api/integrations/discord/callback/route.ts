import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { DiscordOAuthService } from "@/lib/oauth/discord"
import { parseOAuthState } from "@/lib/oauth/utils"
import type { Database } from "@/types/supabase"

export async function GET(request: NextRequest) {
  try {
    // Get code and state from query parameters
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    // Handle OAuth errors from Discord
    if (error) {
      console.error("Discord OAuth error:", error)
      const errorDescription = searchParams.get("error_description") || error
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=oauth_error&provider=discord&message=${encodeURIComponent(
          errorDescription,
        )}`,
      )
    }

    if (!code) {
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=missing_code&provider=discord&message=${encodeURIComponent(
          "Missing authorization code",
        )}`,
      )
    }

    if (!state) {
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=missing_state&provider=discord&message=${encodeURIComponent(
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
        `https://chainreact.app/integrations?error=invalid_state&provider=discord&message=${encodeURIComponent(
          "Invalid state parameter",
        )}`,
      )
    }

    const { userId } = stateData

    if (!userId) {
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=missing_user_id&provider=discord&message=${encodeURIComponent(
          "Missing user ID in state",
        )}`,
      )
    }

    // Create Supabase client using route handler method with cookies
    const supabase = createRouteHandlerClient<Database>({ cookies })

    // Verify the user session
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session || session.user.id !== userId) {
      return NextResponse.redirect(
        `https://chainreact.app/integrations?error=session_mismatch&provider=discord&message=${encodeURIComponent(
          "Session validation failed",
        )}`,
      )
    }

    // Handle OAuth callback
    const result = await DiscordOAuthService.handleCallback(code, state, supabase, userId)

    // Redirect based on result
    return NextResponse.redirect(result.redirectUrl)
  } catch (error: any) {
    console.error("Discord OAuth callback error:", error)
    return NextResponse.redirect(
      `https://chainreact.app/integrations?error=callback_failed&provider=discord&message=${encodeURIComponent(
        error.message || "An unexpected error occurred",
      )}`,
    )
  }
}
