import { type NextRequest, NextResponse } from "next/server"
import { NotionOAuthService } from "@/lib/oauth/notion"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("Notion OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Notion OAuth error:", error)
    return NextResponse.redirect(
      new URL(`/integrations?error=oauth_error&message=${encodeURIComponent(error)}&provider=notion`, request.url),
    )
  }

  if (!code || !state) {
    console.error("Missing code or state in Notion callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=notion", request.url))
  }

  try {
    const baseUrl = new URL(request.url).origin
    const result = await NotionOAuthService.handleCallback(code, state, baseUrl)

    console.log("Notion OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl))
  } catch (error: any) {
    console.error("Notion OAuth callback error:", error)
    const errorMessage = encodeURIComponent(error.message || "Unknown error occurred")
    return NextResponse.redirect(
      new URL(`/integrations?error=callback_failed&provider=notion&message=${errorMessage}`, request.url),
    )
  }
}
