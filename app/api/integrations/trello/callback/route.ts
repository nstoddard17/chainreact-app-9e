import { type NextRequest, NextResponse } from "next/server"
import { TrelloOAuthService } from "@/lib/oauth/trello"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const token = searchParams.get("token")
  const state = searchParams.get("state")

  console.log("Trello OAuth callback:", {
    token: !!token,
    state: !!state,
    allParams: Object.fromEntries(searchParams.entries()),
    url: request.url,
  })

  if (!token) {
    console.log("No token in query params, redirecting to client-side handler")
    return NextResponse.redirect(new URL("/integrations?trello_auth=pending", request.url))
  }

  if (!state) {
    console.error("Missing state in Trello callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_state&provider=trello", request.url))
  }

  try {
    const baseUrl = new URL(request.url).origin
    const result = await TrelloOAuthService.handleCallback(token, state, baseUrl)

    console.log("Trello OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl))
  } catch (error: any) {
    console.error("Trello OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=trello&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
