import { getAdminSupabaseClient } from "@/lib/supabase/admin"
import { refreshTokenIfNeeded } from "./tokenRefresher"
import { TokenAuditLogger } from "./TokenAuditLogger"

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
  const supabase = getAdminSupabaseClient()
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
  ].includes(provider)

  // For Google/Microsoft, always refresh before API calls to ensure fresh tokens
  // For others, only refresh if expiring soon
  let needsRefresh = false

  if (isGoogleOrMicrosoft && integration.refresh_token) {
    // Always refresh Google/Microsoft tokens before API calls
    needsRefresh = true
  } else if (integration.expires_at) {
    // For other providers, check if token expires within 30 minutes
    const now = Math.floor(Date.now() / 1000)
    const expiresAt = new Date(integration.expires_at).getTime() / 1000
    needsRefresh = expiresAt - now < 1800 // 30 minutes
  }

  let currentToken = integration.access_token

  if (needsRefresh) {
    console.log(`Refreshing token for ${provider}...`)
    const refreshResult = await refreshTokenIfNeeded(integration)

    if (refreshResult.success && refreshResult.newToken) {
      currentToken = refreshResult.newToken
      console.log(`Successfully refreshed ${provider} token`)
    } else if (!refreshResult.success) {
      console.error(`Failed to refresh ${provider} token:`, refreshResult.message)

      // For Google/Microsoft, don't mark as disconnected immediately - they should keep working
      if (!isGoogleOrMicrosoft) {
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
        // Only mark as disconnected if it's not Google/Microsoft or if refresh completely fails
        if (!isGoogleOrMicrosoft) {
          await supabase
            .from("integrations")
            .update({
              status: "disconnected",
              updated_at: new Date().toISOString(),
            })
            .eq("id", integration.id)
        }

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

interface RefreshStats {
  totalProcessed: number
  successful: number
  failed: number
  skipped: number
  errors: Array<{
    provider: string
    userId: string
    error: string
  }>
}

/**
 * Enhanced background job to refresh tokens that are expiring soon
 */
export async function refreshExpiringTokens(): Promise<RefreshStats> {
  const supabase = getAdminSupabaseClient()
  if (!supabase) {
    throw new Error("Failed to create Supabase client for token refresh job")
  }

  const stats: RefreshStats = {
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  }

  try {
    // Get all connected integrations with refresh tokens
    const { data: integrations, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("status", "connected")
      .not("refresh_token", "is", null)

    if (error) {
      throw new Error(`Error fetching integrations: ${error.message}`)
    }

    if (!integrations || integrations.length === 0) {
      console.log("ℹ️ No integrations with refresh tokens found")
      return stats
    }

    console.log(`🔍 Found ${integrations.length} integrations with refresh tokens`)
    stats.totalProcessed = integrations.length

    // Process integrations in batches to avoid overwhelming APIs
    const batchSize = 5
    for (let i = 0; i < integrations.length; i += batchSize) {
      const batch = integrations.slice(i, i + batchSize)

      await Promise.allSettled(
        batch.map(async (integration) => {
          try {
            const result = await processIntegrationRefresh(integration)

            if (result.refreshed) {
              stats.successful++
              console.log(`✅ Refreshed ${integration.provider} for user ${integration.user_id}`)
            } else if (result.success) {
              stats.skipped++
            } else {
              stats.failed++
              stats.errors.push({
                provider: integration.provider,
                userId: integration.user_id,
                error: result.message,
              })
              console.warn(
                `⚠️ Failed to refresh ${integration.provider} for user ${integration.user_id}: ${result.message}`,
              )
            }
          } catch (error: any) {
            stats.failed++
            stats.errors.push({
              provider: integration.provider,
              userId: integration.user_id,
              error: error.message,
            })
            console.error(`💥 Error processing ${integration.provider} for user ${integration.user_id}:`, error)
          }
        }),
      )

      // Small delay between batches to be respectful to APIs
      if (i + batchSize < integrations.length) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    // Clean up old refresh logs (keep last 30 days)
    await cleanupOldLogs(supabase)

    return stats
  } catch (error: any) {
    console.error("💥 Critical error in refreshExpiringTokens:", error)
    throw error
  }
}

async function processIntegrationRefresh(integration: any) {
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

  // Determine if refresh is needed
  let shouldRefresh = false
  const now = Math.floor(Date.now() / 1000)

  if (isGoogleOrMicrosoft) {
    // For Google/Microsoft, refresh if expires within 1 hour or no expiry set
    if (!integration.expires_at) {
      shouldRefresh = true
    } else {
      const expiresIn = integration.expires_at - now
      shouldRefresh = expiresIn < 3600 // 1 hour
    }
  } else if (integration.expires_at) {
    // For others, refresh if expires within 2 hours
    const expiresIn = integration.expires_at - now
    shouldRefresh = expiresIn < 7200 // 2 hours
  }

  if (!shouldRefresh) {
    return {
      refreshed: false,
      success: true,
      message: "Token not due for refresh",
    }
  }

  // Attempt refresh with retry logic
  return await refreshTokenWithRetry(integration, 3)
}

async function refreshTokenWithRetry(integration: any, maxRetries: number) {
  let lastError: any

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await refreshTokenIfNeeded(integration)

      if (result.success) {
        // Update last refresh timestamp
        const supabase = getAdminSupabaseClient()
        if (supabase) {
          await supabase
            .from("integrations")
            .update({
              last_token_refresh: new Date().toISOString(),
              consecutive_failures: 0, // Reset failure count on success
            })
            .eq("id", integration.id)
        }
        return result
      } else {
        lastError = new Error(result.message)
      }
    } catch (error) {
      lastError = error
      console.warn(`🔄 Retry ${attempt}/${maxRetries} failed for ${integration.provider}:`, error)
    }

    // Wait before retry (exponential backoff)
    if (attempt < maxRetries) {
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000))
    }
  }

  // All retries failed - update failure count
  const supabase = getAdminSupabaseClient()
  if (supabase) {
    await supabase
      .from("integrations")
      .update({
        consecutive_failures: (integration.consecutive_failures || 0) + 1,
        last_failure_at: new Date().toISOString(),
      })
      .eq("id", integration.id)
  }

  throw lastError
}

async function cleanupOldLogs(supabase: any) {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    await supabase.from("token_refresh_logs").delete().lt("executed_at", thirtyDaysAgo.toISOString())
  } catch (error) {
    console.warn("Failed to cleanup old logs:", error)
  }
}

async function getIntegration(integrationId: string) {
  try {
    const supabase = getAdminSupabaseClient()
    const { data: integration, error } = await supabase
      .from("integrations")
      .select("*")
      .eq("id", integrationId)
      .single()

    if (error || !integration) {
      throw new Error(`No integration found with id: ${integrationId}`)
    }

    return integration
  } catch (error) {
    console.error(`💥 Error fetching integration with id: ${integrationId}:`, error)
    throw error
  }
}

async function updateIntegration(
  integrationId: string,
  updates: {
    access_token: string
    refresh_token?: string
    expires_at?: string
    status?: string
    updated_at: string
  },
) {
  try {
    const supabase = getAdminSupabaseClient()
    await supabase.from("integrations").update(updates).eq("id", integrationId)
  } catch (error) {
    console.error(`💥 Error updating integration with id: ${integrationId}:`, error)
    throw error
  }
}

async function handleTokenRefreshResult(
  integration: any,
  result: {
    success: boolean
    newAccessToken?: string
    newRefreshToken?: string
    expiresIn?: number
    errorMessage?: string
    statusCode?: number
  },
) {
  if (result.success) {
    const supabase = getAdminSupabaseClient()
    const { access_token, refresh_token, expires_at } = await getEncryptedTokens(
      result.newAccessToken,
      result.newRefreshToken,
      result.expiresIn,
    )

    const updates: any = {
      access_token,
      refresh_token,
      expires_at,
      status: "connected",
      updated_at: new Date().toISOString(),
    }

    await updateIntegration(integration.id, updates)

    const logger = TokenAuditLogger.getInstance()
    await logger.logTokenRefresh(integration.id, integration.provider, true)
  } else {
    const supabase = getAdminSupabaseClient()
    const updates: any = {
      status: "error",
      updated_at: new Date().toISOString(),
    }

    await updateIntegration(integration.id, updates)

    const logger = TokenAuditLogger.getInstance()
    await logger.logTokenRefresh(integration.id, integration.provider, false)
  }
}
