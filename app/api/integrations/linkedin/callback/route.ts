import { type NextRequest, NextResponse } from "next/server"
import { LinkedInOAuthService } from "@/lib/oauth/linkedin"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("LinkedIn OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("LinkedIn OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=linkedin", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in LinkedIn callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=linkedin", request.url))
  }

  try {
    const baseUrl = new URL(request.url).origin
    const result = await LinkedInOAuthService.handleCallback(code, state, baseUrl)

    console.log("LinkedIn OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl))
  } catch (error: any) {
    console.error("LinkedIn OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=linkedin&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
