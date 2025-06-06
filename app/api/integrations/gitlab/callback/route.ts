import { type NextRequest, NextResponse } from "next/server"
import { GitLabOAuthService } from "@/lib/oauth/gitlab"

export async function GET(request: NextRequest) {
  try {
    // Extract code and state from query parameters
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")

    if (!code) {
      console.error("GitLab callback: Missing code parameter")
      return NextResponse.redirect(`${request.nextUrl.origin}/integrations?error=missing_code&provider=gitlab`)
    }

    if (!state) {
      console.error("GitLab callback: Missing state parameter")
      return NextResponse.redirect(`${request.nextUrl.origin}/integrations?error=missing_state&provider=gitlab`)
    }

    // Get the base URL for redirects
    const baseUrl = request.nextUrl.origin

    // Handle the OAuth callback
    const result = await GitLabOAuthService.handleCallback(code, state, baseUrl)

    // Redirect based on the result
    return NextResponse.redirect(result.redirectUrl)
  } catch (error: any) {
    console.error("GitLab callback error:", error)
    return NextResponse.redirect(
      `${request.nextUrl.origin}/integrations?error=callback_failed&provider=gitlab&message=${encodeURIComponent(
        error.message,
      )}`,
    )
  }
}
