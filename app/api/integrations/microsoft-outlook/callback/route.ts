import { type NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createAdminClient } from "@/lib/supabase/admin"
import { createPopupResponse } from "@/lib/utils/createPopupResponse"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { prepareIntegrationData } from "@/lib/integrations/tokenUtils"

import { logger } from '@/lib/utils/logger'

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const error = url.searchParams.get("error")
  const errorDescription = url.searchParams.get("error_description")

  const baseUrl = getBaseUrl()
  const provider = "microsoft-outlook"

  if (error) {
    const message = errorDescription || error
    logger.error(`Error with Microsoft Outlook OAuth: ${message}`)
    return createPopupResponse("error", provider, `OAuth Error: ${message}`, baseUrl)
  }

  if (!code || !state) {
    return createPopupResponse("error", provider, "No code or state provided for Microsoft Outlook OAuth.", baseUrl)
  }

  try {
    const { userId } = JSON.parse(atob(state))
    if (!userId) {
      throw new Error("Missing userId in Microsoft Outlook state")
    }

    const supabase = createAdminClient()

    const clientId = process.env.OUTLOOK_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID
    const clientSecret = process.env.OUTLOOK_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET
    const redirectUri = `${baseUrl}/api/integrations/microsoft-outlook/callback`

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
        scope: "offline_access https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/Calendars.ReadWrite https://graph.microsoft.com/Contacts.Read https://graph.microsoft.com/Contacts.ReadWrite",
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenjsonResponse()
      throw new Error(`Microsoft token exchange failed: ${errorData.error_description}`)
    }

    const tokenData = await tokenjsonResponse()
    
    let providerEmail: string | null = null
    let providerAccountName: string | null = null
    let providerUserId: string | null = null
    
    // Check account type to warn about personal account limitations
    try {
      const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { 
          "Authorization": `Bearer ${tokenData.access_token}` 
        }
      })
      
      if (userResponse.ok) {
        const userData = await userjsonResponse()
        const email = userData.mail || userData.userPrincipalName || ""

        providerUserId = userData.id || null
        providerEmail = email || null
        providerAccountName = userData.displayName || providerEmail
        
        // Check if this is a personal account
        const isPersonalAccount = !userData.userPrincipalName || 
                                 email.includes("outlook.com") ||
                                 email.includes("hotmail.com") ||
                                 email.includes("live.com") ||
                                 email.includes("gmail.com")
        
        if (isPersonalAccount) {
          logger.warn("⚠️ Personal Microsoft account detected:", email)
          logger.warn("   Outlook API may have limitations with personal accounts")
          logger.warn("   Some features may not work as expected")
          
          // Store a warning flag in the integration metadata
          const metadata = {
            accountType: "personal",
            email: email,
            displayName: userData.displayName || null,
            warning: "Some Outlook features may not work with personal Microsoft accounts. Consider using a work or school account for full functionality.",
            knownLimitation: true
          }
          
          tokenData._metadata = metadata
        } else {
          logger.debug("✅ Work/School account detected:", email)
          tokenData._metadata = {
            accountType: "work",
            email: email,
            displayName: userData.displayName || null
          }
        }
      }
    } catch (checkError) {
      logger.error("Could not check account type:", checkError)
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
    )
    
    // Add account type metadata if available
    // Store email and account name in metadata instead of non-existent columns
    const metadata = tokenData._metadata || {}
    if (providerEmail) {
      metadata.provider_email = providerEmail
    }
    if (providerAccountName) {
      metadata.provider_account_name = providerAccountName
    }
    integrationData.metadata = metadata

    if (providerUserId) {
      integrationData.provider_user_id = providerUserId
    }

    if (refreshTokenExpiresAt) {
      integrationData.refresh_token_expires_at = refreshTokenExpiresAt.toISOString()
    }

    const { data: upsertedIntegration, error: upsertError } = await supabase
      .from("integrations")
      .upsert(integrationData, {
        onConflict: "user_id, provider",
      })
      .select(
        "id, provider, status, scopes, metadata, expires_at, provider_user_id, refresh_token_expires_at"
      )
      .single()

    if (upsertError) {
      throw new Error(`Failed to save Microsoft Outlook integration: ${upsertError.message}`)
    }

    const payload = {
      integrationId: upsertedIntegration?.id,
      email: upsertedIntegration?.metadata?.provider_email || providerEmail,
      accountName: upsertedIntegration?.metadata?.provider_account_name || providerAccountName,
      userId: upsertedIntegration?.provider_user_id || providerUserId,
      scopes: upsertedIntegration?.scopes || integrationData.scopes || [],
      metadata: upsertedIntegration?.metadata || integrationData.metadata || null,
      expiresAt: upsertedIntegration?.expires_at || integrationData.expires_at || null,
      refreshTokenExpiresAt:
        upsertedIntegration?.refresh_token_expires_at || refreshTokenExpiresAt.toISOString(),
    }

    return createPopupResponse(
      "success",
      provider,
      "Microsoft Outlook account connected successfully.",
      baseUrl,
      { payload }
    )
  } catch (e: any) {
    logger.error("Microsoft Outlook callback error:", e)
    return createPopupResponse("error", provider, e.message || "An unexpected error occurred.", baseUrl)
  }
}
