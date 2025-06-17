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
    console.error(`Error with GitHub OAuth: ${error}`)
    redirectUrl.searchParams.set("error", "Failed to connect GitHub account.")
    return NextResponse.redirect(redirectUrl)
  }

  if (!code) {
    redirectUrl.searchParams.set("error", "No code provided for GitHub OAuth.")
    return NextResponse.redirect(redirectUrl)
  }

  if (!state) {
    redirectUrl.searchParams.set("error", "No state provided for GitHub OAuth.")
    return NextResponse.redirect(redirectUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      redirectUrl.searchParams.set("error", "Missing userId in GitHub state.")
      return NextResponse.redirect(redirectUrl)
    }

    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID!,
        client_secret: process.env.GITHUB_CLIENT_SECRET!,
        code,
        redirect_uri: `${getBaseUrl()}/api/integrations/github/callback`,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error("Failed to exchange GitHub code for token:", errorData)
      redirectUrl.searchParams.set("error", "Failed to get GitHub access token.")
      return NextResponse.redirect(redirectUrl)
    }

    const tokens = await response.json()
    const accessToken = tokens.access_token

    const userInfoResponse = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github.v3+json",
      },
    })

    if (!userInfoResponse.ok) {
      console.error("Failed to fetch GitHub user info")
      redirectUrl.searchParams.set("error", "Failed to fetch GitHub user info.")
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
        provider: "github",
        provider_user_id: providerAccountId.toString(),
        access_token: accessToken,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
        scopes: tokens.scope ? tokens.scope.split(",") : null,
        status: "connected",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id, provider" },
    )

    if (dbError) {
      console.error("Error saving GitHub integration to DB:", dbError)
      redirectUrl.searchParams.set("error", "Failed to save GitHub integration.")
      return NextResponse.redirect(redirectUrl)
    }

    redirectUrl.searchParams.set("success", "GitHub account connected successfully.")
    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    console.error("Error during GitHub OAuth callback:", error)
    redirectUrl.searchParams.set("error", "An unexpected error occurred.")
    return NextResponse.redirect(redirectUrl)
  }
}
