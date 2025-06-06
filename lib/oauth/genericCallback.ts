import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { parseOAuthState } from "./utils"

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

export async function handleGenericOAuthCallback(request: NextRequest, provider: string, oauthService: any) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    console.log(`${provider} OAuth callback received:`, { code: !!code, state: !!state, error })

    if (error) {
      console.error(`${provider} OAuth error:`, error)
      const baseUrl = new URL(request.url).origin
      return NextResponse.redirect(
        new URL(`/integrations?error=oauth_denied&provider=${provider}&message=${encodeURIComponent(error)}`, baseUrl),
      )
    }

    if (!code || !state) {
      console.error(`Missing code or state in ${provider} OAuth callback`)
      const baseUrl = new URL(request.url).origin
      return NextResponse.redirect(new URL(`/integrations?error=missing_params&provider=${provider}`, baseUrl))
    }

    // Parse state to get user information
    let stateData
    try {
      stateData = parseOAuthState(state)
    } catch (error) {
      console.error("Invalid state parameter:", error)
      const baseUrl = new URL(request.url).origin
      return NextResponse.redirect(new URL(`/integrations?error=invalid_state&provider=${provider}`, baseUrl))
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
      console.error(`No user ID found in ${provider} OAuth callback`)
      const baseUrl = new URL(request.url).origin
      return NextResponse.redirect(new URL(`/integrations?error=no_user&provider=${provider}`, baseUrl))
    }

    // Handle the OAuth callback
    const result = await oauthService.handleCallback(code, state, supabase, userId)

    return NextResponse.redirect(new URL(result.redirectUrl))
  } catch (error: any) {
    console.error(`${provider} OAuth callback error:`, error)
    const baseUrl = new URL(request.url).origin
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=${provider}&message=${encodeURIComponent(error.message)}`,
        baseUrl,
      ),
    )
  }
}
