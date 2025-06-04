import { type NextRequest, NextResponse } from "next/server"
import { TwitterOAuthService } from "@/lib/oauth/twitter"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Twitter OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Twitter OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=twitter", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in Twitter callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=twitter", request.url))
  }

  try {
    const baseUrl = new URL(request.url).origin
    const result = await TwitterOAuthService.handleCallback(code, state, baseUrl)

    console.log("Twitter OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl))
  } catch (error: any) {
    console.error("Twitter OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=twitter&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
