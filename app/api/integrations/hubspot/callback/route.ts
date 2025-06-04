import { type NextRequest, NextResponse } from "next/server"
import { HubSpotOAuthService } from "@/lib/oauth/hubspot"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("HubSpot OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("HubSpot OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=hubspot", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in HubSpot callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=hubspot", request.url))
  }

  try {
    const baseUrl = new URL(request.url).origin
    const result = await HubSpotOAuthService.handleCallback(code, state, baseUrl)

    console.log("HubSpot OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl))
  } catch (error: any) {
    console.error("HubSpot OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=hubspot&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
