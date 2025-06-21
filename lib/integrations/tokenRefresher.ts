import { createAdminClient } from "@/lib/supabase/admin"
import { decrypt } from "@/lib/security/encryption"
import { getSecret } from "@/lib/secrets"
import { SupabaseClient } from "@supabase/supabase-js"

interface Integration {
  id: string
  provider: string
  access_token: string
  refresh_token?: string
  expires_at?: string | number
  refresh_token_expires_at?: string | number
  user_id: string
  status?: string
  [key: string]: any
}

interface RefreshResult {
  refreshed: boolean
  success: boolean
  message: string
  newToken?: string
  newExpiry?: number
  newRefreshToken?: string
  newRefreshTokenExpiry?: number
  requiresReconnect?: boolean
  recovered?: boolean
  updatedIntegration?: Integration
  statusUpdate?: "expired" | "connected" | "disconnected"
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
    "youtube-studio",
    "gmail",
    "google-calendar",
    "google-docs",
    "google-drive",
    "google-sheets",
    "teams",
    "onedrive",
    "microsoft-onenote",
    "microsoft-outlook",
  ].includes(integration.provider)

  // Determine if refresh is needed
  let needsRefresh = false;
  const now = Math.floor(Date.now() / 1000);
  const THIRTY_MINUTES = 30 * 60; // 30 minutes in seconds

  // Check if the token expires within 30 minutes or has already expired
  if (integration.expires_at) {
    const expiresAtTimestamp =
      typeof integration.expires_at === "string"
        ? new Date(integration.expires_at).getTime() / 1000
        : integration.expires_at;

    const expiresIn = expiresAtTimestamp - now;
    
    if (expiresIn <= THIRTY_MINUTES) {
      needsRefresh = true;
      const status = expiresIn <= 0 ? "already expired" : "expires within 30 minutes";
      console.log(`Token for ${integration.provider} ${status} (${expiresIn}s). Refreshing...`);
    }
  } else if (isGoogleOrMicrosoft) {
    // For Google/Microsoft without expiry, refresh proactively
    needsRefresh = true;
    console.log(`Google/Microsoft integration (${integration.provider}) without expiry time. Refreshing proactively.`);
  }

  // Always try to refresh if marked as expired or needs_reauthorization
  if (integration.status === "expired" || integration.status === "needs_reauthorization") {
    needsRefresh = true;
    console.log(`Integration ${integration.provider} is marked as ${integration.status}. Attempting recovery...`);
  }

  if (!needsRefresh) {
    return {
      refreshed: false,
      success: true,
      message: "Token not due for refresh (expires in more than 30 minutes)",
    }
  }

  // Attempt token refresh
  try {
    const result = await refreshTokenByProvider(integration);

    if (result.success && result.newToken) {
      // Update the token in the database
      const supabase = createAdminClient();
      if (!supabase) {
        throw new Error("Failed to create database client");
      }

      const updateData: any = {
        access_token: result.newToken,
        last_token_refresh: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        consecutive_failures: 0, // Reset failure count on success
      };

      // Always set status to connected if we successfully refreshed a token
      const isRecovered = integration.status === "expired" || integration.status === "needs_reauthorization";
      
      updateData.status = "connected";
      if (isRecovered) {
        console.log(`Successfully recovered ${integration.provider} from ${integration.status} status`);
        updateData.disconnected_at = null;
        updateData.disconnect_reason = null;
      }

      // Set expiry based on provider type
      if (result.newExpiry) {
        updateData.expires_at = new Date(result.newExpiry * 1000).toISOString();
      } else if (isGoogleOrMicrosoft) {
        // Default to 1 hour if no expiry provided for Google/Microsoft
        const expiryTimestamp = Math.floor(Date.now() / 1000) + 3600;
        updateData.expires_at = new Date(expiryTimestamp * 1000).toISOString();
      }

      // Update refresh token if provided
      if (result.newRefreshToken) {
        updateData.refresh_token = result.newRefreshToken;
      }

      if (result.newRefreshTokenExpiry) {
        updateData.refresh_token_expires_at = new Date(result.newRefreshTokenExpiry * 1000).toISOString();
      }

      const { error } = await supabase.from("integrations").update(updateData).eq("id", integration.id);

      if (error) {
        console.error("Failed to update integration after token refresh:", error);
        // Even if DB update fails, return success because token was technically refreshed
        return { 
          ...result, 
          refreshed: true, 
          recovered: isRecovered
        };
      }

      // Fetch the updated integration to return it
      const { data: updatedIntegration, error: fetchError } = await supabase
        .from("integrations")
        .select("*")
        .eq("id", integration.id)
        .single();

      if (fetchError) {
        console.error("Failed to fetch updated integration:", fetchError);
        // Return original result if fetch fails
        return { 
          ...result, 
          refreshed: true,
          recovered: isRecovered
        };
      }

      return { 
        ...result, 
        refreshed: true, 
        recovered: isRecovered,
        updatedIntegration 
      };
    } else if (result.requiresReconnect) {
      // Mark integration as expired or disconnected based on the result
      const supabase = createAdminClient();
      if (supabase) {
        await supabase
          .from("integrations")
          .update({
            status: result.statusUpdate || "disconnected", // Use specified status or default to disconnected
            disconnected_at: new Date().toISOString(),
            disconnect_reason: result.message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", integration.id);

        // Create notification for user
        try {
          await supabase.rpc("create_token_expiry_notification", {
            p_user_id: integration.user_id,
            p_provider: integration.provider,
          });
        } catch (notifError) {
          console.error(`Failed to create notification for ${integration.provider}:`, notifError);
        }
      }
    }

    return result;
  } catch (error) {
    console.error(`Error refreshing token for ${integration.provider}:`, error);

    // Use the handleRefreshError function for consistent error handling
    const supabase = createAdminClient();
    if (supabase) {
      return await handleRefreshError(
        supabase,
        integration,
        error,
        `Failed to refresh token: ${(error as Error).message}`
      );
    }

    return {
      refreshed: false,
      success: false,
      message: `Failed to refresh token: ${(error as Error).message}`,
    };
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

  // Decrypt the refresh token if needed
  const secret = await getSecret("encryption_key")
  if (!secret) {
    return {
      refreshed: false,
      success: false,
      message: "Encryption secret is not configured.",
    }
  }
  const decryptedRefreshToken = decrypt(refresh_token, secret)

  switch (provider) {
    case "google":
    case "youtube":
    case "youtube-studio":
    case "gmail":
    case "google-calendar":
    case "google-docs":
    case "google-drive":
    case "google-sheets":
      return await refreshGoogleToken(decryptedRefreshToken)
    case "teams":
    case "onedrive":
    case "microsoft-onenote":
    case "microsoft-outlook":
      return await refreshMicrosoftToken(decryptedRefreshToken, integration)
    case "dropbox":
      return await refreshDropboxToken(decryptedRefreshToken)
    case "slack":
      return await refreshSlackToken(decryptedRefreshToken)
    case "twitter":
      return await refreshTwitterToken(decryptedRefreshToken)
    case "hubspot":
      return await refreshHubSpotToken(decryptedRefreshToken)
    case "linkedin":
      return await refreshLinkedInToken(decryptedRefreshToken)
    case "facebook":
      return await refreshFacebookToken(decryptedRefreshToken)
    case "gitlab":
      return await refreshGitLabToken(decryptedRefreshToken)
    case "airtable":
      return await refreshAirtableToken(decryptedRefreshToken)
    case "discord":
      return await refreshDiscordToken(decryptedRefreshToken)
    case "instagram":
      return await refreshInstagramToken(decryptedRefreshToken)
    case "tiktok":
      return await refreshTikTokToken(decryptedRefreshToken)
    case "github":
      return await refreshGitHubToken(decryptedRefreshToken)
    case "trello":
      return await refreshTrelloToken(decryptedRefreshToken)
    case "mailchimp":
      return await refreshMailchimpToken(decryptedRefreshToken)
    case "shopify":
      return await refreshShopifyToken(decryptedRefreshToken)
    case "paypal":
      return await refreshPayPalToken(decryptedRefreshToken)
    case "stripe":
      return await refreshStripeToken(decryptedRefreshToken)
    case "box":
      return await refreshBoxToken(decryptedRefreshToken)
    case "blackbaud":
      return await refreshBlackbaudToken(decryptedRefreshToken)
    case "globalpayments":
      return await refreshGlobalPaymentsToken(decryptedRefreshToken)
    case "gumroad":
      return await refreshGumroadToken(decryptedRefreshToken)
    case "kit":
      return await refreshKitToken(decryptedRefreshToken)
    default:
      return {
        refreshed: false,
        success: false,
        message: `Token refresh for ${provider} is not supported`,
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
      if (data.error === "invalid_grant") {
        return {
          refreshed: false,
          success: false,
          message: "Google token has been revoked and requires re-authentication",
          requiresReconnect: true,
        }
      }

      return {
        refreshed: false,
        success: false,
        message: `Google token refresh failed: ${data.error_description}`,
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

async function refreshMicrosoftToken(
  refreshToken: string,
  integration: Integration,
): Promise<RefreshResult> {
  const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET
  const tenantId = integration.metadata?.tenantId || "common"

  if (!clientId || !clientSecret) {
    throw new Error("Microsoft client ID or secret not configured")
  }

  try {
    const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
        scope: "offline_access User.Read Mail.ReadWrite Calendars.ReadWrite Files.ReadWrite.All",
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      if (data.error === "invalid_grant") {
        return {
          refreshed: false,
          success: false,
          message: "Microsoft token has been revoked or expired and requires re-authentication",
          requiresReconnect: true,
        }
      }

      return {
        refreshed: false,
        success: false,
        message: `Microsoft token refresh failed: ${data.error_description}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Microsoft token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + data.expires_in,
      newRefreshToken: data.refresh_token, // Microsoft often returns a new refresh token
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

    const response = await fetch("https://api.dropbox.com/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
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
        message: `Dropbox token refresh failed: ${data.error_description}`,
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
        grant_type: "refresh_token",
        refresh_token: refreshToken,
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
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 43200), // 12 hours default
      newRefreshToken: data.refresh_token,
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
  const clientId = process.env.NEXT_PUBLIC_TWITTER_CLIENT_ID
  const clientSecret = process.env.TWITTER_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error("Twitter client ID or secret not configured")
  }

  try {
    const response = await fetch("https://api.twitter.com/2/oauth2/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        refreshed: false,
        success: false,
        message: `Twitter token refresh failed: ${data.error}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Twitter token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 7200), // 2 hours default
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
      return {
        refreshed: false,
        success: false,
        message: `HubSpot token refresh failed: ${data.message}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed HubSpot token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + data.expires_in,
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
      return {
        refreshed: false,
        success: false,
        message: `LinkedIn token refresh failed: ${data.error_description}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed LinkedIn token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + data.expires_in,
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

    const response = await fetch("https://graph.facebook.com/v13.0/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: clientId,
        client_secret: clientSecret,
        fb_exchange_token: refreshToken,
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      return {
        refreshed: false,
        success: false,
        message: `Facebook token refresh failed: ${data.error.message}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Facebook token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + data.expires_in,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Facebook token refresh error: ${(error as Error).message}`,
    }
  }
}

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
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `GitLab token refresh error: ${(error as Error).message}`,
    }
  }
}

async function refreshAirtableToken(refreshToken: string): Promise<RefreshResult> {
  const clientId = process.env.NEXT_PUBLIC_AIRTABLE_CLIENT_ID
  const clientSecret = process.env.AIRTABLE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error("Airtable client ID or secret not configured")
  }

  const tokenUrl = "https://www.airtable.com/oauth2/v1/token"
  
  // Create Basic Auth header
  const authHeader = `Basic ${btoa(`${clientId}:${clientSecret}`)}`

  try {
    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": authHeader,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        // Remove client_id and client_secret from body since they're in the Authorization header
      }),
    })

    const data = await response.json()

    if (!response.ok) {
      console.error("Airtable token refresh error response:", data)
      
      // Handle specific error cases
      if (data.error === "invalid_client") {
        return {
          refreshed: false,
          success: false,
          message: "Airtable OAuth client configuration error - check client ID and secret",
          requiresReconnect: true,
        }
      }
      
      if (data.error === "invalid_grant") {
        return {
          refreshed: false,
          success: false,
          message: "Airtable token expired and requires re-authentication",
          requiresReconnect: true,
          statusUpdate: "expired"
        }
      }

      return {
        refreshed: false,
        success: false,
        message: `Airtable token refresh failed: ${data.error_description || data.error || "Unknown error"}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Airtable token",
      newToken: data.access_token,
      newExpiry: data.expires_in ? Math.floor(Date.now() / 1000) + data.expires_in : undefined,
      newRefreshToken: data.refresh_token,
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

async function fetchAllUserIntegrations(userId: string) {
  try {
    const supabase = createAdminClient()
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
    const supabase = createAdminClient()
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
  const supabase = createAdminClient()
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

async function refreshBoxToken(refreshToken: string): Promise<RefreshResult> {
  const clientId = process.env.NEXT_PUBLIC_BOX_CLIENT_ID
  const clientSecret = process.env.BOX_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error("Box client ID or secret not configured")
  }

  try {
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

async function refreshGumroadToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_GUMROAD_CLIENT_ID
    const clientSecret = process.env.GUMROAD_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing Gumroad OAuth credentials",
      }
    }

    const response = await fetch("https://gumroad.com/oauth/token", {
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
        message: `Gumroad token refresh failed: ${data.error || "Unknown error"}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Gumroad token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Gumroad token refresh error: ${(error as Error).message}`,
    }
  }
}

async function refreshKitToken(refreshToken: string): Promise<RefreshResult> {
  try {
    const clientId = process.env.NEXT_PUBLIC_KIT_CLIENT_ID
    const clientSecret = process.env.KIT_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return {
        refreshed: false,
        success: false,
        message: "Missing Kit OAuth credentials",
      }
    }

    const response = await fetch("https://kit.com/oauth/token", {
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
        message: `Kit token refresh failed: ${data.error || "Unknown error"}`,
      }
    }

    return {
      refreshed: true,
      success: true,
      message: "Successfully refreshed Kit token",
      newToken: data.access_token,
      newExpiry: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
      newRefreshToken: data.refresh_token,
    }
  } catch (error) {
    return {
      refreshed: false,
      success: false,
      message: `Kit token refresh error: ${(error as Error).message}`,
    }
  }
}

export const handleRefreshError = async (
  supabase: SupabaseClient,
  integration: any,
  error: any,
  errorMessage: string
): Promise<RefreshResult> => {
  console.error(`Token refresh error for ${integration.provider}:`, errorMessage, error);
  
  // Update integration with failure count
  const updateData: any = {
    consecutive_failures: (integration.consecutive_failures || 0) + 1,
    last_failure_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  
  // Check if the token has actually expired based on its expires_at timestamp
  const now = new Date();
  if (integration.expires_at && new Date(integration.expires_at) <= now) {
    // Token is actually expired, update status to "expired"
    console.log(`Setting ${integration.provider} status to 'expired' since refresh failed and token has expired (${integration.expires_at})`);
    updateData.status = "expired";
  } else if (integration.expires_at) {
    // Token is still valid, keep status as "connected"
    const expiresAt = new Date(integration.expires_at);
    const timeUntilExpiry = (expiresAt.getTime() - now.getTime()) / 1000; // in seconds
    console.log(`Keeping ${integration.provider} status as 'connected' since token is still valid for ${timeUntilExpiry.toFixed(0)} seconds`);
    
    // Only set status if it's not already connected
    if (integration.status !== "connected") {
      updateData.status = "connected";
    }
  }

  await supabase
    .from("integrations")
    .update(updateData)
    .eq("id", integration.id);

  return {
    refreshed: false,
    success: false,
    message: errorMessage,
  };
};