import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { searchParams } = new URL(request.url)

  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  // Handle OAuth errors
  if (error) {
    console.error("GitHub OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_failed", request.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/integrations?error=missing_params", request.url))
  }

  try {
    // Verify state parameter
    const stateData = JSON.parse(atob(state))
    if (stateData.provider !== "github") {
      throw new Error("Invalid state parameter")
    }

    // Exchange code for access token
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
      }),
    })

    const tokenData = await tokenResponse.json()

    if (tokenData.error) {
      throw new Error(`GitHub token exchange failed: ${tokenData.error_description}`)
    }

    // Get user info from GitHub
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        Accept: "application/vnd.github.v3+json",
      },
    })

    const githubUser = await userResponse.json()

    if (!userResponse.ok) {
      throw new Error("Failed to fetch GitHub user data")
    }

    // Get current user session
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.redirect(new URL("/auth/login?error=session_expired", request.url))
    }

    // Store integration in database
    const { error: dbError } = await supabase.from("integrations").insert({
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

    if (dbError) {
      console.error("Database error:", dbError)
      throw new Error("Failed to save integration")
    }

    // Redirect back to integrations page with success
    return NextResponse.redirect(new URL("/integrations?success=github_connected", request.url))
  } catch (error) {
    console.error("GitHub OAuth callback error:", error)
    return NextResponse.redirect(new URL("/integrations?error=connection_failed", request.url))
  }
}
