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
    console.error(`Error with Facebook OAuth: ${error}`)
    redirectUrl.searchParams.set("error", "Failed to connect Facebook account.")
    return NextResponse.redirect(redirectUrl)
  }

  if (!code) {
    redirectUrl.searchParams.set("error", "No code provided for Facebook OAuth.")
    return NextResponse.redirect(redirectUrl)
  }

  if (!state) {
    redirectUrl.searchParams.set("error", "No state provided for Facebook OAuth.")
    return NextResponse.redirect(redirectUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      redirectUrl.searchParams.set("error", "Missing userId in Facebook state.")
      return NextResponse.redirect(redirectUrl)
    }

    const tokenUrl = new URL("https://graph.facebook.com/v15.0/oauth/access_token")
    tokenUrl.searchParams.set("client_id", process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID!)
    tokenUrl.searchParams.set("redirect_uri", `${getBaseUrl()}/api/integrations/facebook/callback`)
    tokenUrl.searchParams.set("client_secret", process.env.FACEBOOK_CLIENT_SECRET!)
    tokenUrl.searchParams.set("code", code)

    const response = await fetch(tokenUrl)

    if (!response.ok) {
      const errorData = await response.json()
      console.error("Failed to exchange Facebook code for token:", errorData)
      redirectUrl.searchParams.set("error", "Failed to get Facebook access token.")
      return NextResponse.redirect(redirectUrl)
    }

    const tokens = await response.json()
    const accessToken = tokens.access_token

    const userInfoResponse = await fetch(`https://graph.facebook.com/me?fields=id,name,email&access_token=${accessToken}`)

    if (!userInfoResponse.ok) {
      console.error("Failed to fetch Facebook user info")
      redirectUrl.searchParams.set("error", "Failed to fetch Facebook user info.")
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
        provider: "facebook",
        provider_account_id: providerAccountId,
        access_token: accessToken,
        status: "connected",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id, provider" },
    )

    if (dbError) {
      console.error("Error saving Facebook integration to DB:", dbError)
      redirectUrl.searchParams.set("error", "Failed to save Facebook integration.")
      return NextResponse.redirect(redirectUrl)
    }

    redirectUrl.searchParams.set("success", "Facebook account connected successfully.")
    return NextResponse.redirect(redirectUrl)
  } catch (error) {
    console.error("Error during Facebook OAuth callback:", error)
    redirectUrl.searchParams.set("error", "An unexpected error occurred.")
    return NextResponse.redirect(redirectUrl)
  }
}
