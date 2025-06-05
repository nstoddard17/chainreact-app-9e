import { type NextRequest, NextResponse } from "next/server"
import { TikTokOAuthService } from "@/lib/oauth/tiktok"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const baseUrl = new URL(request.url).origin
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("TikTok OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("TikTok OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=tiktok", baseUrl))
  }

  if (!code || !state) {
    console.error("Missing code or state in TikTok callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=tiktok", baseUrl))
  }

  try {
    const result = await TikTokOAuthService.handleCallback(code, state, baseUrl)

    console.log("TikTok OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl, baseUrl))
  } catch (error: any) {
    console.error("TikTok OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=tiktok&message=${encodeURIComponent(error.message)}`,
        baseUrl,
      ),
    )
  }
}
