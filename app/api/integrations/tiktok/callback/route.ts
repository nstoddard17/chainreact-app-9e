import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseClient } from "@/lib/supabase"

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("TikTok OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("TikTok OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in TikTok callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params", request.url))
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    if (provider !== "tiktok") {
      throw new Error("Invalid provider in state")
    }

    // Exchange code for access token
    const tokenResponse = await fetch("https://open-api.tiktok.com/oauth/access_token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_key: process.env.NEXT_PUBLIC_TIKTOK_CLIENT_ID!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${request.nextUrl.origin}/api/integrations/tiktok/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("TikTok token exchange failed:", errorData)
      throw new Error("Failed to exchange code for token")
    }

    const tokenData = await tokenResponse.json()
    const { access_token, expires_in, open_id } = tokenData.data

    // Get user info from TikTok
    const userResponse = await fetch("https://open-api.tiktok.com/user/info/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access_token}`,
      },
      body: JSON.stringify({
        access_token,
        open_id,
        fields: ["open_id", "union_id", "avatar_url", "display_name"],
      }),
    })

    if (!userResponse.ok) {
      throw new Error("Failed to get user info")
    }

    const userData = await userResponse.json()
    const user = userData.data.user

    // Store integration in Supabase
    const supabase = getSupabaseClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session) {
      throw new Error("No session found")
    }

    const integrationData = {
      user_id: session.user.id,
      provider: "tiktok",
      provider_user_id: user.open_id,
      access_token,
      expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
      status: "connected" as const,
      scopes: ["user.info.basic", "video.upload"],
      metadata: {
        open_id: user.open_id,
        union_id: user.union_id,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        connected_at: new Date().toISOString(),
      },
    }

    if (reconnect && integrationId) {
      // Update existing integration
      const { error } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integrationId)

      if (error) throw error
    } else {
      // Create new integration
      const { error } = await supabase.from("integrations").insert(integrationData)
      if (error) throw error
    }

    console.log("TikTok integration saved successfully")
    return NextResponse.redirect(new URL("/integrations?success=tiktok_connected", request.url))
  } catch (error: any) {
    console.error("TikTok OAuth callback error:", error)
    return NextResponse.redirect(new URL("/integrations?error=callback_failed", request.url))
  }
}
