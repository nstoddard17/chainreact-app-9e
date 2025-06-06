import { type NextRequest, NextResponse } from "next/server"
import { LinkedInOAuthService } from "@/lib/oauth/linkedin"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const baseUrl = new URL(request.url).origin
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const errorDescription = searchParams.get("error_description")

  console.log("LinkedIn OAuth callback:", { code: !!code, state, error, errorDescription })

  if (error) {
    console.error("LinkedIn OAuth error:", error, errorDescription ? `(${errorDescription})` : "")
    return NextResponse.redirect(
      new URL(
        `/integrations?error=oauth_error&provider=linkedin&message=${encodeURIComponent(
          errorDescription || error || "OAuth error",
        )}`,
        baseUrl,
      ),
    )
  }

  if (!code || !state) {
    console.error("Missing code or state in LinkedIn callback", { code: !!code, state })
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=linkedin", baseUrl))
  }

  if (typeof code !== "string" || code.trim() === "") {
    console.error("Invalid authorization code received from LinkedIn:", { code })
    return NextResponse.redirect(new URL("/integrations?error=invalid_code&provider=linkedin", baseUrl))
  }

  try {
    const result = await LinkedInOAuthService.handleCallback(code, state, baseUrl)

    console.log("LinkedIn OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl, baseUrl))
  } catch (error: any) {
    console.error("LinkedIn OAuth callback error:", error)
    console.error("LinkedIn OAuth Configuration Debugging:", {
      clientId: process.env.LINKEDIN_CLIENT_ID ? "configured" : "not configured",
      clientSecret: process.env.LINKEDIN_CLIENT_SECRET ? "configured" : "not configured",
      redirectUri: process.env.LINKEDIN_REDIRECT_URI ? "configured" : "not configured",
    })
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=linkedin&message=${encodeURIComponent(error.message)}`,
        baseUrl,
      ),
    )
  }
}
