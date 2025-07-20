import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { prepareIntegrationData } from "@/lib/integrations/tokenUtils"

const provider = "microsoft-onenote"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error) {
    console.error(`OneNote OAuth error: ${error}`)
    return NextResponse.redirect(`${getBaseUrl()}/integrations?error=oauth_error&provider=${provider}`)
  }

  if (!code) {
    console.error("OneNote OAuth callback missing code parameter")
    return NextResponse.redirect(`${getBaseUrl()}/integrations?error=missing_code&provider=${provider}`)
  }

  if (!state) {
    console.error("OneNote OAuth callback missing state parameter")
    return NextResponse.redirect(`${getBaseUrl()}/integrations?error=missing_state&provider=${provider}`)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      throw new Error("Missing userId in OneNote state")
    }

    const supabase = createAdminClient()

    const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
    const redirectUri = `${getBaseUrl()}/api/integrations/microsoft-onenote/callback`

    if (!clientId || !clientSecret) {
      throw new Error("Microsoft client ID or secret not configured")
    }

    const tokenResponse = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        scope: "offline_access User.Read Notes.ReadWrite.All",
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      throw new Error(`Microsoft token exchange failed: ${errorData.error_description}`)
    }

    const tokenData = await tokenResponse.json()

    // Calculate refresh token expiration (Microsoft default is 90 days)
    const refreshExpiresIn = tokenData.refresh_expires_in || 90 * 24 * 60 * 60 // 90 days in seconds
    const refreshTokenExpiresAt = new Date(Date.now() + refreshExpiresIn * 1000)

    // Prepare integration data with encrypted tokens
    const integrationData = await prepareIntegrationData(
      userId,
      provider,
      tokenData.access_token,
      tokenData.refresh_token,
      tokenData.scope ? tokenData.scope.split(" ") : [],
      tokenData.expires_in,
      refreshTokenExpiresAt,
    )

    const { error: upsertError } = await supabase.from("integrations").upsert(integrationData, {
      onConflict: "user_id, provider",
    })

    if (upsertError) {
      console.error("Failed to save OneNote integration:", upsertError)
      throw new Error(`Failed to save integration: ${upsertError.message}`)
    }

    console.log(`Successfully connected OneNote for user ${userId}`)
    return NextResponse.redirect(`${getBaseUrl()}/integrations?success=connected&provider=${provider}`)

  } catch (error: any) {
    console.error("OneNote callback error:", error)
    return NextResponse.redirect(
      `${getBaseUrl()}/integrations?error=callback_failed&provider=${provider}&message=${encodeURIComponent(error.message)}`
    )
  }
}
