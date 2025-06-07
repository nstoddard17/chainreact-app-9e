import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Use direct Supabase client with service role for reliable database operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined")
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
})

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const baseUrl = new URL(request.url).origin
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("YouTube OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("YouTube OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=youtube", baseUrl))
  }

  if (!code || !state) {
    console.error("Missing code or state in YouTube callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=youtube", baseUrl))
  }

  try {
    // Parse state to get user ID
    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Failed to parse state:", e)
      return NextResponse.redirect(new URL("/integrations?error=invalid_state&provider=youtube", baseUrl))
    }

    const userId = stateData.userId

    if (!userId) {
      console.error("No user ID in state")
      return NextResponse.redirect(new URL("/integrations?error=missing_user_id&provider=youtube", baseUrl))
    }

    const clientId = process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error("Missing YouTube client ID or secret")
      return NextResponse.redirect(new URL("/integrations?error=missing_client_credentials&provider=youtube", baseUrl))
    }

    // Exchange code for token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${getBaseUrl(request)}/api/integrations/youtube/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error("YouTube token exchange failed:", errorText)
      return NextResponse.redirect(
        new URL(
          `/integrations?error=token_exchange_failed&provider=youtube&message=${encodeURIComponent(errorText)}`,
          baseUrl,
        ),
      )
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in } = tokenData

    // Get user info - first try YouTube API
    let userData
    let channelId
    let channelTitle
    let channelDescription

    try {
      const userResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      })

      if (userResponse.ok) {
        userData = await userResponse.json()
        const channel = userData.items?.[0]
        channelId = channel?.id
        channelTitle = channel?.snippet?.title
        channelDescription = channel?.snippet?.description
      } else {
        console.warn("Could not get YouTube channel info, falling back to Google profile")
      }
    } catch (e) {
      console.warn("Error fetching YouTube channel:", e)
    }

    // If YouTube API fails, fall back to Google profile
    if (!channelId) {
      try {
        const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: {
            Authorization: `Bearer ${access_token}`,
          },
        })

        if (profileResponse.ok) {
          const profileData = await profileResponse.json()
          channelId = profileData.id
          channelTitle = profileData.name
        } else {
          console.error("Failed to get Google profile:", await profileResponse.text())
        }
      } catch (e) {
        console.error("Error fetching Google profile:", e)
      }
    }

    if (!channelId) {
      channelId = `unknown_${Date.now()}`
      channelTitle = "Unknown Channel"
    }

    const now = new Date().toISOString()

    // Check if integration exists
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "youtube")
      .maybeSingle()

    const integrationData = {
      user_id: userId,
      provider: "youtube",
      provider_user_id: channelId,
      access_token,
      refresh_token,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status: "connected",
      scopes: tokenData.scope ? tokenData.scope.split(" ") : ["https://www.googleapis.com/auth/youtube.readonly"],
      metadata: {
        channel_id: channelId,
        channel_title: channelTitle,
        channel_description: channelDescription,
        connected_at: now,
      },
      updated_at: now,
    }

    if (existingIntegration) {
      const { error } = await supabase.from("integrations").update(integrationData).eq("id", existingIntegration.id)

      if (error) {
        console.error("Error updating YouTube integration:", error)
        return NextResponse.redirect(new URL("/integrations?error=database_update_failed&provider=youtube", baseUrl))
      }
    } else {
      const { error } = await supabase.from("integrations").insert({
        ...integrationData,
        created_at: now,
      })

      if (error) {
        console.error("Error inserting YouTube integration:", error)
        return NextResponse.redirect(new URL("/integrations?error=database_insert_failed&provider=youtube", baseUrl))
      }
    }

    // Add a delay to ensure database operations complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    return NextResponse.redirect(new URL(`/integrations?success=true&provider=youtube&t=${Date.now()}`, baseUrl))
  } catch (error: any) {
    console.error("YouTube OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=youtube&message=${encodeURIComponent(error.message)}`,
        baseUrl,
      ),
    )
  }
}
