import { db } from "@/lib/db"

interface Integration {
  id: string
  provider: string
  access_token: string
  refresh_token?: string
  expires_at?: number
  [key: string]: any
}

interface RefreshResult {
  refreshed: boolean
  success: boolean
  message: string
  newToken?: string
  newExpiry?: number
  newRefreshToken?: string
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
    const now = Math.floor(Date.now() / 1000)
    const expiresIn = integration.expires_at - now
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
        last_refreshed: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      // For Google/Microsoft, set expiry far in the future if successful refresh
      if (isGoogleOrMicrosoft) {
        // Set expiry to 1 year from now for Google/Microsoft
        updateData.expires_at = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60
      } else if (result.newExpiry) {
        updateData.expires_at = result.newExpiry
      }

      // Update refresh token if provided (Google sometimes provides new ones)
      if (result.newRefreshToken) {
        updateData.refresh_token = result.newRefreshToken
      }

      await db.from("integrations").update(updateData).eq("id", integration.id)
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
      return refreshMicrosoftToken(refresh_token!)
    case "dropbox":
      return refreshDropboxToken(refresh_token!)
    case "slack":
      return refreshSlackToken(refresh_token!)
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
      // Google tokens are valid for 1 hour, but we'll set a longer expiry since we auto-refresh
      newExpiry: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 year
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
async function refreshMicrosoftToken(refreshToken: string): Promise<RefreshResult> {
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
      // Microsoft tokens are valid for 1 hour, but we'll set a longer expiry since we auto-refresh
      newExpiry: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 year
      newRefreshToken: data.refresh_token, // Microsoft may provide a new refresh token
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
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 86400), // Default to 24h if not provided
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Slack token refresh error: ${(error as Error).message}`,
    }
  }
}
