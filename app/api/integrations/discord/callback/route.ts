import { type NextRequest, NextResponse } from "next/server"
import { DiscordOAuthService } from "@/lib/oauth/discord"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Discord OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Discord OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=discord", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in Discord callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=discord", request.url))
  }

  try {
    const baseUrl = new URL(request.url).origin
    const result = await DiscordOAuthService.handleCallback(code, state, baseUrl)

    console.log("Discord OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl))
  } catch (error: any) {
    console.error("Discord OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=discord&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
