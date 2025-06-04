import { type NextRequest, NextResponse } from "next/server"
import { YouTubeOAuthService } from "@/lib/oauth/youtube"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("YouTube OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("YouTube OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in YouTube callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params", request.url))
  }

  try {
    const baseUrl = new URL(request.url).origin
    const result = await YouTubeOAuthService.handleCallback(code, state, baseUrl)

    console.log("YouTube OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl))
  } catch (error: any) {
    console.error("YouTube OAuth callback error:", error)
    return NextResponse.redirect(new URL("/integrations?error=callback_failed", request.url))
  }
}
