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

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")
  const error_description = searchParams.get("error_description")

  const baseUrl = getBaseUrl(req)
  const redirectUri = `${getBaseUrl(req)}/api/integrations/youtube/callback`

  if (error) {
    console.error("YouTube Auth Error:", error, error_description)
    return NextResponse.redirect(
      `${baseUrl}/integrations?error=youtube_auth_failed&message=${encodeURIComponent(error_description || error)}`,
    )
  }

  if (!code || !state) {
    console.error("Missing code or state")
    return NextResponse.redirect(`${baseUrl}/integrations?error=missing_code_or_state&provider=youtube`)
  }

  try {
    // Parse state to get user ID
    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Failed to parse state:", e)
      return NextResponse.redirect(`${baseUrl}/integrations?error=invalid_state&provider=youtube`)
    }

    const userId = stateData.userId

    if (!userId) {
      console.error("No user ID in state")
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_user_id&provider=youtube`)
    }

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error("Missing Google client ID or secret")
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_client_credentials&provider=youtube`)
    }

    const tokenEndpoint = "https://oauth2.googleapis.com/token"
    const body = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      client_secret: clientSecret,
      code: code,
      grant_type: "authorization_code",
    })

    const response = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    })

    if (!response.ok) {
      console.error("Token request failed", response.status, await response.text())
      return NextResponse.redirect(`${baseUrl}/integrations?error=token_request_failed&provider=youtube`)
    }

    const data = await response.json()
    const accessToken = data.access_token
    const refreshToken = data.refresh_token
    const expires_in = data.expires_in

    if (!accessToken || !refreshToken) {
      console.error("Missing access token or refresh token")
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_tokens&provider=youtube`)
    }

    // Get YouTube channel info
    let userData
    let channelId
    let displayName

    try {
      const userResponse = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      })

      if (userResponse.ok) {
        userData = await userResponse.json()
        const channel = userData.items?.[0]
        if (channel) {
          channelId = channel.id
          displayName = channel.snippet?.title
        }
      }
    } catch (e) {
      console.warn("Could not get YouTube channel info:", e)
    }

    // Fallback to Google profile if YouTube channel not available
    if (!channelId) {
      try {
        const profileResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })

        if (profileResponse.ok) {
          const profileData = await profileResponse.json()
          channelId = profileData.id
          displayName = profileData.name
        }
      } catch (e) {
        console.warn("Could not get Google profile:", e)
      }
    }

    if (!channelId) {
      console.error("Failed to get YouTube user info")
      return NextResponse.redirect(`${baseUrl}/integrations?error=user_info_failed&provider=youtube`)
    }

    const now = new Date().toISOString()

    // Check if integration exists
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "youtube")
      .maybeSingle()

    // Parse YouTube-specific scopes from the token response
    const youtubeScopes = data.scope
      ? data.scope
          .split(" ")
          .filter(
            (scope) =>
              scope.includes("youtube") ||
              scope.includes("userinfo") ||
              scope === "openid" ||
              scope === "profile" ||
              scope === "email",
          )
      : [
          "https://www.googleapis.com/auth/youtube.readonly",
          "https://www.googleapis.com/auth/userinfo.profile",
          "https://www.googleapis.com/auth/userinfo.email",
        ]

    console.log("YouTube scopes being stored:", youtubeScopes)

    const integrationData = {
      user_id: userId,
      provider: "youtube",
      provider_user_id: channelId,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status: "connected",
      scopes: youtubeScopes,
      metadata: {
        display_name: displayName,
        channel_id: channelId,
        connected_at: now,
        scopes: youtubeScopes, // Store scopes in metadata as well for diagnostics
        raw_scope_string: data.scope,
        youtube_specific: true, // Flag to indicate this is YouTube-specific
        token_source: "youtube_oauth", // Indicate the source of the token
      },
      updated_at: now,
    }

    if (existingIntegration) {
      const { error } = await supabase.from("integrations").update(integrationData).eq("id", existingIntegration.id)

      if (error) {
        console.error("Error updating YouTube integration:", error)
        return NextResponse.redirect(`${baseUrl}/integrations?error=database_update_failed&provider=youtube`)
      }
    } else {
      const { error } = await supabase.from("integrations").insert({
        ...integrationData,
        created_at: now,
      })

      if (error) {
        console.error("Error inserting YouTube integration:", error)
        return NextResponse.redirect(`${baseUrl}/integrations?error=database_insert_failed&provider=youtube`)
      }
    }

    // Add a delay to ensure database operations complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    return NextResponse.redirect(`${baseUrl}/integrations?success=youtube_connected&provider=youtube&t=${Date.now()}`)
  } catch (e: any) {
    console.error("Error during YouTube auth:", e)
    return NextResponse.redirect(
      `${baseUrl}/integrations?error=youtube_auth_failed&message=${encodeURIComponent(e.message)}`,
    )
  }
}
