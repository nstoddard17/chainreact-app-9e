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
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=tiktok", request.url))
  }

  if (!code || !state) {
    console.error("Missing code or state in TikTok callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=tiktok", request.url))
  }

  try {
    // Decode state to get provider info
    const stateData = JSON.parse(atob(state))
    const { provider, reconnect, integrationId } = stateData

    console.log("Decoded state data:", stateData)

    if (provider !== "tiktok") {
      throw new Error("Invalid provider in state")
    }

    // Exchange code for access token
    console.log("Exchanging code for access token...")
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
      throw new Error(`Failed to exchange code for token: ${errorData}`)
    }

    const tokenData = await tokenResponse.json()
    console.log("Token exchange successful:", { hasAccessToken: !!tokenData.data?.access_token })
    const { access_token, expires_in, open_id } = tokenData.data

    // Get user info from TikTok
    console.log("Fetching user info from TikTok...")
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
      const errorData = await userResponse.text()
      console.error("Failed to get user info from TikTok:", errorData)
      throw new Error(`Failed to get user info: ${errorData}`)
    }

    const userData = await userResponse.json()
    const user = userData.data.user
    console.log("User info fetched successfully:", { openId: user.open_id })

    // Store integration in Supabase with robust session handling
    const supabase = getSupabaseClient()

    // Try multiple methods to get session
    let session = null
    try {
      const {
        data: { session: cookieSession },
      } = await supabase.auth.getSession()
      session = cookieSession
      console.log("Session from cookies:", !!session)
    } catch (error) {
      console.log("Failed to get session from cookies:", error)
    }

    // If no session from cookies, try authorization headers
    if (!session) {
      try {
        const authHeader = request.headers.get("authorization")
        if (authHeader?.startsWith("Bearer ")) {
          const token = authHeader.substring(7)
          const {
            data: { user },
          } = await supabase.auth.getUser(token)
          if (user) {
            session = { user }
            console.log("Session from auth header:", !!session)
          }
        }
      } catch (error) {
        console.log("Failed to get session from headers:", error)
      }
    }

    // For reconnection scenarios, try to find user from existing integration
    if (!session && reconnect && integrationId) {
      try {
        const { data: existingIntegration } = await supabase
          .from("integrations")
          .select("user_id")
          .eq("id", integrationId)
          .single()

        if (existingIntegration) {
          session = { user: { id: existingIntegration.user_id } }
          console.log("Session from existing integration:", !!session)
        }
      } catch (error) {
        console.log("Failed to get user from existing integration:", error)
      }
    }

    if (!session) {
      console.error("No session found after all attempts")
      return NextResponse.redirect(new URL("/integrations?error=no_session&provider=tiktok", request.url))
    }

    const integrationData = {
      user_id: session.user.id,
      provider: "tiktok",
      provider_user_id: user.open_id,
      access_token,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
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

    console.log("Saving integration to database...", {
      userId: session.user.id,
      provider: "tiktok",
      reconnect,
      integrationId,
    })

    if (reconnect && integrationId) {
      // Update existing integration
      const { error } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integrationId)

      if (error) {
        console.error("Error updating integration:", error)
        throw error
      }
      console.log("Integration updated successfully")
    } else {
      // Create new integration
      const { error } = await supabase.from("integrations").insert(integrationData)
      if (error) {
        console.error("Error inserting integration:", error)
        throw error
      }
      console.log("Integration created successfully")
    }

    console.log("TikTok integration saved successfully")
    return NextResponse.redirect(new URL("/integrations?success=tiktok_connected", request.url))
  } catch (error: any) {
    console.error("TikTok OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=tiktok&message=${encodeURIComponent(error.message)}`,
        request.url,
      ),
    )
  }
}
