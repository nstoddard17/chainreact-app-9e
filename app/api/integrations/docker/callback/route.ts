import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

// Validate environment variables
if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable")
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable")
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")

  const redirectUrl = new URL("/integrations", getBaseUrl())

  if (error) {
    console.error(`Error with Docker OAuth: ${error}`)
    redirectUrl.searchParams.set("error", "Failed to connect Docker account.")
    return NextResponse.redirect(redirectUrl)
  }

  if (!code) {
    redirectUrl.searchParams.set("error", "No code provided for Docker OAuth.")
    return NextResponse.redirect(redirectUrl)
  }

  if (!state) {
    redirectUrl.searchParams.set("error", "No state provided for Docker OAuth.")
    return NextResponse.redirect(redirectUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      redirectUrl.searchParams.set("error", "Missing userId in Docker state.")
      return NextResponse.redirect(redirectUrl)
    }

    const response = await fetch("https://hub.docker.com/v2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: process.env.NEXT_PUBLIC_DOCKER_CLIENT_ID!,
        client_secret: process.env.DOCKER_CLIENT_SECRET!,
        redirect_uri: `${getBaseUrl()}/api/integrations/docker/callback`,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error("Failed to exchange Docker code for token:", errorData)
      redirectUrl.searchParams.set("error", "Failed to get Docker access token.")
      return NextResponse.redirect(redirectUrl)
    }

    const tokens = await response.json()
    const accessToken = tokens.access_token
    const refreshToken = tokens.refresh_token

    const userInfoResponse = await fetch("https://hub.docker.com/v2/user/", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userInfoResponse.ok) {
      console.error("Failed to fetch Docker user info")
      redirectUrl.searchParams.set("error", "Failed to fetch Docker user info.")
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
        provider: "docker",
        provider_user_id: providerAccountId,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null,
        scopes: tokens.scope ? tokens.scope.split(" ") : null,
        status: "connected",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id, provider" },
    )

    if (dbError) {
      console.error("Error saving Docker integration to DB:", dbError)
      redirectUrl.searchParams.set("error", "Failed to save Docker integration.")
      return NextResponse.redirect(redirectUrl)
    }

    redirectUrl.searchParams.set("success", "Docker account connected successfully.")
    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    console.error("Error during Docker OAuth callback:", error)
    redirectUrl.searchParams.set("error", "An unexpected error occurred.")
    return NextResponse.redirect(redirectUrl)
  }
}
