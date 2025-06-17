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
    console.error(`Error with Gmail OAuth: ${error}`)
    redirectUrl.searchParams.set("error", "Failed to connect Gmail account.")
    return NextResponse.redirect(redirectUrl)
  }

  if (!code) {
    redirectUrl.searchParams.set("error", "No code provided for Gmail OAuth.")
    return NextResponse.redirect(redirectUrl)
  }

  if (!state) {
    redirectUrl.searchParams.set("error", "No state provided for Gmail OAuth.")
    return NextResponse.redirect(redirectUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      redirectUrl.searchParams.set("error", "Missing userId in Gmail state.")
      return NextResponse.redirect(redirectUrl)
    }

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error("Missing Google Client ID or Client Secret environment variables.")
      redirectUrl.searchParams.set("error", "Server configuration error for Gmail OAuth.")
      return NextResponse.redirect(redirectUrl)
    }

    let tokens
    try {
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: `${getBaseUrl()}/api/integrations/gmail/callback`,
          grant_type: "authorization_code",
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error("Failed to exchange Gmail code for token:", JSON.stringify(errorData, null, 2))
        redirectUrl.searchParams.set(
          "error",
          `Failed to get Gmail access token: ${errorData.error_description || errorData.error}`,
        )
        return NextResponse.redirect(redirectUrl)
      }
      tokens = await response.json()
    } catch (fetchError: any) {
      console.error("Error fetching Google token:", fetchError)
      redirectUrl.searchParams.set("error", `Token fetch failed: ${fetchError.message}`)
      return NextResponse.redirect(redirectUrl)
    }

    const accessToken = tokens.access_token
    const refreshToken = tokens.refresh_token
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userInfoResponse.ok) {
      console.error("Failed to fetch Gmail user info")
      redirectUrl.searchParams.set("error", "Failed to fetch Gmail user info.")
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
        provider: "gmail",
        provider_account_id: providerAccountId,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: expiresAt,
        status: "connected",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id, provider" },
    )

    if (dbError) {
      console.error("Error saving Gmail integration to DB:", dbError)
      redirectUrl.searchParams.set("error", "Failed to save Gmail integration.")
      return NextResponse.redirect(redirectUrl)
    }

    redirectUrl.searchParams.set("success", "Gmail account connected successfully.")
    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    console.error("Error during Gmail OAuth callback:", error)
    redirectUrl.searchParams.set("error", "An unexpected error occurred.")
    return NextResponse.redirect(redirectUrl)
  }
}
