import { type NextRequest, NextResponse } from "next/server"
import { GoogleOAuthService } from "@/lib/oauth/google"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const scope = searchParams.get("scope")

  console.log("Google OAuth callback:", { code: !!code, state, error, scope })

  if (error) {
    console.error("Google OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=google", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in Google callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=google", request.url))
  }

  try {
    const baseUrl = new URL(request.url).origin
    const result = await GoogleOAuthService.handleCallback(code, state, baseUrl)

    console.log("Google OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl))
  } catch (error: any) {
    console.error("Google OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=google&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
