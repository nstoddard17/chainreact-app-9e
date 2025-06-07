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
}

/**
 * Checks if a token needs refreshing and refreshes it if needed
 */
export async function refreshTokenIfNeeded(integration: Integration): Promise<RefreshResult> {
  // If no expiry or refresh token, can't refresh
  if (!integration.expires_at || !integration.refresh_token) {
    return {
      refreshed: false,
      success: true,
      message: "No expiry or refresh token available",
    }
  }

  // Check if token is expired or will expire soon (within 5 minutes)
  const now = Math.floor(Date.now() / 1000)
  const expiresIn = integration.expires_at - now
  const needsRefresh = expiresIn < 300 // 5 minutes

  if (!needsRefresh) {
    return {
      refreshed: false,
      success: true,
      message: `Token valid for ${Math.floor(expiresIn / 60)} more minutes`,
    }
  }

  // Token needs refreshing
  try {
    const result = await refreshTokenByProvider(integration)

    if (result.success && result.newToken) {
      // Update the token in the database
      await db
        .from("integrations")
        .update({
          access_token: result.newToken,
          expires_at: result.newExpiry,
          last_refreshed: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id)
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
      return refreshGoogleToken(refresh_token!)
    case "dropbox":
      return refreshDropboxToken(refresh_token!)
    case "slack":
      return refreshSlackToken(refresh_token!)
    // Add more providers as needed
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
      newExpiry: Math.floor(Date.now() / 1000) + data.expires_in,
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
