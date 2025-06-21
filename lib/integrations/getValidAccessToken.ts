import { createSupabaseServerClient } from "@/utils/supabase/server"
import { refreshTokenIfNeeded } from "./tokenRefresher"
import { Integration } from "./tokenRefresher"

export interface TokenResult {
  valid: boolean
  accessToken?: string
  requiresReauth: boolean
  message: string
  provider: string
  userId: string
  token?: Integration
}

/**
 * Gets a valid access token for the specified user and provider
 * Automatically refreshes the token if needed
 */
export async function getValidAccessToken(userId: string, provider: string): Promise<TokenResult> {
  try {
    const supabase = createSupabaseServerClient()
    if (!supabase) {
      return {
        valid: false,
        requiresReauth: false,
        message: "Failed to create database client",
        provider,
        userId,
      }
    }

    // Get the integration
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", provider)
      .eq("status", "connected")
      .single()

    if (error || !integration) {
      return {
        valid: false,
        requiresReauth: true,
        message: `No active ${provider} integration found`,
        provider,
        userId,
      }
    }

    // Check if token needs refresh
    const refreshResult = await refreshTokenIfNeeded(integration)
    const finalIntegration = refreshResult.updatedIntegration || integration

    // If refresh failed and we don't have a refresh token, require reauth
    if (!refreshResult.success && !finalIntegration.refresh_token) {
      // Create a notification for the user
      await supabase.rpc("create_token_expiry_notification", {
        p_user_id: userId,
        p_provider: provider,
      })

      // Update integration status
      await supabase
        .from("integrations")
        .update({
          status: "disconnected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", finalIntegration.id)

      return {
        valid: false,
        requiresReauth: true,
        message: `${provider} token expired and requires re-authentication`,
        provider,
        userId,
      }
    }

    // Return the current token (which may have been refreshed)
    return {
      valid: true,
      accessToken: finalIntegration.access_token,
      requiresReauth: false,
      message: refreshResult.refreshed ? "Token was refreshed" : "Token is valid",
      provider,
      userId,
      token: finalIntegration,
    }
  } catch (error: any) {
    console.error(`Error getting valid access token for ${provider}:`, error)
    return {
      valid: false,
      requiresReauth: false,
      message: `Error: ${error.message}`,
      provider,
      userId,
    }
  }
}
