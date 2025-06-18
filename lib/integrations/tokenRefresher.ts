import { getAdminSupabaseClient } from "@/lib/supabase/admin"
import { decrypt } from "@/lib/security/encryption"

interface Integration {
  id: string
  provider: string
  access_token: string
  refresh_token?: string
  expires_at?: string | number
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

export async function refreshTokenIfNeeded(integration: Integration): Promise<RefreshResult> {
  // Validate input
  if (!integration || !integration.provider) {
    return {
      refreshed: false,
      success: false,
      message: "Invalid integration data",
    }
  }

  // Check if refresh token exists
  if (!integration.refresh_token) {
    return {
      refreshed: false,
      success: true,
      message: "No refresh token available",
    }
  }

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

  // Determine if refresh is needed
  let needsRefresh = false
  const refreshThreshold = isGoogleOrMicrosoft ? 1800 : 300 // 30 min vs 5 min

  if (integration.expires_at) {
    const expiresAtTimestamp =
      typeof integration.expires_at === "string"
        ? new Date(integration.expires_at).getTime() / 1000
        : integration.expires_at

    const now = Math.floor(Date.now() / 1000)
    const expiresIn = expiresAtTimestamp - now
    needsRefresh = expiresIn < refreshThreshold
  } else if (isGoogleOrMicrosoft) {
    // For Google/Microsoft without expiry, refresh proactively
    needsRefresh = true
  }

  if (!needsRefresh && !isGoogleOrMicrosoft) {
    return {
      refreshed: false,
      success: true,
      message: "Token not due for refresh",
    }
  }

  // Attempt token refresh
  try {
    const result = await refreshTokenByProvider(integration)

    if (result.success && result.newToken) {
      // Update the token in the database
      const supabase = getAdminSupabaseClient()
      if (!supabase) {
        throw new Error("Failed to create database client")
      }

      const updateData: any = {
        access_token: result.newToken,
        last_token_refresh: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        consecutive_failures: 0, // Reset failure count on success
      }

      // Set expiry based on provider type
      if (isGoogleOrMicrosoft) {
        // For Google/Microsoft, use the actual expiry time from the token refresh response
        if (result.newExpiry) {
          updateData.expires_at = new Date(result.newExpiry * 1000).toISOString()
        } else {
          // Default to 1 hour if no expiry provided
          const expiryTimestamp = Math.floor(Date.now() / 1000) + 3600
          updateData.expires_at = new Date(expiryTimestamp * 1000).toISOString()
        }
      } else if (result.newExpiry) {
        updateData.expires_at = new Date(result.newExpiry * 1000).toISOString()
      }

      // Update refresh token if provided
      if (result.newRefreshToken) {
        updateData.refresh_token = result.newRefreshToken
      }

      const { error } = await supabase.from("integrations").update(updateData).eq("id", integration.id)

      if (error) {
        console.error("Failed to update integration after token refresh:", error)
      }
    } else if (result.requiresReconnect) {
      // Mark integration as disconnected
      const supabase = getAdminSupabaseClient()
      if (supabase) {
        await supabase
          .from("integrations")
          .update({
            status: "disconnected",
            disconnected_at: new Date().toISOString(),
            disconnect_reason: result.message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integration.id)

        // Create notification for user
        try {
          await supabase.rpc("create_token_expiry_notification", {
            p_user_id: integration.user_id,
            p_provider: integration.provider,
          })
        } catch (notifError) {
          console.error(`Failed to create notification for ${integration.provider}:`, notifError)
        }
      }
    }

    return result
  } catch (error) {
    console.error(`Error refreshing token for ${integration.provider}:`, error)

    // Update failure count and check if we should mark as expired
    const supabase = getAdminSupabaseClient()
    if (supabase) {
      const updateData: any = {
        consecutive_failures: (integration.consecutive_failures || 0) + 1,
        last_failure_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      // Check if the token is actually expired and update status accordingly
      if (integration.expires_at) {
        const expiresAtTimestamp =
          typeof integration.expires_at === "string"
            ? new Date(integration.expires_at).getTime() / 1000
            : integration.expires_at
        const now = Math.floor(Date.now() / 1000)
        
        if (expiresAtTimestamp < now) {
          // Token is actually expired, update status
          updateData.status = "expired"
          console.log(`Marking ${integration.provider} as expired due to failed refresh`)
        }
      }

      await supabase
        .from("integrations")
        .update(updateData)
        .eq("id", integration.id)
    }

    return {
      refreshed: false,
      success: false,
      message: `Failed to refresh token: ${(error as Error).message}`,
    }
  }
}

async function refreshTokenByProvider(integration: Integration): Promise<RefreshResult> {
  const { provider, refresh_token } = integration

  if (!refresh_token) {
    return {
      refreshed: false,
      success: false,
      message: "No refresh token available",
    }
  }

  switch (provider) {
    case "google":
    case "youtube":
    case "gmail":
    case "google-calendar":
    case "google-docs":
    case "google-drive":
    case "google-sheets":
      return refreshGoogleToken(refresh_token)

    case "teams":
    case "onedrive":
      return refreshMicrosoftToken(refresh_token, integration)

    case "dropbox":
      return refreshDropboxToken(refresh_token)

    case "slack":
      return refreshSlackToken(refresh_token)

    case "twitter":
      return refreshTwitterToken(refresh_token)

    case "hubspot":
      return refreshHubSpotToken(refresh_token)

    case "linkedin":
      return refreshLinkedInToken(refresh_token)

    case "facebook":
      return refreshFacebookToken(refresh_token)

    default:
      return {
        refreshed: false,
        success: false,
        message: `Token refresh not implemented for ${provider}`,
      }
  }
}

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
      console.error("Google token refresh failed:", data)
      
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

    // Calculate expiry time (default to 1 hour if not provided)
    const expiresIn = data.expires_in || 3600
    const expiryTime = Math.floor(Date.now() / 1000) + expiresIn

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Google token",
      newToken: data.access_token,
      newExpiry: expiryTime,
      newRefreshToken: data.refresh_token, // Google may return a new refresh token
    }
  } catch (error) {
    console.error("Google token refresh error:", error)
    return {
      refreshed: false,
      success: false,
      message: `Google token refresh error: ${(error as Error).message}`,
    }
  }
}

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
      if (data.error === "invalid_grant") {
        return {
          refreshed: false,
          success: false,
          message: `Microsoft ${integration.provider} token requires re-authentication`,
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
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 7200),
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Twitter token refresh error: ${(error as Error).message}`,
    }
  }
}

async function refreshHubSpotToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_HUBSPOT_CLIENT_ID
    const clientSecret = process.env.HUBSPOT_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing HubSpot OAuth credentials",
      }
    }

    const response = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      if (data.error === "invalid_grant") {
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

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed HubSpot token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 21600),
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `HubSpot token refresh error: ${(error as Error).message}`,
    }
  }
}

async function refreshLinkedInToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_LINKEDIN_CLIENT_ID
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing LinkedIn OAuth credentials",
      }
    }

    const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      if (data.error === "invalid_grant") {
        return {
          refreshed: false,
          success: false,
          message: "LinkedIn token expired and requires re-authentication",
          requiresReconnect: true,
        }
      }

      return {
        refreshed: false,
        success: false,
        message: `LinkedIn token refresh failed: ${data.error_description || data.error}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed LinkedIn token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 5184000), // 60 days default
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `LinkedIn token refresh error: ${(error as Error).message}`,
    }
  }
}

async function refreshFacebookToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_FACEBOOK_CLIENT_ID
    const clientSecret = process.env.FACEBOOK_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing Facebook OAuth credentials",
      }
    }

    const response = await fetch("https://graph.facebook.com/v18.0/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    })

    const data = await response.json()

    if (!response.ok || data.error) {
      if (data.error?.code === 190) {
        return {
          refreshed: false,
          success: false,
          message: "Facebook token expired and requires re-authentication",
          requiresReconnect: true,
        }
      }

      return {
        refreshed: false,
        success: false,
        message: `Facebook token refresh failed: ${data.error?.message || data.error}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Facebook token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 5184000), // 60 days default
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Facebook token refresh error: ${(error as Error).message}`,
    }
  }
}

async function fetchAllUserIntegrations(userId: string) {
  try {
    const supabase = getAdminSupabaseClient()
    const { data, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)

    if (error) {
      console.error("Failed to fetch user integrations:", error)
      return []
    }

    return data
  } catch (error) {
    console.error("Failed to fetch user integrations:", error)
    return []
  }
}

async function fetchIntegrationById(integrationId: string, userId: string) {
  try {
    const supabase = getAdminSupabaseClient()
    const { data, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integrationId)
      .eq("user_id", userId)

    if (error) {
      console.error("Failed to fetch integration:", error)
      return null
    }

    return data[0]
  } catch (error) {
    console.error("Failed to fetch integration:", error)
    return null
  }
}

async function updateIntegrationTokens(
  integrationId: string,
  newAccessToken: string,
  newRefreshToken?: string,
) {
  const supabase = getAdminSupabaseClient()
  const updates: {
    access_token: string
    refresh_token?: string
  } = {
    access_token: newAccessToken,
  }

  if (newRefreshToken) {
    updates.refresh_token = newRefreshToken
  }

  const { error } = await supabase
    .from("integrations")
    .update(updates)
    .eq("id", integrationId)

  if (error) {
    console.error("Failed to update integration tokens:", error)
  }
}
