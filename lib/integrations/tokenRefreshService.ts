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
import { getAllScopes } from "./integrationScopes"

import { logger } from '@/lib/utils/logger'

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
  verbose?: boolean
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
  const verbose = options.verbose ?? false

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
      logger.error("Error fetching integrations:", error.message)
      throw error
    }

    logger.debug(`Found ${integrations.length} integrations with refresh tokens`)

    // Process integrations in batches
    const batchSize = config.batchSize || 50
    const batches = []

    for (let i = 0; i < integrations.length; i += batchSize) {
      batches.push(integrations.slice(i, i + batchSize))
    }

    // Process each batch sequentially
    for (const [batchIndex, batch] of batches.entries()) {
      logger.debug(`Processing batch ${batchIndex + 1} of ${batches.length} (${batch.length} integrations)`)

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
            if (verbose) logger.debug(`No refresh needed for ${integration.provider} (ID: ${integration.id}): ${needsRefresh.reason}`)
            stats.skipped++
            return
          }

          if (verbose) logger.debug(`Refreshing token for ${integration.provider} (ID: ${integration.id}): ${needsRefresh.reason}`)

          if (!integration.refresh_token) {
            logger.error(
              `Skipping refresh for ${integration.provider}: Refresh token is null.`,
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
              await updateIntegrationWithRefreshResult(integration.id, refreshResult, verbose)
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
                verbose
              )
            }
          }
        } catch (error: any) {
          logger.error(`Unexpected error refreshing token for ${integration.provider} (ID: ${integration.id}):`, error)
          stats.failed++
          stats.providerStats[integration.provider].failed++
          stats.errors["unexpected_error"] = (stats.errors["unexpected_error"] || 0) + 1

          if (!config.dryRun) {
            // Update integration with error details
            await updateIntegrationWithError(integration.id, `Unexpected error: ${error.message}`, {}, verbose)
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
    logger.error("Error during token refresh:", error)
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
async function updateIntegrationWithRefreshResult(integrationId: string, refreshResult: RefreshResult, verbose: boolean = false): Promise<void> {
  const { accessToken, refreshToken, accessTokenExpiresIn, refreshTokenExpiresIn, scope } = refreshResult

  if (!accessToken) {
    throw new Error("Cannot update integration: No access token in refresh result")
  }

  try {
    // First, get the current integration data to access the metadata
    const { data: integration, error: fetchError } = await db
      .from("integrations")
      .select("metadata")
      .eq("id", integrationId)
      .single()

    if (fetchError) {
      logger.error(`Error fetching integration data:`, fetchError.message)
      throw fetchError
    }

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
      if (verbose) logger.debug(`Encrypted new tokens for integration ID: ${integrationId}`)
    } catch (error: any) {
      logger.error(`Failed to encrypt tokens:`, error)
      // Continue with unencrypted tokens as fallback
    }

    // Update metadata to clear any error information
    let updatedMetadata = integration?.metadata || {}
    if (typeof updatedMetadata === 'string') {
      try {
        updatedMetadata = JSON.parse(updatedMetadata)
      } catch (e) {
        updatedMetadata = {}
      }
    }
    
    // Remove error information from metadata
    if (updatedMetadata) {
      delete updatedMetadata.last_error
      delete updatedMetadata.last_error_at
      delete updatedMetadata.requires_reauth
    }

    // Prepare the update data
    const updateData: Record<string, any> = {
      access_token: encryptedAccessToken,
      updated_at: now.toISOString(),
      last_refresh_attempt: now.toISOString(),
      last_refresh_success: now.toISOString(),
      consecutive_failures: 0,
      status: "connected",
      disconnect_reason: null,
      metadata: updatedMetadata
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

    if (verbose) logger.debug(`Updated tokens for integration ID: ${integrationId}`)
  } catch (error: any) {
    logger.error(`Failed to update tokens:`, error)
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
  verbose: boolean = false
): Promise<void> {
  try {
    // Get the current integration data
    const { data: integration, error: fetchError } = await db
      .from("integrations")
      .select("consecutive_failures, metadata")
      .eq("id", integrationId)
      .single()

    if (fetchError) {
      logger.error(`Error fetching integration data:`, fetchError.message)
      throw fetchError
    }

    // Increment the failure counter
    const consecutiveFailures = (integration?.consecutive_failures || 0) + 1

    // Update metadata with error information
    let updatedMetadata = integration?.metadata || {}
    if (typeof updatedMetadata === 'string') {
      try {
        updatedMetadata = JSON.parse(updatedMetadata)
      } catch (e) {
        updatedMetadata = {}
      }
    }
    
    // Add error information to metadata
    updatedMetadata = {
      ...updatedMetadata,
      last_error: errorMessage,
      last_error_at: new Date().toISOString(),
      requires_reauth: consecutiveFailures >= 3 || additionalData.status === "needs_reauthorization"
    }

    // Prepare the update data
    const updateData: Record<string, any> = {
      consecutive_failures: consecutiveFailures,
      disconnect_reason: errorMessage,
      updated_at: new Date().toISOString(),
      metadata: updatedMetadata,
      ...additionalData,
    }

    // If there are too many consecutive failures, mark as needing reauthorization
    if (consecutiveFailures >= 3 && !additionalData.status) {
      updateData.status = "needs_reauthorization"
    }

    // Update the database
    const { error: updateError } = await db.from("integrations").update(updateData).eq("id", integrationId)

    if (updateError) {
      logger.error(`Error updating integration with error:`, updateError.message)
    }
  } catch (error) {
    logger.error(`Unexpected error updating integration with error:`, error)
  }
}

/**
 * Refresh a token for a specific provider
 */
export async function refreshTokenForProvider(
  provider: string,
  refreshToken: string,
  integration: Integration,
  options: { verbose?: boolean } = {}
): Promise<RefreshResult> {
  const verbose = options.verbose ?? false;
  
  if (verbose) logger.debug(`Starting token refresh for ${provider} (ID: ${integration.id})`)
  else logger.debug(`Refreshing token for ${provider}`) // No user ID in regular logs

  try {
    // Decrypt the refresh token if it appears to be encrypted
    let decryptedRefreshToken = refreshToken
    if (refreshToken.includes(":")) {
      try {
        const secret = await getSecret("encryption_key")
        if (!secret) {
          throw new Error("Encryption secret is not configured")
        }

        if (verbose) logger.debug(`Decrypting refresh token for ${provider} (ID: ${integration.id})`)
        decryptedRefreshToken = decrypt(refreshToken, secret)
      } catch (error: any) {
        logger.error(`Decryption error:`, error)
        
        // Check for specific decryption errors
        if (error.code === 'ERR_CRYPTO_INVALID_IV') {
          return {
            success: false,
            error: `Failed to decrypt refresh token: Invalid initialization vector. The token may be corrupted or encrypted with a different key.`,
            needsReauthorization: true
          }
        } else if (error.message.includes('Invalid initialization vector')) {
          return {
            success: false,
            error: `Failed to decrypt refresh token: Invalid initialization vector. The token may be corrupted or encrypted with a different key.`,
            needsReauthorization: true
          }
        } 
          return {
            success: false,
            error: `Failed to decrypt refresh token: ${error.message}`,
            needsReauthorization: true
          }
        
      }
    } else {
      if (verbose) logger.debug(`Refresh token for ${provider} (ID: ${integration.id}) does not appear to be encrypted`)
    }

    const config = getOAuthConfig(provider)

    if (!config) {
      logger.error(`No OAuth config found for provider: ${provider}`)
      return { success: false, error: `No OAuth config found for provider: ${provider}` }
    }

    if (verbose) logger.debug(`Found OAuth config for ${provider}`)

    // Special handling for Microsoft services to ensure they use the correct client credentials
    let clientId: string | undefined
    let clientSecret: string | undefined
    
    if (provider === "teams") {
      clientId = process.env.TEAMS_CLIENT_ID
      clientSecret = process.env.TEAMS_CLIENT_SECRET
      if (!clientId || !clientSecret) {
        return { 
          success: false, 
          error: `Teams client credentials not configured. Please set TEAMS_CLIENT_ID and TEAMS_CLIENT_SECRET.` 
        }
      }
    } else if (provider === "onedrive") {
      clientId = process.env.ONEDRIVE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID
      clientSecret = process.env.ONEDRIVE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET
    } else if (provider === "microsoft-outlook") {
      clientId = process.env.OUTLOOK_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID
      clientSecret = process.env.OUTLOOK_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET
    } else if (provider === "microsoft-onenote") {
      clientId = process.env.ONENOTE_CLIENT_ID || process.env.MICROSOFT_CLIENT_ID
      clientSecret = process.env.ONENOTE_CLIENT_SECRET || process.env.MICROSOFT_CLIENT_SECRET
    } else {
      // Use the standard OAuth config for other providers
      const credentials = getOAuthClientCredentials(config)
      clientId = credentials.clientId
      clientSecret = credentials.clientSecret
    }

    if (!clientId || !clientSecret) {
      logger.error(`Missing client credentials for provider: ${provider}`)
      return { success: false, error: `Missing client credentials for provider: ${provider}` }
    }

    if (verbose) logger.debug(`Got client credentials for ${provider}`)

    // Create a fresh URLSearchParams object to avoid "body used already" errors
    const bodyParams: Record<string, string> = {
      grant_type: "refresh_token",
      refresh_token: decryptedRefreshToken,
    }

    if (config.refreshRequiresClientAuth) {
      if (config.authMethod === "body") {
        bodyParams.client_id = clientId
        bodyParams.client_secret = clientSecret
        if (verbose) logger.debug(`Added client auth to body for ${provider}`)
      }
    } else {
      // Some providers like Kit only need client_id, not client_secret for refresh
      if (provider.toLowerCase() === "kit") {
        bodyParams.client_id = clientId
        // Remove any client_secret if it was added
        delete bodyParams.client_secret
        if (verbose) logger.debug(`Special handling for Kit: added only client_id to body`)
      }
    }

    // Add scope if configured AND the provider supports it during refresh
    // Some providers like Discord don't accept scope in refresh requests
    if (config.scope && config.sendScopeWithRefresh !== false) {
      // Teams uses config.scope directly (same as other Microsoft services)
      if (provider === "teams") {
        const scopeString = config.scope || ""
        bodyParams.scope = scopeString
        if (verbose) logger.debug(`Added Teams scope from config: ${scopeString}`)
      } else {
        const scopeString = Array.isArray(config.scope) ? config.scope.join(" ") : config.scope
        bodyParams.scope = scopeString
        if (verbose) logger.debug(`Added scope to body for ${provider}: ${scopeString}`)
      }
    } else if (config.scope && config.sendScopeWithRefresh === false) {
      if (verbose) logger.debug(`Skipping scope for ${provider} as sendScopeWithRefresh is false`)
    }

    // Add redirect_uri if required
    if (config.sendRedirectUriWithRefresh) {
      const baseUrl = getBaseUrl()
      const redirectUri = `${baseUrl}${config.redirectUriPath}`
      bodyParams.redirect_uri = redirectUri
      if (verbose) logger.debug(`Added redirect_uri to body for ${provider}: ${redirectUri}`)
    }

    // Special handling for Airtable
    if (provider === "airtable" && config.redirectUriPath) {
      const baseUrl = getBaseUrl()
      const redirectUri = `${baseUrl}${config.redirectUriPath}`
      bodyParams.redirect_uri = redirectUri
      if (verbose) logger.debug(`Added redirect_uri to body for Airtable: ${redirectUri}`)
    }

    // Special handling for Dropbox
    if (provider === "dropbox") {
      if (verbose) logger.debug(`Skipping redirect_uri for Dropbox as it's not supported during refresh`)
      delete bodyParams.redirect_uri
    }

    // Prepare the request headers
    const headers = new Headers()
    if (config.authMethod === "basic") {
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64")
      headers.set("Authorization", `Basic ${basicAuth}`)
      if (verbose) logger.debug(`Added Basic auth header for ${provider}`)
    } else if (config.authMethod === "header") {
      headers.set("Client-ID", clientId)
      headers.set("Authorization", `Bearer ${clientSecret}`)
      if (verbose) logger.debug(`Added header auth for ${provider}`)
    }
    headers.set("Content-Type", "application/x-www-form-urlencoded")

    // Convert bodyParams to string
    const bodyString = new URLSearchParams(bodyParams).toString()

    // Log the request details
    if (verbose) {
      logger.debug(`Sending refresh request to ${config.tokenEndpoint} for ${provider}`)
      logger.debug(`Request body params:`, Object.keys(bodyParams).join(', '))
    } else {
      logger.debug(`Refreshing token for ${provider}`)
    }

    // Make the request
    const response = await fetch(config.tokenEndpoint, {
      method: "POST",
      headers,
      body: bodyString,
    })

    if (verbose) logger.debug(`Received response from ${provider}: ${response.status} ${response.statusText}`)

    // Try to parse the response as JSON, but handle non-JSON responses gracefully
    let responseData: any
    try {
      responseData = await response.json()
    } catch (parseError: any) {
      const responseText = await response.text()
      
      // Check if the response is HTML (common with Kit and some other providers)
      if (responseText.trim().startsWith("<!doctype html>") || responseText.trim().startsWith("<html")) {
        logger.error(`❌ Failed to parse JSON response from ${provider}: ${responseText.substring(0, 200)}...`)
        return {
          success: false,
          error: `Provider returned HTML instead of JSON. The refresh token may be invalid or the provider's API may have changed.`,
          statusCode: response.status,
          needsReauthorization: true
        }
      }
      
      logger.error(`❌ Failed to parse JSON response from ${provider}:`, parseError)
      return {
        success: false,
        error: `Failed to parse response: ${parseError.message}`,
        statusCode: response.status
      }
    }

    if (!response.ok) {
      const errorMessage = responseData.error_description || responseData.error || `HTTP ${response.status} - ${response.statusText}`
      logger.error(
        `Failed to refresh token for ${provider} (ID: ${integration.id}). ` +
          `Status: ${response.status}. ` +
          `Error: ${errorMessage}. ` +
          `Response: ${JSON.stringify(responseData)}`,
      )

      // Check for specific error codes that indicate an invalid refresh token
      const isInvalidGrant = responseData.error === "invalid_grant"
      const isInvalidOrExpiredToken = isInvalidGrant || response.status === 401

      // Provider-specific error handling
      let finalErrorMessage = errorMessage
      let needsReauth = isInvalidOrExpiredToken

      // Special handling for Gmail and Google services
      if (provider === "gmail" || provider.startsWith("google")) {
        if (verbose) logger.debug(`Google error type: ${responseData.error}`)
        if (responseData.error === "invalid_grant") {
          finalErrorMessage = `Google refresh token has been revoked or expired. This can happen if you changed your password, revoked access, or haven't used this integration in over 6 months. Please reconnect your ${provider} account in Settings → Integrations.`
          needsReauth = true
        }
      }

      // Special handling for Discord errors
      else if (provider === "discord") {
        if (verbose) logger.debug(`Discord error type: ${responseData.error}`)
        if (responseData.error === "invalid_scope") {
          finalErrorMessage = "Discord authentication scopes have changed. Please reconnect your Discord account in Settings → Integrations."
          needsReauth = true
        } else if (responseData.error === "invalid_grant") {
          finalErrorMessage = "Discord refresh token expired or invalid. Please reconnect your Discord account in Settings → Integrations."
          needsReauth = true
        }
      }

      // Special handling for Airtable errors
      else if (provider === "airtable") {
        if (verbose) logger.debug(`Airtable error type: ${responseData.error}`)
        if (responseData.error === "invalid_grant") {
          finalErrorMessage = "Airtable refresh token expired or invalid. User must re-authorize."
          needsReauth = true
        }
      }

      // Special handling for Microsoft-related providers (Teams, OneDrive)
      else if (provider === "teams" || provider === "onedrive" || provider.startsWith("microsoft")) {
        if (verbose) logger.debug(`Microsoft error type: ${responseData.error}`)
        if (responseData.error === "invalid_grant") {
          finalErrorMessage = `${provider} refresh token expired or invalid. User must re-authorize.`
          needsReauth = true
        }
      }
      
      // Special handling for TikTok
      else if (provider === "tiktok") {
        if (verbose) logger.debug(`TikTok error type: ${responseData.error}`)
        
        // Common TikTok error patterns
        if (responseData.error === "invalid_client") {
          finalErrorMessage = "TikTok client credentials are invalid or expired."
        } else if (responseData.error === "invalid_request") {
          finalErrorMessage = "TikTok refresh token request was invalid."
        } else if (responseData.error === "invalid_response" || responseData.error === "invalid_response_format") {
          finalErrorMessage = responseData.error_description || "TikTok returned an invalid response."
          needsReauth = true; // HTML responses usually indicate an expired token
        } else if (response.status === 401) {
          finalErrorMessage = "TikTok authorization failed. The refresh token may be expired."
          needsReauth = true;
        }
      }
      
      // Special handling for Kit
      else if (provider === "kit") {
        if (verbose) logger.debug(`Kit error type: ${responseData.error}`)
        
        if (responseData.error === "invalid_response" || responseData.error === "invalid_response_format") {
          finalErrorMessage = responseData.error_description || "Kit returned an invalid response."
          needsReauth = true; // HTML responses usually indicate an expired token
        } else if (response.status === 401) {
          finalErrorMessage = "Kit authorization failed. The refresh token may be expired."
          needsReauth = true;
        }
      }
      
      // Special handling for PayPal
      else if (provider === "paypal") {
        if (verbose) logger.debug(`PayPal error type: ${responseData.error}`)
        
        if (responseData.error === "invalid_client") {
          finalErrorMessage = "PayPal client credentials are invalid. Please check PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET."
        } else if (responseData.error === "invalid_grant") {
          finalErrorMessage = "PayPal refresh token expired or invalid. User must re-authorize."
          needsReauth = true
        } else if (response.status === 401) {
          finalErrorMessage = "PayPal authentication failed. Client credentials may be invalid or expired."
        }
      }

      return {
        success: false,
        error: finalErrorMessage,
        statusCode: response.status,
        providerResponse: responseData,
        invalidRefreshToken: needsReauth,
        needsReauthorization: needsReauth,
      }
    }

    const newAccessToken = responseData.access_token
    const newRefreshToken = responseData.refresh_token
    const expiresIn = responseData.expires_in
    const refreshExpiresIn = responseData.refresh_expires_in
    const newScope = responseData.scope

    return {
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      accessTokenExpiresIn: expiresIn,
      refreshTokenExpiresIn: refreshExpiresIn,
      scope: newScope,
      providerResponse: responseData,
    }
  } catch (error: any) {
    logger.error("Error during token refresh:", error)
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
    logger.error("Error fetching integrations:", error.message)
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
    logger.error("Error fetching integrations with errors:", error.message)
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
