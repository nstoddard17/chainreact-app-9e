import { type NextRequest, NextResponse } from "next/server"
import { DockerOAuthService } from "@/lib/oauth/docker"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Docker OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Docker OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=docker", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in Docker callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=docker", request.url))
  }

  try {
    const baseUrl = new URL(request.url).origin
    const result = await DockerOAuthService.handleCallback(code, state, baseUrl)

    console.log("Docker OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl))
  } catch (error: any) {
    console.error("Docker OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=docker&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
