import { type NextRequest, NextResponse } from "next/server"
import { FacebookOAuthService } from "@/lib/oauth/facebook"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Facebook OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Facebook OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=facebook", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in Facebook callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=facebook", request.url))
  }

  try {
    const baseUrl = new URL(request.url).origin
    const result = await FacebookOAuthService.handleCallback(code, state, baseUrl)

    console.log("Facebook OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl))
  } catch (error: any) {
    console.error("Facebook OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=facebook&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
