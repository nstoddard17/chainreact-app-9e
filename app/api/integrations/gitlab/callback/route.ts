import { type NextRequest, NextResponse } from "next/server"
import { GitLabOAuthService } from "@/lib/oauth/gitlab"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("GitLab OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("GitLab OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=gitlab", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in GitLab callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=gitlab", request.url))
  }

  try {
    const baseUrl = new URL(request.url).origin
    const result = await GitLabOAuthService.handleCallback(code, state, baseUrl)

    console.log("GitLab OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl))
  } catch (error: any) {
    console.error("GitLab OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=gitlab&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
