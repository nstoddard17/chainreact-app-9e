/**
 * Token Refresh Service
 *
 * This module provides functions to refresh OAuth tokens across different providers
 * using a centralized, configuration-driven approach.
 */

import type { Integration } from "@/types/integration"
import { db } from "@/lib/db"
import { getOAuthConfig, getOAuthClientCredentials } from "./oauthConfig"
import fetch from "node-fetch"
import { getBaseUrl } from "@/lib/utils/getBaseUrl"
import { decrypt } from "@/lib/security/encryption"
import { getSecret } from "@/lib/secrets"
import { encryptTokens } from "./tokenUtils"

// Standard response for token refresh operations
export interface RefreshResult {
  success: boolean
  accessToken?: string
  refreshToken?: string
  accessTokenExpiresIn?: number // Seconds until access token expiration
  refreshTokenExpiresIn?: number // Seconds until refresh token expiration
  error?: string
  statusCode?: number
  providerResponse?: any
  invalidRefreshToken?: boolean
  needsReauthorization?: boolean
  scope?: string
}

/**
 * Query parameters for refreshing tokens
 */
export interface RefreshTokensOptions {
  prioritizeExpiring?: boolean // Prioritize tokens that are about to expire
  dryRun?: boolean // Don't actually update the database
  limit?: number // Maximum number of tokens to refresh. If omitted, all eligible tokens will be processed.
  batchSize?: number // Number of tokens to refresh in each batch
  onlyProvider?: string // Only refresh tokens for this provider
  accessTokenExpiryThreshold?: number // Minutes before access token expiry to refresh
  refreshTokenExpiryThreshold?: number // Minutes before refresh token expiry to refresh
  retryFailedInLast?: number // Only retry tokens that failed in the last X minutes
  includeInactive?: boolean // Include inactive integrations
}

/**
 * Statistics from a token refresh operation
 */
export interface RefreshStats {
  processed: number
  successful: number
  failed: number
  skipped: number
  errors: Record<string, number>
  providerStats: Record<
    string,
    {
      processed: number
      successful: number
      failed: number
    }
  >
  startTime: Date
  endTime?: Date
  durationMs?: number
}

/**
 * Default options for token refresh
 */
const DEFAULT_REFRESH_OPTIONS: RefreshTokensOptions = {
  prioritizeExpiring: true,
  dryRun: false,
  batchSize: 50,
  accessTokenExpiryThreshold: 30, // 30 minutes
  refreshTokenExpiryThreshold: 30, // 30 minutes
}

/**
 * Main function to refresh OAuth tokens for active integrations
 *
 * @param options Options for token refresh
 * @returns Statistics about the refresh operation
 */
export async function refreshTokens(options: RefreshTokensOptions = {}): Promise<RefreshStats> {
  const startTime = new Date()

  // Merge default options with provided options
  const config = { ...DEFAULT_REFRESH_OPTIONS, ...options }

  // Initialize statistics
  const stats: RefreshStats = {
    processed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: {},
    providerStats: {},
    startTime,
  }

  try {
    // Build the query to get integrations with refresh tokens
    let query = db.from("integrations").select("*").not("refresh_token", "is", null)

    // Filter by status
    if (!config.includeInactive) {
      query = query.eq("is_active", true)
    }

    // Filter by provider if specified
    if (config.onlyProvider) {
      query = query.eq("provider", config.onlyProvider)
    }

    // Filter by failed tokens if specified
    if (config.retryFailedInLast) {
      const retryAfter = new Date()
      retryAfter.setMinutes(retryAfter.getMinutes() - config.retryFailedInLast)
      query = query.gt("consecutive_failures", 0).gt("updated_at", retryAfter.toISOString())
    }

    // Order by priority if requested
    if (config.prioritizeExpiring) {
      // First order by expires_at (nulls first), then by refresh_token_expires_at (nulls first)
      query = query
        .order("expires_at", { ascending: true, nullsFirst: false })
        .order("refresh_token_expires_at", { ascending: true, nullsFirst: false })
    }

    // Limit the number of tokens to process, if specified
    if (config.limit && config.limit > 0) {
      query = query.limit(config.limit)
    }

    // Execute the query
    const { data: integrations, error } = await query

    if (error) {
      console.error("Error fetching integrations:", error.message)
      throw error
    }

    console.log(`Found ${integrations.length} integrations with refresh tokens`)

    // Process integrations in batches
    const batchSize = config.batchSize || 50
    const batches = []

    for (let i = 0; i < integrations.length; i += batchSize) {
      batches.push(integrations.slice(i, i + batchSize))
    }

    // Process each batch sequentially
    for (const [batchIndex, batch] of batches.entries()) {
      console.log(`Processing batch ${batchIndex + 1} of ${batches.length} (${batch.length} integrations)`)

      // Process integrations in parallel within each batch
      const batchPromises = batch.map(async (integration) => {
        stats.processed++

        // Initialize provider stats if not yet initialized
        if (!stats.providerStats[integration.provider]) {
          stats.providerStats[integration.provider] = {
            processed: 0,
            successful: 0,
            failed: 0,
          }
        }

        stats.providerStats[integration.provider].processed++

        try {
          // Check if refresh is needed
          const needsRefresh = shouldRefreshToken(integration, {
            accessTokenExpiryThreshold: config.accessTokenExpiryThreshold,
            refreshTokenExpiryThreshold: config.refreshTokenExpiryThreshold,
          })

          if (!needsRefresh.shouldRefresh) {
            console.log(`No refresh needed for ${integration.provider} (ID: ${integration.id}): ${needsRefresh.reason}`)
            stats.skipped++
            return
          }

          console.log(`Refreshing token for ${integration.provider} (ID: ${integration.id}): ${needsRefresh.reason}`)

          if (!integration.refresh_token) {
            console.error(
              `Skipping refresh for ${integration.provider} (ID: ${integration.id}): Refresh token is null.`,
            )
            stats.skipped++
            return
          }

          // Refresh the token
          const refreshResult = await refreshTokenForProvider(
            integration.provider,
            integration.refresh_token,
            integration,
          )

          if (refreshResult.success) {
            stats.successful++
            stats.providerStats[integration.provider].successful++

            if (!config.dryRun) {
              // Update the token in the database
              await updateIntegrationWithRefreshResult(integration.id, refreshResult)
            }
          } else {
            stats.failed++
            stats.providerStats[integration.provider].failed++
            stats.errors[refreshResult.error || "unknown"] = (stats.errors[refreshResult.error || "unknown"] || 0) + 1

            if (!config.dryRun) {
              let status: "expired" | "needs_reauthorization" = "expired"
              if (refreshResult.invalidRefreshToken || refreshResult.needsReauthorization) {
                status = "needs_reauthorization"
              }

              // Update integration with error details
              await updateIntegrationWithError(
                integration.id,
                refreshResult.error || "Unknown error during token refresh",
                { status },
              )
            }
          }
        } catch (error: any) {
          console.error(`Unexpected error refreshing token for ${integration.provider} (ID: ${integration.id}):`, error)
          stats.failed++
          stats.providerStats[integration.provider].failed++
          stats.errors["unexpected_error"] = (stats.errors["unexpected_error"] || 0) + 1

          if (!config.dryRun) {
            // Update integration with error details
            await updateIntegrationWithError(integration.id, `Unexpected error: ${error.message}`, {})
          }
        }
      })

      // Wait for all integrations in the batch to be processed
      await Promise.all(batchPromises)
    }

    // Calculate duration
    const endTime = new Date()
    stats.endTime = endTime
    stats.durationMs = endTime.getTime() - startTime.getTime()

    return stats
  } catch (error) {
    console.error("Error during token refresh:", error)
    throw error
  }
}

/**
 * Determines if a token should be refreshed based on expiration times and other factors
 */
export function shouldRefreshToken(
  integration: Integration,
  options: { accessTokenExpiryThreshold?: number; refreshTokenExpiryThreshold?: number },
): { shouldRefresh: boolean; reason: string } {
  const now = new Date()
  const accessThreshold = options.accessTokenExpiryThreshold || 30 // Default 30 minutes
  const refreshThreshold = options.refreshTokenExpiryThreshold || 60 // Default 60 minutes

  // Check access token expiration
  if (integration.expires_at) {
    const expiresAt = new Date(integration.expires_at)
    const minutesUntilExpiration = (expiresAt.getTime() - now.getTime()) / (1000 * 60)

    if (minutesUntilExpiration <= accessThreshold) {
      return {
        shouldRefresh: true,
        reason: `Access token expires in ${Math.max(0, Math.round(minutesUntilExpiration))} minutes`,
      }
    }
  } else {
    // No expiration is set, we should refresh to be safe
    return { shouldRefresh: true, reason: "No access token expiration set" }
  }

  // Check refresh token expiration if applicable
  if (integration.refresh_token_expires_at) {
    const refreshExpiresAt = new Date(integration.refresh_token_expires_at)
    const minutesUntilRefreshExpiration = (refreshExpiresAt.getTime() - now.getTime()) / (1000 * 60)

    if (minutesUntilRefreshExpiration <= refreshThreshold) {
      return {
        shouldRefresh: true,
        reason: `Refresh token expires in ${Math.max(0, Math.round(minutesUntilRefreshExpiration))} minutes`,
      }
    }
  }

  // No refresh needed
  return { shouldRefresh: false, reason: "Tokens are still valid" }
}

/**
 * Update an integration with a successful refresh result
 */
async function updateIntegrationWithRefreshResult(integrationId: string, refreshResult: RefreshResult): Promise<void> {
  const { accessToken, refreshToken, accessTokenExpiresIn, refreshTokenExpiresIn, scope } = refreshResult

  if (!accessToken) {
    throw new Error("Cannot update integration: No access token in refresh result")
  }

  try {
    // Calculate the new expiration dates
    const now = new Date()
    let expiresAt: Date | null = null
    let refreshTokenExpiresAt: Date | null = null

    if (accessTokenExpiresIn) {
      expiresAt = new Date(now.getTime() + accessTokenExpiresIn * 1000)
    }

    // Handle refresh token expiration from the refresh response
    if (refreshTokenExpiresIn) {
      refreshTokenExpiresAt = new Date(now.getTime() + refreshTokenExpiresIn * 1000)
    }

    // Encrypt the new tokens
    let encryptedAccessToken = accessToken
    let encryptedRefreshToken = refreshToken || undefined

    try {
      const { encryptedAccessToken: newEncryptedAccessToken, encryptedRefreshToken: newEncryptedRefreshToken } =
        await encryptTokens(accessToken, refreshToken)

      encryptedAccessToken = newEncryptedAccessToken
      encryptedRefreshToken = newEncryptedRefreshToken || undefined
      console.log(`🔐 Encrypted new tokens for integration ID: ${integrationId}`)
    } catch (error: any) {
      console.error(`❌ Failed to encrypt new tokens for integration ID: ${integrationId}:`, error)
      // Continue with unencrypted tokens as fallback
    }

    // Prepare the update data
    const updateData: Record<string, any> = {
      access_token: encryptedAccessToken,
      updated_at: now.toISOString(),
      last_refresh_attempt: now.toISOString(),
      last_refresh_success: now.toISOString(),
      consecutive_failures: 0,
      status: "connected",
    }

    if (expiresAt) {
      updateData.expires_at = expiresAt.toISOString()
    }

    if (encryptedRefreshToken) {
      updateData.refresh_token = encryptedRefreshToken
    }

    // Update refresh token expiration if provided
    if (refreshTokenExpiresAt) {
      updateData.refresh_token_expires_at = refreshTokenExpiresAt.toISOString()
    }

    if (scope) {
      updateData.scope = scope
    }

    // Update the integration in the database
    const { error } = await db.from("integrations").update(updateData).eq("id", integrationId)

    if (error) {
      throw error
    }

    console.log(`✅ Updated tokens for integration ID: ${integrationId}`)
  } catch (error: any) {
    console.error(`❌ Failed to update tokens for integration ID: ${integrationId}:`, error)
    throw error
  }
}

/**
 * Update an integration with an error from token refresh
 */
async function updateIntegrationWithError(
  integrationId: string,
  errorMessage: string,
  additionalData: Record<string, any> = {},
): Promise<void> {
  try {
    // Get the current integration data
    const { data: integration, error: fetchError } = await db
      .from("integrations")
      .select("consecutive_failures")
      .eq("id", integrationId)
      .single()

    if (fetchError) {
      console.error(`Error fetching integration ${integrationId}:`, fetchError.message)
      throw fetchError
    }

    // Increment the failure counter
    const consecutiveFailures = (integration?.consecutive_failures || 0) + 1

    // Prepare the update data
    const updateData: Record<string, any> = {
      consecutive_failures: consecutiveFailures,
      disconnect_reason: errorMessage,
      updated_at: new Date().toISOString(),
      ...additionalData,
    }

    // If there are too many consecutive failures, mark as needing reauthorization
    if (consecutiveFailures >= 3 && !additionalData.status) {
      updateData.status = "needs_reauthorization"
    }

    // Update the database
    const { error: updateError } = await db.from("integrations").update(updateData).eq("id", integrationId)

    if (updateError) {
      console.error(`Error updating integration ${integrationId} with error:`, updateError.message)
    }
  } catch (error) {
    console.error(`Unexpected error updating integration ${integrationId} with error:`, error)
  }
}

/**
 * Refresh a token for a specific provider
 */
export async function refreshTokenForProvider(
  provider: string,
  refreshToken: string,
  integration: Integration,
): Promise<RefreshResult> {
  console.log(`🔄 Starting token refresh for ${provider} (ID: ${integration.id})`)

  try {
    // Decrypt the refresh token if it appears to be encrypted
    let decryptedRefreshToken = refreshToken
    if (refreshToken.includes(":")) {
      try {
        const secret = await getSecret("encryption_key")
        if (!secret) {
          throw new Error("Encryption secret is not configured")
        }

        console.log(`🔐 Decrypting refresh token for ${provider} (ID: ${integration.id})`)
        decryptedRefreshToken = decrypt(refreshToken, secret)
      } catch (error: any) {
        console.error(`❌ Failed to decrypt refresh token for ${provider} (ID: ${integration.id}):`, error)
        return {
          success: false,
          error: `Failed to decrypt refresh token: ${error.message}`,
        }
      }
    } else {
      console.log(`⚠️ Refresh token for ${provider} (ID: ${integration.id}) does not appear to be encrypted`)
    }

    const config = getOAuthConfig(provider)

    if (!config) {
      console.error(`❌ No OAuth config found for provider: ${provider}`)
      return { success: false, error: `No OAuth config found for provider: ${provider}` }
    }

    console.log(`✅ Found OAuth config for ${provider}: ${config.id}`)

    const { clientId, clientSecret } = getOAuthClientCredentials(config)

    if (!clientId || !clientSecret) {
      console.error(`❌ Missing client credentials for provider: ${provider}`)
      return { success: false, error: `Missing client credentials for provider: ${provider}` }
    }

    console.log(`✅ Got client credentials for ${provider}`)

    // Create a fresh URLSearchParams object to avoid "body used already" errors
    const bodyParams: Record<string, string> = {
      grant_type: "refresh_token",
      refresh_token: decryptedRefreshToken,
    }

    if (config.refreshRequiresClientAuth) {
      if (config.authMethod === "body") {
        bodyParams.client_id = clientId
        bodyParams.client_secret = clientSecret
        console.log(`✅ Added client auth to body for ${provider}`)
      }
    }

    // Add client_id to body if required (for providers like Twitter that need it with Basic Auth)
    if (config.sendClientIdWithRefresh) {
      bodyParams.client_id = clientId
    }

    // Add custom parameters if they exist
    if (config.additionalRefreshParams) {
      Object.entries(config.additionalRefreshParams).forEach(([key, value]) => {
        // Handle special placeholder values
        if (value === "PLACEHOLDER") {
          if (key === "fb_exchange_token" && integration.access_token) {
            bodyParams[key] = integration.access_token
          } else if (key === "client_key") {
            bodyParams[key] = clientId
          }
        } else {
          bodyParams[key] = value
        }
      })
    }

    // Determine the scope string from integration.scope or integration.scopes
    let scopeString: string | undefined = undefined
    if (integration.scope) {
      scopeString = integration.scope
    } else if (integration.scopes) {
      // Handle both string and array types for scopes
      if (Array.isArray(integration.scopes)) {
        scopeString = integration.scopes.join(" ")
      } else if (typeof integration.scopes === "string") {
        scopeString = integration.scopes
      }
    }

    // Add scope if required by the provider and available in the integration
    if (config.sendScopeWithRefresh && scopeString) {
      bodyParams.scope = scopeString
      console.log(`✅ Added scope to body for ${provider}: ${scopeString}`)
    }

    // HACK: Force add redirect_uri for all Microsoft providers to fix refresh issues
    if (provider.startsWith("microsoft") || provider === "onedrive" || provider === "teams") {
      const baseUrl = getBaseUrl()
      // Make sure we're using the correct callback path for each provider
      let redirectPath = `/api/integrations/${provider}/callback`

      // For Microsoft providers, ensure we're using the correct callback URL
      // This is crucial as Microsoft is very strict about the redirect URI
      if (config.redirectUriPath) {
        redirectPath = config.redirectUriPath
      }

      const redirectUri = `${baseUrl}${redirectPath}`
      bodyParams.redirect_uri = redirectUri
      console.log(`✅ Added redirect_uri to body for ${provider}: ${redirectUri}`)
    }

    // Special handling for Airtable
    if (provider === "airtable") {
      // Airtable requires redirect_uri in refresh token requests
      const baseUrl = getBaseUrl()
      const redirectUri = `${baseUrl}/api/integrations/airtable/callback`
      bodyParams.redirect_uri = redirectUri
      console.log(`✅ Added redirect_uri to body for Airtable: ${redirectUri}`)

      // Ensure we're using the correct grant_type for Airtable
      bodyParams.grant_type = "refresh_token"

      // Log the refresh token (first few chars) to help debug
      if (decryptedRefreshToken) {
        console.log(`🔄 Airtable refresh token starts with: ${decryptedRefreshToken.substring(0, 10)}...`)
      } else {
        console.error(`❌ Airtable refresh token is empty or undefined`)
      }
    }

    // Add redirect_uri for providers that need it during refresh
    if (config.sendRedirectUriWithRefresh && config.redirectUriPath) {
      // Skip redirect_uri for Dropbox as it doesn't accept this parameter during refresh
      if (provider !== 'dropbox') {
        const baseUrl = getBaseUrl()
        const redirectUri = `${baseUrl}${config.redirectUriPath}`
        bodyParams.redirect_uri = redirectUri
        console.log(`✅ Added redirect_uri to body for ${provider}: ${redirectUri}`)
      } else {
        console.log(`ℹ️ Skipping redirect_uri for Dropbox as it's not supported during refresh`)
      }
    }

    // Prepare the request
    const headers = new Headers()
    if (config.authMethod === "basic") {
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
      headers.set("Authorization", `Basic ${basicAuth}`)
      console.log(`✅ Added Basic auth header for ${provider}`)
    } else if (config.authMethod === "header") {
      headers.set("Client-ID", clientId)
      headers.set("Authorization", `Bearer ${clientSecret}`)
      console.log(`✅ Added header auth for ${provider}`)
    }
    headers.set("Content-Type", "application/x-www-form-urlencoded")

    // Convert bodyParams to URLSearchParams string - create a fresh instance to avoid "body used already"
    const bodyString = new URLSearchParams(bodyParams).toString()
    console.log(`🔄 Sending refresh request to ${config.tokenEndpoint} for ${provider}`)
    console.log(`🔄 Request body: ${bodyString}`)

    try {
      const response = await fetch(config.tokenEndpoint, {
        method: "POST",
        headers,
        body: bodyString,
      })

      console.log(`🔄 Received response from ${provider}: ${response.status} ${response.statusText}`)

      // Try to parse the response as JSON, but handle non-JSON responses gracefully
      let data: any
      let responseText: string
      
      try {
        responseText = await response.text()
        try {
          data = JSON.parse(responseText)
          console.log(`✅ Parsed JSON response from ${provider}`)
        } catch (error) {
          // If parsing fails, the body might not be JSON. We'll use the raw text.
          console.error(`❌ Failed to parse JSON response from ${provider}: ${responseText}`)
          
          // Special handling for TikTok
          if (provider === 'tiktok') {
            console.log(`🔄 Attempting to handle non-JSON TikTok response`)
            
            // Check if it's an HTML response (common with TikTok errors)
            if (responseText.includes('<!DOCTYPE html>') || responseText.includes('<html>')) {
              data = { 
                error: "invalid_response", 
                error_description: "TikTok returned HTML instead of JSON. The refresh token might be invalid or expired."
              }
            } else {
              // Try to extract information from the response if possible
              data = { 
                error: "invalid_response_format", 
                error_description: "TikTok returned an invalid response format",
                body: responseText.substring(0, 200) // Only include the first 200 chars to avoid huge logs
              }
            }
          } else {
            data = { error: "Invalid JSON response", body: responseText }
          }
        }
      } catch (error: any) {
        console.error(`❌ Error reading response body from ${provider}: ${error.message}`)
        return {
          success: false,
          error: `Error reading response body: ${error.message}`,
          statusCode: response.status,
        }
      }

      if (!response.ok) {
        const errorMessage = data.error_description || data.error || `HTTP ${response.status} - ${response.statusText}`
        console.error(
          `Failed to refresh token for ${provider} (ID: ${integration.id}). ` +
            `Status: ${response.status}. ` +
            `Error: ${errorMessage}. ` +
            `Response: ${JSON.stringify(data)}`,
        )

        // Check for specific error codes that indicate an invalid refresh token
        const isInvalidGrant = data.error === "invalid_grant"
        const isInvalidOrExpiredToken = isInvalidGrant || response.status === 401

        // Provider-specific error handling
        let finalErrorMessage = errorMessage
        let needsReauth = isInvalidOrExpiredToken

        // Special handling for Airtable errors
        if (provider === "airtable") {
          console.log(`🔄 Airtable error details: ${JSON.stringify(data)}`)
          if (data.error === "invalid_grant") {
            finalErrorMessage = "Airtable refresh token expired or invalid. User must re-authorize."
            needsReauth = true
          }
        }

        // Special handling for Microsoft-related providers (Teams, OneDrive)
        if (provider === "teams" || provider === "onedrive" || provider.startsWith("microsoft")) {
          console.log(`🔄 Microsoft error details: ${JSON.stringify(data)}`)
          if (data.error === "invalid_grant") {
            finalErrorMessage = `${provider} refresh token expired or invalid. User must re-authorize.`
            needsReauth = true
          }
        }
        
        // Special handling for TikTok
        if (provider === "tiktok") {
          console.log(`🔄 TikTok error details: ${JSON.stringify(data)}`)
          
          // Common TikTok error patterns
          if (data.error === "invalid_client") {
            finalErrorMessage = "TikTok client credentials are invalid or expired."
          } else if (data.error === "invalid_request") {
            finalErrorMessage = "TikTok refresh token request was invalid."
          } else if (data.error === "invalid_response" || data.error === "invalid_response_format") {
            finalErrorMessage = data.error_description || "TikTok returned an invalid response."
            needsReauth = true; // HTML responses usually indicate an expired token
          } else if (response.status === 401) {
            finalErrorMessage = "TikTok authorization failed. The refresh token may be expired."
            needsReauth = true;
          }
        }
        
        // Special handling for PayPal
        if (provider === "paypal") {
          console.log(`🔄 PayPal error details: ${JSON.stringify(data)}`)
          if (data.error === "invalid_client") {
            finalErrorMessage = "PayPal client credentials are invalid."
          }
        }

        return {
          success: false,
          error: finalErrorMessage,
          statusCode: response.status,
          providerResponse: data,
          invalidRefreshToken: needsReauth,
          needsReauthorization: needsReauth,
        }
      }

      const newAccessToken = data.access_token
      const newRefreshToken = data.refresh_token
      const expiresIn = data.expires_in
      const refreshExpiresIn = data.refresh_expires_in
      const newScope = data.scope

      return {
        success: true,
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        accessTokenExpiresIn: expiresIn,
        refreshTokenExpiresIn: refreshExpiresIn,
        scope: newScope,
        providerResponse: data,
      }
    } catch (fetchError: any) {
      console.error(`❌ Network error during token refresh for ${provider}: ${fetchError.message}`)
      return {
        success: false,
        error: `Network error during token refresh: ${fetchError.message}`,
        statusCode: 0,
        needsReauthorization: false,
      }
    }
  } catch (error: any) {
    console.error("Error during token refresh:", error)
    return {
      success: false,
      error: `Unexpected error during token refresh: ${error.message || "Unknown error"}`,
      statusCode: 500,
      needsReauthorization: false,
    }
  }
}

/**
 * Get tokens that need refreshing
 */
export async function getTokensNeedingRefresh(options: {
  limit?: number
  accessTokenExpiryThreshold?: number
  refreshTokenExpiryThreshold?: number
  includeInactive?: boolean
}): Promise<Integration[]> {
  const now = new Date()
  const accessThreshold = options.accessTokenExpiryThreshold || 30 // Default 30 minutes
  const refreshThreshold = options.refreshTokenExpiryThreshold || 60 // Default 60 minutes

  // Calculate thresholds as dates
  const accessExpiryThreshold = new Date(now)
  accessExpiryThreshold.setMinutes(accessExpiryThreshold.getMinutes() + accessThreshold)

  const refreshExpiryThreshold = new Date(now)
  refreshExpiryThreshold.setMinutes(refreshExpiryThreshold.getMinutes() + refreshThreshold)

  // Build the query to get integrations with refresh tokens
  let query = db.from("integrations").select("*").not("refresh_token", "is", null)

  // Filter by status
  if (!options.includeInactive) {
    query = query.eq("is_active", true)
  }

  // Get tokens where either:
  // 1. Access token expires soon or has no expiry
  // 2. Refresh token expires soon
  query = query.or(
    `expires_at.lt.${accessExpiryThreshold.toISOString()},expires_at.is.null,refresh_token_expires_at.lt.${refreshExpiryThreshold.toISOString()}`,
  )

  // Order by expiration time
  query = query
    .order("expires_at", { ascending: true, nullsFirst: false })
    .order("refresh_token_expires_at", { ascending: true, nullsFirst: false })

  // Limit the number of results
  if (options.limit) {
    query = query.limit(options.limit)
  }

  // Execute the query
  const { data: integrations, error } = await query

  if (error) {
    console.error("Error fetching integrations:", error.message)
    throw error
  }

  return integrations || []
}

/**
 * Get tokens with refresh errors
 */
export async function getTokensWithRefreshErrors(options: {
  limit?: number
  minConsecutiveFailures?: number
}): Promise<Integration[]> {
  const minFailures = options.minConsecutiveFailures || 1

  // Build the query to get integrations with refresh errors
  let query = db
    .from("integrations")
    .select("*")
    .gte("consecutive_failures", minFailures)
    .order("consecutive_failures", { ascending: false })

  // Limit the number of results
  if (options.limit) {
    query = query.limit(options.limit)
  }

  // Execute the query
  const { data: integrations, error } = await query

  if (error) {
    console.error("Error fetching integrations with errors:", error.message)
    throw error
  }

  return integrations || []
}

/**
 * Export convenience methods for use in API routes and other services
 */
export const TokenRefreshService = {
  refreshTokens,
  shouldRefreshToken,
  refreshTokenForProvider,
  getTokensNeedingRefresh,
  getTokensWithRefreshErrors,
}

export default TokenRefreshService
