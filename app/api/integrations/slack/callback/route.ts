import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

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
    if (!code) {
      console.error("Missing authorization code")
      const redirectUrl = new URL("/integrations", origin)
      redirectUrl.searchParams.set("error", "missing_code")
      redirectUrl.searchParams.set("message", "Authorization code not received from Slack")
      redirectUrl.searchParams.set("provider", "slack")
      return NextResponse.redirect(redirectUrl.toString())
    }

    // Validate environment variables
    if (!process.env.NEXT_PUBLIC_SLACK_CLIENT_ID || !process.env.SLACK_CLIENT_SECRET) {
      console.error("Missing Slack OAuth configuration")
      const redirectUrl = new URL("/integrations", origin)
      redirectUrl.searchParams.set("error", "configuration_error")
      redirectUrl.searchParams.set("message", "Slack OAuth not properly configured")
      redirectUrl.searchParams.set("provider", "slack")
      return NextResponse.redirect(redirectUrl.toString())
    }

    // Exchange code for access token
    console.log("Exchanging code for access token...")
    const tokenResponse = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        code,
        redirect_uri: `${origin}/api/integrations/slack/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      console.error("Token exchange failed:", tokenResponse.status, tokenResponse.statusText)
      const redirectUrl = new URL("/integrations", origin)
      redirectUrl.searchParams.set("error", "token_exchange_failed")
      redirectUrl.searchParams.set("message", `Failed to exchange code for token: ${tokenResponse.statusText}`)
      redirectUrl.searchParams.set("provider", "slack")
      return NextResponse.redirect(redirectUrl.toString())
    }

    const tokenData = await tokenResponse.json()
    console.log("Token exchange response:", { ok: tokenData.ok, team: tokenData.team?.name })

    if (!tokenData.ok) {
      console.error("Slack token error:", tokenData.error)
      const redirectUrl = new URL("/integrations", origin)
      redirectUrl.searchParams.set("error", "token_error")
      redirectUrl.searchParams.set("message", tokenData.error || "Token exchange failed")
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
      const redirectUrl = new URL("/integrations", origin)
      redirectUrl.searchParams.set("error", "session_error")
      redirectUrl.searchParams.set("message", "No active user session found")
      redirectUrl.searchParams.set("provider", "slack")
      return NextResponse.redirect(redirectUrl.toString())
    }

    console.log("User session found:", session.user.id)

    // Prepare integration data
    const integrationData = {
      user_id: session.user.id,
      provider: "slack",
      provider_user_id: tokenData.authed_user?.id || tokenData.user_id,
      status: "connected" as const,
      scopes: tokenData.scope ? tokenData.scope.split(",") : [],
      metadata: {
        access_token: tokenData.access_token,
        token_type: tokenData.token_type || "bot",
        scope: tokenData.scope,
        team: tokenData.team,
        authed_user: tokenData.authed_user,
        bot_user_id: tokenData.bot_user_id,
        connected_at: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    console.log("Saving integration to database...")

    // Check if integration already exists
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", session.user.id)
      .eq("provider", "slack")
      .single()

    let result
    if (existingIntegration) {
      console.log("Updating existing Slack integration:", existingIntegration.id)
      result = await supabase
        .from("integrations")
        .update({
          status: "connected",
          provider_user_id: integrationData.provider_user_id,
          scopes: integrationData.scopes,
          metadata: integrationData.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingIntegration.id)
        .select()
    } else {
      console.log("Creating new Slack integration")
      result = await supabase.from("integrations").insert(integrationData).select()
    }

    if (result.error) {
      console.error("Database error:", result.error)
      const redirectUrl = new URL("/integrations", origin)
      redirectUrl.searchParams.set("error", "database_error")
      redirectUrl.searchParams.set("message", `Database error: ${result.error.message}`)
      redirectUrl.searchParams.set("provider", "slack")
      return NextResponse.redirect(redirectUrl.toString())
    }

    console.log("Slack integration saved successfully:", result.data?.[0]?.id)

    // Redirect to success page
    const redirectUrl = new URL("/integrations", origin)
    redirectUrl.searchParams.set("success", existingIntegration ? "slack_reconnected" : "slack_connected")
    redirectUrl.searchParams.set("provider", "slack")

    console.log("Redirecting to:", redirectUrl.toString())
    return NextResponse.redirect(redirectUrl.toString())
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
