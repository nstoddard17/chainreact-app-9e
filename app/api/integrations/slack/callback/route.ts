import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { SlackOAuthService } from "@/lib/oauth/slack"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    console.log("Slack OAuth callback received:", { code: !!code, state: !!state, error })

    if (error) {
      console.error("Slack OAuth error:", error)
      const baseUrl = new URL(request.url).origin
      return NextResponse.redirect(
        new URL(`/integrations?error=oauth_denied&provider=slack&message=${encodeURIComponent(error)}`, baseUrl),
      )
    }

    if (!code || !state) {
      console.error("Missing code or state in Slack OAuth callback")
      const baseUrl = new URL(request.url).origin
      return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=slack", baseUrl))
    }

    // Parse state to get user information
    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch (error) {
      console.error("Invalid state parameter:", error)
      const baseUrl = new URL(request.url).origin
      return NextResponse.redirect(new URL("/integrations?error=invalid_state&provider=slack", baseUrl))
    }

    // Get user session to determine user_id
    let userId = stateData.userId

    if (!userId) {
      // Try to get user from session if not in state
      const sessionCookie = request.cookies.get("sb-access-token")?.value
      if (sessionCookie) {
        const {
          data: { user },
        } = await supabase.auth.getUser(sessionCookie)
        userId = user?.id
      }
    }

    if (!userId) {
      console.error("No user ID found in Slack OAuth callback")
      const baseUrl = new URL(request.url).origin
      return NextResponse.redirect(new URL("/integrations?error=no_user&provider=slack", baseUrl))
    }

    // Handle the OAuth callback
    const result = await SlackOAuthService.handleCallback(code, state, supabase, userId)

    return NextResponse.redirect(new URL(result.redirectUrl))
  } catch (error: any) {
    console.error("Slack OAuth callback error:", error)
    const baseUrl = new URL(request.url).origin
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=slack&message=${encodeURIComponent(error.message)}`,
        baseUrl,
      ),
    )
  }
}
