import { db } from "@/lib/db"

/**
 * Integration type definition
 */
interface Integration {
  id: string
  user_id: string
  provider: string
  access_token: string | null
  refresh_token: string | null
  expires_at: string | number | null
  status: string
  consecutive_failures?: number
}

/**
 * Result of a token refresh attempt
 */
interface RefreshResult {
  success: boolean
  refreshed: boolean
  message: string
  newToken?: string
  newExpiry?: number
  newRefreshToken?: string
  requiresReconnect?: boolean
}

/**
 * Main function to refresh a token if needed
 */
export async function refreshTokenIfNeeded(integration: Integration): Promise<RefreshResult> {
  console.log(`🔍 refreshTokenIfNeeded called for ${integration.provider}`)

  // For Google and Microsoft, always try to refresh if we have a refresh token
  const isGoogleOrMicrosoft = [
    "google",
    "youtube",
    "gmail",
    "google-calendar",
    "google-docs",
    "google-drive",
    "google-sheets",
    "teams",
    "onedrive",
  ].includes(integration.provider)

  if (!integration.refresh_token) {
    console.log(`❌ No refresh token for ${integration.provider}`)
    return {
      refreshed: false,
      success: true,
      message: "No refresh token available",
    }
  }

  console.log(`✅ Refresh token exists for ${integration.provider}`)

  // For Google/Microsoft: refresh if no expiry or expires within 30 minutes
  // For others: only refresh if expires within 5 minutes
  const refreshThreshold = isGoogleOrMicrosoft ? 1800 : 300 // 30 min vs 5 min

  if (integration.expires_at) {
    // Convert expires_at to timestamp if it's a string
    const expiresAtTimestamp =
      typeof integration.expires_at === "string"
        ? new Date(integration.expires_at).getTime() / 1000
        : integration.expires_at

    const now = Math.floor(Date.now() / 1000)
    const expiresIn = expiresAtTimestamp - now
    const needsRefresh = expiresIn < refreshThreshold

    console.log(
      `⏰ Token for ${integration.provider} expires in ${expiresIn}s (${Math.floor(expiresIn / 60)}min), threshold: ${refreshThreshold}s, needsRefresh: ${needsRefresh}`,
    )

    if (!needsRefresh && !isGoogleOrMicrosoft) {
      return {
        refreshed: false,
        success: true,
        message: `Token valid for ${Math.floor(expiresIn / 60)} more minutes`,
      }
    }
  }

  // Token needs refreshing
  console.log(`🔄 Starting token refresh for ${integration.provider}`)
  try {
    const result = await refreshTokenByProvider(integration.provider, integration.refresh_token)
    console.log(`📋 Refresh result for ${integration.provider}:`, result)

    if (result.success && result.newToken) {
      console.log(`✅ Successful refresh for ${integration.provider}, updating database`)
      // Update the token in the database
      const updateData: any = {
        access_token: result.newToken,
        last_token_refresh: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      // For Google/Microsoft, set expiry far in the future if successful refresh
      if (isGoogleOrMicrosoft) {
        // Set expiry to 1 year from now for Google/Microsoft
        const expiryTimestamp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
        updateData.expires_at = new Date(expiryTimestamp * 1000).toISOString()
      } else if (result.newExpiry) {
        updateData.expires_at = new Date(result.newExpiry * 1000).toISOString()
      }

      // Update refresh token if provided (some providers give new ones)
      if (result.newRefreshToken) {
        updateData.refresh_token = result.newRefreshToken
      }

      console.log(`💾 Updating database for ${integration.provider} with:`, updateData)
      await db.from("integrations").update(updateData).eq("id", integration.id)
      console.log(`✅ Database updated for ${integration.provider}`)
    } else if (result.requiresReconnect) {
      console.log(`🔌 Token for ${integration.provider} requires reconnection`)
      // If the token refresh failed due to invalid_grant, mark the integration as disconnected
      await db
        .from("integrations")
        .update({
          status: "disconnected",
          disconnected_at: new Date().toISOString(),
          disconnect_reason: result.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id)

      // Create a notification for the user
      try {
        await db.rpc("create_token_expiry_notification", {
          p_user_id: integration.user_id,
          p_provider: integration.provider,
        })
        console.log(`📧 Notification created for ${integration.provider}`)
      } catch (notifError) {
        console.error(`❌ Failed to create notification for ${integration.provider}:`, notifError)
      }
    } else {
      console.log(`⚠️ Refresh failed for ${integration.provider}: ${result.message}`)
    }

    return result
  } catch (error) {
    console.error(`💥 Error refreshing token for ${integration.provider}:`, error)
    return {
      refreshed: false,
      success: false,
      message: `Failed to refresh token: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a token for a given provider
 */
export async function refreshTokenByProvider(
  provider: string,
  refresh_token: string | null | undefined,
): Promise<RefreshResult> {
  console.log(`🔧 refreshTokenByProvider called for ${provider}`)

  if (!refresh_token) {
    console.log(`❌ No refresh token provided for ${provider}`)
    return {
      refreshed: false,
      success: false,
      message: "No refresh token provided",
    }
  }

  switch (provider) {
    case "hubspot":
      console.log(`🎯 Calling refreshHubSpotToken`)
      return refreshHubSpotToken(refresh_token!)
    default:
      console.log(`❌ No refresh implementation for ${provider}`)
      return {
        refreshed: false,
        success: false,
        message: `Token refresh not implemented for provider: ${provider}`,
      }
  }
}

/**
 * Refreshes a HubSpot OAuth token
 */
async function refreshHubSpotToken(refreshToken: string): Promise<RefreshResult> {
  console.log(`🚀 Starting HubSpot token refresh`)

  try {
    const clientId = process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET

    console.log(
      `🔑 HubSpot credentials check - clientId: ${clientId ? "EXISTS" : "MISSING"}, clientSecret: ${clientSecret ? "EXISTS" : "MISSING"}`,
    )

    if (!clientId || !clientSecret) {
      console.log(`❌ Missing HubSpot OAuth credentials`)
      return {
        refreshed: false,
        success: false,
        message: "Missing HubSpot OAuth credentials",
      }
    }

    const requestBody = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    })

    console.log(`📤 Making request to HubSpot token endpoint`)
    console.log(`   URL: https://api.hubapi.com/oauth/v1/token`)
    console.log(`   Body: grant_type=refresh_token&client_id=${clientId}&client_secret=[HIDDEN]&refresh_token=[HIDDEN]`)

    // Add timeout to prevent hanging
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      console.log(`⏰ HubSpot API request timeout after 30 seconds`)
      controller.abort()
    }, 30000) // 30 second timeout

    let response: Response
    try {
      console.log(`🌐 Initiating fetch request...`)
      response = await fetch("https://api.hubapi.com/oauth/v1/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: requestBody,
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      console.log(`📥 HubSpot API response received - status: ${response.status} ${response.statusText}`)
    } catch (fetchError: any) {
      clearTimeout(timeoutId)
      console.error(`💥 Fetch request failed:`, fetchError)

      if (fetchError.name === "AbortError") {
        return {
          refreshed: false,
          success: false,
          message: "HubSpot API request timed out after 30 seconds",
        }
      }

      return {
        refreshed: false,
        success: false,
        message: `HubSpot API request failed: ${fetchError.message}`,
      }
    }

    let data: any
    try {
      console.log(`📋 Parsing JSON response...`)
      data = await response.json()
      console.log(`📋 HubSpot API response data:`, data)
    } catch (parseError: any) {
      console.error(`💥 Failed to parse JSON response:`, parseError)
      return {
        refreshed: false,
        success: false,
        message: `Failed to parse HubSpot API response: ${parseError.message}`,
      }
    }

    if (!response.ok) {
      console.log(`❌ HubSpot API request failed with status ${response.status}`)

      // Check for invalid_grant error which means the refresh token is no longer valid
      if (data.error === "invalid_grant") {
        console.log(`🔌 HubSpot token requires re-authentication (invalid_grant)`)
        return {
          refreshed: false,
          success: false,
          message: "HubSpot token expired and requires re-authentication",
          requiresReconnect: true,
        }
      }

      return {
        refreshed: false,
        success: false,
        message: `HubSpot token refresh failed: ${data.error || data.message}`,
      }
    }

    console.log(`✅ HubSpot token refresh successful`)
    console.log(`🔑 New token received: ${data.access_token ? "YES" : "NO"}`)
    console.log(`⏰ Expires in: ${data.expires_in || "NOT_PROVIDED"} seconds`)
    console.log(`🔄 New refresh token: ${data.refresh_token ? "YES" : "NO"}`)

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed HubSpot token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 21600), // HubSpot tokens typically expire in 6 hours
      newRefreshToken: data.refresh_token, // HubSpot may provide a new refresh token
    }
  } catch (error) {
    console.error(`💥 HubSpot token refresh error:`, error)
    return {
      refreshed: false,
      success: false,
      message: `HubSpot token refresh error: ${(error as Error).message}`,
    }
  }
}
