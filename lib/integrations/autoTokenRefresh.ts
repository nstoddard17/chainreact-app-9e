import { createAdminSupabaseClient } from "@/lib/oauth/utils"
import { refreshTokenIfNeeded } from "./tokenRefresher"

interface Integration {
  id: string
  provider: string
  access_token: string
  refresh_token?: string
  expires_at?: string
  user_id: string
  status: string
}

/**
 * Middleware to automatically refresh tokens before API calls
 */
export async function withAutoRefresh<T>(
  userId: string,
  provider: string,
  apiCall: (accessToken: string) => Promise<T>,
): Promise<T> {
  const supabase = createAdminSupabaseClient()
  if (!supabase) {
    throw new Error("Failed to create Supabase client")
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
    throw new Error(`No active ${provider} integration found`)
  }

  // Check if token needs refresh (within 30 minutes of expiry)
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = integration.expires_at ? new Date(integration.expires_at).getTime() / 1000 : 0
  const needsRefresh = expiresAt > 0 && expiresAt - now < 1800 // 30 minutes

  let currentToken = integration.access_token

  if (needsRefresh) {
    console.log(`Token for ${provider} expires soon, refreshing...`)
    const refreshResult = await refreshTokenIfNeeded(integration)

    if (refreshResult.success && refreshResult.newToken) {
      currentToken = refreshResult.newToken
      console.log(`Successfully refreshed ${provider} token`)
    } else if (!refreshResult.success) {
      console.error(`Failed to refresh ${provider} token:`, refreshResult.message)
      // Mark integration as disconnected
      await supabase
        .from("integrations")
        .update({
          status: "disconnected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", integration.id)

      throw new Error(`Token refresh failed for ${provider}: ${refreshResult.message}`)
    }
  }

  try {
    // Make the API call with the current (possibly refreshed) token
    return await apiCall(currentToken)
  } catch (error: any) {
    // If API call fails due to auth issues, try to refresh and retry once
    if (isAuthError(error) && integration.refresh_token) {
      console.log(`API call failed with auth error, attempting token refresh for ${provider}`)

      const refreshResult = await refreshTokenIfNeeded(integration)

      if (refreshResult.success && refreshResult.newToken) {
        console.log(`Retry with refreshed ${provider} token`)
        return await apiCall(refreshResult.newToken)
      } else {
        // Mark as disconnected if refresh fails
        await supabase
          .from("integrations")
          .update({
            status: "disconnected",
            updated_at: new Date().toISOString(),
          })
          .eq("id", integration.id)

        throw new Error(`Authentication failed for ${provider} and token refresh unsuccessful`)
      }
    }

    throw error
  }
}

/**
 * Check if an error is related to authentication/authorization
 */
function isAuthError(error: any): boolean {
  const authErrorCodes = [401, 403]
  const authErrorMessages = [
    "unauthorized",
    "invalid_token",
    "token_expired",
    "access_denied",
    "invalid_grant",
    "unauthenticated",
  ]

  // Check HTTP status codes
  if (error.status && authErrorCodes.includes(error.status)) {
    return true
  }

  // Check error messages
  const errorMessage = (error.message || error.error || "").toLowerCase()
  return authErrorMessages.some((msg) => errorMessage.includes(msg))
}

/**
 * Background job to refresh tokens that are expiring soon
 */
export async function refreshExpiringTokens(): Promise<void> {
  const supabase = createAdminSupabaseClient()
  if (!supabase) {
    console.error("Failed to create Supabase client for token refresh job")
    return
  }

  try {
    // Find integrations with tokens expiring in the next 2 hours
    const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()

    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("status", "connected")
      .not("refresh_token", "is", null)
      .lt("expires_at", twoHoursFromNow)

    if (error) {
      console.error("Error fetching expiring integrations:", error)
      return
    }

    if (!integrations || integrations.length === 0) {
      console.log("No tokens need refreshing")
      return
    }

    console.log(`Found ${integrations.length} tokens that need refreshing`)

    // Refresh each token
    for (const integration of integrations) {
      try {
        const result = await refreshTokenIfNeeded(integration)
        if (result.success) {
          console.log(`Successfully refreshed token for ${integration.provider} (user: ${integration.user_id})`)
        } else {
          console.warn(
            `Failed to refresh token for ${integration.provider} (user: ${integration.user_id}): ${result.message}`,
          )
        }
      } catch (error) {
        console.error(`Error refreshing token for ${integration.provider} (user: ${integration.user_id}):`, error)
      }
    }
  } catch (error) {
    console.error("Error in refreshExpiringTokens job:", error)
  }
}
