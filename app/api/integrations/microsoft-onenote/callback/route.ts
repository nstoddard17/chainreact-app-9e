import { NextRequest, NextResponse } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { prepareIntegrationData } from "@/lib/integrations/tokenUtils"
import { createPopupResponse } from "@/lib/utils/createPopupResponse"

const provider = "microsoft-onenote"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error) {
    console.error(`OneNote OAuth error: ${error}`)
    return createPopupResponse("error", provider, `OAuth error: ${error}`, getBaseUrl())
  }

  if (!code) {
    console.error("OneNote OAuth callback missing code parameter")
    return createPopupResponse("error", provider, "Missing authorization code", getBaseUrl())
  }

  if (!state) {
    console.error("OneNote OAuth callback missing state parameter")
    return createPopupResponse("error", provider, "Missing state parameter", getBaseUrl())
  }

  try {
    const stateData = JSON.parse(atob(state))
    const { userId, forceFresh } = stateData
    if (!userId) {
      throw new Error("Missing userId in OneNote state")
    }

    const supabase = createAdminClient()

    const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
    // Extract the base redirect URI without the timestamp parameter
    const baseRedirectUri = `${getBaseUrl()}/api/integrations/microsoft-onenote/callback`
    const redirectUri = baseRedirectUri

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
        scope: "offline_access openid profile email User.Read Notes.ReadWrite.All",
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

    // For OneNote, ALWAYS delete existing integrations and create fresh ones
    // This ensures we get a completely new OAuth flow every time
    console.log("🔄 OneNote detected - always deleting existing integrations for fresh OAuth flow")
    
    // Delete existing OneNote integrations for this user
    const { error: deleteError } = await supabase
      .from("integrations")
      .delete()
      .eq("user_id", userId)
      .eq("provider", provider)
    
    if (deleteError) {
      console.warn("⚠️ Failed to delete existing OneNote integrations:", deleteError)
    } else {
      console.log("✅ Existing OneNote integrations deleted")
    }
    
    // Now insert the new integration
    const { error: insertError } = await supabase
      .from("integrations")
      .insert(integrationData)
    
    if (insertError) {
      console.error("Failed to insert new OneNote integration:", insertError)
      throw new Error(`Failed to save integration: ${insertError.message}`)
    }
    
    console.log("✅ New OneNote integration created successfully")

    console.log(`Successfully connected OneNote for user ${userId}`)
    return createPopupResponse("success", provider, "OneNote connected successfully", getBaseUrl())

  } catch (error: any) {
    console.error("OneNote callback error:", error)
    return createPopupResponse("error", provider, error.message, getBaseUrl())
  }
}
