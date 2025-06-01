import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const stateParam = searchParams.get("state")

  // Log the callback URL and parameters for debugging
  console.log("GitHub OAuth callback received:", { code: !!code, state: stateParam })

  if (!code) {
    console.error("No code received from GitHub OAuth")
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin}/integrations?error=No+authorization+code+received`,
    )
  }

  try {
    let state: any = {}
    try {
      state = JSON.parse(atob(stateParam || ""))
    } catch (e) {
      console.error("Failed to parse state parameter:", e)
    }

    const supabase = createRouteHandlerClient({ cookies })

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      console.error("No session found in GitHub callback")
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin}/auth/login?error=Authentication+required`,
      )
    }

    // Exchange the code for an access token
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
        client_secret: process.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin}/api/integrations/github/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error("GitHub token exchange failed:", tokenResponse.status, errorText)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin}/integrations?error=Failed+to+exchange+authorization+code`,
      )
    }

    const tokenData = await tokenResponse.json()
    console.log("GitHub token exchange successful:", { hasAccessToken: !!tokenData.access_token })

    if (!tokenData.access_token) {
      console.error("No access token received from GitHub")
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin}/integrations?error=No+access+token+received`,
      )
    }

    // Get user info from GitHub
    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `token ${tokenData.access_token}`,
      },
    })

    if (!userResponse.ok) {
      console.error("Failed to fetch GitHub user info:", userResponse.status)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin}/integrations?error=Failed+to+fetch+user+info`,
      )
    }

    const userData = await userResponse.json()
    console.log("GitHub user info fetched:", { id: userData.id, login: userData.login })

    // Handle reconnection case
    if (state.reconnect && state.integrationId) {
      console.log("Reconnecting GitHub integration:", state.integrationId)

      const { error: updateError } = await supabase
        .from("integrations")
        .update({
          status: "connected",
          access_token: tokenData.access_token,
          provider_user_id: userData.id.toString(),
          metadata: {
            username: userData.login,
            avatar_url: userData.avatar_url,
            html_url: userData.html_url,
            name: userData.name,
            updated_at: new Date().toISOString(),
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", state.integrationId)
        .eq("user_id", session.user.id)

      if (updateError) {
        console.error("Failed to update GitHub integration:", updateError)
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin}/integrations?error=Failed+to+update+integration`,
        )
      }

      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin}/integrations?success=GitHub+reconnected`,
      )
    }

    // Create new integration
    const { error: insertError } = await supabase.from("integrations").insert({
      user_id: session.user.id,
      provider: "github",
      provider_user_id: userData.id.toString(),
      status: "connected",
      access_token: tokenData.access_token,
      scopes: tokenData.scope ? tokenData.scope.split(",") : [],
      metadata: {
        username: userData.login,
        avatar_url: userData.avatar_url,
        html_url: userData.html_url,
        name: userData.name,
        connected_at: new Date().toISOString(),
      },
    })

    if (insertError) {
      console.error("Failed to insert GitHub integration:", insertError)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin}/integrations?error=Failed+to+create+integration`,
      )
    }

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin}/integrations?success=GitHub+connected`,
    )
  } catch (error) {
    console.error("GitHub OAuth callback error:", error)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin}/integrations?error=Integration+error`,
    )
  }
}
