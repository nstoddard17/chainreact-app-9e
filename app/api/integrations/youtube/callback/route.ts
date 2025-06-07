import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// Use direct Supabase client with service role for reliable database operations
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase environment variables:", {
    hasUrl: !!supabaseUrl,
    hasKey: !!supabaseKey,
  })
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined")
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
  },
})

export async function GET(request: NextRequest) {
  console.log("=== YouTube OAuth Callback Started ===")

  const searchParams = request.nextUrl.searchParams
  const baseUrl = new URL(request.url).origin
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  console.log("YouTube OAuth callback params:", {
    hasCode: !!code,
    state: state?.substring(0, 50) + "...",
    error,
    baseUrl,
  })

  if (error) {
    console.error("YouTube OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=true&provider=youtube", baseUrl))
  }

  if (!code || !state) {
    console.error("Missing code or state in YouTube callback")
    return NextResponse.redirect(
      new URL("/integrations?error=true&provider=youtube&message=Missing+parameters", baseUrl),
    )
  }

  try {
    // Parse state to get user ID
    let stateData
    try {
      stateData = JSON.parse(atob(state))
      console.log("Parsed state data:", { userId: stateData.userId, provider: stateData.provider })
    } catch (e) {
      console.error("Failed to parse state:", e)
      return NextResponse.redirect(new URL("/integrations?error=true&provider=youtube&message=Invalid+state", baseUrl))
    }

    const userId = stateData.userId

    if (!userId) {
      console.error("No user ID in state")
      return NextResponse.redirect(
        new URL("/integrations?error=true&provider=youtube&message=Missing+user+ID", baseUrl),
      )
    }

    console.log("Processing YouTube OAuth for user:", userId)

    const clientId = process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET

    console.log("OAuth credentials check:", {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      clientIdSource: process.env.NEXT_PUBLIC_YOUTUBE_CLIENT_ID ? "YouTube" : "Google",
    })

    if (!clientId || !clientSecret) {
      console.error("Missing YouTube client ID or secret")
      return NextResponse.redirect(
        new URL("/integrations?error=true&provider=youtube&message=Missing+credentials", baseUrl),
      )
    }

    // Exchange code for token
    console.log("Exchanging code for token...")
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
      console.error("YouTube token exchange failed:", {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorText,
      })
      return NextResponse.redirect(
        new URL(
          `/integrations?error=true&provider=youtube&message=${encodeURIComponent("Token exchange failed")}`,
          baseUrl,
        ),
      )
    }

    const tokenData = await tokenResponse.json()
    console.log("Token exchange successful:", {
      hasAccessToken: !!tokenData.access_token,
      hasRefreshToken: !!tokenData.refresh_token,
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope,
    })

    const { access_token, refresh_token, expires_in } = tokenData

    // Get user info - first try YouTube API
    console.log("Fetching YouTube channel info...")
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
        console.log("YouTube channel info:", { channelId, channelTitle })
      } else {
        console.warn("Could not get YouTube channel info, status:", userResponse.status)
        const errorText = await userResponse.text()
        console.warn("YouTube API error:", errorText)
      }
    } catch (e) {
      console.warn("Error fetching YouTube channel:", e)
    }

    // If YouTube API fails, fall back to Google profile
    if (!channelId) {
      console.log("Falling back to Google profile...")
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
          console.log("Google profile info:", { channelId, channelTitle })
        } else {
          console.error("Failed to get Google profile:", profileResponse.status)
          const errorText = await profileResponse.text()
          console.error("Google profile error:", errorText)
        }
      } catch (e) {
        console.error("Error fetching Google profile:", e)
      }
    }

    if (!channelId) {
      channelId = `unknown_${Date.now()}`
      channelTitle = "Unknown Channel"
      console.log("Using fallback channel info:", { channelId, channelTitle })
    }

    const now = new Date().toISOString()

    // Test database connection first
    console.log("Testing database connection...")
    try {
      const { data: testData, error: testError } = await supabase.from("integrations").select("count").limit(1)

      if (testError) {
        console.error("Database connection test failed:", testError)
        throw new Error(`Database connection failed: ${testError.message}`)
      }
      console.log("Database connection successful")
    } catch (dbError) {
      console.error("Database connection error:", dbError)
      return NextResponse.redirect(
        new URL("/integrations?error=true&provider=youtube&message=Database+connection+failed", baseUrl),
      )
    }

    // Check if integration exists
    console.log("Checking for existing integration...")
    const { data: existingIntegration, error: findError } = await supabase
      .from("integrations")
      .select("id, status, created_at")
      .eq("user_id", userId)
      .eq("provider", "youtube")
      .maybeSingle()

    if (findError) {
      console.error("Error checking for existing integration:", findError)
    } else {
      console.log("Existing integration check:", {
        found: !!existingIntegration,
        id: existingIntegration?.id,
        status: existingIntegration?.status,
      })
    }

    // Prepare integration data
    const integrationData = {
      user_id: userId,
      provider: "youtube",
      provider_user_id: channelId,
      access_token,
      refresh_token,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status: "connected",
      scopes: tokenData.scope ? tokenData.scope.split(" ") : ["https://www.googleapis.com/auth/youtube.readonly"],
      granted_scopes: tokenData.scope
        ? tokenData.scope.split(" ")
        : ["https://www.googleapis.com/auth/youtube.readonly"],
      metadata: {
        channel_id: channelId,
        channel_title: channelTitle,
        channel_description: channelDescription,
        connected_at: now,
      },
      updated_at: now,
    }

    console.log("Integration data prepared:", {
      user_id: integrationData.user_id,
      provider: integrationData.provider,
      provider_user_id: integrationData.provider_user_id,
      status: integrationData.status,
      hasAccessToken: !!integrationData.access_token,
      hasRefreshToken: !!integrationData.refresh_token,
      expires_at: integrationData.expires_at,
      scopes: integrationData.scopes,
    })

    let result
    if (existingIntegration) {
      console.log("Updating existing YouTube integration:", existingIntegration.id)
      result = await supabase.from("integrations").update(integrationData).eq("id", existingIntegration.id).select()

      console.log("Update result:", {
        error: result.error,
        dataCount: result.data?.length,
        updatedId: result.data?.[0]?.id,
      })
    } else {
      console.log("Creating new YouTube integration")
      result = await supabase
        .from("integrations")
        .insert({
          ...integrationData,
          created_at: now,
        })
        .select()

      console.log("Insert result:", {
        error: result.error,
        dataCount: result.data?.length,
        insertedId: result.data?.[0]?.id,
      })
    }

    if (result.error) {
      console.error("Database operation failed:", {
        error: result.error,
        code: result.error.code,
        message: result.error.message,
        details: result.error.details,
        hint: result.error.hint,
      })
      return NextResponse.redirect(
        new URL(
          `/integrations?error=true&provider=youtube&message=${encodeURIComponent(result.error.message)}`,
          baseUrl,
        ),
      )
    }

    console.log("YouTube integration saved successfully:", result.data?.[0]?.id)

    // Verify the save by reading it back
    console.log("Verifying saved integration...")
    const { data: verifyData, error: verifyError } = await supabase
      .from("integrations")
      .select("id, provider, status, user_id")
      .eq("user_id", userId)
      .eq("provider", "youtube")
      .maybeSingle()

    if (verifyError) {
      console.error("Verification failed:", verifyError)
    } else {
      console.log("Verification successful:", verifyData)
    }

    console.log("=== YouTube OAuth Callback Completed Successfully ===")

    // Add a delay to ensure database operations complete
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Use the correct success parameter format that the UI is expecting
    return NextResponse.redirect(new URL(`/integrations?success=true&provider=youtube&t=${Date.now()}`, baseUrl))
  } catch (error: any) {
    console.error("YouTube OAuth callback error:", {
      message: error.message,
      stack: error.stack,
      name: error.name,
    })
    return NextResponse.redirect(
      new URL(`/integrations?error=true&provider=youtube&message=${encodeURIComponent(error.message)}`, baseUrl),
    )
  }
}
