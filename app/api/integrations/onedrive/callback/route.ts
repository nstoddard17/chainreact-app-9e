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
  const provider = "onedrive"

  if (error) {
    const message = errorDescription || error
    logger.error(`Error with OneDrive OAuth: ${message}`)
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

    const clientId = process.env.ONEDRIVE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID
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
    
    // Check account type to inform about potential limitations
    try {
      const userResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { 
          "Authorization": `Bearer ${tokenData.access_token}` 
        }
      })
      
      if (userResponse.ok) {
        const userData = await userResponse.json()
        const email = userData.mail || userData.userPrincipalName || ""
        
        // Check if this is a personal account
        const isPersonalAccount = !userData.userPrincipalName || 
                                 email.includes("outlook.com") ||
                                 email.includes("hotmail.com") ||
                                 email.includes("live.com") ||
                                 email.includes("gmail.com")
        
        if (isPersonalAccount) {
          logger.debug("ℹ️ Personal Microsoft account detected:", email)
          logger.debug("   OneDrive works with personal accounts but has storage limits")
          
          // Store account info in metadata
          const metadata = {
            accountType: "personal",
            email: email,
            info: "OneDrive works with personal accounts. Free accounts have 5GB storage limit."
          }
          
          tokenData._metadata = metadata
        } else {
          logger.debug("✅ Work/School account detected:", email)
          tokenData._metadata = {
            accountType: "work",
            email: email
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
      refreshTokenExpiresAt,
    )
    
    // Add account type metadata if available
    if (tokenData._metadata) {
      integrationData.metadata = tokenData._metadata
    }

    const { error: upsertError } = await supabase.from("integrations").upsert(integrationData, {
      onConflict: "user_id, provider",
    })

    if (upsertError) {
      throw new Error(`Failed to save OneDrive integration: ${upsertError.message}`)
    }

    return createPopupResponse("success", provider, "You can now close this window.", baseUrl)
  } catch (e: any) {
    logger.error("OneDrive callback error:", e)
    return createPopupResponse("error", provider, e.message || "An unexpected error occurred.", baseUrl)
  }
}
