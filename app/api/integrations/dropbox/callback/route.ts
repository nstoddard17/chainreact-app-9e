import { type NextRequest, NextResponse } from "next/server"
import { DropboxOAuthService } from "@/lib/oauth/dropbox"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Dropbox OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Dropbox OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=dropbox", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in Dropbox callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=dropbox", request.url))
  }

  try {
    const baseUrl = new URL(request.url).origin
    const result = await DropboxOAuthService.handleCallback(code, state, baseUrl)

    console.log("Dropbox OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl))
  } catch (error: any) {
    console.error("Dropbox OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=dropbox&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
