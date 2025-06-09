import type { TokenRepository } from "../repositories/TokenRepository"
import type { EncryptionService } from "../security/EncryptionService"
import type { NotificationService } from "../notifications/NotificationService"
import type { AuditLogger } from "../logging/AuditLogger"
import type { ProviderRegistry } from "./ProviderRegistry"
import { TokenRefreshError } from "../errors/TokenErrors"

export interface TokenData {
  id: string
  userId: string
  provider: string
  accessToken: string
  refreshToken?: string
  expiresAt?: Date
  scopes?: string[]
  metadata?: Record<string, any>
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

export interface TokenResult {
  valid: boolean
  accessToken?: string
  requiresReauth: boolean
  message: string
  provider: string
  userId: string
}

export class TokenManagerService {
  private static REFRESH_THRESHOLD_SECONDS = 300 // 5 minutes
  private static MAX_REFRESH_ATTEMPTS = 3
  private static BACKOFF_BASE_MS = 1000 // 1 second

  constructor(
    private tokenRepository: TokenRepository,
    private encryptionService: EncryptionService,
    private notificationService: NotificationService,
    private auditLogger: AuditLogger,
    private providerRegistry: ProviderRegistry,
  ) {}

  /**
   * Get a valid access token for the specified user and provider
   * Automatically refreshes the token if needed
   */
  async getValidAccessToken(userId: string, provider: string): Promise<TokenResult> {
    try {
      // Get the integration token data
      const tokenData = await this.tokenRepository.getTokenData(userId, provider)

      if (!tokenData) {
        return {
          valid: false,
          requiresReauth: true,
          message: `No active ${provider} integration found`,
          provider,
          userId,
        }
      }

      // Check if token is active
      if (!tokenData.isActive) {
        return {
          valid: false,
          requiresReauth: true,
          message: `${provider} integration is disconnected`,
          provider,
          userId,
        }
      }

      // Check if token needs refresh
      const needsRefresh = this.tokenNeedsRefresh(tokenData)

      if (needsRefresh) {
        // Log refresh attempt
        await this.auditLogger.logTokenEvent(tokenData.id, userId, provider, "refresh_attempt", {
          reason: "token_expiring_soon",
        })

        // Try to refresh the token
        const refreshResult = await this.refreshToken(tokenData)

        if (refreshResult.success) {
          return {
            valid: true,
            accessToken: refreshResult.accessToken,
            requiresReauth: false,
            message: "Token was refreshed successfully",
            provider,
            userId,
          }
        } else {
          // If refresh failed and we don't have a refresh token, require reauth
          if (!tokenData.refreshToken) {
            await this.handleTokenRefreshFailure(tokenData, refreshResult.error)

            return {
              valid: false,
              requiresReauth: true,
              message: `${provider} token expired and requires re-authentication`,
              provider,
              userId,
            }
          }

          // If we have a refresh token but refresh still failed, return error
          return {
            valid: false,
            requiresReauth: true,
            message: `Failed to refresh ${provider} token: ${refreshResult.error}`,
            provider,
            userId,
          }
        }
      }

      // Token is valid and doesn't need refresh
      return {
        valid: true,
        accessToken: tokenData.accessToken,
        requiresReauth: false,
        message: "Token is valid",
        provider,
        userId,
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

  /**
   * Check if a token needs to be refreshed
   */
  private tokenNeedsRefresh(tokenData: TokenData): boolean {
    // If no expiry, assume it doesn't need refresh
    if (!tokenData.expiresAt) {
      return false
    }

    const now = new Date()
    const expiresAt = new Date(tokenData.expiresAt)

    // Calculate seconds until expiry
    const secondsUntilExpiry = Math.floor((expiresAt.getTime() - now.getTime()) / 1000)

    // Return true if token expires within the threshold
    return secondsUntilExpiry < TokenManagerService.REFRESH_THRESHOLD_SECONDS
  }

  /**
   * Refresh a token using the provider-specific adapter
   */
  private async refreshToken(
    tokenData: TokenData,
    attempt = 1,
  ): Promise<{
    success: boolean
    accessToken?: string
    error?: string
  }> {
    try {
      // Get the provider adapter
      const providerAdapter = this.providerRegistry.getProviderAdapter(tokenData.provider)

      if (!providerAdapter) {
        throw new Error(`No adapter found for provider: ${tokenData.provider}`)
      }

      // Check if we have a refresh token
      if (!tokenData.refreshToken) {
        throw new TokenRefreshError("No refresh token available")
      }

      // Try to refresh the token
      const refreshResult = await providerAdapter.refreshToken(tokenData.refreshToken)

      if (!refreshResult.success) {
        throw new TokenRefreshError(refreshResult.message || "Unknown refresh error")
      }

      // Update the token data
      const updatedTokenData: Partial<TokenData> = {
        accessToken: refreshResult.accessToken,
        updatedAt: new Date(),
      }

      // Update expiry if provided
      if (refreshResult.expiresIn) {
        updatedTokenData.expiresAt = new Date(Date.now() + refreshResult.expiresIn * 1000)
      }

      // Update refresh token if provided
      if (refreshResult.refreshToken) {
        updatedTokenData.refreshToken = refreshResult.refreshToken
      }

      // Save the updated token
      await this.tokenRepository.updateTokenData(tokenData.id, updatedTokenData)

      // Log successful refresh
      await this.auditLogger.logTokenEvent(tokenData.id, tokenData.userId, tokenData.provider, "refresh_success", {
        expires_at: updatedTokenData.expiresAt?.toISOString(),
        refresh_token_updated: !!refreshResult.refreshToken,
      })

      return {
        success: true,
        accessToken: refreshResult.accessToken,
      }
    } catch (error: any) {
      console.error(`Error refreshing token for ${tokenData.provider}:`, error)

      // Implement exponential backoff for retries
      if (attempt < TokenManagerService.MAX_REFRESH_ATTEMPTS) {
        const backoffTime = TokenManagerService.BACKOFF_BASE_MS * Math.pow(2, attempt - 1)

        console.log(
          `Retrying token refresh in ${backoffTime}ms (attempt ${attempt + 1}/${TokenManagerService.MAX_REFRESH_ATTEMPTS})`,
        )

        await new Promise((resolve) => setTimeout(resolve, backoffTime))

        return this.refreshToken(tokenData, attempt + 1)
      }

      // Log failed refresh
      await this.auditLogger.logTokenEvent(tokenData.id, tokenData.userId, tokenData.provider, "refresh_failure", {
        error: error.message,
      })

      return {
        success: false,
        error: error.message,
      }
    }
  }

  /**
   * Handle a failed token refresh
   */
  private async handleTokenRefreshFailure(tokenData: TokenData, error: string | undefined): Promise<void> {
    try {
      // Update token status to disconnected
      await this.tokenRepository.updateTokenData(tokenData.id, {
        isActive: false,
        updatedAt: new Date(),
      })

      // Notify the user that they need to reconnect
      await this.notificationService.sendTokenExpiryNotification(
        tokenData.userId,
        tokenData.provider,
        error || "Token expired",
      )

      // Log the disconnection
      await this.auditLogger.logTokenEvent(
        tokenData.id,
        tokenData.userId,
        tokenData.provider,
        "integration_disconnected",
        { reason: "token_refresh_failure", error },
      )
    } catch (notifyError) {
      console.error("Error handling token refresh failure:", notifyError)
    }
  }

  /**
   * Process all tokens that are expiring soon
   * Called by the background worker
   */
  async processExpiringTokens(): Promise<{
    processed: number
    refreshed: number
    failed: number
    details: Array<{ userId: string; provider: string; status: string; error?: string }>
  }> {
    const results = {
      processed: 0,
      refreshed: 0,
      failed: 0,
      details: [] as Array<{ userId: string; provider: string; status: string; error?: string }>,
    }

    try {
      // Get all tokens expiring within the threshold
      const expiringTokens = await this.tokenRepository.getExpiringTokens(TokenManagerService.REFRESH_THRESHOLD_SECONDS)

      results.processed = expiringTokens.length

      // Process each token
      for (const token of expiringTokens) {
        try {
          const refreshResult = await this.refreshToken(token)

          if (refreshResult.success) {
            results.refreshed++
            results.details.push({
              userId: token.userId,
              provider: token.provider,
              status: "refreshed",
            })
          } else {
            results.failed++
            results.details.push({
              userId: token.userId,
              provider: token.provider,
              status: "failed",
              error: refreshResult.error,
            })

            // Handle the failure
            await this.handleTokenRefreshFailure(token, refreshResult.error)
          }
        } catch (error: any) {
          results.failed++
          results.details.push({
            userId: token.userId,
            provider: token.provider,
            status: "error",
            error: error.message,
          })
        }
      }

      return results
    } catch (error: any) {
      console.error("Error processing expiring tokens:", error)
      throw error
    }
  }

  /**
   * Validate a token with the provider
   * Used to detect revoked tokens
   */
  async validateToken(userId: string, provider: string): Promise<boolean> {
    try {
      const tokenData = await this.tokenRepository.getTokenData(userId, provider)

      if (!tokenData || !tokenData.isActive) {
        return false
      }

      const providerAdapter = this.providerRegistry.getProviderAdapter(provider)

      if (!providerAdapter) {
        throw new Error(`No adapter found for provider: ${provider}`)
      }

      const isValid = await providerAdapter.validateToken(tokenData.accessToken)

      // If token is invalid, handle it
      if (!isValid) {
        await this.handleTokenValidationFailure(tokenData)
        return false
      }

      return true
    } catch (error: any) {
      console.error(`Error validating token for ${provider}:`, error)
      return false
    }
  }

  /**
   * Handle a failed token validation
   */
  private async handleTokenValidationFailure(tokenData: TokenData): Promise<void> {
    try {
      // Try to refresh the token first
      const refreshResult = await this.refreshToken(tokenData)

      // If refresh succeeds, token is valid again
      if (refreshResult.success) {
        return
      }

      // If refresh fails, mark as disconnected
      await this.tokenRepository.updateTokenData(tokenData.id, {
        isActive: false,
        updatedAt: new Date(),
      })

      // Notify the user
      await this.notificationService.sendTokenRevocationNotification(tokenData.userId, tokenData.provider)

      // Log the revocation
      await this.auditLogger.logTokenEvent(tokenData.id, tokenData.userId, tokenData.provider, "token_revoked", {
        detected_at: new Date().toISOString(),
      })
    } catch (error) {
      console.error("Error handling token validation failure:", error)
    }
  }
}
