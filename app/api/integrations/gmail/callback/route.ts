import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"

// Create a Supabase client with admin privileges
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(request: NextRequest) {
  console.log("Gmail OAuth callback received")

  try {
    const searchParams = request.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")
    const baseUrl = getBaseUrl(request)

    console.log("Gmail callback params:", {
      hasCode: !!code,
      hasState: !!state,
      error,
    })

    if (error) {
      console.error("Gmail OAuth error:", error)
      const errorDescription = searchParams.get("error_description")
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=${encodeURIComponent(error)}&message=${encodeURIComponent(errorDescription || "")}&provider=gmail`,
      )
    }

    if (!code || !state) {
      console.error("Missing code or state in Gmail callback")
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=missing_parameters&message=Authorization code or state is missing&provider=gmail`,
      )
    }

    // Parse state
    let stateData
    try {
      stateData = JSON.parse(atob(state))
      console.log("Gmail parsed state:", stateData)
    } catch (error) {
      console.error("Invalid state parameter in Gmail callback:", error)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=invalid_state&message=Invalid state parameter&provider=gmail`,
      )
    }

    const { userId } = stateData

    if (!userId) {
      console.error("Missing userId in Gmail state")
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=missing_user_id&message=User ID is missing from state&provider=gmail`,
      )
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${baseUrl}/api/integrations/gmail/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text()
      console.error("Gmail token exchange failed:", errorData)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=token_exchange_failed&message=Failed to exchange authorization code for tokens&provider=gmail`,
      )
    }

    const tokens = await tokenResponse.json()
    console.log("Gmail tokens received:", {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      expiresIn: tokens.expires_in,
    })

    // Get user info
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    })

    if (!userResponse.ok) {
      console.error("Failed to get Gmail user info")
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=user_info_failed&message=Failed to get user information&provider=gmail`,
      )
    }

    const userInfo = await userResponse.json()
    console.log("Gmail user info:", {
      email: userInfo.email,
      name: userInfo.name,
    })

    // Calculate token expiration
    const expiresAt = tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000).toISOString() : null

    // Save integration to database
    try {
      // Check if integration already exists
      const { data: existingIntegration } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "gmail")
        .single()

      const now = new Date().toISOString()

      if (existingIntegration) {
        // Update existing integration
        await supabase
          .from("integrations")
          .update({
            provider_user_id: userInfo.id,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || null,
            expires_at: expiresAt,
            status: "connected",
            scopes: tokens.scope ? tokens.scope.split(" ") : [],
            metadata: {
              email: userInfo.email,
              name: userInfo.name,
              picture: userInfo.picture,
            },
            updated_at: now,
          })
          .eq("id", existingIntegration.id)

        console.log("Updated existing Gmail integration:", existingIntegration.id)
      } else {
        // Create new integration
        const { data: newIntegration, error } = await supabase
          .from("integrations")
          .insert({
            user_id: userId,
            provider: "gmail",
            provider_user_id: userInfo.id,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || null,
            expires_at: expiresAt,
            status: "connected",
            scopes: tokens.scope ? tokens.scope.split(" ") : [],
            metadata: {
              email: userInfo.email,
              name: userInfo.name,
              picture: userInfo.picture,
            },
            created_at: now,
            updated_at: now,
          })
          .select("id")
          .single()

        if (error) {
          throw error
        }

        console.log("Created new Gmail integration:", newIntegration?.id)
      }

      // Add a timestamp to ensure the client doesn't get a cached response
      const timestamp = Date.now()
      return NextResponse.redirect(`${baseUrl}/integrations?success=true&provider=gmail&t=${timestamp}`)
    } catch (error) {
      console.error("Failed to save Gmail integration to database:", error)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=database_error&message=Failed to save integration&provider=gmail`,
      )
    }
  } catch (error: any) {
    console.error("Gmail callback error:", error)
    return NextResponse.redirect(
      `${getBaseUrl(request)}/integrations?error=unexpected_error&message=${encodeURIComponent(error.message || "An unexpected error occurred")}&provider=gmail`,
    )
  }
}
