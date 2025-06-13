import { db } from "@/lib/db"

interface Integration {
  id: string
  provider: string
  access_token: string
  refresh_token?: string
  expires_at?: string | number // Could be string or number depending on source
  user_id: string
  [key: string]: any
}

interface RefreshResult {
  refreshed: boolean
  success: boolean
  message: string
  newToken?: string
  newExpiry?: number
  newRefreshToken?: string
  requiresReconnect?: boolean
}

/**
 * Checks if a token needs refreshing and refreshes it if needed
 */
export async function refreshTokenIfNeeded(integration: Integration): Promise<RefreshResult> {
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
    return {
      refreshed: false,
      success: true,
      message: "No refresh token available",
    }
  }

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

    if (!needsRefresh && !isGoogleOrMicrosoft) {
      return {
        refreshed: false,
        success: true,
        message: `Token valid for ${Math.floor(expiresIn / 60)} more minutes`,
      }
    }
  }

  // Token needs refreshing
  try {
    const result = await refreshTokenByProvider(integration)

    if (result.success && result.newToken) {
      // Update the token in the database
      const updateData: any = {
        access_token: result.newToken,
        last_token_refresh: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      // For Google/Microsoft, set expiry far in the future if successful refresh
      if (isGoogleOrMicrosoft) {
        // Set expiry to 1 year from now for Google/Microsoft
        // FIXED: Convert Unix timestamp to ISO string
        const expiryTimestamp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
        updateData.expires_at = new Date(expiryTimestamp * 1000).toISOString()
      } else if (result.newExpiry) {
        // FIXED: Convert Unix timestamp to ISO string
        updateData.expires_at = new Date(result.newExpiry * 1000).toISOString()
      }

      // Update refresh token if provided (Google sometimes provides new ones)
      if (result.newRefreshToken) {
        updateData.refresh_token = result.newRefreshToken
      }

      await db.from("integrations").update(updateData).eq("id", integration.id)
    } else if (result.requiresReconnect) {
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
      } catch (notifError) {
        console.error(`Failed to create notification for ${integration.provider}:`, notifError)
      }
    }

    return result
  } catch (error) {
    console.error(`Error refreshing token for ${integration.provider}:`, error)
    return {
      refreshed: false,
      success: false,
      message: `Failed to refresh token: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a token based on the provider
 */
async function refreshTokenByProvider(integration: Integration): Promise<RefreshResult> {
  const { provider, refresh_token } = integration

  switch (provider) {
    case "google":
    case "youtube":
    case "gmail":
    case "google-calendar":
    case "google-docs":
    case "google-drive":
    case "google-sheets":
      return refreshGoogleToken(refresh_token!)
    case "teams":
    case "onedrive":
      return refreshMicrosoftToken(refresh_token!, integration)
    case "dropbox":
      return refreshDropboxToken(refresh_token!)
    case "slack":
      return refreshSlackToken(refresh_token!)
    case "twitter":
      return refreshTwitterToken(refresh_token!)
    default:
      return {
        refreshed: false,
        success: false,
        message: `Token refresh not implemented for ${provider}`,
      }
  }
}

/**
 * Refreshes a Google OAuth token
 */
async function refreshGoogleToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing Google OAuth credentials",
      }
    }

    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      // Check for invalid_grant error which means the refresh token is no longer valid
      if (data.error === "invalid_grant") {
        return {
          refreshed: false,
          success: false,
          message: "Google token expired and requires re-authentication",
          requiresReconnect: true,
        }
      }

      return {
        refreshed: false,
        success: false,
        message: `Google token refresh failed: ${data.error}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Google token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      newRefreshToken: data.refresh_token, // Google may provide a new refresh token
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Google token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a Microsoft OAuth token (Teams, OneDrive)
 */
async function refreshMicrosoftToken(refreshToken: string, integration: Integration): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_TEAMS_CLIENT_ID || process.env.NEXT_PUBLIC_ONEDRIVE_CLIENT_ID
    const clientSecret = process.env.TEAMS_CLIENT_SECRET || process.env.ONEDRIVE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing Microsoft OAuth credentials",
      }
    }

    const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      // Check for invalid_grant error which means the refresh token is no longer valid
      if (data.error === "invalid_grant") {
        console.log(
          `⚠️ Microsoft ${integration.provider} token for user ${integration.user_id} requires reconnection: invalid_grant`,
        )

        return {
          refreshed: false,
          success: false,
          message: `Microsoft ${integration.provider} token requires re-authentication (invalid_grant)`,
          requiresReconnect: true,
        }
      }

      return {
        refreshed: false,
        success: false,
        message: `Microsoft token refresh failed: ${data.error}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Microsoft token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Microsoft token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a Dropbox OAuth token
 */
async function refreshDropboxToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_DROPBOX_CLIENT_ID
    const clientSecret = process.env.DROPBOX_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing Dropbox OAuth credentials",
      }
    }

    const response = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      // Check for invalid_grant error
      if (data.error === "invalid_grant") {
        return {
          refreshed: false,
          success: false,
          message: "Dropbox token expired and requires re-authentication",
          requiresReconnect: true,
        }
      }

      return {
        refreshed: false,
        success: false,
        message: `Dropbox token refresh failed: ${data.error}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Dropbox token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + data.expires_in,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Dropbox token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a Slack OAuth token
 */
async function refreshSlackToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_SLACK_CLIENT_ID
    const clientSecret = process.env.SLACK_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing Slack OAuth credentials",
      }
    }

    const response = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    })

    const data = await response.json()

    if (!data.ok) {
      // Check for common Slack error that indicates token needs reconnection
      if (data.error === "invalid_auth" || data.error === "token_revoked") {
        return {
          refreshed: false,
          success: false,
          message: "Slack token expired and requires re-authentication",
          requiresReconnect: true,
        }
      }

      return {
        refreshed: false,
        success: false,
        message: `Slack token refresh failed: ${data.error}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Slack token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 86400),
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Slack token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a Twitter OAuth token
 */
async function refreshTwitterToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
    const clientSecret = process.env.TWITTER_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing Twitter OAuth credentials",
      }
    }

    const response = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      // Check for invalid_grant error
      if (data.error === "invalid_grant") {
        return {
          refreshed: false,
          success: false,
          message: "Twitter token expired and requires re-authentication",
          requiresReconnect: true,
        }
      }

      return {
        refreshed: false,
        success: false,
        message: `Twitter token refresh failed: ${data.error_description || data.error}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Twitter token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 7200), // Twitter tokens typically expire in 2 hours
      newRefreshToken: data.refresh_token, // Twitter may provide a new refresh token
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Twitter token refresh error: ${(error as Error).message}`,
    }
  }
}
