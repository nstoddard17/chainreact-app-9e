import { type NextRequest, NextResponse } from "next/server"
import { TeamsOAuthService } from "@/lib/oauth/teams"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  console.log("Teams OAuth callback:", {
    code: !!code,
    state: !!state,
    error,
    errorDescription,
  })

  if (error) {
    console.error("Teams OAuth error:", error, errorDescription)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=oauth_error&provider=teams&message=${encodeURIComponent(errorDescription || error)}`,
        request.url,
      ),
    )
  }

  if (!code || !state) {
    console.error("Missing code or state in Teams callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=teams", request.url))
  }

  try {
    const baseUrl = new URL(request.url).origin
    const result = await TeamsOAuthService.handleCallback(code, state, baseUrl)

    console.log("Teams OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl))
  } catch (error: any) {
    console.error("Teams OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=teams&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
