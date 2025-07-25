import { type NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createPopupResponse } from "@/lib/utils/createPopupResponse"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { prepareIntegrationData } from "@/lib/integrations/tokenUtils"

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const errorDescription = url.searchParams.get("error_description")

  const baseUrl = getBaseUrl()
  const provider = "onedrive"

  if (error) {
    const message = errorDescription || error
    console.error(`Error with OneDrive OAuth: ${message}`)
    return createPopupResponse("error", provider, `OAuth Error: ${message}`, baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse("error", provider, "No code or state provided for OneDrive OAuth.", baseUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      throw new Error("Missing userId in OneDrive state")
    }

    const supabase = createAdminClient()

    const clientId = process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID || process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID
    const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/onedrive/callback`

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
        scope: "offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Files.ReadWrite.All",
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
      throw new Error(`Failed to save OneDrive integration: ${upsertError.message}`)
    }

    return createPopupResponse("success", provider, "You can now close this window.", baseUrl)
  } catch (e: any) {
    console.error("OneDrive callback error:", e)
    return createPopupResponse("error", provider, e.message || "An unexpected error occurred.", baseUrl)
  }
}
