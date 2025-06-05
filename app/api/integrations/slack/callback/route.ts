import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { SlackOAuthService } from "@/lib/oauth/slack"

export async function GET(request: NextRequest) {
  console.log("Slack OAuth callback received")

  try {
    const { searchParams } = new URL(request.url)
    const baseUrl = new URL(request.url).origin
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
      const redirectUrl = new URL("/integrations", baseUrl)
      redirectUrl.searchParams.set("error", "oauth_error")
      redirectUrl.searchParams.set("message", `Slack OAuth error: ${error}`)
      redirectUrl.searchParams.set("provider", "slack")
      return NextResponse.redirect(redirectUrl.toString())
    }

    // Validate required parameters
    if (!code || !state) {
      console.error("Missing authorization code or state")
      const redirectUrl = new URL("/integrations", baseUrl)
      redirectUrl.searchParams.set("error", "missing_params")
      redirectUrl.searchParams.set("message", "Authorization code or state not received from Slack")
      redirectUrl.searchParams.set("provider", "slack")
      return NextResponse.redirect(redirectUrl.toString())
    }

    // Initialize Supabase client
    const supabase = createRouteHandlerClient({ cookies })

    // Get current session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session) {
      console.error("Session error:", sessionError)
      const redirectUrl = new URL("/integrations", baseUrl)
      redirectUrl.searchParams.set("error", "session_error")
      redirectUrl.searchParams.set("message", "No active user session found")
      redirectUrl.searchParams.set("provider", "slack")
      return NextResponse.redirect(redirectUrl.toString())
    }

    console.log("User session found:", session.user.id)

    // Handle the OAuth callback using the secure service
    const result = await SlackOAuthService.handleCallback(code, state, baseUrl, supabase, session.user.id)

    console.log("Slack OAuth result:", result.success ? "success" : "failed")
    return NextResponse.redirect(new URL(result.redirectUrl, baseUrl))
  } catch (error: any) {
    console.error("Slack OAuth callback error:", error)

    const baseUrl = new URL(request.url).origin
    const redirectUrl = new URL("/integrations", baseUrl)
    redirectUrl.searchParams.set("error", "callback_failed")
    redirectUrl.searchParams.set("message", `Callback failed: ${error.message}`)
    redirectUrl.searchParams.set("provider", "slack")

    return NextResponse.redirect(redirectUrl.toString())
  }
}
