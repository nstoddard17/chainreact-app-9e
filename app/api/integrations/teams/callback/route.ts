import type { NextRequest } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createAdminClient } from "@/lib/supabase/admin"
import { createPopupResponse } from "@/lib/utils/createPopupResponse"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { prepareIntegrationData } from "@/lib/integrations/tokenUtils"
import { getAllScopes } from "@/lib/integrations/integrationScopes"

import { logger } from '@/lib/utils/logger'

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
    logger.error(`Error with Teams OAuth: ${message}`)
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
    logger.debug('🔍 Teams OAuth Debug:')
    logger.debug('  - TEAMS_CLIENT_ID set:', !!process.env.TEAMS_CLIENT_ID)
    logger.debug('  - TEAMS_CLIENT_SECRET set:', !!process.env.TEAMS_CLIENT_SECRET)
    logger.debug('  - Using client ID:', clientId ? `${clientId.substring(0, 10)}...` : 'NOT SET')
    logger.debug('  - Using client ID type: TEAMS_SPECIFIC')
    
    const redirectUri = `${baseUrl}/api/integrations/teams/callback`

    if (!clientId || !clientSecret) {
      throw new Error("Teams client ID or secret not configured. Please set TEAMS_CLIENT_ID and TEAMS_CLIENT_SECRET environment variables.")
    }

    // Get scope from OAuth config (same as other Microsoft services)
    const { getOAuthConfig } = await import("@/lib/integrations/oauthConfig")
    const config = getOAuthConfig("teams")
    if (!config) throw new Error("Teams OAuth config not found")
    
    const scopeString = config.scope || ""
    
    logger.debug('🔍 Teams Token Request Debug:')
    logger.debug('  - Scope string being sent:', scopeString)
    logger.debug('  - Client ID being used:', clientId ? `${clientId.substring(0, 10)}...` : 'NOT SET')
    logger.debug('  - Redirect URI:', redirectUri)

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
    logger.debug('🔍 Teams Token Response Debug:')
    logger.debug('  - Response status:', tokenResponse.status)
    logger.debug('  - Access token received:', !!tokenData.access_token)
    logger.debug('  - Refresh token received:', !!tokenData.refresh_token)
    logger.debug('  - Scopes returned by Microsoft:', tokenData.scope)
    logger.debug('  - Scopes we requested:', scopeString)
    logger.debug('  - Token type:', tokenData.token_type)
    logger.debug('  - Expires in:', tokenData.expires_in)
    logger.debug('  - Full token response:', JSON.stringify(tokenData, null, 2))

    // Validate Teams account access
    logger.debug('🔍 Validating Teams account access...')
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
    logger.debug('🔍 Teams account validation result:', validationData)

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
      } 
        return createPopupResponse("error", provider,
          "Failed to validate Teams account access. Please try again or contact support.", baseUrl)
      
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
    logger.error("Teams callback error:", e)
    return createPopupResponse("error", provider, e.message || "An unexpected error occurred.", baseUrl)
  }
}
