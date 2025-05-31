import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")

  if (!code || !state) {
    return NextResponse.redirect(new URL("/integrations?error=missing_params", request.url))
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      return NextResponse.redirect(new URL("/auth/login", request.url))
    }

    // Parse state to check if this is a reconnection
    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch {
      stateData = { provider: "github", timestamp: Date.now() }
    }

    const isReconnection = stateData.reconnect && stateData.integrationId

    // Exchange code for access token
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID!,
        client_secret: process.env.GITHUB_CLIENT_SECRET!,
        code,
      }),
    })

    const tokenData = await tokenResponse.json()

    if (tokenData.error) {
      throw new Error(tokenData.error_description || "Failed to exchange code for token")
    }

    // Get user info
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
        "User-Agent": "ChainReact-SaaS",
      },
    })

    const userData = await userResponse.json()

    if (isReconnection) {
      // Update existing integration
      const { error } = await supabase
        .from("integrations")
        .update({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
          status: "connected",
          updated_at: new Date().toISOString(),
          metadata: {
            username: userData.login,
            name: userData.name,
            email: userData.email,
            avatar_url: userData.avatar_url,
            reconnected_at: new Date().toISOString(),
          },
        })
        .eq("id", stateData.integrationId)

      if (error) {
        throw error
      }

      return NextResponse.redirect(new URL("/integrations?success=github_reconnected", request.url))
    } else {
      // Create new integration or upsert
      const { error } = await supabase.from("integrations").upsert({
        user_id: session.user.id,
        provider: "github",
        provider_user_id: userData.id.toString(),
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
        scopes: tokenData.scope?.split(",") || [],
        metadata: {
          username: userData.login,
          name: userData.name,
          email: userData.email,
          avatar_url: userData.avatar_url,
        },
        status: "connected",
      })

      if (error) {
        throw error
      }

      return NextResponse.redirect(new URL("/integrations?success=github_connected", request.url))
    }
  } catch (error) {
    console.error("GitHub OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_failed", request.url))
  }
}
