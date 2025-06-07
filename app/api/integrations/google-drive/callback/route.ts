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

  console.log("Google Drive OAuth callback:", { code: !!code, state, error })

  if (error) {
    console.error("Google Drive OAuth error:", error)
    return NextResponse.redirect(new URL("/integrations?error=oauth_error&provider=google-drive", baseUrl))
  }

  if (!code || !state) {
    console.error("Missing code or state in Google Drive callback")
    return NextResponse.redirect(new URL("/integrations?error=missing_params&provider=google-drive", baseUrl))
  }

  try {
    // Parse state to get user ID
    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Failed to parse state:", e)
      return NextResponse.redirect(new URL("/integrations?error=invalid_state&provider=google-drive", baseUrl))
    }

    const userId = stateData.userId

    if (!userId) {
      console.error("No user ID in state")
      return NextResponse.redirect(new URL("/integrations?error=missing_user_id&provider=google-drive", baseUrl))
    }

    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error("Missing Google client ID or secret")
      return NextResponse.redirect(
        new URL("/integrations?error=missing_client_credentials&provider=google-drive", baseUrl),
      )
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
        redirect_uri: `${getBaseUrl(request)}/api/integrations/google-drive/callback`,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error("Google Drive token exchange failed:", errorText)
      return NextResponse.redirect(
        new URL(
          `/integrations?error=token_exchange_failed&provider=google-drive&message=${encodeURIComponent(errorText)}`,
          baseUrl,
        ),
      )
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in } = tokenData

    // Get user info from Google
    const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: {
        Authorization: `Bearer ${access_token}`,
      },
    })

    if (!userResponse.ok) {
      console.error("Failed to get Google user info:", await userResponse.text())
      return NextResponse.redirect(new URL("/integrations?error=user_info_failed&provider=google-drive", baseUrl))
    }

    const userData = await userResponse.json()

    const now = new Date().toISOString()

    // Check if integration exists
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "google-drive")
      .maybeSingle()

    const integrationData = {
      user_id: userId,
      provider: "google-drive",
      provider_user_id: userData.id,
      access_token,
      refresh_token,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status: "connected",
      scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
      metadata: {
        email: userData.email,
        name: userData.name,
        picture: userData.picture,
        verified_email: userData.verified_email,
        connected_at: now,
      },
      updated_at: now,
    }

    if (existingIntegration) {
      const { error } = await supabase.from("integrations").update(integrationData).eq("id", existingIntegration.id)

      if (error) {
        console.error("Error updating Google Drive integration:", error)
        return NextResponse.redirect(
          new URL("/integrations?error=database_update_failed&provider=google-drive", baseUrl),
        )
      }
    } else {
      const { error } = await supabase.from("integrations").insert({
        ...integrationData,
        created_at: now,
      })

      if (error) {
        console.error("Error inserting Google Drive integration:", error)
        return NextResponse.redirect(
          new URL("/integrations?error=database_insert_failed&provider=google-drive", baseUrl),
        )
      }
    }

    // Add a delay to ensure database operations complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    return NextResponse.redirect(new URL(`/integrations?success=true&provider=google-drive&t=${Date.now()}`, baseUrl))
  } catch (error: any) {
    console.error("Google Drive OAuth callback error:", error)
    return NextResponse.redirect(
      new URL(
        `/integrations?error=callback_failed&provider=google-drive&message=${encodeURIComponent(error.message)}`,
        baseUrl,
      ),
    )
  }
}
