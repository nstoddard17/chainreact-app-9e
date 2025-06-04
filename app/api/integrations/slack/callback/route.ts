import { type NextRequest, NextResponse } from "next/server"
import { SlackOAuthService } from "@/lib/oauth/slack"

export async function GET(request: NextRequest) {
  console.log("Slack OAuth callback received")

  try {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    console.log("Slack callback params:", {
      code: code ? "present" : "missing",
      state: state ? "present" : "missing",
      error,
    })

    // Handle OAuth errors from Slack
    if (error) {
      console.error("Slack OAuth error:", error)
      const redirectUrl = new URL("/integrations", origin)
      redirectUrl.searchParams.set("error", "oauth_error")
      redirectUrl.searchParams.set("message", `Slack OAuth error: ${error}`)
      redirectUrl.searchParams.set("provider", "slack")
      return NextResponse.redirect(redirectUrl.toString())
    }

    // Validate required parameters
    if (!code || !state) {
      console.error("Missing authorization code or state")
      const redirectUrl = new URL("/integrations", origin)
      redirectUrl.searchParams.set("error", "missing_params")
      redirectUrl.searchParams.set("message", "Authorization code or state not received from Slack")
      redirectUrl.searchParams.set("provider", "slack")
      return NextResponse.redirect(redirectUrl.toString())
    }

    // Handle the OAuth callback using the secure service
    const result = await SlackOAuthService.handleCallback(code, state, origin)

    console.log("Slack OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl))
  } catch (error: any) {
    console.error("Slack OAuth callback error:", error)

    const { origin } = new URL(request.url)
    const redirectUrl = new URL("/integrations", origin)
    redirectUrl.searchParams.set("error", "callback_failed")
    redirectUrl.searchParams.set("message", `Callback failed: ${error.message}`)
    redirectUrl.searchParams.set("provider", "slack")

    return NextResponse.redirect(redirectUrl.toString())
  }
}
