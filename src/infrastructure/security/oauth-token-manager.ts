import { EventEmitter } from 'events'
import { secureTokenManager, TokenType } from './token-manager'
import { auditLogger, AuditEventType, ComplianceFramework } from './audit-logger'

/**
 * OAuth token refresh status
 */
export enum TokenRefreshStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  EXPIRED = 'expired',
  INVALID = 'invalid',
  RATE_LIMITED = 'rate_limited',
  PROVIDER_ERROR = 'provider_error'
}

/**
 * OAuth provider configuration
 */
export interface OAuthProviderConfig {
  providerId: string
  clientId: string
  clientSecret: string
  tokenEndpoint: string
  refreshEndpoint?: string
  scopes: string[]
  refreshThreshold: number // milliseconds before expiry to refresh
  maxRetries: number
  retryDelay: number
  rotationPolicy: {
    enabled: boolean
    rotateRefreshToken: boolean
    maxTokenAge: number
    rotateOnSuspiciousActivity: boolean
  }
}

/**
 * OAuth token data
 */
export interface OAuthTokenData {
  accessToken: string
  refreshToken?: string
  idToken?: string
  expiresIn: number
  expiresAt: number
  scopes: string[]
  tokenType: string
  providerId: string
  userId: string
  createdAt: number
  lastRefreshed?: number
  refreshCount: number
  metadata?: Record<string, any>
}

/**
 * Token refresh result
 */
export interface TokenRefreshResult {
  status: TokenRefreshStatus
  newTokenData?: OAuthTokenData
  error?: string
  metadata?: Record<string, any>
  retryAfter?: number
}

/**
 * Token rotation event
 */
export interface TokenRotationEvent {
  providerId: string
  userId: string
  oldTokenId: string
  newTokenId: string
  reason: string
  timestamp: number
}

/**
 * OAuth token manager with automatic refresh and rotation
 */
export class OAuthTokenManager extends EventEmitter {
  private providers = new Map<string, OAuthProviderConfig>()
  private activeTokens = new Map<string, OAuthTokenData>()
  private refreshQueue = new Map<string, Promise<TokenRefreshResult>>()
  private refreshScheduler: NodeJS.Timeout | null = null
  private rotationScheduler: NodeJS.Timeout | null = null
  private refreshAttempts = new Map<string, number>()

  constructor() {
    super()
    this.startRefreshScheduler()
    this.startRotationScheduler()
    console.log('🔄 OAuth token manager initialized')
  }

  /**
   * Register OAuth provider
   */
  registerProvider(config: OAuthProviderConfig): void {
    this.providers.set(config.providerId, config)
    console.log(`🔧 OAuth provider registered: ${config.providerId}`)
  }

  /**
   * Store OAuth tokens securely
   */
  async storeTokens(tokenData: Omit<OAuthTokenData, 'createdAt' | 'refreshCount'>): Promise<{
    accessTokenId: string
    refreshTokenId?: string
    idTokenId?: string
  }> {
    const now = Date.now()
    const fullTokenData: OAuthTokenData = {
      ...tokenData,
      createdAt: now,
      refreshCount: 0
    }

    // Store access token
    const accessTokenId = await secureTokenManager.storeToken(tokenData.accessToken, {
      type: TokenType.ACCESS_TOKEN,
      providerId: tokenData.providerId,
      userId: tokenData.userId,
      scopes: tokenData.scopes,
      expiresAt: tokenData.expiresAt,
      source: 'oauth',
      metadata: {
        tokenType: tokenData.tokenType,
        expiresIn: tokenData.expiresIn
      }
    })

    // Store refresh token if available
    let refreshTokenId: string | undefined
    if (tokenData.refreshToken) {
      refreshTokenId = await secureTokenManager.storeToken(tokenData.refreshToken, {
        type: TokenType.REFRESH_TOKEN,
        providerId: tokenData.providerId,
        userId: tokenData.userId,
        scopes: tokenData.scopes,
        source: 'oauth',
        metadata: {
          accessTokenId
        }
      })
    }

    // Store ID token if available
    let idTokenId: string | undefined
    if (tokenData.idToken) {
      idTokenId = await secureTokenManager.storeToken(tokenData.idToken, {
        type: TokenType.ID_TOKEN,
        providerId: tokenData.providerId,
        userId: tokenData.userId,
        scopes: tokenData.scopes,
        expiresAt: tokenData.expiresAt,
        source: 'oauth',
        metadata: {
          accessTokenId
        }
      })
    }

    // Store in active tokens for management
    const tokenKey = `${tokenData.providerId}:${tokenData.userId}`
    this.activeTokens.set(tokenKey, {
      ...fullTokenData,
      accessToken: accessTokenId, // Store token ID instead of actual token
      refreshToken: refreshTokenId,
      idToken: idTokenId
    })

    // Log token creation
    await auditLogger.logEvent({
      type: AuditEventType.TOKEN_CREATED,
      severity: 'info',
      action: 'oauth_token_stored',
      outcome: 'success',
      description: `OAuth tokens stored for ${tokenData.providerId}`,
      userId: tokenData.userId,
      resource: tokenData.providerId,
      metadata: {
        scopes: tokenData.scopes,
        expiresAt: tokenData.expiresAt,
        tokenType: tokenData.tokenType
      },
      complianceFrameworks: [ComplianceFramework.SOC2]
    })

    console.log(`🔐 OAuth tokens stored for ${tokenData.providerId}:${tokenData.userId}`)
    
    return { accessTokenId, refreshTokenId, idTokenId }
  }

  /**
   * Get valid access token (with automatic refresh)
   */
  async getAccessToken(providerId: string, userId: string): Promise<string | null> {
    const tokenKey = `${providerId}:${userId}`
    const tokenData = this.activeTokens.get(tokenKey)
    
    if (!tokenData) {
      console.warn(`⚠️ No OAuth tokens found for ${providerId}:${userId}`)
      return null
    }

    // Check if token needs refresh
    const now = Date.now()
    const provider = this.providers.get(providerId)
    const refreshThreshold = provider?.refreshThreshold || 300000 // 5 minutes default

    if (tokenData.expiresAt - now <= refreshThreshold) {
      console.log(`🔄 Token refresh needed for ${providerId}:${userId}`)
      
      // Check if refresh is already in progress
      if (this.refreshQueue.has(tokenKey)) {
        const refreshResult = await this.refreshQueue.get(tokenKey)!
        if (refreshResult.status === TokenRefreshStatus.SUCCESS && refreshResult.newTokenData) {
          return await secureTokenManager.retrieveToken(refreshResult.newTokenData.accessToken, {
            userId
          })
        }
        return null
      }

      // Start refresh process
      const refreshPromise = this.refreshTokens(providerId, userId)
      this.refreshQueue.set(tokenKey, refreshPromise)

      try {
        const refreshResult = await refreshPromise
        if (refreshResult.status === TokenRefreshStatus.SUCCESS && refreshResult.newTokenData) {
          return await secureTokenManager.retrieveToken(refreshResult.newTokenData.accessToken, {
            userId
          })
        }
        return null
      } finally {
        this.refreshQueue.delete(tokenKey)
      }
    }

    // Token is still valid, return it
    return await secureTokenManager.retrieveToken(tokenData.accessToken, { userId })
  }

  /**
   * Refresh OAuth tokens
   */
  async refreshTokens(providerId: string, userId: string): Promise<TokenRefreshResult> {
    const provider = this.providers.get(providerId)
    if (!provider) {
      return {
        status: TokenRefreshStatus.FAILED,
        error: `Provider ${providerId} not configured`
      }
    }

    const tokenKey = `${providerId}:${userId}`
    const tokenData = this.activeTokens.get(tokenKey)
    
    if (!tokenData || !tokenData.refreshToken) {
      return {
        status: TokenRefreshStatus.FAILED,
        error: 'No refresh token available'
      }
    }

    // Check retry limits
    const attempts = this.refreshAttempts.get(tokenKey) || 0
    if (attempts >= provider.maxRetries) {
      return {
        status: TokenRefreshStatus.FAILED,
        error: 'Maximum refresh attempts exceeded'
      }
    }

    try {
      // Get refresh token
      const refreshToken = await secureTokenManager.retrieveToken(tokenData.refreshToken, { userId })
      if (!refreshToken) {
        return {
          status: TokenRefreshStatus.INVALID,
          error: 'Refresh token not found or invalid'
        }
      }

      // Increment attempt counter
      this.refreshAttempts.set(tokenKey, attempts + 1)

      // Call provider's token refresh endpoint
      const refreshResult = await this.callTokenRefreshEndpoint(provider, refreshToken, tokenData.scopes)
      
      if (refreshResult.status === TokenRefreshStatus.SUCCESS && refreshResult.newTokenData) {
        // Store new tokens
        const newTokenIds = await this.storeTokens(refreshResult.newTokenData)
        
        // Revoke old tokens
        if (tokenData.accessToken) {
          secureTokenManager.revokeToken(tokenData.accessToken, 'token_refreshed')
        }
        if (tokenData.refreshToken && provider.rotationPolicy.rotateRefreshToken) {
          secureTokenManager.revokeToken(tokenData.refreshToken, 'token_refreshed')
        }

        // Update active tokens
        this.activeTokens.set(tokenKey, {
          ...refreshResult.newTokenData,
          accessToken: newTokenIds.accessTokenId,
          refreshToken: newTokenIds.refreshTokenId || tokenData.refreshToken,
          idToken: newTokenIds.idTokenId,
          lastRefreshed: Date.now(),
          refreshCount: tokenData.refreshCount + 1
        })

        // Reset attempt counter
        this.refreshAttempts.delete(tokenKey)

        // Log successful refresh
        await auditLogger.logEvent({
          type: AuditEventType.TOKEN_REFRESHED,
          severity: 'info',
          action: 'oauth_token_refreshed',
          outcome: 'success',
          description: `OAuth tokens refreshed for ${providerId}`,
          userId,
          resource: providerId,
          metadata: {
            refreshCount: tokenData.refreshCount + 1,
            scopes: refreshResult.newTokenData.scopes
          },
          complianceFrameworks: [ComplianceFramework.SOC2]
        })

        this.emit('tokenRefreshed', {
          providerId,
          userId,
          tokenData: refreshResult.newTokenData
        })

        console.log(`✅ OAuth tokens refreshed for ${providerId}:${userId}`)
      } else {
        // Log failed refresh
        await auditLogger.logEvent({
          type: AuditEventType.TOKEN_REFRESHED,
          severity: 'warning',
          action: 'oauth_token_refresh_failed',
          outcome: 'failure',
          description: `OAuth token refresh failed for ${providerId}: ${refreshResult.error}`,
          userId,
          resource: providerId,
          metadata: {
            error: refreshResult.error,
            attempts: attempts + 1
          },
          complianceFrameworks: [ComplianceFramework.SOC2]
        })
      }

      return refreshResult

    } catch (error: any) {
      console.error(`❌ Token refresh error for ${providerId}:${userId}:`, error)
      
      return {
        status: TokenRefreshStatus.PROVIDER_ERROR,
        error: error.message,
        metadata: { attempts: attempts + 1 }
      }
    }
  }

  /**
   * Rotate tokens based on policy
   */
  async rotateTokens(providerId: string, userId: string, reason: string): Promise<boolean> {
    const provider = this.providers.get(providerId)
    if (!provider?.rotationPolicy.enabled) {
      return false
    }

    const tokenKey = `${providerId}:${userId}`
    const tokenData = this.activeTokens.get(tokenKey)
    
    if (!tokenData) {
      return false
    }

    try {
      // Force refresh to get new tokens
      const refreshResult = await this.refreshTokens(providerId, userId)
      
      if (refreshResult.status === TokenRefreshStatus.SUCCESS) {
        const rotationEvent: TokenRotationEvent = {
          providerId,
          userId,
          oldTokenId: tokenData.accessToken,
          newTokenId: refreshResult.newTokenData!.accessToken,
          reason,
          timestamp: Date.now()
        }

        this.emit('tokenRotated', rotationEvent)
        
        console.log(`🔄 Tokens rotated for ${providerId}:${userId} (${reason})`)
        return true
      }

      return false
    } catch (error: any) {
      console.error(`❌ Token rotation failed for ${providerId}:${userId}:`, error)
      return false
    }
  }

  /**
   * Revoke OAuth tokens
   */
  async revokeTokens(providerId: string, userId: string, reason: string = 'user_request'): Promise<boolean> {
    const tokenKey = `${providerId}:${userId}`
    const tokenData = this.activeTokens.get(tokenKey)
    
    if (!tokenData) {
      return false
    }

    try {
      // Revoke tokens from secure storage
      if (tokenData.accessToken) {
        secureTokenManager.revokeToken(tokenData.accessToken, reason)
      }
      if (tokenData.refreshToken) {
        secureTokenManager.revokeToken(tokenData.refreshToken, reason)
      }
      if (tokenData.idToken) {
        secureTokenManager.revokeToken(tokenData.idToken, reason)
      }

      // Remove from active tokens
      this.activeTokens.delete(tokenKey)
      this.refreshAttempts.delete(tokenKey)

      // Log revocation
      await auditLogger.logEvent({
        type: AuditEventType.TOKEN_REVOKED,
        severity: 'info',
        action: 'oauth_tokens_revoked',
        outcome: 'success',
        description: `OAuth tokens revoked for ${providerId}: ${reason}`,
        userId,
        resource: providerId,
        metadata: { reason },
        complianceFrameworks: [ComplianceFramework.SOC2]
      })

      console.log(`❌ OAuth tokens revoked for ${providerId}:${userId} (${reason})`)
      return true

    } catch (error: any) {
      console.error(`❌ Token revocation failed for ${providerId}:${userId}:`, error)
      return false
    }
  }

  /**
   * Get token statistics
   */
  getTokenStats(): {
    totalTokens: number
    activeTokens: number
    expiringTokens: number
    recentRefreshes: number
    providerStats: Record<string, {
      tokens: number
      expiring: number
      avgRefreshCount: number
    }>
  } {
    const now = Date.now()
    const next24Hours = now + (24 * 60 * 60 * 1000)
    const last24Hours = now - (24 * 60 * 60 * 1000)

    let expiringTokens = 0
    let recentRefreshes = 0
    const providerStats: Record<string, { tokens: number; expiring: number; avgRefreshCount: number; totalRefreshes: number }> = {}

    for (const tokenData of this.activeTokens.values()) {
      // Initialize provider stats
      if (!providerStats[tokenData.providerId]) {
        providerStats[tokenData.providerId] = {
          tokens: 0,
          expiring: 0,
          avgRefreshCount: 0,
          totalRefreshes: 0
        }
      }

      const stats = providerStats[tokenData.providerId]
      stats.tokens++
      stats.totalRefreshes += tokenData.refreshCount

      // Check if expiring within 24 hours
      if (tokenData.expiresAt <= next24Hours) {
        expiringTokens++
        stats.expiring++
      }

      // Check recent refreshes
      if (tokenData.lastRefreshed && tokenData.lastRefreshed >= last24Hours) {
        recentRefreshes++
      }
    }

    // Calculate average refresh counts
    for (const stats of Object.values(providerStats)) {
      stats.avgRefreshCount = stats.tokens > 0 ? stats.totalRefreshes / stats.tokens : 0
      delete (stats as any).totalRefreshes
    }

    return {
      totalTokens: this.activeTokens.size,
      activeTokens: this.activeTokens.size,
      expiringTokens,
      recentRefreshes,
      providerStats
    }
  }

  /**
   * Call provider's token refresh endpoint
   */
  private async callTokenRefreshEndpoint(
    provider: OAuthProviderConfig,
    refreshToken: string,
    scopes: string[]
  ): Promise<TokenRefreshResult> {
    const endpoint = provider.refreshEndpoint || provider.tokenEndpoint
    
    const requestBody = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      scope: scopes.join(' ')
    })

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: requestBody
      })

      const responseData = await response.json()

      if (!response.ok) {
        let status = TokenRefreshStatus.PROVIDER_ERROR
        
        if (response.status === 400 && responseData.error === 'invalid_grant') {
          status = TokenRefreshStatus.EXPIRED
        } else if (response.status === 429) {
          status = TokenRefreshStatus.RATE_LIMITED
        }

        return {
          status,
          error: responseData.error_description || responseData.error || 'Unknown error',
          metadata: { httpStatus: response.status, responseData },
          retryAfter: response.headers.get('retry-after') ? 
            parseInt(response.headers.get('retry-after')!) * 1000 : undefined
        }
      }

      // Parse successful response
      const expiresIn = responseData.expires_in || 3600
      const newTokenData: OAuthTokenData = {
        accessToken: responseData.access_token,
        refreshToken: responseData.refresh_token || refreshToken, // Keep old refresh token if not rotated
        idToken: responseData.id_token,
        expiresIn,
        expiresAt: Date.now() + (expiresIn * 1000),
        scopes: responseData.scope ? responseData.scope.split(' ') : scopes,
        tokenType: responseData.token_type || 'Bearer',
        providerId: provider.providerId,
        userId: '', // Will be set by caller
        createdAt: Date.now(),
        refreshCount: 0
      }

      return {
        status: TokenRefreshStatus.SUCCESS,
        newTokenData
      }

    } catch (error: any) {
      return {
        status: TokenRefreshStatus.PROVIDER_ERROR,
        error: error.message
      }
    }
  }

  /**
   * Start automatic refresh scheduler
   */
  private startRefreshScheduler(): void {
    this.refreshScheduler = setInterval(() => {
      this.performScheduledRefresh()
    }, 60000) // Check every minute
  }

  /**
   * Start token rotation scheduler
   */
  private startRotationScheduler(): void {
    this.rotationScheduler = setInterval(() => {
      this.performScheduledRotation()
    }, 3600000) // Check every hour
  }

  /**
   * Perform scheduled token refresh
   */
  private async performScheduledRefresh(): Promise<void> {
    const now = Date.now()
    let refreshedCount = 0

    for (const [tokenKey, tokenData] of this.activeTokens.entries()) {
      const [providerId, userId] = tokenKey.split(':')
      const provider = this.providers.get(providerId)
      
      if (!provider) continue

      // Check if token needs refresh
      const timeUntilExpiry = tokenData.expiresAt - now
      if (timeUntilExpiry <= provider.refreshThreshold && timeUntilExpiry > 0) {
        try {
          const result = await this.refreshTokens(providerId, userId)
          if (result.status === TokenRefreshStatus.SUCCESS) {
            refreshedCount++
          }
        } catch (error) {
          console.error(`❌ Scheduled refresh failed for ${tokenKey}:`, error)
        }
      }
    }

    if (refreshedCount > 0) {
      console.log(`🔄 Scheduled refresh completed: ${refreshedCount} tokens refreshed`)
    }
  }

  /**
   * Perform scheduled token rotation
   */
  private async performScheduledRotation(): Promise<void> {
    const now = Date.now()
    let rotatedCount = 0

    for (const [tokenKey, tokenData] of this.activeTokens.entries()) {
      const [providerId, userId] = tokenKey.split(':')
      const provider = this.providers.get(providerId)
      
      if (!provider?.rotationPolicy.enabled) continue

      // Check if token should be rotated due to age
      const tokenAge = now - tokenData.createdAt
      if (tokenAge >= provider.rotationPolicy.maxTokenAge) {
        try {
          const rotated = await this.rotateTokens(providerId, userId, 'scheduled_rotation')
          if (rotated) {
            rotatedCount++
          }
        } catch (error) {
          console.error(`❌ Scheduled rotation failed for ${tokenKey}:`, error)
        }
      }
    }

    if (rotatedCount > 0) {
      console.log(`🔄 Scheduled rotation completed: ${rotatedCount} tokens rotated`)
    }
  }

  /**
   * Shutdown OAuth token manager
   */
  shutdown(): void {
    if (this.refreshScheduler) {
      clearInterval(this.refreshScheduler)
      this.refreshScheduler = null
    }

    if (this.rotationScheduler) {
      clearInterval(this.rotationScheduler)
      this.rotationScheduler = null
    }

    this.providers.clear()
    this.activeTokens.clear()
    this.refreshQueue.clear()
    this.refreshAttempts.clear()
    this.removeAllListeners()

    console.log('🛑 OAuth token manager shutdown')
  }
}

/**
 * Global OAuth token manager instance
 */
export const oauthTokenManager = new OAuthTokenManager()

/**
 * OAuth token decorator for automatic token management
 */
export function OAuthManaged(providerId: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value

    descriptor.value = async function (this: any, ...args: any[]) {
      const userId = args[args.length - 1] // Assume last arg is userId
      
      try {
        // Get valid access token
        const accessToken = await oauthTokenManager.getAccessToken(providerId, userId)
        
        if (!accessToken) {
          throw new Error(`No valid OAuth token available for ${providerId}`)
        }

        // Update the provider instance with the fresh token
        if (this.config && this.config.baseUrl) {
          // Store token for API calls (implementation specific)
          this._currentAccessToken = accessToken
        }

        return await method.apply(this, args)
      } catch (error: any) {
        console.error(`❌ OAuth token error for ${providerId}:`, error.message)
        throw error
      }
    }

    return descriptor
  }
}