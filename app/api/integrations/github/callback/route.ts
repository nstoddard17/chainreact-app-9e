import { type NextRequest, NextResponse } from "next/server"
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"

export async function GET(request: NextRequest) {
  console.log("GitHub OAuth callback received")

  try {
    const { searchParams } = new URL(request.url)
    const baseUrl = new URL(request.url).origin
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")
    const errorDescription = searchParams.get("error_description")

    console.log("GitHub callback params:", {
      code: code ? "present" : "missing",
      state: state ? "present" : "missing",
      error,
      errorDescription,
    })

    // Handle OAuth errors from GitHub
    if (error) {
      console.error("GitHub OAuth error:", { error, errorDescription })
      const redirectUrl = new URL("/integrations", baseUrl)
      redirectUrl.searchParams.set("error", "oauth_error")
      redirectUrl.searchParams.set("message", errorDescription || error)
      redirectUrl.searchParams.set("provider", "github")
      return NextResponse.redirect(redirectUrl.toString())
    }

    // Validate required parameters
    if (!code) {
      console.error("Missing authorization code")
      const redirectUrl = new URL("/integrations", baseUrl)
      redirectUrl.searchParams.set("error", "missing_code")
      redirectUrl.searchParams.set("message", "Authorization code not received from GitHub")
      redirectUrl.searchParams.set("provider", "github")
      return NextResponse.redirect(redirectUrl.toString())
    }

    if (!state) {
      console.error("Missing state parameter")
      const redirectUrl = new URL("/integrations", baseUrl)
      redirectUrl.searchParams.set("error", "missing_state")
      redirectUrl.searchParams.set("message", "State parameter missing - possible security issue")
      redirectUrl.searchParams.set("provider", "github")
      return NextResponse.redirect(redirectUrl.toString())
    }

    // Parse and validate state
    let stateData
    try {
      stateData = JSON.parse(atob(state))
      console.log("Parsed state data:", stateData)
    } catch (err) {
      console.error("Invalid state parameter:", err)
      const redirectUrl = new URL("/integrations", baseUrl)
      redirectUrl.searchParams.set("error", "invalid_state")
      redirectUrl.searchParams.set("message", "Invalid state parameter")
      redirectUrl.searchParams.set("provider", "github")
      return NextResponse.redirect(redirectUrl.toString())
    }

    // Validate environment variables
    if (!process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
      console.error("Missing GitHub OAuth configuration")
      const redirectUrl = new URL("/integrations", baseUrl)
      redirectUrl.searchParams.set("error", "configuration_error")
      redirectUrl.searchParams.set("message", "GitHub OAuth not properly configured")
      redirectUrl.searchParams.set("provider", "github")
      return NextResponse.redirect(redirectUrl.toString())
    }

    // Exchange code for access token
    console.log("Exchanging code for access token...")
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${baseUrl}/api/integrations/github/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      console.error("Token exchange failed:", tokenResponse.status, tokenResponse.statusText)
      const errorText = await tokenResponse.text()
      console.error("Token exchange error details:", errorText)

      const redirectUrl = new URL("/integrations", baseUrl)
      redirectUrl.searchParams.set("error", "token_exchange_failed")
      redirectUrl.searchParams.set("message", `Failed to exchange code for token: ${tokenResponse.statusText}`)
      redirectUrl.searchParams.set("provider", "github")
      return NextResponse.redirect(redirectUrl.toString())
    }

    const tokenData = await tokenResponse.json()
    console.log("Token exchange successful, received:", Object.keys(tokenData))

    if (tokenData.error) {
      console.error("GitHub token error:", tokenData)
      const redirectUrl = new URL("/integrations", baseUrl)
      redirectUrl.searchParams.set("error", "token_error")
      redirectUrl.searchParams.set("message", tokenData.error_description || tokenData.error)
      redirectUrl.searchParams.set("provider", "github")
      return NextResponse.redirect(redirectUrl.toString())
    }

    if (!tokenData.access_token) {
      console.error("No access token received:", tokenData)
      const redirectUrl = new URL("/integrations", baseUrl)
      redirectUrl.searchParams.set("error", "no_access_token")
      redirectUrl.searchParams.set("message", "No access token received from GitHub")
      redirectUrl.searchParams.set("provider", "github")
      return NextResponse.redirect(redirectUrl.toString())
    }

    // Get user info from GitHub
    console.log("Fetching GitHub user info...")
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "User-Agent": "ChainReact-App",
      },
    })

    if (!userResponse.ok) {
      console.error("Failed to fetch GitHub user info:", userResponse.status)
      const redirectUrl = new URL("/integrations", baseUrl)
      redirectUrl.searchParams.set("error", "user_fetch_failed")
      redirectUrl.searchParams.set("message", "Failed to fetch user information from GitHub")
      redirectUrl.searchParams.set("provider", "github")
      return NextResponse.redirect(redirectUrl.toString())
    }

    const userData = await userResponse.json()
    console.log("GitHub user data received:", { id: userData.id, login: userData.login })

    // Initialize Supabase client
    const supabase = createRouteHandlerClient({ cookies })

    // Get current session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      console.error("Session error:", sessionError)
      const redirectUrl = new URL("/integrations", baseUrl)
      redirectUrl.searchParams.set("error", "session_error")
      redirectUrl.searchParams.set("message", "Failed to get user session")
      redirectUrl.searchParams.set("provider", "github")
      return NextResponse.redirect(redirectUrl.toString())
    }

    if (!session) {
      console.error("No active session found")
      const redirectUrl = new URL("/integrations", baseUrl)
      redirectUrl.searchParams.set("error", "no_session")
      redirectUrl.searchParams.set("message", "No active user session found")
      redirectUrl.searchParams.set("provider", "github")
      return NextResponse.redirect(redirectUrl.toString())
    }

    console.log("User session found:", session.user.id)

    // Prepare integration data
    const integrationData = {
      user_id: session.user.id,
      provider: "github",
      provider_user_id: userData.id.toString(),
      access_token: tokenData.access_token,
      status: "connected" as const,
      scopes: tokenData.scope ? tokenData.scope.split(",") : ["repo", "user"],
      metadata: {
        access_token: tokenData.access_token,
        token_type: tokenData.token_type || "bearer",
        scope: tokenData.scope,
        github_user: {
          id: userData.id,
          login: userData.login,
          name: userData.name,
          email: userData.email,
          avatar_url: userData.avatar_url,
        },
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
      .eq("provider", "github")
      .single()

    let result
    if (existingIntegration) {
      console.log("Updating existing GitHub integration:", existingIntegration.id)
      result = await supabase
        .from("integrations")
        .update({
          status: "connected",
          provider_user_id: userData.id.toString(),
          access_token: tokenData.access_token,
          scopes: integrationData.scopes,
          metadata: integrationData.metadata,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingIntegration.id)
        .select()
    } else {
      console.log("Creating new GitHub integration")
      result = await supabase.from("integrations").insert(integrationData).select()
    }

    if (result.error) {
      console.error("Database error:", result.error)
      const redirectUrl = new URL("/integrations", baseUrl)
      redirectUrl.searchParams.set("error", "database_error")
      redirectUrl.searchParams.set("message", `Database error: ${result.error.message}`)
      redirectUrl.searchParams.set("provider", "github")
      return NextResponse.redirect(redirectUrl.toString())
    }

    console.log("GitHub integration saved successfully:", result.data?.[0]?.id)

    // Redirect to success page
    const redirectUrl = new URL("/integrations", baseUrl)
    redirectUrl.searchParams.set("success", existingIntegration ? "github_reconnected" : "github_connected")
    redirectUrl.searchParams.set("provider", "github")

    console.log("Redirecting to:", redirectUrl.toString())
    return NextResponse.redirect(redirectUrl.toString())
  } catch (error: any) {
    console.error("GitHub OAuth callback error:", error)

    const baseUrl = new URL(request.url).origin
    const redirectUrl = new URL("/integrations", baseUrl)
    redirectUrl.searchParams.set("error", "callback_failed")
    redirectUrl.searchParams.set("message", `Callback failed: ${error.message}`)
    redirectUrl.searchParams.set("provider", "github")

    return NextResponse.redirect(redirectUrl.toString())
  }
}
