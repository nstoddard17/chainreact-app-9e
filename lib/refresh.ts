import { db } from "@/lib/db"
import { getOAuthService } from "@/lib/oauth"
import type { Integration } from "@/lib/db/schema"

interface RefreshResult {
  success: boolean
  message: string
  updatedToken?: {
    access_token: string
    refresh_token?: string
    expires_at?: number
  }
}

/**
 * Checks if a token needs refreshing and refreshes it if necessary
 * @param integration The integration object containing token information
 * @returns Result object with success status and message
 */
export async function refreshTokenIfNeeded(integration: Integration): Promise<RefreshResult> {
  // Skip if no refresh token or provider doesn't support refresh
  if (!integration.refresh_token) {
    return { success: false, message: "No refresh token available" }
  }

  // Check if token is expired or will expire soon (within 5 minutes)
  const expiresAt = integration.expires_at
  const now = Math.floor(Date.now() / 1000)
  const buffer = 5 * 60 // 5 minutes buffer

  if (!expiresAt || expiresAt > now + buffer) {
    return { success: true, message: "Token still valid, no refresh needed" }
  }

  try {
    // Get the appropriate OAuth service for this provider
    const oauthService = getOAuthService(integration.provider)
    if (!oauthService || typeof oauthService.refreshToken !== "function") {
      return { success: false, message: `Provider ${integration.provider} doesn't support token refresh` }
    }

    // Refresh the token
    const refreshedTokens = await oauthService.refreshToken(integration.refresh_token)

    if (!refreshedTokens || !refreshedTokens.access_token) {
      throw new Error("Failed to refresh token: Invalid response")
    }

    // Update the token in the database
    const { error } = await db
      .from("integrations")
      .update({
        access_token: refreshedTokens.access_token,
        refresh_token: refreshedTokens.refresh_token || integration.refresh_token,
        expires_at: refreshedTokens.expires_at || null,
        updated_at: new Date().toISOString(),
        last_refresh: new Date().toISOString(),
      })
      .eq("id", integration.id)

    if (error) {
      throw new Error(`Failed to update token in database: ${error.message}`)
    }

    // Log the refresh for audit purposes
    await db.from("token_refresh_logs").insert({
      integration_id: integration.id,
      provider: integration.provider,
      user_id: integration.user_id,
      success: true,
      created_at: new Date().toISOString(),
    })

    return {
      success: true,
      message: "Token refreshed successfully",
      updatedToken: {
        access_token: refreshedTokens.access_token,
        refresh_token: refreshedTokens.refresh_token,
        expires_at: refreshedTokens.expires_at,
      },
    }
  } catch (error) {
    // Log the error
    console.error(`Failed to refresh token for ${integration.provider}:`, error)

    // Log the failure for audit purposes
    await db.from("token_refresh_logs").insert({
      integration_id: integration.id,
      provider: integration.provider,
      user_id: integration.user_id,
      success: false,
      error_message: error instanceof Error ? error.message : String(error),
      created_at: new Date().toISOString(),
    })

    // Update the integration status to indicate it needs reconnection
    await db
      .from("integrations")
      .update({
        status: "needs_reconnect",
        updated_at: new Date().toISOString(),
      })
      .eq("id", integration.id)

    return {
      success: false,
      message: `Failed to refresh token: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
