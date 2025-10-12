import { createCipheriv, createDecipheriv, randomBytes, pbkdf2Sync, createHmac } from 'crypto'
import { EventEmitter } from 'events'

import { logger } from '@/lib/utils/logger'

/**
 * Token types
 */
export enum TokenType {
  ACCESS_TOKEN = 'access_token',
  REFRESH_TOKEN = 'refresh_token',
  ID_TOKEN = 'id_token',
  API_KEY = 'api_key',
  WEBHOOK_SECRET = 'webhook_secret',
  ENCRYPTION_KEY = 'encryption_key',
  SESSION_TOKEN = 'session_token',
  TEMPORARY_TOKEN = 'temporary_token'
}

/**
 * Token metadata
 */
export interface TokenMetadata {
  id: string
  type: TokenType
  providerId: string
  userId: string
  scopes?: string[]
  expiresAt?: number
  createdAt: number
  lastUsed?: number
  rotationCount: number
  encrypted: boolean
  algorithm: string
  source: 'oauth' | 'manual' | 'generated' | 'rotated'
  metadata?: Record<string, any>
}

/**
 * Encrypted token storage
 */
export interface EncryptedToken {
  id: string
  encryptedValue: string
  iv: string
  salt: string
  authTag: string
  keyDerivationParams: {
    iterations: number
    keyLength: number
    digest: string
  }
  metadata: TokenMetadata
}

/**
 * Token rotation policy
 */
export interface TokenRotationPolicy {
  enabled: boolean
  rotateBeforeExpiry: number // milliseconds before expiry to rotate
  maxAge: number // maximum age before forced rotation
  rotateOnSuspiciousActivity: boolean
  rotateOnLocationChange: boolean
  retainPreviousVersions: number // how many old versions to keep
}

/**
 * Token access log entry
 */
export interface TokenAccessLog {
  tokenId: string
  userId: string
  providerId: string
  action: 'created' | 'accessed' | 'rotated' | 'revoked' | 'expired'
  timestamp: number
  ip?: string
  userAgent?: string
  location?: string
  success: boolean
  details?: Record<string, any>
}

/**
 * Token validation result
 */
export interface TokenValidationResult {
  valid: boolean
  reason?: string
  metadata?: TokenMetadata
  requiresRotation?: boolean
  remainingTime?: number
}

/**
 * Secure token manager with encryption, rotation, and auditing
 */
export class SecureTokenManager extends EventEmitter {
  private tokens = new Map<string, EncryptedToken>()
  private rotationPolicies = new Map<string, TokenRotationPolicy>()
  private accessLogs: TokenAccessLog[] = []
  private revokedTokens = new Set<string>()
  private suspiciousTokens = new Set<string>()
  private masterKey: Buffer
  private rotationInterval: NodeJS.Timeout | null = null
  private cleanupInterval: NodeJS.Timeout | null = null

  private readonly ALGORITHM = 'aes-256-gcm'
  private readonly KEY_LENGTH = 32
  private readonly IV_LENGTH = 16
  private readonly SALT_LENGTH = 32
  private readonly TAG_LENGTH = 16
  private readonly PBKDF2_ITERATIONS = 100000

  constructor(masterKeyBase64?: string) {
    super()

    // Initialize master key
    if (masterKeyBase64) {
      this.masterKey = Buffer.from(masterKeyBase64, 'base64')
    } else {
      this.masterKey = this.generateMasterKey()
      // SECURITY: Never log the actual key value
      logger.warn('⚠️ Generated new master key. Set TOKEN_MASTER_KEY environment variable to persist it.')
    }

    this.initializeDefaultPolicies()
    this.startRotationScheduler()
    this.startCleanupScheduler()

    logger.debug('🔐 Secure token manager initialized')
  }

  /**
   * Store token securely with encryption
   */
  async storeToken(
    tokenValue: string,
    metadata: Omit<TokenMetadata, 'id' | 'createdAt' | 'rotationCount' | 'encrypted' | 'algorithm'>
  ): Promise<string> {
    const tokenId = this.generateTokenId()
    const { encryptedValue, iv, salt, authTag } = this.encryptToken(tokenValue)
    
    const fullMetadata: TokenMetadata = {
      ...metadata,
      id: tokenId,
      createdAt: Date.now(),
      rotationCount: 0,
      encrypted: true,
      algorithm: this.ALGORITHM
    }

    const encryptedToken: EncryptedToken = {
      id: tokenId,
      encryptedValue,
      iv,
      salt,
      authTag,
      keyDerivationParams: {
        iterations: this.PBKDF2_ITERATIONS,
        keyLength: this.KEY_LENGTH,
        digest: 'sha512'
      },
      metadata: fullMetadata
    }

    this.tokens.set(tokenId, encryptedToken)
    
    this.logTokenAccess({
      tokenId,
      userId: metadata.userId,
      providerId: metadata.providerId,
      action: 'created',
      timestamp: Date.now(),
      success: true,
      details: { type: metadata.type, source: metadata.source }
    })

    this.emit('tokenStored', tokenId, metadata)
    logger.debug(`🔒 Token stored securely: ${tokenId} (${metadata.type})`)
    
    return tokenId
  }

  /**
   * Retrieve and decrypt token
   */
  async retrieveToken(tokenId: string, context?: {
    userId?: string
    ip?: string
    userAgent?: string
  }): Promise<string | null> {
    const encryptedToken = this.tokens.get(tokenId)
    if (!encryptedToken) {
      this.logTokenAccess({
        tokenId,
        userId: context?.userId || 'unknown',
        providerId: 'unknown',
        action: 'accessed',
        timestamp: Date.now(),
        success: false,
        details: { reason: 'Token not found' },
        ...context
      })
      return null
    }

    // Check if token is revoked
    if (this.revokedTokens.has(tokenId)) {
      this.logTokenAccess({
        tokenId,
        userId: encryptedToken.metadata.userId,
        providerId: encryptedToken.metadata.providerId,
        action: 'accessed',
        timestamp: Date.now(),
        success: false,
        details: { reason: 'Token revoked' },
        ...context
      })
      return null
    }

    // Validate token
    const validation = this.validateToken(encryptedToken, context)
    if (!validation.valid) {
      this.logTokenAccess({
        tokenId,
        userId: encryptedToken.metadata.userId,
        providerId: encryptedToken.metadata.providerId,
        action: 'accessed',
        timestamp: Date.now(),
        success: false,
        details: { reason: validation.reason },
        ...context
      })
      return null
    }

    // Decrypt token
    try {
      const decryptedToken = this.decryptToken(encryptedToken)
      
      // Update last used timestamp
      encryptedToken.metadata.lastUsed = Date.now()
      
      this.logTokenAccess({
        tokenId,
        userId: encryptedToken.metadata.userId,
        providerId: encryptedToken.metadata.providerId,
        action: 'accessed',
        timestamp: Date.now(),
        success: true,
        ...context
      })

      // Check if rotation is needed
      if (validation.requiresRotation) {
        this.emit('rotationRequired', tokenId, encryptedToken.metadata)
      }

      this.emit('tokenAccessed', tokenId, encryptedToken.metadata)
      return decryptedToken
      
    } catch (error: any) {
      this.logTokenAccess({
        tokenId,
        userId: encryptedToken.metadata.userId,
        providerId: encryptedToken.metadata.providerId,
        action: 'accessed',
        timestamp: Date.now(),
        success: false,
        details: { reason: 'Decryption failed', error: error.message },
        ...context
      })
      
      // Mark token as suspicious
      this.suspiciousTokens.add(tokenId)
      logger.error(`🚨 Token decryption failed: ${tokenId}`)
      return null
    }
  }

  /**
   * Rotate token (create new version)
   */
  async rotateToken(tokenId: string, newTokenValue: string): Promise<string | null> {
    const existingToken = this.tokens.get(tokenId)
    if (!existingToken) {
      return null
    }

    // Create new token with incremented rotation count
    const newTokenId = this.generateTokenId()
    const { encryptedValue, iv, salt, authTag } = this.encryptToken(newTokenValue)
    
    const newMetadata: TokenMetadata = {
      ...existingToken.metadata,
      id: newTokenId,
      createdAt: Date.now(),
      rotationCount: existingToken.metadata.rotationCount + 1,
      source: 'rotated',
      lastUsed: undefined
    }

    const newEncryptedToken: EncryptedToken = {
      id: newTokenId,
      encryptedValue,
      iv,
      salt,
      authTag,
      keyDerivationParams: existingToken.keyDerivationParams,
      metadata: newMetadata
    }

    this.tokens.set(newTokenId, newEncryptedToken)
    
    // Handle retention policy
    const policy = this.getRotationPolicy(existingToken.metadata.providerId, existingToken.metadata.type)
    if (policy.retainPreviousVersions > 0) {
      // Keep old token for grace period
      setTimeout(() => {
        this.revokeToken(tokenId, 'rotation_cleanup')
      }, 300000) // 5 minutes grace period
    } else {
      // Immediately revoke old token
      this.revokeToken(tokenId, 'rotated')
    }

    this.logTokenAccess({
      tokenId: newTokenId,
      userId: newMetadata.userId,
      providerId: newMetadata.providerId,
      action: 'rotated',
      timestamp: Date.now(),
      success: true,
      details: { 
        previousTokenId: tokenId,
        rotationCount: newMetadata.rotationCount
      }
    })

    this.emit('tokenRotated', tokenId, newTokenId, newMetadata)
    logger.debug(`🔄 Token rotated: ${tokenId} -> ${newTokenId}`)
    
    return newTokenId
  }

  /**
   * Revoke token
   */
  revokeToken(tokenId: string, reason: string): boolean {
    const token = this.tokens.get(tokenId)
    if (!token) {
      return false
    }

    this.revokedTokens.add(tokenId)
    
    this.logTokenAccess({
      tokenId,
      userId: token.metadata.userId,
      providerId: token.metadata.providerId,
      action: 'revoked',
      timestamp: Date.now(),
      success: true,
      details: { reason }
    })

    this.emit('tokenRevoked', tokenId, token.metadata, reason)
    logger.debug(`❌ Token revoked: ${tokenId} (${reason})`)
    
    return true
  }

  /**
   * Bulk revoke tokens for user or provider
   */
  bulkRevokeTokens(criteria: {
    userId?: string
    providerId?: string
    type?: TokenType
    olderThan?: number
  }, reason: string): number {
    let revokedCount = 0
    
    for (const [tokenId, token] of this.tokens.entries()) {
      let shouldRevoke = true
      
      if (criteria.userId && token.metadata.userId !== criteria.userId) {
        shouldRevoke = false
      }
      if (criteria.providerId && token.metadata.providerId !== criteria.providerId) {
        shouldRevoke = false
      }
      if (criteria.type && token.metadata.type !== criteria.type) {
        shouldRevoke = false
      }
      if (criteria.olderThan && token.metadata.createdAt > criteria.olderThan) {
        shouldRevoke = false
      }
      
      if (shouldRevoke && this.revokeToken(tokenId, reason)) {
        revokedCount++
      }
    }
    
    logger.debug(`🗑️ Bulk revoked ${revokedCount} tokens (${reason})`)
    return revokedCount
  }

  /**
   * Get token metadata without decrypting value
   */
  getTokenMetadata(tokenId: string): TokenMetadata | null {
    const token = this.tokens.get(tokenId)
    return token ? { ...token.metadata } : null
  }

  /**
   * List tokens by criteria
   */
  listTokens(criteria: {
    userId?: string
    providerId?: string
    type?: TokenType
    includeRevoked?: boolean
  } = {}): TokenMetadata[] {
    const tokens: TokenMetadata[] = []
    
    for (const [tokenId, token] of this.tokens.entries()) {
      // Skip revoked tokens unless explicitly requested
      if (!criteria.includeRevoked && this.revokedTokens.has(tokenId)) {
        continue
      }
      
      let matches = true
      
      if (criteria.userId && token.metadata.userId !== criteria.userId) {
        matches = false
      }
      if (criteria.providerId && token.metadata.providerId !== criteria.providerId) {
        matches = false
      }
      if (criteria.type && token.metadata.type !== criteria.type) {
        matches = false
      }
      
      if (matches) {
        tokens.push({ ...token.metadata })
      }
    }
    
    return tokens.sort((a, b) => b.createdAt - a.createdAt)
  }

  /**
   * Configure token rotation policy
   */
  setRotationPolicy(providerId: string, tokenType: TokenType, policy: TokenRotationPolicy): void {
    const key = `${providerId}:${tokenType}`
    this.rotationPolicies.set(key, policy)
    logger.debug(`🔄 Rotation policy set: ${key}`)
  }

  /**
   * Get token access logs
   */
  getAccessLogs(criteria: {
    tokenId?: string
    userId?: string
    providerId?: string
    action?: TokenAccessLog['action']
    since?: number
    limit?: number
  } = {}): TokenAccessLog[] {
    let logs = this.accessLogs
    
    // Apply filters
    if (criteria.tokenId) {
      logs = logs.filter(log => log.tokenId === criteria.tokenId)
    }
    if (criteria.userId) {
      logs = logs.filter(log => log.userId === criteria.userId)
    }
    if (criteria.providerId) {
      logs = logs.filter(log => log.providerId === criteria.providerId)
    }
    if (criteria.action) {
      logs = logs.filter(log => log.action === criteria.action)
    }
    if (criteria.since) {
      logs = logs.filter(log => log.timestamp >= criteria.since)
    }
    
    // Sort by timestamp (newest first)
    logs.sort((a, b) => b.timestamp - a.timestamp)
    
    // Apply limit
    if (criteria.limit) {
      logs = logs.slice(0, criteria.limit)
    }
    
    return logs
  }

  /**
   * Get token statistics
   */
  getTokenStats(): {
    total: number
    active: number
    revoked: number
    suspicious: number
    byType: Record<TokenType, number>
    byProvider: Record<string, number>
    expiringWithin24Hours: number
    requiresRotation: number
  } {
    const stats = {
      total: this.tokens.size,
      active: 0,
      revoked: this.revokedTokens.size,
      suspicious: this.suspiciousTokens.size,
      byType: {} as Record<TokenType, number>,
      byProvider: {} as Record<string, number>,
      expiringWithin24Hours: 0,
      requiresRotation: 0
    }

    const now = Date.now()
    const next24Hours = now + (24 * 60 * 60 * 1000)

    for (const [tokenId, token] of this.tokens.entries()) {
      if (!this.revokedTokens.has(tokenId)) {
        stats.active++
      }

      // Count by type
      const type = token.metadata.type
      stats.byType[type] = (stats.byType[type] || 0) + 1

      // Count by provider
      const provider = token.metadata.providerId
      stats.byProvider[provider] = (stats.byProvider[provider] || 0) + 1

      // Check if expiring within 24 hours
      if (token.metadata.expiresAt && token.metadata.expiresAt <= next24Hours) {
        stats.expiringWithin24Hours++
      }

      // Check if requires rotation
      const validation = this.validateToken(token)
      if (validation.requiresRotation) {
        stats.requiresRotation++
      }
    }

    return stats
  }

  /**
   * Export master key (for backup purposes)
   */
  exportMasterKey(): string {
    return this.masterKey.toString('base64')
  }

  /**
   * Generate secure random master key
   */
  private generateMasterKey(): Buffer {
    return randomBytes(this.KEY_LENGTH)
  }

  /**
   * Generate unique token ID
   */
  private generateTokenId(): string {
    return `tok_${Date.now()}_${randomBytes(16).toString('hex')}`
  }

  /**
   * Encrypt token value
   */
  private encryptToken(tokenValue: string): {
    encryptedValue: string
    iv: string
    salt: string
    authTag: string
  } {
    const salt = randomBytes(this.SALT_LENGTH)
    const iv = randomBytes(this.IV_LENGTH)
    
    // Derive key from master key and salt
    const key = pbkdf2Sync(this.masterKey, salt, this.PBKDF2_ITERATIONS, this.KEY_LENGTH, 'sha512')
    
    // Encrypt token
    const cipher = createCipheriv(this.ALGORITHM, key, iv)
    let encrypted = cipher.update(tokenValue, 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    const authTag = cipher.getAuthTag()
    
    return {
      encryptedValue: encrypted,
      iv: iv.toString('hex'),
      salt: salt.toString('hex'),
      authTag: authTag.toString('hex')
    }
  }

  /**
   * Decrypt token value
   */
  private decryptToken(encryptedToken: EncryptedToken): string {
    const salt = Buffer.from(encryptedToken.salt, 'hex')
    const iv = Buffer.from(encryptedToken.iv, 'hex')
    const authTag = Buffer.from(encryptedToken.authTag, 'hex')
    
    // Derive key from master key and salt
    const key = pbkdf2Sync(
      this.masterKey,
      salt,
      encryptedToken.keyDerivationParams.iterations,
      encryptedToken.keyDerivationParams.keyLength,
      encryptedToken.keyDerivationParams.digest
    )
    
    // Decrypt token
    const decipher = createDecipheriv(this.ALGORITHM, key, iv)
    decipher.setAuthTag(authTag)
    
    let decrypted = decipher.update(encryptedToken.encryptedValue, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return decrypted
  }

  /**
   * Validate token
   */
  private validateToken(encryptedToken: EncryptedToken, context?: any): TokenValidationResult {
    const now = Date.now()
    const metadata = encryptedToken.metadata
    
    // Check if token is expired
    if (metadata.expiresAt && metadata.expiresAt <= now) {
      return {
        valid: false,
        reason: 'Token expired',
        metadata
      }
    }
    
    // Check if token is suspicious
    if (this.suspiciousTokens.has(metadata.id)) {
      return {
        valid: false,
        reason: 'Token marked as suspicious',
        metadata
      }
    }
    
    // Check rotation policy
    const policy = this.getRotationPolicy(metadata.providerId, metadata.type)
    let requiresRotation = false
    
    if (policy.enabled) {
      // Check if approaching expiry
      if (metadata.expiresAt && (metadata.expiresAt - now) <= policy.rotateBeforeExpiry) {
        requiresRotation = true
      }
      
      // Check max age
      if ((now - metadata.createdAt) >= policy.maxAge) {
        requiresRotation = true
      }
      
      // Check for suspicious activity
      if (policy.rotateOnSuspiciousActivity && this.detectSuspiciousActivity(metadata.id)) {
        requiresRotation = true
      }
    }
    
    return {
      valid: true,
      metadata,
      requiresRotation,
      remainingTime: metadata.expiresAt ? metadata.expiresAt - now : undefined
    }
  }

  /**
   * Get rotation policy for provider and token type
   */
  private getRotationPolicy(providerId: string, tokenType: TokenType): TokenRotationPolicy {
    const key = `${providerId}:${tokenType}`
    return this.rotationPolicies.get(key) || this.getDefaultRotationPolicy(tokenType)
  }

  /**
   * Get default rotation policy for token type
   */
  private getDefaultRotationPolicy(tokenType: TokenType): TokenRotationPolicy {
    const policies: Record<TokenType, TokenRotationPolicy> = {
      [TokenType.ACCESS_TOKEN]: {
        enabled: true,
        rotateBeforeExpiry: 300000, // 5 minutes
        maxAge: 3600000, // 1 hour
        rotateOnSuspiciousActivity: true,
        rotateOnLocationChange: false,
        retainPreviousVersions: 1
      },
      [TokenType.REFRESH_TOKEN]: {
        enabled: true,
        rotateBeforeExpiry: 86400000, // 1 day
        maxAge: 604800000, // 7 days
        rotateOnSuspiciousActivity: true,
        rotateOnLocationChange: true,
        retainPreviousVersions: 2
      },
      [TokenType.API_KEY]: {
        enabled: false,
        rotateBeforeExpiry: 0,
        maxAge: Infinity,
        rotateOnSuspiciousActivity: true,
        rotateOnLocationChange: false,
        retainPreviousVersions: 0
      },
      [TokenType.SESSION_TOKEN]: {
        enabled: true,
        rotateBeforeExpiry: 1800000, // 30 minutes
        maxAge: 28800000, // 8 hours
        rotateOnSuspiciousActivity: true,
        rotateOnLocationChange: true,
        retainPreviousVersions: 0
      },
      [TokenType.WEBHOOK_SECRET]: {
        enabled: false,
        rotateBeforeExpiry: 0,
        maxAge: Infinity,
        rotateOnSuspiciousActivity: true,
        rotateOnLocationChange: false,
        retainPreviousVersions: 1
      },
      [TokenType.ID_TOKEN]: {
        enabled: true,
        rotateBeforeExpiry: 300000, // 5 minutes
        maxAge: 3600000, // 1 hour
        rotateOnSuspiciousActivity: true,
        rotateOnLocationChange: false,
        retainPreviousVersions: 0
      },
      [TokenType.ENCRYPTION_KEY]: {
        enabled: true,
        rotateBeforeExpiry: 2592000000, // 30 days
        maxAge: 7776000000, // 90 days
        rotateOnSuspiciousActivity: true,
        rotateOnLocationChange: false,
        retainPreviousVersions: 3
      },
      [TokenType.TEMPORARY_TOKEN]: {
        enabled: false,
        rotateBeforeExpiry: 0,
        maxAge: 3600000, // 1 hour
        rotateOnSuspiciousActivity: false,
        rotateOnLocationChange: false,
        retainPreviousVersions: 0
      }
    }
    
    return policies[tokenType]
  }

  /**
   * Detect suspicious activity for a token
   */
  private detectSuspiciousActivity(tokenId: string): boolean {
    const recentLogs = this.accessLogs
      .filter(log => log.tokenId === tokenId && log.timestamp > Date.now() - 3600000) // Last hour
      .sort((a, b) => a.timestamp - b.timestamp)
    
    if (recentLogs.length < 2) return false
    
    // Check for rapid access from different locations
    const locations = new Set(recentLogs.map(log => log.ip).filter(Boolean))
    if (locations.size > 3) {
      return true
    }
    
    // Check for rapid access with different user agents
    const userAgents = new Set(recentLogs.map(log => log.userAgent).filter(Boolean))
    if (userAgents.size > 2) {
      return true
    }
    
    // Check for high frequency access
    if (recentLogs.length > 100) {
      return true
    }
    
    return false
  }

  /**
   * Log token access
   */
  private logTokenAccess(log: TokenAccessLog): void {
    this.accessLogs.push(log)
    
    // Keep only last 10,000 logs
    if (this.accessLogs.length > 10000) {
      this.accessLogs.splice(0, this.accessLogs.length - 10000)
    }
    
    this.emit('tokenAccessLogged', log)
  }

  /**
   * Initialize default rotation policies
   */
  private initializeDefaultPolicies(): void {
    // Policies are handled by getDefaultRotationPolicy
    logger.debug('📋 Default token rotation policies initialized')
  }

  /**
   * Start automatic token rotation scheduler
   */
  private startRotationScheduler(): void {
    this.rotationInterval = setInterval(() => {
      this.performScheduledRotations()
    }, 300000) // Check every 5 minutes
  }

  /**
   * Perform scheduled token rotations
   */
  private performScheduledRotations(): void {
    let rotationCount = 0
    
    for (const [tokenId, token] of this.tokens.entries()) {
      if (this.revokedTokens.has(tokenId)) continue
      
      const validation = this.validateToken(token)
      if (validation.requiresRotation) {
        // For automatic rotation, we need the provider to handle token refresh
        this.emit('autoRotationRequired', tokenId, token.metadata)
        rotationCount++
      }
    }
    
    if (rotationCount > 0) {
      logger.debug(`🔄 Scheduled rotation required for ${rotationCount} tokens`)
    }
  }

  /**
   * Start cleanup scheduler
   */
  private startCleanupScheduler(): void {
    this.cleanupInterval = setInterval(() => {
      this.performCleanup()
    }, 3600000) // Clean up every hour
  }

  /**
   * Perform cleanup of old tokens and logs
   */
  private performCleanup(): void {
    const now = Date.now()
    const cleanupAge = 7 * 24 * 60 * 60 * 1000 // 7 days
    let cleanedTokens = 0
    let cleanedLogs = 0
    
    // Clean up expired and old revoked tokens
    for (const [tokenId, token] of this.tokens.entries()) {
      const shouldCleanup = 
        (token.metadata.expiresAt && token.metadata.expiresAt < now - cleanupAge) ||
        (this.revokedTokens.has(tokenId) && now - token.metadata.createdAt > cleanupAge)
      
      if (shouldCleanup) {
        this.tokens.delete(tokenId)
        this.revokedTokens.delete(tokenId)
        this.suspiciousTokens.delete(tokenId)
        cleanedTokens++
      }
    }
    
    // Clean up old access logs
    const cutoff = now - cleanupAge
    const initialLogCount = this.accessLogs.length
    this.accessLogs = this.accessLogs.filter(log => log.timestamp >= cutoff)
    cleanedLogs = initialLogCount - this.accessLogs.length
    
    if (cleanedTokens > 0 || cleanedLogs > 0) {
      logger.debug(`🧹 Token cleanup: ${cleanedTokens} tokens, ${cleanedLogs} logs removed`)
    }
  }

  /**
   * Shutdown token manager
   */
  shutdown(): void {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval)
      this.rotationInterval = null
    }
    
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
    
    // Clear sensitive data
    this.tokens.clear()
    this.accessLogs.length = 0
    this.revokedTokens.clear()
    this.suspiciousTokens.clear()
    this.rotationPolicies.clear()
    
    // Zero out master key
    this.masterKey.fill(0)
    
    this.removeAllListeners()
    logger.debug('🛑 Secure token manager shutdown')
  }
}

/**
 * Global secure token manager instance
 */
export const secureTokenManager = new SecureTokenManager(process.env.TOKEN_MASTER_KEY)

/**
 * Token security decorator
 */
export function SecureToken(options: {
  type: TokenType
  autoRotate?: boolean
  logAccess?: boolean
} = { type: TokenType.ACCESS_TOKEN }) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value

    descriptor.value = async function (this: any, ...args: any[]) {
      const providerId = this.providerId || 'unknown'
      const userId = args[args.length - 1] || 'unknown'
      
      try {
        const result = await method.apply(this, args)
        
        // If method returns a token, store it securely
        if (typeof result === 'string' && result.length > 10) {
          const tokenId = await secureTokenManager.storeToken(result, {
            type: options.type,
            providerId,
            userId,
            source: 'oauth'
          })
          
          logger.debug(`🔐 Token secured: ${tokenId}`)
          return tokenId // Return token ID instead of actual token
        }
        
        return result
      } catch (error: any) {
        logger.error(`❌ Token operation failed: ${error.message}`)
        throw error
      }
    }

    return descriptor
  }
}