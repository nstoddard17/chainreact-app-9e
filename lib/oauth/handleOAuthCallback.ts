import { type NextRequest, NextResponse } from "next/server"
import { getAbsoluteBaseUrl, getOAuthRedirectUri, parseOAuthState, validateSession } from "./utils"
import type { BaseOAuthService } from "./BaseOAuthService"

export async function handleOAuthCallback(
  request: NextRequest,
  provider: string,
  oauthService: typeof BaseOAuthService,
): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const baseUrl = getAbsoluteBaseUrl(request)
    const redirectUri = getOAuthRedirectUri(provider)

    console.log(`${provider} OAuth callback - using redirect URI:`, redirectUri)

    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    // Handle OAuth errors from provider
    if (error) {
      console.error(`${provider} OAuth error:`, error)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=oauth_denied&provider=${provider}&message=${encodeURIComponent(error)}`,
      )
    }

    // Validate required parameters
    if (!code || !state) {
      console.error(`Missing code or state in ${provider} callback`)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=missing_params&provider=${provider}&message=Authorization+code+or+state+not+received`,
      )
    }

    // Parse state to get user information
    let stateData
    try {
      stateData = parseOAuthState(state)
    } catch (error) {
      console.error("Invalid state parameter:", error)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=invalid_state&provider=${provider}&message=Invalid+state+parameter`,
      )
    }

    // Get user ID from state or session
    let userId = stateData.userId

    // If no user ID in state, validate session
    if (!userId) {
      userId = await validateSession(request)
    }

    // If still no user ID, redirect to error
    if (!userId) {
      console.error(`No user ID found in ${provider} OAuth callback`)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=session_error&provider=${provider}&message=Please+log+in+again`,
      )
    }

    // Handle the OAuth callback
    const result = await oauthService.handleCallback(code, state, redirectUri, userId)

    // Redirect based on result
    return NextResponse.redirect(result.redirectUrl)
  } catch (error: any) {
    console.error(`${provider} OAuth callback error:`, error)
    const baseUrl = getAbsoluteBaseUrl(request)
    return NextResponse.redirect(
      `${baseUrl}/integrations?error=callback_failed&provider=${provider}&message=${encodeURIComponent(
        error.message || "An unexpected error occurred",
      )}`,
    )
  }
}
