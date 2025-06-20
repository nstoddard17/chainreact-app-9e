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
    "youtube-studio",
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
    case "hubspot":
      return refreshHubSpotToken(refresh_token!)
    case "gitlab":
      return refreshGitLabToken(refresh_token!)
    case "airtable":
      return refreshAirtableToken(refresh_token!)
    case "linkedin":
      return refreshLinkedInToken(refresh_token!)
    case "facebook":
      return refreshFacebookToken(refresh_token!)
    case "discord":
      return refreshDiscordToken(refresh_token!)
    case "instagram":
      return refreshInstagramToken(refresh_token!)
    case "tiktok":
      return refreshTikTokToken(refresh_token!)
    case "github":
      return refreshGitHubToken(refresh_token!)
    case "notion":
      return refreshNotionToken(refresh_token!)
    case "trello":
      return refreshTrelloToken(refresh_token!)
    case "mailchimp":
      return refreshMailchimpToken(refresh_token!)
    case "shopify":
      return refreshShopifyToken(refresh_token!)
    case "paypal":
      return refreshPayPalToken(refresh_token!)
    case "stripe":
      return refreshStripeToken(refresh_token!)
    case "box":
      return refreshBoxToken(refresh_token!)
    case "youtube-studio":
      return refreshGoogleToken(refresh_token!) // Uses same Google OAuth
    case "microsoft-outlook":
      return refreshMicrosoftToken(refresh_token!, integration) // Uses same Microsoft OAuth
    case "microsoft-onenote":
      return refreshMicrosoftToken(refresh_token!, integration) // Uses same Microsoft OAuth
    case "blackbaud":
      return refreshBlackbaudToken(refresh_token!)
    case "globalpayments":
      return refreshGlobalPaymentsToken(refresh_token!)
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
    // Use unified Microsoft OAuth app for all Microsoft services
    const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID
    const clientSecret = process.env.MICROSOFT_CLIENT_SECRET

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

/**
 * Refreshes a HubSpot OAuth token
 */
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
      // Check for invalid_grant error which means the refresh token is no longer valid
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
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 21600), // HubSpot tokens typically expire in 6 hours
      newRefreshToken: data.refresh_token, // HubSpot may provide a new refresh token
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `HubSpot token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a GitLab OAuth token
 */
async function refreshGitLabToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_GITLAB_CLIENT_ID
    const clientSecret = process.env.GITLAB_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing GitLab OAuth credentials",
      }
    }

    const response = await fetch("https://gitlab.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
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
          message: "GitLab token expired and requires re-authentication",
          requiresReconnect: true,
        }
      }

      return {
        refreshed: false,
        success: false,
        message: `GitLab token refresh failed: ${data.error_description || data.error}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed GitLab token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 7200), // GitLab tokens typically expire in 2 hours
      newRefreshToken: data.refresh_token, // GitLab may provide a new refresh token
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `GitLab token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes an Airtable OAuth token
 */
async function refreshAirtableToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_AIRTABLE_CLIENT_ID
    const clientSecret = process.env.AIRTABLE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing Airtable OAuth credentials",
      }
    }

    // Use Basic Authentication like in the callback
    const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`

    const response = await fetch("https://airtable.com/oauth2/v1/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": authHeader,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error("Airtable token refresh error response:", data)
      
      // Check for invalid_grant error which means the refresh token is no longer valid
      if (data.error === "invalid_grant") {
        return {
          refreshed: false,
          success: false,
          message: "Airtable token expired and requires re-authentication",
          requiresReconnect: true,
        }
      }

      if (data.error === "invalid_client") {
        return {
          refreshed: false,
          success: false,
          message: "Airtable OAuth client configuration error - check client ID and secret",
          requiresReconnect: true,
        }
      }

      return {
        refreshed: false,
        success: false,
        message: `Airtable token refresh failed: ${data.error_description || data.error}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Airtable token",
      newToken: data.access_token,
      newExpiry: data.expires_in ? Math.floor(Date.now() / 1000) + data.expires_in : undefined,
      newRefreshToken: data.refresh_token, // Airtable may provide a new refresh token
    }
  } catch (error) {
    console.error("Airtable token refresh exception:", error)
    return {
      refreshed: false,
      success: false,
      message: `Airtable token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a LinkedIn OAuth token
 */
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
        message: `LinkedIn token refresh failed: ${data.error}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed LinkedIn token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `LinkedIn token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a Facebook OAuth token
 */
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

    if (!response.ok) {
      if (data.error?.type === "OAuthException") {
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
        message: `Facebook token refresh failed: ${data.error?.message || "Unknown error"}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Facebook token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Facebook token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a Discord OAuth token
 */
async function refreshDiscordToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID
    const clientSecret = process.env.DISCORD_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing Discord OAuth credentials",
      }
    }

    const response = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      if (data.error === "invalid_grant") {
        return {
          refreshed: false,
          success: false,
          message: "Discord token expired and requires re-authentication",
          requiresReconnect: true,
        }
      }

      return {
        refreshed: false,
        success: false,
        message: `Discord token refresh failed: ${data.error}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Discord token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Discord token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes an Instagram OAuth token
 */
async function refreshInstagramToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_INSTAGRAM_CLIENT_ID
    const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing Instagram OAuth credentials",
      }
    }

    const response = await fetch("https://graph.instagram.com/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "ig_refresh_token",
        access_token: refreshToken,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        refreshed: false,
        success: false,
        message: `Instagram token refresh failed: ${data.error?.message || "Unknown error"}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Instagram token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Instagram token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a TikTok OAuth token
 */
async function refreshTikTokToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_TIKTOK_CLIENT_ID
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing TikTok OAuth credentials",
      }
    }

    const response = await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cache-Control": "no-cache",
      },
      body: new URLSearchParams({
        client_key: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        refreshed: false,
        success: false,
        message: `TikTok token refresh failed: ${data.error?.message || "Unknown error"}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed TikTok token",
      newToken: data.data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.data.expires_in || 3600),
      newRefreshToken: data.data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `TikTok token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a GitHub OAuth token
 */
async function refreshGitHubToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID
    const clientSecret = process.env.GITHUB_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing GitHub OAuth credentials",
      }
    }

    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    })

    const data = await response.json()

    if (!response.ok || data.error) {
      return {
        refreshed: false,
        success: false,
        message: `GitHub token refresh failed: ${data.error || "Unknown error"}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed GitHub token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `GitHub token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a Notion OAuth token
 */
async function refreshNotionToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_NOTION_CLIENT_ID
    const clientSecret = process.env.NOTION_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing Notion OAuth credentials",
      }
    }

    const response = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/json",
        "Notion-Version": "2022-06-28",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        refreshed: false,
        success: false,
        message: `Notion token refresh failed: ${data.error || "Unknown error"}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Notion token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Notion token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a Trello OAuth token
 */
async function refreshTrelloToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_TRELLO_CLIENT_ID
    const clientSecret = process.env.TRELLO_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing Trello OAuth credentials",
      }
    }

    const response = await fetch("https://trello.com/1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        refreshed: false,
        success: false,
        message: `Trello token refresh failed: ${data.error || "Unknown error"}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Trello token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Trello token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a Mailchimp OAuth token
 */
async function refreshMailchimpToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_MAILCHIMP_CLIENT_ID
    const clientSecret = process.env.MAILCHIMP_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing Mailchimp OAuth credentials",
      }
    }

    const response = await fetch("https://login.mailchimp.com/oauth2/token", {
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
      return {
        refreshed: false,
        success: false,
        message: `Mailchimp token refresh failed: ${data.error || "Unknown error"}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Mailchimp token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Mailchimp token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a Shopify OAuth token
 */
async function refreshShopifyToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_SHOPIFY_CLIENT_ID
    const clientSecret = process.env.SHOPIFY_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing Shopify OAuth credentials",
      }
    }

    const response = await fetch("https://shop.myshopify.com/admin/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        refreshed: false,
        success: false,
        message: `Shopify token refresh failed: ${data.error || "Unknown error"}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Shopify token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Shopify token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a PayPal OAuth token
 */
async function refreshPayPalToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
    const clientSecret = process.env.PAYPAL_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing PayPal OAuth credentials",
      }
    }

    const response = await fetch("https://api.paypal.com/v1/identity/openidconnect/tokenservice", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        refreshed: false,
        success: false,
        message: `PayPal token refresh failed: ${data.error || "Unknown error"}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed PayPal token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `PayPal token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a Stripe OAuth token
 */
async function refreshStripeToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_STRIPE_CLIENT_ID
    const clientSecret = process.env.STRIPE_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing Stripe OAuth credentials",
      }
    }

    const response = await fetch("https://connect.stripe.com/oauth/token", {
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
      return {
        refreshed: false,
        success: false,
        message: `Stripe token refresh failed: ${data.error || "Unknown error"}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Stripe token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Stripe token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a Box OAuth token
 */
async function refreshBoxToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_BOX_CLIENT_ID
    const clientSecret = process.env.BOX_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing Box OAuth credentials",
      }
    }

    const response = await fetch("https://api.box.com/oauth2/token", {
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
      return {
        refreshed: false,
        success: false,
        message: `Box token refresh failed: ${data.error || "Unknown error"}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Box token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Box token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a Blackbaud OAuth token
 */
async function refreshBlackbaudToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_BLACKBAUD_CLIENT_ID
    const clientSecret = process.env.BLACKBAUD_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing Blackbaud OAuth credentials",
      }
    }

    const response = await fetch("https://oauth2.sky.blackbaud.com/token", {
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
      return {
        refreshed: false,
        success: false,
        message: `Blackbaud token refresh failed: ${data.error || "Unknown error"}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Blackbaud token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Blackbaud token refresh error: ${(error as Error).message}`,
    }
  }
}

/**
 * Refreshes a GlobalPayments OAuth token
 */
async function refreshGlobalPaymentsToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_GLOBALPAYMENTS_CLIENT_ID
    const clientSecret = process.env.GLOBALPAYMENTS_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing GlobalPayments OAuth credentials",
      }
    }

    const response = await fetch("https://apis.globalpay.com/ucp/auth/oauth/token", {
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
      return {
        refreshed: false,
        success: false,
        message: `GlobalPayments token refresh failed: ${data.error || "Unknown error"}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed GlobalPayments token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `GlobalPayments token refresh error: ${(error as Error).message}`,
    }
  }
}
