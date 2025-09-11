import type { NextRequest } from "next/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { createPopupResponse } from "@/lib/utils/createPopupResponse"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { prepareIntegrationData } from "@/lib/integrations/tokenUtils"
import { getAllScopes } from "@/lib/integrations/integrationScopes"

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const errorDescription = url.searchParams.get("error_description")

  const baseUrl = getBaseUrl()
  const provider = "teams"

  if (error) {
    const message = errorDescription || error
    console.error(`Error with Teams OAuth: ${message}`)
    return createPopupResponse("error", provider, `OAuth Error: ${message}`, baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse("error", provider, "No code or state provided for Teams OAuth.", baseUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      throw new Error("Missing userId in Teams state")
    }

    const supabase = createAdminClient()

    const clientId = process.env.TEAMS_CLIENT_ID
    const clientSecret = process.env.TEAMS_CLIENT_SECRET
    
    // Debug logging to see which client ID is being used
    console.log('🔍 Teams OAuth Debug:')
    console.log('  - TEAMS_CLIENT_ID set:', !!process.env.TEAMS_CLIENT_ID)
    console.log('  - TEAMS_CLIENT_SECRET set:', !!process.env.TEAMS_CLIENT_SECRET)
    console.log('  - Using client ID:', clientId ? `${clientId.substring(0, 10)}...` : 'NOT SET')
    console.log('  - Using client ID type: TEAMS_SPECIFIC')
    
    const redirectUri = `${baseUrl}/api/integrations/teams/callback`

    if (!clientId || !clientSecret) {
      throw new Error("Teams client ID or secret not configured. Please set TEAMS_CLIENT_ID and TEAMS_CLIENT_SECRET environment variables.")
    }

    // Get scope from OAuth config (same as other Microsoft services)
    const { getOAuthConfig } = await import("@/lib/integrations/oauthConfig")
    const config = getOAuthConfig("teams")
    if (!config) throw new Error("Teams OAuth config not found")
    
    const scopeString = config.scope || ""
    
    console.log('🔍 Teams Token Request Debug:')
    console.log('  - Scope string being sent:', scopeString)
    console.log('  - Client ID being used:', clientId ? `${clientId.substring(0, 10)}...` : 'NOT SET')
    console.log('  - Redirect URI:', redirectUri)

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
          scope: scopeString,
        }),
      })

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json()
      throw new Error(`Microsoft token exchange failed: ${errorData.error_description}`)
    }

    const tokenData = await tokenResponse.json()

    // Debug logging for token response
    console.log('🔍 Teams Token Response Debug:')
    console.log('  - Response status:', tokenResponse.status)
    console.log('  - Access token received:', !!tokenData.access_token)
    console.log('  - Refresh token received:', !!tokenData.refresh_token)
    console.log('  - Scopes returned by Microsoft:', tokenData.scope)
    console.log('  - Scopes we requested:', scopeString)
    console.log('  - Token type:', tokenData.token_type)
    console.log('  - Expires in:', tokenData.expires_in)
    console.log('  - Full token response:', JSON.stringify(tokenData, null, 2))

    // Validate Teams account access
    console.log('🔍 Validating Teams account access...')
    const validationResponse = await fetch(`${baseUrl}/api/integrations/validate-teams-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        accessToken: tokenData.access_token
      })
    })

    const validationData = await validationResponse.json()
    console.log('🔍 Teams account validation result:', validationData)

    if (!validationData.success) {
      if (validationData.error === 'TEAMS_PERSONAL_ACCOUNT') {
        return createPopupResponse("error", provider, 
          "Microsoft Teams integration requires a work or school account with Microsoft 365 subscription. " +
          "Personal Microsoft accounts (@outlook.com, @hotmail.com, etc.) are not supported. " +
          "Please use your work or school email address.", baseUrl)
      } else if (validationData.error === 'TEAMS_NO_ACCESS') {
        return createPopupResponse("error", provider,
          "Your work or school account does not have access to Microsoft Teams. " +
          "Please contact your administrator to enable Teams access or ensure you have a Microsoft 365 subscription.", baseUrl)
      } else {
        return createPopupResponse("error", provider,
          "Failed to validate Teams account access. Please try again or contact support.", baseUrl)
      }
    }

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
    
    // Add account type metadata from validation
    if (validationData.userInfo) {
      integrationData.metadata = {
        accountType: validationData.userInfo.accountType,
        email: validationData.userInfo.userPrincipalName,
        displayName: validationData.userInfo.displayName
      }
    }

    const { error: upsertError } = await supabase.from("integrations").upsert(integrationData, {
      onConflict: "user_id, provider",
    })

    if (upsertError) {
      throw new Error(`Failed to save Teams integration: ${upsertError.message}`)
    }

    return createPopupResponse("success", provider, "You can now close this window.", baseUrl)
  } catch (e: any) {
    console.error("Teams callback error:", e)
    return createPopupResponse("error", provider, e.message || "An unexpected error occurred.", baseUrl)
  }
}
