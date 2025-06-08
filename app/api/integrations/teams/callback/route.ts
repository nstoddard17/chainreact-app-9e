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
  const redirectUri = `${getBaseUrl(req)}/api/integrations/teams/callback`

  if (error) {
    console.error("Teams Auth Error:", error, error_description)
    return NextResponse.redirect(
      `${baseUrl}/integrations?error=teams_auth_failed&message=${encodeURIComponent(error_description || error)}`,
    )
  }

  if (!code || !state) {
    console.error("Missing code or state")
    return NextResponse.redirect(`${baseUrl}/integrations?error=missing_code_or_state&provider=teams`)
  }

  try {
    // Parse state to get user ID
    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Failed to parse state:", e)
      return NextResponse.redirect(`${baseUrl}/integrations?error=invalid_state&provider=teams`)
    }

    const userId = stateData.userId

    if (!userId) {
      console.error("No user ID in state")
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_user_id&provider=teams`)
    }

    const clientId = process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID
    const clientSecret = process.env.TEAMS_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error("Missing Teams client ID or secret")
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_client_credentials&provider=teams`)
    }

    const tokenEndpoint = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
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
      return NextResponse.redirect(`${baseUrl}/integrations?error=token_request_failed&provider=teams`)
    }

    const data = await response.json()
    const accessToken = data.access_token
    const refreshToken = data.refresh_token
    const expires_in = data.expires_in

    if (!accessToken || !refreshToken) {
      console.error("Missing access token or refresh token")
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_tokens&provider=teams`)
    }

    // Get user info
    const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    if (!userResponse.ok) {
      console.error("Failed to get Teams user info:", await userResponse.text())
      return NextResponse.redirect(`${baseUrl}/integrations?error=user_info_failed&provider=teams`)
    }

    const userData = await userResponse.json()
    const now = new Date().toISOString()

    // Check if integration exists
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "teams")
      .maybeSingle()

    const integrationData = {
      user_id: userId,
      provider: "teams",
      provider_user_id: userData.id,
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status: "connected",
      scopes: data.scope ? data.scope.split(" ") : [],
      metadata: {
        display_name: userData.displayName,
        email: userData.userPrincipalName,
        connected_at: now,
      },
      updated_at: now,
    }

    if (existingIntegration) {
      const { error } = await supabase.from("integrations").update(integrationData).eq("id", existingIntegration.id)

      if (error) {
        console.error("Error updating Teams integration:", error)
        return NextResponse.redirect(`${baseUrl}/integrations?error=database_update_failed&provider=teams`)
      }
    } else {
      const { error } = await supabase.from("integrations").insert({
        ...integrationData,
        created_at: now,
      })

      if (error) {
        console.error("Error inserting Teams integration:", error)
        return NextResponse.redirect(`${baseUrl}/integrations?error=database_insert_failed&provider=teams`)
      }
    }

    // Add a delay to ensure database operations complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    return NextResponse.redirect(`${baseUrl}/integrations?success=teams_connected&provider=teams&t=${Date.now()}`)
  } catch (e: any) {
    console.error("Error during Teams auth:", e)
    return NextResponse.redirect(
      `${baseUrl}/integrations?error=teams_auth_failed&message=${encodeURIComponent(e.message)}`,
    )
  }
}
