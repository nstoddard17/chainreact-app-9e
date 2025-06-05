import { type NextRequest, NextResponse } from "next/server"
import { InstagramOAuthService } from "@/lib/oauth/instagram"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const baseUrl = new URL(request.url).origin
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Instagram OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Instagram OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=instagram", baseUrl))
  }

  if (!code || !state) {
    console.error("Missing code or state in Instagram callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=instagram", baseUrl))
  }

  try {
    const result = await InstagramOAuthService.handleCallback(code, state, baseUrl)

    console.log("Instagram OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl, baseUrl))
  } catch (error: any) {
    console.error("Instagram OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=instagram&message=${encodeURIComponent(error.message)}`,
        baseUrl,
      ),
    )
  }
}
