import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { type NextRequest, NextResponse } from "next/server"
import { createAdminSupabaseClient, parseOAuthState, upsertIntegration } from "@/lib/oauth/utils"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    const baseUrl = getBaseUrl(request)

    // Handle OAuth errors
    if (error) {
      const error_description = searchParams.get("error_description")
      console.error("Airtable OAuth Error:", error, error_description)
      return NextResponse.redirect(
        `${baseUrl}/integrations?error=oauth_error&message=${encodeURIComponent(error_description || error)}`,
      )
    }

    if (!code || !state) {
      console.error("Missing code or state parameter")
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_params`)
    }

    // Parse state to get user info
    let stateData
    try {
      stateData = parseOAuthState(state)
    } catch (error) {
      console.error("Invalid state parameter:", error)
      return NextResponse.redirect(`${baseUrl}/integrations?error=invalid_state`)
    }

    const { provider, userId, reconnect, integrationId } = stateData

    if (provider !== "airtable" || !userId) {
      console.error("Invalid state data")
      return NextResponse.redirect(`${baseUrl}/integrations?error=invalid_state`)
    }

    // Exchange code for access token
    const clientId = process.env.NEXT_PUBLIC_AIRTABLE_CLIENT_ID
    const clientSecret = process.env.AIRTABLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      console.error("Missing Airtable credentials")
      return NextResponse.redirect(`${baseUrl}/integrations?error=missing_credentials`)
    }

    const redirectUri = `${baseUrl}/api/integrations/airtable/callback`

    const tokenResponse = await fetch("https://airtable.com/oauth2/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    })

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text()
      console.error("Token exchange failed:", errorText)
      return NextResponse.redirect(`${baseUrl}/integrations?error=token_exchange_failed`)
    }

    const tokenData = await tokenResponse.json()

    if (!tokenData.access_token) {
      console.error("No access token received")
      return NextResponse.redirect(`${baseUrl}/integrations?error=no_access_token`)
    }

    // Get user info from Airtable
    const userResponse = await fetch("https://api.airtable.com/v0/meta/whoami", {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    })

    if (!userResponse.ok) {
      console.error("Failed to get user info")
      return NextResponse.redirect(`${baseUrl}/integrations?error=user_info_failed`)
    }

    const userData = await userResponse.json()

    // Save integration to database
    const supabase = createAdminSupabaseClient()
    if (!supabase) {
      console.error("Failed to create Supabase client")
      return NextResponse.redirect(`${baseUrl}/integrations?error=database_error`)
    }

    const integrationData = {
      user_id: userId,
      provider: "airtable",
      provider_user_id: userData.id,
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || null,
      expires_at: tokenData.expires_in ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString() : null,
      status: "connected" as const,
      scopes: tokenData.scope ? tokenData.scope.split(" ") : [],
      metadata: {
        user_name: userData.name,
        user_email: userData.email,
        connected_at: new Date().toISOString(),
      },
    }

    await upsertIntegration(supabase, integrationData)

    console.log("Airtable integration saved successfully")

    // Redirect back to integrations page with success
    return NextResponse.redirect(`${baseUrl}/integrations?success=true&provider=airtable`)
  } catch (error: any) {
    console.error("Airtable OAuth callback error:", error)
    const baseUrl = getBaseUrl(request)
    return NextResponse.redirect(
      `${baseUrl}/integrations?error=callback_error&message=${encodeURIComponent(error.message)}`,
    )
  }
}
