import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export async function GET(req: NextRequest) {
  console.log("LinkedIn OAuth callback initiated")

  try {
    const searchParams = req.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    console.log("LinkedIn callback params:", {
      hasCode: !!code,
      hasState: !!state,
      error,
      fullUrl: req.url,
    })

    if (error) {
      console.error("LinkedIn OAuth error:", error)
      const baseUrl = getBaseUrl(req)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=oauth_error&provider=linkedin&message=${encodeURIComponent(error)}`,
      )
    }

    if (!code || !state) {
      console.error("LinkedIn: Missing code or state parameter")
      const baseUrl = getBaseUrl(req)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=missing_params&provider=linkedin&message=${encodeURIComponent("Missing authorization code or state")}`,
      )
    }

    // Parse state
    let stateData
    try {
      stateData = JSON.parse(atob(state))
      console.log("LinkedIn state data:", stateData)
    } catch (stateError) {
      console.error("LinkedIn: Invalid state parameter:", stateError)
      const baseUrl = getBaseUrl(req)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=invalid_state&provider=linkedin&message=${encodeURIComponent("Invalid state parameter")}`,
      )
    }

    const { provider, userId, reconnect, integrationId } = stateData

    if (provider !== "linkedin") {
      console.error("LinkedIn: Invalid provider in state:", provider)
      const baseUrl = getBaseUrl(req)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=invalid_provider&provider=linkedin&message=${encodeURIComponent("Invalid provider in state")}`,
      )
    }

    if (!userId) {
      console.error("LinkedIn: Missing userId in state")
      const baseUrl = getBaseUrl(req)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=missing_user&provider=linkedin&message=${encodeURIComponent("Missing user ID")}`,
      )
    }

    // Exchange code for access token
    console.log("LinkedIn: Exchanging code for access token")

    const clientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error("LinkedIn: Missing OAuth configuration")
      const baseUrl = getBaseUrl(req)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=config_error&provider=linkedin&message=${encodeURIComponent("LinkedIn OAuth not configured")}`,
      )
    }

    const tokenResponse = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${getBaseUrl(req)}/api/integrations/linkedin/callback`,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}))
      console.error("LinkedIn: Token exchange failed:", {
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        error: errorData,
      })

      const baseUrl = getBaseUrl(req)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=token_exchange&provider=linkedin&message=${encodeURIComponent("Failed to exchange authorization code for access token")}`,
      )
    }

    const tokenData = await tokenResponse.json()
    console.log("LinkedIn: Token exchange successful")

    const { access_token, expires_in } = tokenData

    // Get user info
    console.log("LinkedIn: Fetching user info")
    const userResponse = await fetch("https://api.linkedin.com/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!userResponse.ok) {
      console.error("LinkedIn: Failed to get user info:", userResponse.status, userResponse.statusText)
      const baseUrl = getBaseUrl(req)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=user_info&provider=linkedin&message=${encodeURIComponent("Failed to get user information")}`,
      )
    }

    const userData = await userResponse.json()
    console.log("LinkedIn: User info retrieved:", {
      sub: userData.sub,
      email: userData.email,
      name: userData.name,
    })

    // Create Supabase client with service role
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Prepare integration data
    const integrationData = {
      user_id: userId,
      provider: "linkedin",
      provider_user_id: userData.sub,
      access_token,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status: "connected" as const,
      scopes: ["openid", "profile", "email", "w_member_social"],
      metadata: {
        first_name: userData.given_name,
        last_name: userData.family_name,
        email: userData.email,
        name: userData.name,
        picture: userData.picture,
        connected_at: new Date().toISOString(),
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    console.log("LinkedIn: Saving integration to database")

    // Save to database with upsert logic
    if (reconnect && integrationId) {
      const { error: updateError } = await supabase
        .from("integrations")
        .update({
          ...integrationData,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integrationId)

      if (updateError) {
        console.error("LinkedIn: Database update error:", updateError)
        throw updateError
      }
      console.log("LinkedIn: Integration updated successfully")
    } else {
      // Check if integration already exists
      const { data: existingIntegration } = await supabase
        .from("integrations")
        .select("id")
        .eq("user_id", userId)
        .eq("provider", "linkedin")
        .single()

      if (existingIntegration) {
        // Update existing integration
        const { error: updateError } = await supabase
          .from("integrations")
          .update({
            ...integrationData,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingIntegration.id)

        if (updateError) {
          console.error("LinkedIn: Database update error:", updateError)
          throw updateError
        }
        console.log("LinkedIn: Existing integration updated successfully")
      } else {
        // Insert new integration
        const { error: insertError } = await supabase.from("integrations").insert(integrationData)

        if (insertError) {
          console.error("LinkedIn: Database insert error:", insertError)
          throw insertError
        }
        console.log("LinkedIn: New integration created successfully")
      }
    }

    // Add a small delay to ensure database operations complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    console.log("LinkedIn: OAuth flow completed successfully")
    const baseUrl = getBaseUrl(req)
    const timestamp = Date.now()

    return NextResponse.redirect(`${baseUrl}/integrations?success=true&provider=linkedin&t=${timestamp}`)
  } catch (error: any) {
    console.error("LinkedIn: OAuth callback error:", error)
    const baseUrl = getBaseUrl(req)
    return NextResponse.redirect(
      `${baseUrl}/integrations?error=callback_error&provider=linkedin&message=${encodeURIComponent(error.message || "An unexpected error occurred")}`,
    )
  }
}
