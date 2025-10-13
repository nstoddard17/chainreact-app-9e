import { NextRequest, NextResponse } from "next/server"
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createAdminClient } from "@/lib/supabase/admin"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { prepareIntegrationData } from "@/lib/integrations/tokenUtils"
import { createPopupResponse } from "@/lib/utils/createPopupResponse"

import { logger } from '@/lib/utils/logger'

const provider = "microsoft-onenote"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get("code")
  const state = searchParams.get("state")
  const error = searchParams.get("error")

  if (error) {
    logger.error(`OneNote OAuth error: ${error}`)
    return createPopupResponse("error", provider, `OAuth error: ${error}`, getBaseUrl())
  }

  if (!code) {
    logger.error("OneNote OAuth callback missing code parameter")
    return createPopupResponse("error", provider, "Missing authorization code", getBaseUrl())
  }

  if (!state) {
    logger.error("OneNote OAuth callback missing state parameter")
    return createPopupResponse("error", provider, "Missing state parameter", getBaseUrl())
  }

  try {
    const stateData = JSON.parse(atob(state))
    const { userId, forceFresh } = stateData
    if (!userId) {
      throw new Error("Missing userId in OneNote state")
    }

    const supabase = createAdminClient()

    const clientId = process.env.ONENOTE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID
    const clientSecret = process.env.ONENOTE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET
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
        scope: "offline_access openid profile email https://graph.microsoft.com/User.Read https://graph.microsoft.com/Notes.ReadWrite.All https://graph.microsoft.com/Files.Read",
      }),
    })

    if (!tokenResponse.ok) {
      const errorData = await tokenjsonResponse()
      throw new Error(`Microsoft token exchange failed: ${errorData.error_description}`)
    }

    const tokenData = await tokenjsonResponse()

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
    
    // Explicitly set the status to connected
    integrationData.status = "connected"
    // Add a timestamp to ensure the updated_at field changes
    integrationData.updated_at = new Date().toISOString()

    // First check if the integration already exists
    const { data: existingIntegration, error: checkError } = await supabase
      .from("integrations")
      .select("id")
      .eq("user_id", userId)
      .eq("provider", provider)
      .single();
      
    if (checkError && checkError.code !== "PGRST116") { // PGRST116 is "no rows returned" error
      logger.error("Error checking for existing integration:", checkError);
    }
    
    // Use upsert like Airtable to ensure the integration is properly saved
    logger.debug("🔄 OneNote detected - using upsert for integration storage");
    logger.debug(`${existingIntegration ? "Updating existing" : "Creating new"} OneNote integration for user ${userId}`);
    
    const { error: upsertError } = await supabase
      .from("integrations")
      .upsert(integrationData, {
        onConflict: "user_id, provider",
      })
    
    if (upsertError) {
      logger.error("Failed to upsert OneNote integration:", upsertError)
      throw new Error(`Failed to save integration: ${upsertError.message}`)
    }
    
    logger.debug("✅ OneNote integration upserted successfully")
    
    // Verify that the integration was actually saved by querying it back
    const { data: savedIntegration, error: verifyError } = await supabase
      .from("integrations")
      .select("id, status, provider, updated_at")
      .eq("user_id", userId)
      .eq("provider", provider)
      .single();
      
    if (verifyError) {
      logger.error("⚠️ Error verifying OneNote integration was saved:", verifyError);
    } else {
      logger.debug("✅ Verified OneNote integration was saved:", {
        id: savedIntegration.id,
        status: savedIntegration.status,
        provider: savedIntegration.provider,
        updated_at: savedIntegration.updated_at
      });
    }
    
    // Log the integration data that was saved
    logger.debug(`Successfully connected OneNote for user ${userId}`)
    logger.debug("🔍 Integration data saved:", {
      provider,
      status: integrationData.status,
      user_id: userId,
      timestamp: new Date().toISOString()
    })
    return createPopupResponse("success", provider, "OneNote connected successfully", getBaseUrl())

  } catch (error: any) {
    logger.error("OneNote callback error:", error)
    return createPopupResponse("error", provider, error.message, getBaseUrl())
  }
}
