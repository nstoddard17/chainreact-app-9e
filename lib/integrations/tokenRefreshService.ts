/**
 * Token Refresh Service
 * 
 * This module provides functions to refresh OAuth tokens across different providers
 * using a centralized, configuration-driven approach.
 */

import { Integration } from "@/types/integration";
import { db } from "@/lib/db";
import { getOAuthConfig, getOAuthClientCredentials, OAuthProviderConfig } from "./oauthConfig";
import { encrypt, decrypt } from "@/lib/security/encryption";
import { getSecret } from "@/lib/secrets";
import fetch from 'node-fetch';

// Standard response for token refresh operations
export interface RefreshResult {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresIn?: number; // Seconds until access token expiration
  refreshTokenExpiresIn?: number; // Seconds until refresh token expiration
  error?: string;
  statusCode?: number;
  providerResponse?: any;
  invalidRefreshToken?: boolean;
  needsReauthorization?: boolean;
}

/**
 * Query parameters for refreshing tokens
 */
export interface RefreshTokensOptions {
  prioritizeExpiring?: boolean; // Prioritize tokens that are about to expire
  dryRun?: boolean; // Don't actually update the database
  limit?: number; // Maximum number of tokens to refresh
  batchSize?: number; // Number of tokens to refresh in each batch
  onlyProvider?: string; // Only refresh tokens for this provider
  accessTokenExpiryThreshold?: number; // Minutes before access token expiry to refresh
  refreshTokenExpiryThreshold?: number; // Minutes before refresh token expiry to refresh
  retryFailedInLast?: number; // Only retry tokens that failed in the last X minutes
  includeInactive?: boolean; // Include inactive integrations
}

/**
 * Statistics from a token refresh operation
 */
export interface RefreshStats {
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: Record<string, number>;
  providerStats: Record<string, {
    processed: number;
    successful: number;
    failed: number;
  }>;
  startTime: Date;
  endTime?: Date;
  durationMs?: number;
}

/**
 * Default options for token refresh
 */
const DEFAULT_REFRESH_OPTIONS: RefreshTokensOptions = {
  prioritizeExpiring: true,
  dryRun: false,
  limit: 200,
  batchSize: 50,
  accessTokenExpiryThreshold: 30, // 30 minutes
  refreshTokenExpiryThreshold: 60, // 1 hour
};

/**
 * Main function to refresh OAuth tokens for active integrations
 * 
 * @param options Options for token refresh
 * @returns Statistics about the refresh operation
 */
export async function refreshTokens(options: RefreshTokensOptions = {}): Promise<RefreshStats> {
  const startTime = new Date();
  
  // Merge default options with provided options
  const config = { ...DEFAULT_REFRESH_OPTIONS, ...options };
  
  // Initialize statistics
  const stats: RefreshStats = {
    processed: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: {},
    providerStats: {},
    startTime,
  };

  try {
    // Get the encryption key
    const encryptionKey = await getSecret("encryption_key") || process.env.ENCRYPTION_KEY;
    if (!encryptionKey) {
      throw new Error("Missing encryption key");
    }
    
    // Build the query to get integrations with refresh tokens
    let query = db
      .from("integrations")
      .select("*")
      .not("refresh_token", "is", null);
    
    // Filter by status
    if (!config.includeInactive) {
      query = query.eq("is_active", true);
    }
    
    // Filter by provider if specified
    if (config.onlyProvider) {
      query = query.eq("provider", config.onlyProvider);
    }
    
    // Filter by failed tokens if specified
    if (config.retryFailedInLast) {
      const retryAfter = new Date();
      retryAfter.setMinutes(retryAfter.getMinutes() - config.retryFailedInLast);
      query = query
        .gt("consecutive_failures", 0)
        .gt("updated_at", retryAfter.toISOString());
    }
    
    // Order by priority if requested
    if (config.prioritizeExpiring) {
      // First order by expires_at (nulls first), then by refresh_token_expires_at (nulls first)
      query = query.order("expires_at", { ascending: true, nullsFirst: false })
                   .order("refresh_token_expires_at", { ascending: true, nullsFirst: false });
    }
    
    // Limit the number of tokens to process
    query = query.limit(config.limit || 200);
    
    // Execute the query
    const { data: integrations, error } = await query;
    
    if (error) {
      console.error("Error fetching integrations:", error.message);
      throw error;
    }
    
    console.log(`Found ${integrations.length} integrations with refresh tokens`);
    
    // Process integrations in batches
    const batchSize = config.batchSize || 50;
    const batches = [];
    
    for (let i = 0; i < integrations.length; i += batchSize) {
      batches.push(integrations.slice(i, i + batchSize));
    }
    
    // Process each batch sequentially
    for (const [batchIndex, batch] of batches.entries()) {
      console.log(`Processing batch ${batchIndex + 1} of ${batches.length} (${batch.length} integrations)`);
      
      // Process integrations in parallel within each batch
      const batchPromises = batch.map(async (integration) => {
        stats.processed++;
        
        // Initialize provider stats if not yet initialized
        if (!stats.providerStats[integration.provider]) {
          stats.providerStats[integration.provider] = {
            processed: 0,
            successful: 0,
            failed: 0,
          };
        }
        
        stats.providerStats[integration.provider].processed++;
        
        try {
          // Check if refresh is needed
          const needsRefresh = shouldRefreshToken(integration, {
            accessTokenExpiryThreshold: config.accessTokenExpiryThreshold,
            refreshTokenExpiryThreshold: config.refreshTokenExpiryThreshold,
          });
          
          if (!needsRefresh.shouldRefresh) {
            console.log(`No refresh needed for ${integration.provider} (ID: ${integration.id}): ${needsRefresh.reason}`);
            stats.skipped++;
            return;
          }
          
          console.log(`Refreshing token for ${integration.provider} (ID: ${integration.id}): ${needsRefresh.reason}`);
          
          // Decrypt the refresh token
          let decryptedRefreshToken: string;
          try {
            if (!integration.refresh_token) throw new Error("Refresh token is null or undefined");
            decryptedRefreshToken = decrypt(integration.refresh_token, encryptionKey);
          } catch (decryptError: any) {
            if (decryptError.message.includes('Invalid encrypted text format') || decryptError.message.includes('Failed to decrypt data')) {
              console.warn(`Token for ${integration.provider} (ID: ${integration.id}) appears to be unencrypted. Proceeding with unencrypted token.`);
              decryptedRefreshToken = integration.refresh_token!;
            } else {
              console.error(`Decryption error for ${integration.provider} (ID: ${integration.id}): ${decryptError.message}`);
              stats.failed++;
              stats.providerStats[integration.provider].failed++;
              stats.errors["decryption_error"] = (stats.errors["decryption_error"] || 0) + 1;
              
              // Update integration with error details
              if (!config.dryRun) {
                await updateIntegrationWithError(
                  integration.id, 
                  `Decryption error: ${decryptError.message}`,
                  { status: "needs_reauthorization" }
                );
              }
              return;
            }
          }
          
          // Refresh the token
          const refreshResult = await refreshTokenForProvider(
            integration.provider,
            decryptedRefreshToken,
            integration
          );
          
          if (refreshResult.success) {
            stats.successful++;
            stats.providerStats[integration.provider].successful++;
            
            if (!config.dryRun) {
              // Update the token in the database
              await updateIntegrationWithRefreshResult(integration.id, refreshResult, encryptionKey);
            }
          } else {
            stats.failed++;
            stats.providerStats[integration.provider].failed++;
            stats.errors[refreshResult.error || "unknown"] = 
              (stats.errors[refreshResult.error || "unknown"] || 0) + 1;
              
            if (!config.dryRun) {
              let status = "error";
              if (refreshResult.invalidRefreshToken || refreshResult.needsReauthorization) {
                status = "needs_reauthorization";
              }
              
              // Update integration with error details
              await updateIntegrationWithError(
                integration.id, 
                refreshResult.error || "Unknown error during token refresh",
                { status }
              );
            }
          }
        } catch (error: any) {
          console.error(`Unexpected error refreshing token for ${integration.provider} (ID: ${integration.id}):`, error);
          stats.failed++;
          stats.providerStats[integration.provider].failed++;
          stats.errors["unexpected_error"] = (stats.errors["unexpected_error"] || 0) + 1;
          
          if (!config.dryRun) {
            // Update integration with error details
            await updateIntegrationWithError(
              integration.id, 
              `Unexpected error: ${error.message}`,
              {}
            );
          }
        }
      });
      
      // Wait for all integrations in the batch to be processed
      await Promise.all(batchPromises);
    }
    
    // Calculate duration
    const endTime = new Date();
    stats.endTime = endTime;
    stats.durationMs = endTime.getTime() - startTime.getTime();
    
    return stats;
  } catch (error) {
    console.error("Error during token refresh:", error);
    throw error;
  }
}

/**
 * Determines if a token should be refreshed based on expiration times and other factors
 */
export function shouldRefreshToken(
  integration: Integration,
  options: { accessTokenExpiryThreshold?: number; refreshTokenExpiryThreshold?: number }
): { shouldRefresh: boolean; reason: string } {
  const now = new Date();
  const accessThreshold = options.accessTokenExpiryThreshold || 30; // Default 30 minutes
  const refreshThreshold = options.refreshTokenExpiryThreshold || 60; // Default 60 minutes
  
  // Check access token expiration
  if (integration.expires_at) {
    const expiresAt = new Date(integration.expires_at);
    const minutesUntilExpiration = (expiresAt.getTime() - now.getTime()) / (1000 * 60);
    
    if (minutesUntilExpiration < accessThreshold) {
      return { 
        shouldRefresh: true, 
        reason: `Access token expires in ${Math.max(0, Math.round(minutesUntilExpiration))} minutes`
      };
    }
  } else {
    // No expiration is set, we should refresh to be safe
    return { shouldRefresh: true, reason: "No access token expiration set" };
  }
  
  // Check refresh token expiration if applicable
  if (integration.refresh_token_expires_at) {
    const refreshExpiresAt = new Date(integration.refresh_token_expires_at);
    const minutesUntilRefreshExpiration = (refreshExpiresAt.getTime() - now.getTime()) / (1000 * 60);
    
    if (minutesUntilRefreshExpiration < refreshThreshold) {
      return { 
        shouldRefresh: true, 
        reason: `Refresh token expires in ${Math.max(0, Math.round(minutesUntilRefreshExpiration))} minutes`
      };
    }
  }
  
  // No refresh needed
  return { shouldRefresh: false, reason: "Tokens are still valid" };
}

/**
 * Update an integration with a successful refresh result
 */
async function updateIntegrationWithRefreshResult(
  integrationId: string,
  refreshResult: RefreshResult,
  encryptionKey: string
): Promise<void> {
  const now = new Date();
  
  // Prepare the update data
  const updateData: Record<string, any> = {
    status: "active",
    last_token_refresh: now.toISOString(),
    updated_at: now.toISOString(),
    consecutive_failures: 0,
    disconnect_reason: null,
  };
  
  // Update access token if provided
  if (refreshResult.accessToken) {
    updateData.access_token = refreshResult.accessToken;
    
    // Calculate new access token expiration time if provided
    if (refreshResult.accessTokenExpiresIn) {
      const expiryDate = new Date();
      expiryDate.setSeconds(expiryDate.getSeconds() + refreshResult.accessTokenExpiresIn);
      updateData.expires_at = expiryDate.toISOString();
    }
  }
  
  // Update refresh token if provided
  if (refreshResult.refreshToken) {
    updateData.refresh_token = encrypt(refreshResult.refreshToken, encryptionKey);
    
    // Calculate new refresh token expiration time if provided
    if (refreshResult.refreshTokenExpiresIn) {
      const newRefreshTokenExpiresAt = new Date();
      newRefreshTokenExpiresAt.setSeconds(
        newRefreshTokenExpiresAt.getSeconds() + refreshResult.refreshTokenExpiresIn
      );
      updateData.refresh_token_expires_at = newRefreshTokenExpiresAt.toISOString();
    }
  }
  
  // Update the database
  const { error } = await db
    .from("integrations")
    .update(updateData)
    .eq("id", integrationId);
  
  if (error) {
    console.error(`Error updating integration ${integrationId}:`, error.message);
    throw error;
  }
}

/**
 * Update an integration with an error from token refresh
 */
async function updateIntegrationWithError(
  integrationId: string,
  errorMessage: string,
  additionalData: Record<string, any> = {}
): Promise<void> {
  try {
    // Get the current integration data
    const { data: integration, error: fetchError } = await db
      .from("integrations")
      .select("consecutive_failures")
      .eq("id", integrationId)
      .single();
      
    if (fetchError) {
      console.error(`Error fetching integration ${integrationId}:`, fetchError.message);
      throw fetchError;
    }
    
    // Increment the failure counter
    const consecutiveFailures = (integration?.consecutive_failures || 0) + 1;
    
    // Prepare the update data
    const updateData: Record<string, any> = {
      consecutive_failures: consecutiveFailures,
      disconnect_reason: errorMessage,
      updated_at: new Date().toISOString(),
      ...additionalData
    };
    
    // If there are too many consecutive failures, mark as needing reauthorization
    if (consecutiveFailures >= 3 && !additionalData.status) {
      updateData.status = "needs_reauthorization";
    }
    
    // Update the database
    const { error: updateError } = await db
      .from("integrations")
      .update(updateData)
      .eq("id", integrationId);
      
    if (updateError) {
      console.error(`Error updating integration ${integrationId} with error:`, updateError.message);
    }
  } catch (error) {
    console.error(`Unexpected error updating integration ${integrationId} with error:`, error);
  }
}

/**
 * Refresh a token for a specific provider
 */
export async function refreshTokenForProvider(
  provider: string,
  refreshToken: string,
  integration: Integration
): Promise<RefreshResult> {
  // Get the OAuth configuration for this provider
  const config = getOAuthConfig(provider);
  
  if (!config) {
    return {
      success: false,
      error: `No OAuth configuration available for provider: ${provider}`,
      needsReauthorization: false,
    };
  }
  
  try {
    // Prepare the request based on the provider configuration
    const { clientId, clientSecret } = getOAuthClientCredentials(config);
    
    // Standard OAuth 2.0 refresh token parameters
    const params: Record<string, string> = {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    };
    
    // Add client credentials based on auth method
    if (config.refreshRequiresClientAuth) {
      if (config.authMethod === "body") {
        params.client_id = clientId;
        params.client_secret = clientSecret;
      }
    }
    
    // Add any provider-specific parameters
    if (config.additionalRefreshParams) {
      Object.entries(config.additionalRefreshParams).forEach(([key, value]) => {
        // Handle special placeholder values
        if (value === "PLACEHOLDER" && key === "fb_exchange_token") {
          params[key] = integration.access_token;
        } else {
          params[key] = value;
        }
      });
    }
    
    // Set up request headers
    const headers: Record<string, string> = {
      "Content-Type": "application/x-www-form-urlencoded",
      "Accept": "application/json",
    };
    
    // Add authorization header for basic auth
    if (config.authMethod === "basic") {
      const base64Credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
      headers["Authorization"] = `Basic ${base64Credentials}`;
    } else if (config.authMethod === "header") {
      headers["client_id"] = clientId;
      headers["client_secret"] = clientSecret;
    }
    
    // Make the request
    const response = await fetch(config.tokenEndpoint, {
      method: "POST",
      headers,
      body: new URLSearchParams(params),
    });
    
    const data = await response.json();
    
    // Handle errors
    if (!response.ok || data.error) {
      return {
        success: false,
        error: `${provider} API error: ${data.error || response.statusText} - ${data.error_description || "No description"}`,
        statusCode: response.status,
        providerResponse: data,
        invalidRefreshToken: 
          data.error === "invalid_grant" || 
          data.error === "invalid_token" ||
          data.error === "bad_verification_code",
        needsReauthorization: true,
      };
    }
    
    // Handle success
    return {
      success: true,
      accessToken: data.access_token,
      refreshToken: data.refresh_token, // Some providers return a new refresh token
      accessTokenExpiresIn: data.expires_in,
      // Only include refresh token expiration if the provider supports it
      refreshTokenExpiresIn: config.refreshTokenExpirationSupported ? data.refresh_token_expires_in : undefined,
      providerResponse: data,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Network error for ${provider}: ${error.message}`,
      needsReauthorization: false,
    };
  }
}

/**
 * Get tokens that need refreshing
 */
export async function getTokensNeedingRefresh(options: {
  limit?: number;
  accessTokenExpiryThreshold?: number;
  refreshTokenExpiryThreshold?: number;
  includeInactive?: boolean;
}): Promise<Integration[]> {
  const now = new Date();
  const accessThreshold = options.accessTokenExpiryThreshold || 30; // Default 30 minutes
  const refreshThreshold = options.refreshTokenExpiryThreshold || 60; // Default 60 minutes
  
  // Calculate thresholds as dates
  const accessExpiryThreshold = new Date(now);
  accessExpiryThreshold.setMinutes(accessExpiryThreshold.getMinutes() + accessThreshold);
  
  const refreshExpiryThreshold = new Date(now);
  refreshExpiryThreshold.setMinutes(refreshExpiryThreshold.getMinutes() + refreshThreshold);
  
  // Build the query to get integrations with refresh tokens
  let query = db
    .from("integrations")
    .select("*")
    .not("refresh_token", "is", null);
  
  // Filter by status
  if (!options.includeInactive) {
    query = query.eq("is_active", true);
  }
  
  // Get tokens where either:
  // 1. Access token expires soon or has no expiry
  // 2. Refresh token expires soon
  query = query.or(`expires_at.lt.${accessExpiryThreshold.toISOString()},expires_at.is.null,refresh_token_expires_at.lt.${refreshExpiryThreshold.toISOString()}`);
  
  // Order by expiration time
  query = query.order("expires_at", { ascending: true, nullsFirst: false })
               .order("refresh_token_expires_at", { ascending: true, nullsFirst: false });
  
  // Limit the number of results
  if (options.limit) {
    query = query.limit(options.limit);
  }
  
  // Execute the query
  const { data: integrations, error } = await query;
  
  if (error) {
    console.error("Error fetching integrations:", error.message);
    throw error;
  }
  
  return integrations || [];
}

/**
 * Get tokens with refresh errors
 */
export async function getTokensWithRefreshErrors(options: {
  limit?: number;
  minConsecutiveFailures?: number;
}): Promise<Integration[]> {
  const minFailures = options.minConsecutiveFailures || 1;
  
  // Build the query to get integrations with refresh errors
  let query = db
    .from("integrations")
    .select("*")
    .gte("consecutive_failures", minFailures)
    .order("consecutive_failures", { ascending: false });
  
  // Limit the number of results
  if (options.limit) {
    query = query.limit(options.limit);
  }
  
  // Execute the query
  const { data: integrations, error } = await query;
  
  if (error) {
    console.error("Error fetching integrations with errors:", error.message);
    throw error;
  }
  
  return integrations || [];
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
};

export default TokenRefreshService; 