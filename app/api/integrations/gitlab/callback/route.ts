import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")

  const redirectUrl = new URL("/integrations", getBaseUrl())

  if (error) {
    console.error(`Error with GitLab OAuth: ${error}`)
    redirectUrl.searchParams.set("error", "Failed to connect GitLab account.")
    return NextResponse.redirect(redirectUrl)
  }

  if (!code) {
    redirectUrl.searchParams.set("error", "No code provided for GitLab OAuth.")
    return NextResponse.redirect(redirectUrl)
  }

  if (!state) {
    redirectUrl.searchParams.set("error", "No state provided for GitLab OAuth.")
    return NextResponse.redirect(redirectUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      redirectUrl.searchParams.set("error", "Missing userId in GitLab state.")
      return NextResponse.redirect(redirectUrl)
    }

    const response = await fetch("https://gitlab.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID!,
        client_secret: process.env.GITLAB_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${getBaseUrl()}/api/integrations/gitlab/callback`,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error("Failed to exchange GitLab code for token:", errorData)
      redirectUrl.searchParams.set("error", "Failed to get GitLab access token.")
      return NextResponse.redirect(redirectUrl)
    }

    const tokens = await response.json()
    const accessToken = tokens.access_token
    const refreshToken = tokens.refresh_token
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const userInfoResponse = await fetch("https://gitlab.com/api/v4/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userInfoResponse.ok) {
      console.error("Failed to fetch GitLab user info")
      redirectUrl.searchParams.set("error", "Failed to fetch GitLab user info.")
      return NextResponse.redirect(redirectUrl)
    }

    const userInfo = await userInfoResponse.json()
    const providerAccountId = userInfo.id

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    const { error: dbError } = await supabase.from("integrations").upsert(
      {
        user_id: userId,
        provider: "gitlab",
        provider_account_id: providerAccountId.toString(),
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        status: "connected",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id, provider" },
    )

    if (dbError) {
      console.error("Error saving GitLab integration to DB:", dbError)
      redirectUrl.searchParams.set("error", "Failed to save GitLab integration.")
      return NextResponse.redirect(redirectUrl)
    }

    redirectUrl.searchParams.set("success", "GitLab account connected successfully.")
    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    console.error("Error during GitLab OAuth callback:", error)
    redirectUrl.searchParams.set("error", "An unexpected error occurred.")
    return NextResponse.redirect(redirectUrl)
  }
}
