import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { searchParams, origin } = new URL(request.url)

  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const error_description = searchParams.get("error_description")

  console.log("GitHub callback received:", { code: !!code, state: !!state, error, error_description })

  // Handle OAuth errors
  if (error) {
    console.error("GitHub OAuth error:", error, error_description)
    return NextResponse.redirect(
      new URL(`/integrations?error=oauth_failed&details=${encodeURIComponent(error_description || error)}`, origin),
    )
  }

  if (!code) {
    console.error("Missing authorization code")
    return NextResponse.redirect(new URL("/integrations?error=missing_code", origin))
  }

  if (!state) {
    console.error("Missing state parameter")
    return NextResponse.redirect(new URL("/integrations?error=missing_state", origin))
  }

  try {
    // Verify state parameter
    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Invalid state parameter:", e)
      throw new Error("Invalid state parameter")
    }

    if (stateData.provider !== "github") {
      throw new Error("Invalid state parameter - wrong provider")
    }

    console.log("Exchanging code for token...")

    // Exchange code for access token
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "ChainReact-SaaS/1.0",
      },
      body: JSON.stringify({
        client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${origin}/api/integrations/github/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      console.error("Token exchange failed:", tokenResponse.status, tokenResponse.statusText)
      throw new Error(`GitHub token exchange failed: ${tokenResponse.statusText}`)
    }

    const tokenData = await tokenResponse.json()
    console.log("Token response:", { ...tokenData, access_token: tokenData.access_token ? "[REDACTED]" : undefined })

    if (tokenData.error) {
      console.error("Token exchange error:", tokenData.error, tokenData.error_description)
      throw new Error(`GitHub token exchange failed: ${tokenData.error_description || tokenData.error}`)
    }

    if (!tokenData.access_token) {
      console.error("No access token received")
      throw new Error("No access token received from GitHub")
    }

    console.log("Fetching GitHub user data...")

    // Get user info from GitHub
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "ChainReact-SaaS/1.0",
      },
    })

    if (!userResponse.ok) {
      console.error("GitHub user fetch failed:", userResponse.status, userResponse.statusText)
      throw new Error(`Failed to fetch GitHub user data: ${userResponse.statusText}`)
    }

    const githubUser = await userResponse.json()
    console.log("GitHub user fetched:", { id: githubUser.id, login: githubUser.login })

    // Get current user session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError) {
      console.error("Session error:", sessionError)
      throw new Error("Failed to get user session")
    }

    if (!session) {
      console.error("No active session")
      return NextResponse.redirect(new URL("/auth/login?error=session_expired", origin))
    }

    console.log("Saving integration to database...")

    // Check if integration already exists
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", session.user.id)
      .eq("provider", "github")
      .eq("provider_user_id", githubUser.id.toString())
      .single()

    if (existingIntegration) {
      // Update existing integration
      const { error: updateError } = await supabase
        .from("integrations")
        .update({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_type: tokenData.token_type || "bearer",
          scopes: tokenData.scope ? tokenData.scope.split(",") : ["repo", "workflow"],
          status: "connected",
          metadata: {
            username: githubUser.login,
            name: githubUser.name,
            email: githubUser.email,
            avatar_url: githubUser.avatar_url,
            public_repos: githubUser.public_repos,
            followers: githubUser.followers,
            following: githubUser.following,
            created_at: githubUser.created_at,
            updated_at: githubUser.updated_at,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingIntegration.id)

      if (updateError) {
        console.error("Database update error:", updateError)
        throw new Error("Failed to update integration")
      }
    } else {
      // Create new integration
      const { error: insertError } = await supabase.from("integrations").insert({
        user_id: session.user.id,
        provider: "github",
        provider_user_id: githubUser.id.toString(),
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_type: tokenData.token_type || "bearer",
        scopes: tokenData.scope ? tokenData.scope.split(",") : ["repo", "workflow"],
        status: "connected",
        metadata: {
          username: githubUser.login,
          name: githubUser.name,
          email: githubUser.email,
          avatar_url: githubUser.avatar_url,
          public_repos: githubUser.public_repos,
          followers: githubUser.followers,
          following: githubUser.following,
          created_at: githubUser.created_at,
          updated_at: githubUser.updated_at,
        },
      })

      if (insertError) {
        console.error("Database insert error:", insertError)
        throw new Error("Failed to save integration")
      }
    }

    console.log("Integration saved successfully")

    // Redirect back to integrations page with success
    return NextResponse.redirect(new URL("/integrations?success=github_connected", origin))
  } catch (error: any) {
    console.error("GitHub OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(`/integrations?error=connection_failed&details=${encodeURIComponent(error.message)}`, origin),
    )
  }
}
