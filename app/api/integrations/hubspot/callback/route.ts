import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { getBaseUrl } from "@/lib/utils"

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
  const code = request.nextUrl.searchParams.get("code")
  const state = request.nextUrl.searchParams.get("state")
  const baseUrl = getBaseUrl()

  if (!code || !state) {
    console.error("No code or state received")
    return NextResponse.redirect(`${baseUrl}/integrations?error=hubspot_no_code`)
  }

  try {
    // Parse state to get user ID
    let stateData
    try {
      stateData = JSON.parse(atob(state))
    } catch (e) {
      console.error("Failed to parse state:", e)
      return NextResponse.redirect(`${baseUrl}/integrations?error=invalid_state&provider=hubspot`)
    }

    const userId = stateData.userId

    if (!userId) {
      console.error("No user ID in state")
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_user_id&provider=hubspot`)
    }

    const clientId = process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error("Missing HubSpot client ID or secret")
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_client_credentials&provider=hubspot`)
    }

    // Exchange code for token
    const tokenResponse = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${getBaseUrl()}/api/integrations/hubspot/callback`,
        code,
      }),
    })

    if (!tokenResponse.ok) {
      console.error("HubSpot token exchange failed:", await tokenResponse.text())
      return NextResponse.redirect(`${baseUrl}/integrations?error=token_exchange_failed&provider=hubspot`)
    }

    const tokenData = await tokenResponse.json()
    const { access_token, refresh_token, expires_in } = tokenData

    // Get user info
    const userResponse = await fetch("https://api.hubapi.com/oauth/v1/access-tokens/" + access_token)

    if (!userResponse.ok) {
      console.error("HubSpot user info failed:", await userResponse.text())
      return NextResponse.redirect(`${baseUrl}/integrations?error=user_info_failed&provider=hubspot`)
    }

    const userData = await userResponse.json()
    const now = new Date().toISOString()

    // Check if integration exists
    const { data: existingIntegration } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", "hubspot")
      .maybeSingle()

    const integrationData = {
      user_id: userId,
      provider: "hubspot",
      provider_user_id: userData.user_id.toString(),
      access_token,
      refresh_token,
      expires_at: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
      status: "connected",
      scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
      metadata: {
        hub_domain: userData.hub_domain,
        hub_id: userData.hub_id,
        user_id: userData.user_id,
        connected_at: now,
      },
      updated_at: now,
    }

    if (existingIntegration) {
      const { error } = await supabase.from("integrations").update(integrationData).eq("id", existingIntegration.id)

      if (error) {
        console.error("Error updating HubSpot integration:", error)
        return NextResponse.redirect(`${baseUrl}/integrations?error=database_update_failed&provider=hubspot`)
      }
    } else {
      const { error } = await supabase.from("integrations").insert({
        ...integrationData,
        created_at: now,
      })

      if (error) {
        console.error("Error inserting HubSpot integration:", error)
        return NextResponse.redirect(`${baseUrl}/integrations?error=database_insert_failed&provider=hubspot`)
      }
    }

    // Add a delay to ensure database operations complete
    await new Promise((resolve) => setTimeout(resolve, 500))

    return NextResponse.redirect(`${baseUrl}/integrations?success=hubspot_connected&provider=hubspot&t=${Date.now()}`)
  } catch (error: any) {
    console.error("HubSpot OAuth Error:", error)
    return NextResponse.redirect(
      `${baseUrl}/integrations?error=hubspot_oauth_error&message=${encodeURIComponent(error.message)}`,
    )
  }
}
