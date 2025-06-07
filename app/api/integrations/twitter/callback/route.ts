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
  const errorDescription = searchParams.get("error_description")

  console.log("X (Twitter) OAuth callback received:", {
    hasCode: !!code,
    hasState: !!state,
    error,
    errorDescription,
    baseUrl,
    fullUrl: request.url,
  })

  if (error) {
    console.error("X (Twitter) OAuth error:", { error, errorDescription })
    const errorMessage = errorDescription || error
    return NextResponse.redirect(
      new URL(`/integrations?error=oauth_error&provider=twitter&message=${encodeURIComponent(errorMessage)}`, baseUrl),
    )
  }

  if (!code || !state) {
    console.error("Missing code or state in X (Twitter) callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=twitter", baseUrl))
  }

  try {
    // Parse state to get user ID
    let stateData
    try {
      stateData = JSON.parse(atob(state))
      console.log("Parsed state data:", stateData)
    } catch (e) {
      console.error("Failed to parse state:", e)
      return NextResponse.redirect(new URL("/integrations?error=invalid_state&provider=twitter", baseUrl))
    }

    const userId = stateData.userId

    if (!userId) {
      console.error("No user ID in state")
      return NextResponse.redirect(new URL("/integrations?error=missing_user_id&provider=twitter", baseUrl))
    }

    console.log("Processing Twitter OAuth for user:", userId)

    const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
    const clientSecret = process.env.TWITTER_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error("Missing X (Twitter) client ID or secret")
      return NextResponse.redirect(new URL("/integrations?error=missing_client_credentials&provider=twitter", baseUrl))
    }

    // Use dynamic redirect URI
    const redirectUri = `${baseUrl}/api/integrations/twitter/callback`

    console.log("Exchanging code for token with:", {
      clientId,
      redirectUri,
      hasClientSecret: !!clientSecret,
    })

    // Exchange code for token
    const tokenResponse = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(clientId + ":" + clientSecret).toString("base64")}`,
      },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: "challenge",
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error("X (Twitter) token exchange failed:", errorText)
      return NextResponse.redirect(new URL("/integrations?error=token_exchange_failed&provider=twitter", baseUrl))
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in, scope } = tokenData

    console.log("Token exchange successful:", {
      hasAccessToken: !!access_token,
      hasRefreshToken: !!refresh_token,
      expiresIn: expires_in,
      scope,
    })

    // Get user info
    const userResponse = await fetch("https://api.twitter.com/2/users/me", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!userResponse.ok) {
      const errorText = await userResponse.text()
      console.error("X (Twitter) user info failed:", errorText)
      return NextResponse.redirect(new URL("/integrations?error=user_info_failed&provider=twitter", baseUrl))
    }

    const userData = await userResponse.json()
    const user = userData.data
    const now = new Date().toISOString()

    console.log("User info retrieved:", {
      userId: user.id,
      username: user.username,
      name: user.name,
    })

    // Check if integration exists
    const { data: existingIntegration, error: findError } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "twitter")
      .maybeSingle()

    if (findError) {
      console.error("Error checking for existing integration:", findError)
    }

    console.log("Existing integration check:", { exists: !!existingIntegration, findError })

    const integrationData = {
      user_id: userId,
      provider: "twitter",
      provider_user_id: user.id,
      access_token,
      refresh_token,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status: "connected",
      scopes: scope ? scope.split(" ") : [],
      metadata: {
        username: user.username,
        user_name: user.name,
        connected_at: now,
        scopes_validated: true,
        access_token, // Store in metadata as backup
        refresh_token, // Store in metadata as backup
      },
      updated_at: now,
    }

    console.log("Integration data to save:", {
      ...integrationData,
      access_token: "***",
      refresh_token: "***",
      metadata: {
        ...integrationData.metadata,
        access_token: "***",
        refresh_token: "***",
      },
    })

    let result
    if (existingIntegration) {
      console.log("Updating existing integration:", existingIntegration.id)
      result = await supabase
        .from("integrations")
        .update(integrationData)
        .eq("id", existingIntegration.id)
        .select()
        .single()

      if (result.error) {
        console.error("Error updating X (Twitter) integration:", result.error)
        return NextResponse.redirect(new URL("/integrations?error=database_update_failed&provider=twitter", baseUrl))
      }
    } else {
      console.log("Creating new integration")
      result = await supabase
        .from("integrations")
        .insert({
          ...integrationData,
          created_at: now,
        })
        .select()
        .single()

      if (result.error) {
        console.error("Error inserting X (Twitter) integration:", result.error)
        return NextResponse.redirect(new URL("/integrations?error=database_insert_failed&provider=twitter", baseUrl))
      }
    }

    console.log("Integration saved successfully:", {
      id: result.data?.id,
      provider: result.data?.provider,
      status: result.data?.status,
    })

    // Add a longer delay to ensure database operations complete
    await new Promise((resolve) => setTimeout(resolve, 1500))

    return NextResponse.redirect(
      new URL(`/integrations?success=twitter_connected&provider=twitter&t=${Date.now()}`, baseUrl),
    )
  } catch (error: any) {
    console.error("X (Twitter) OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=twitter&message=${encodeURIComponent(error.message)}`,
        baseUrl,
      ),
    )
  }
}
