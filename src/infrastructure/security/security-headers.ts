import { createHash, randomBytes } from 'crypto'
import { EventEmitter } from 'events'

import { logger } from '@/lib/utils/logger'

/**
 * Security header configuration
 */
export interface SecurityHeadersConfig {
  // Content Security Policy
  csp: {
    enabled: boolean
    directives: {
      defaultSrc?: string[]
      scriptSrc?: string[]
      styleSrc?: string[]
      imgSrc?: string[]
      connectSrc?: string[]
      fontSrc?: string[]
      objectSrc?: string[]
      mediaSrc?: string[]
      frameSrc?: string[]
      childSrc?: string[]
      frameAncestors?: string[]
      formAction?: string[]
      baseUri?: string[]
      manifestSrc?: string[]
      workerSrc?: string[]
    }
    reportUri?: string
    reportOnly?: boolean
    upgradeInsecureRequests?: boolean
  }

  // HTTP Strict Transport Security
  hsts: {
    enabled: boolean
    maxAge: number
    includeSubdomains: boolean
    preload: boolean
  }

  // X-Frame-Options
  frameOptions: {
    enabled: boolean
    value: 'DENY' | 'SAMEORIGIN' | string // for ALLOW-FROM
  }

  // X-Content-Type-Options
  contentTypeOptions: {
    enabled: boolean
    nosniff: boolean
  }

  // X-XSS-Protection
  xssProtection: {
    enabled: boolean
    value: '0' | '1' | '1; mode=block'
  }

  // Referrer Policy
  referrerPolicy: {
    enabled: boolean
    value: 'no-referrer' | 'no-referrer-when-downgrade' | 'origin' | 'origin-when-cross-origin' | 'same-origin' | 'strict-origin' | 'strict-origin-when-cross-origin' | 'unsafe-url'
  }

  // Permissions Policy
  permissionsPolicy: {
    enabled: boolean
    directives: Record<string, string[]>
  }

  // Additional security headers
  additionalHeaders: Record<string, string>
}

/**
 * CSRF protection configuration
 */
export interface CSRFConfig {
  enabled: boolean
  tokenName: string
  headerName: string
  cookieName: string
  secret: string
  tokenLength: number
  maxAge: number
  sameSite: 'strict' | 'lax' | 'none'
  secure: boolean
  httpOnly: boolean
  ignoredMethods: string[]
  trustedOrigins: string[]
  customValidation?: (token: string, sessionToken: string) => boolean
}

/**
 * CSRF token information
 */
export interface CSRFToken {
  token: string
  sessionId: string
  createdAt: number
  expiresAt: number
  used: boolean
  ip?: string
  userAgent?: string
}

/**
 * Security violation details
 */
export interface SecurityViolation {
  type: 'csp' | 'csrf' | 'frame_options' | 'referrer' | 'xss' | 'custom'
  severity: 'low' | 'medium' | 'high' | 'critical'
  description: string
  ip?: string
  userAgent?: string
  url?: string
  timestamp: number
  blocked: boolean
  details?: Record<string, any>
}

/**
 * Comprehensive security headers and CSRF protection manager
 */
export class SecurityHeadersManager extends EventEmitter {
  private config: SecurityHeadersConfig
  private csrfConfig: CSRFConfig
  private csrfTokens = new Map<string, CSRFToken>()
  private violations: SecurityViolation[] = []
  private nonces = new Map<string, { value: string; createdAt: number }>()
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(
    securityConfig: Partial<SecurityHeadersConfig> = {},
    csrfConfig: Partial<CSRFConfig> = {}
  ) {
    super()

    this.config = this.mergeWithDefaults(securityConfig)
    this.csrfConfig = this.mergeCSRFDefaults(csrfConfig)
    
    this.startCleanup()
    logger.debug('🛡️ Security headers manager initialized')
  }

  /**
   * Generate security headers for response
   */
  generateHeaders(request?: {
    url?: string
    method?: string
    headers?: Record<string, string>
    ip?: string
    userAgent?: string
  }): Record<string, string> {
    const headers: Record<string, string> = {}

    // Content Security Policy
    if (this.config.csp.enabled) {
      const cspValue = this.buildCSPHeader(request)
      const headerName = this.config.csp.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy'
      headers[headerName] = cspValue
    }

    // HTTP Strict Transport Security
    if (this.config.hsts.enabled) {
      let hstsValue = `max-age=${this.config.hsts.maxAge}`
      if (this.config.hsts.includeSubdomains) {
        hstsValue += '; includeSubDomains'
      }
      if (this.config.hsts.preload) {
        hstsValue += '; preload'
      }
      headers['Strict-Transport-Security'] = hstsValue
    }

    // X-Frame-Options
    if (this.config.frameOptions.enabled) {
      headers['X-Frame-Options'] = this.config.frameOptions.value
    }

    // X-Content-Type-Options
    if (this.config.contentTypeOptions.enabled && this.config.contentTypeOptions.nosniff) {
      headers['X-Content-Type-Options'] = 'nosniff'
    }

    // X-XSS-Protection
    if (this.config.xssProtection.enabled) {
      headers['X-XSS-Protection'] = this.config.xssProtection.value
    }

    // Referrer Policy
    if (this.config.referrerPolicy.enabled) {
      headers['Referrer-Policy'] = this.config.referrerPolicy.value
    }

    // Permissions Policy
    if (this.config.permissionsPolicy.enabled) {
      const permissionsValue = this.buildPermissionsPolicyHeader()
      if (permissionsValue) {
        headers['Permissions-Policy'] = permissionsValue
      }
    }

    // Additional custom headers
    Object.assign(headers, this.config.additionalHeaders)

    return headers
  }

  /**
   * Generate CSRF token
   */
  generateCSRFToken(sessionId: string, request?: {
    ip?: string
    userAgent?: string
  }): string {
    if (!this.csrfConfig.enabled) {
      throw new Error('CSRF protection is not enabled')
    }

    const tokenValue = this.createTokenValue()
    const now = Date.now()

    const csrfToken: CSRFToken = {
      token: tokenValue,
      sessionId,
      createdAt: now,
      expiresAt: now + this.csrfConfig.maxAge,
      used: false,
      ip: request?.ip,
      userAgent: request?.userAgent
    }

    this.csrfTokens.set(tokenValue, csrfToken)
    
    logger.debug(`🎫 CSRF token generated for session: ${sessionId}`)
    return tokenValue
  }

  /**
   * Validate CSRF token
   */
  validateCSRFToken(
    token: string,
    sessionId: string,
    request?: {
      method?: string
      origin?: string
      referer?: string
      ip?: string
      userAgent?: string
    }
  ): {
    valid: boolean
    reason?: string
    shouldBlock?: boolean
  } {
    if (!this.csrfConfig.enabled) {
      return { valid: true }
    }

    // Check if method should be ignored
    if (request?.method && this.csrfConfig.ignoredMethods.includes(request.method.toUpperCase())) {
      return { valid: true }
    }

    // Check if token exists
    const csrfToken = this.csrfTokens.get(token)
    if (!csrfToken) {
      this.recordViolation({
        type: 'csrf',
        severity: 'high',
        description: 'Invalid CSRF token',
        ip: request?.ip,
        userAgent: request?.userAgent,
        timestamp: Date.now(),
        blocked: true,
        details: { token, sessionId, reason: 'token_not_found' }
      })
      return { valid: false, reason: 'Invalid token', shouldBlock: true }
    }

    // Check if token is expired
    if (Date.now() > csrfToken.expiresAt) {
      this.csrfTokens.delete(token)
      this.recordViolation({
        type: 'csrf',
        severity: 'medium',
        description: 'Expired CSRF token',
        ip: request?.ip,
        userAgent: request?.userAgent,
        timestamp: Date.now(),
        blocked: true,
        details: { token, sessionId, reason: 'token_expired' }
      })
      return { valid: false, reason: 'Token expired', shouldBlock: false }
    }

    // Check if token belongs to session
    if (csrfToken.sessionId !== sessionId) {
      this.recordViolation({
        type: 'csrf',
        severity: 'critical',
        description: 'CSRF token session mismatch',
        ip: request?.ip,
        userAgent: request?.userAgent,
        timestamp: Date.now(),
        blocked: true,
        details: { 
          token, 
          expectedSession: sessionId, 
          actualSession: csrfToken.sessionId,
          reason: 'session_mismatch'
        }
      })
      return { valid: false, reason: 'Session mismatch', shouldBlock: true }
    }

    // Check if token was already used (single-use tokens)
    if (csrfToken.used) {
      this.recordViolation({
        type: 'csrf',
        severity: 'high',
        description: 'CSRF token reuse attempt',
        ip: request?.ip,
        userAgent: request?.userAgent,
        timestamp: Date.now(),
        blocked: true,
        details: { token, sessionId, reason: 'token_reused' }
      })
      return { valid: false, reason: 'Token already used', shouldBlock: true }
    }

    // Validate origin if available
    if (request?.origin) {
      const isValidOrigin = this.validateOrigin(request.origin)
      if (!isValidOrigin) {
        this.recordViolation({
          type: 'csrf',
          severity: 'critical',
          description: 'Invalid origin for CSRF protected request',
          ip: request?.ip,
          userAgent: request?.userAgent,
          timestamp: Date.now(),
          blocked: true,
          details: { token, sessionId, origin: request.origin, reason: 'invalid_origin' }
        })
        return { valid: false, reason: 'Invalid origin', shouldBlock: true }
      }
    }

    // Custom validation if provided
    if (this.csrfConfig.customValidation) {
      const customValid = this.csrfConfig.customValidation(token, sessionId)
      if (!customValid) {
        this.recordViolation({
          type: 'csrf',
          severity: 'high',
          description: 'CSRF custom validation failed',
          ip: request?.ip,
          userAgent: request?.userAgent,
          timestamp: Date.now(),
          blocked: true,
          details: { token, sessionId, reason: 'custom_validation_failed' }
        })
        return { valid: false, reason: 'Custom validation failed', shouldBlock: true }
      }
    }

    // Mark token as used
    csrfToken.used = true

    logger.debug(`✅ CSRF token validated for session: ${sessionId}`)
    return { valid: true }
  }

  /**
   * Generate nonce for CSP
   */
  generateNonce(): string {
    const nonce = randomBytes(16).toString('base64')
    this.nonces.set(nonce, {
      value: nonce,
      createdAt: Date.now()
    })
    return nonce
  }

  /**
   * Validate CSP violation report
   */
  handleCSPViolation(report: any, request?: {
    ip?: string
    userAgent?: string
  }): void {
    const violation: SecurityViolation = {
      type: 'csp',
      severity: this.classifyCSPViolationSeverity(report),
      description: `CSP violation: ${report['violated-directive'] || 'unknown directive'}`,
      ip: request?.ip,
      userAgent: request?.userAgent,
      url: report['document-uri'],
      timestamp: Date.now(),
      blocked: report.disposition === 'enforce',
      details: report
    }

    this.recordViolation(violation)
    this.emit('cspViolation', violation)
    
    logger.warn(`🚨 CSP violation detected:`, report)
  }

  /**
   * Get security violation statistics
   */
  getViolationStats(): {
    total: number
    byType: Record<string, number>
    bySeverity: Record<string, number>
    recent: SecurityViolation[]
    blocked: number
  } {
    const byType: Record<string, number> = {}
    const bySeverity: Record<string, number> = {}
    let blocked = 0

    for (const violation of this.violations) {
      byType[violation.type] = (byType[violation.type] || 0) + 1
      bySeverity[violation.severity] = (bySeverity[violation.severity] || 0) + 1
      
      if (violation.blocked) {
        blocked++
      }
    }

    const recent = this.violations
      .filter(v => Date.now() - v.timestamp < 24 * 60 * 60 * 1000) // Last 24 hours
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 10)

    return {
      total: this.violations.length,
      byType,
      bySeverity,
      recent,
      blocked
    }
  }

  /**
   * Update security configuration
   */
  updateConfig(newConfig: Partial<SecurityHeadersConfig>): void {
    this.config = this.mergeWithDefaults(newConfig)
    logger.debug('🔧 Security headers configuration updated')
  }

  /**
   * Update CSRF configuration
   */
  updateCSRFConfig(newConfig: Partial<CSRFConfig>): void {
    this.csrfConfig = this.mergeCSRFDefaults(newConfig)
    logger.debug('🔧 CSRF protection configuration updated')
  }

  /**
   * Build Content Security Policy header
   */
  private buildCSPHeader(request?: any): string {
    const directives: string[] = []
    const cspDirectives = this.config.csp.directives

    for (const [directive, sources] of Object.entries(cspDirectives)) {
      if (sources && sources.length > 0) {
        const directiveName = directive.replace(/([A-Z])/g, '-$1').toLowerCase()
        directives.push(`${directiveName} ${sources.join(' ')}`)
      }
    }

    if (this.config.csp.upgradeInsecureRequests) {
      directives.push('upgrade-insecure-requests')
    }

    if (this.config.csp.reportUri) {
      directives.push(`report-uri ${this.config.csp.reportUri}`)
    }

    return directives.join('; ')
  }

  /**
   * Build Permissions Policy header
   */
  private buildPermissionsPolicyHeader(): string {
    const policies: string[] = []
    
    for (const [feature, allowlist] of Object.entries(this.config.permissionsPolicy.directives)) {
      if (allowlist.length === 0) {
        policies.push(`${feature}=()`)
      } else {
        const origins = allowlist.map(origin => origin === 'self' ? 'self' : `"${origin}"`).join(' ')
        policies.push(`${feature}=(${origins})`)
      }
    }

    return policies.join(', ')
  }

  /**
   * Create CSRF token value
   */
  private createTokenValue(): string {
    const randomData = randomBytes(this.csrfConfig.tokenLength)
    const timestamp = Date.now().toString()
    const combined = randomData.toString('hex') + timestamp
    
    return createHash('sha256')
      .update(combined + this.csrfConfig.secret)
      .digest('hex')
      .substring(0, this.csrfConfig.tokenLength * 2)
  }

  /**
   * Validate request origin
   */
  private validateOrigin(origin: string): boolean {
    // Allow same origin
    if (origin === 'null') {
      return false // Reject null origin
    }

    // Check against trusted origins
    for (const trustedOrigin of this.csrfConfig.trustedOrigins) {
      if (origin === trustedOrigin || origin.endsWith(`.${trustedOrigin}`)) {
        return true
      }
    }

    return false
  }

  /**
   * Classify CSP violation severity
   */
  private classifyCSPViolationSeverity(report: any): SecurityViolation['severity'] {
    const violatedDirective = report['violated-directive'] || ''
    const blockedUri = report['blocked-uri'] || ''

    // Critical: Script injection attempts
    if (violatedDirective.includes('script-src') && blockedUri.includes('data:')) {
      return 'critical'
    }

    // High: External script/style loading
    if (violatedDirective.includes('script-src') || violatedDirective.includes('style-src')) {
      return 'high'
    }

    // Medium: Frame/object violations
    if (violatedDirective.includes('frame-src') || violatedDirective.includes('object-src')) {
      return 'medium'
    }

    // Low: Image/font/connect violations
    return 'low'
  }

  /**
   * Record security violation
   */
  private recordViolation(violation: SecurityViolation): void {
    this.violations.push(violation)
    
    // Keep only last 1000 violations
    if (this.violations.length > 1000) {
      this.violations.splice(0, this.violations.length - 1000)
    }

    this.emit('securityViolation', violation)
  }

  /**
   * Start cleanup interval
   */
  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup()
    }, 60000) // Clean up every minute
  }

  /**
   * Clean up expired tokens and nonces
   */
  private cleanup(): void {
    const now = Date.now()
    let cleanedTokens = 0
    let cleanedNonces = 0

    // Clean up expired CSRF tokens
    for (const [token, csrfToken] of this.csrfTokens.entries()) {
      if (now > csrfToken.expiresAt) {
        this.csrfTokens.delete(token)
        cleanedTokens++
      }
    }

    // Clean up old nonces (older than 1 hour)
    for (const [nonce, nonceData] of this.nonces.entries()) {
      if (now - nonceData.createdAt > 3600000) {
        this.nonces.delete(nonce)
        cleanedNonces++
      }
    }

    if (cleanedTokens > 0 || cleanedNonces > 0) {
      logger.debug(`🧹 Security cleanup: ${cleanedTokens} tokens, ${cleanedNonces} nonces removed`)
    }
  }

  /**
   * Merge with default security configuration
   */
  private mergeWithDefaults(config: Partial<SecurityHeadersConfig>): SecurityHeadersConfig {
    return {
      csp: {
        enabled: true,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"]
        },
        reportOnly: false,
        upgradeInsecureRequests: true,
        ...config.csp
      },
      hsts: {
        enabled: true,
        maxAge: 31536000, // 1 year
        includeSubdomains: true,
        preload: true,
        ...config.hsts
      },
      frameOptions: {
        enabled: true,
        value: 'DENY',
        ...config.frameOptions
      },
      contentTypeOptions: {
        enabled: true,
        nosniff: true,
        ...config.contentTypeOptions
      },
      xssProtection: {
        enabled: true,
        value: '1; mode=block',
        ...config.xssProtection
      },
      referrerPolicy: {
        enabled: true,
        value: 'strict-origin-when-cross-origin',
        ...config.referrerPolicy
      },
      permissionsPolicy: {
        enabled: true,
        directives: {
          camera: [],
          microphone: [],
          geolocation: [],
          payment: [],
          usb: [],
          magnetometer: [],
          gyroscope: [],
          accelerometer: []
        },
        ...config.permissionsPolicy
      },
      additionalHeaders: {
        'X-Powered-By': 'ChainReact Security',
        ...config.additionalHeaders
      }
    }
  }

  /**
   * Merge with default CSRF configuration
   */
  private mergeCSRFDefaults(config: Partial<CSRFConfig>): CSRFConfig {
    return {
      enabled: true,
      tokenName: '_csrf',
      headerName: 'X-CSRF-Token',
      cookieName: '_csrf_token',
      secret: process.env.CSRF_SECRET || 'change-this-secret-in-production',
      tokenLength: 32,
      maxAge: 3600000, // 1 hour
      sameSite: 'strict',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
      trustedOrigins: ['localhost', '127.0.0.1'],
      ...config
    }
  }

  /**
   * Shutdown security headers manager
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }

    this.csrfTokens.clear()
    this.nonces.clear()
    this.violations.length = 0
    this.removeAllListeners()
    
    logger.debug('🛑 Security headers manager shutdown')
  }
}

/**
 * Express middleware factory for security headers
 */
export function createSecurityHeadersMiddleware(config?: Partial<SecurityHeadersConfig>) {
  const manager = new SecurityHeadersManager(config)
  
  return (req: any, res: any, next: any) => {
    const headers = manager.generateHeaders({
      url: req.url,
      method: req.method,
      headers: req.headers,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.headers['user-agent']
    })

    // Apply headers to response
    for (const [name, value] of Object.entries(headers)) {
      res.setHeader(name, value)
    }

    next()
  }
}

/**
 * Express middleware factory for CSRF protection
 */
export function createCSRFMiddleware(config?: Partial<CSRFConfig>) {
  const manager = new SecurityHeadersManager({}, config)
  
  return (req: any, res: any, next: any) => {
    // Skip if CSRF is disabled
    if (!config?.enabled) {
      return next()
    }

    // Generate token for safe methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const sessionId = req.session?.id || req.sessionID
      if (sessionId) {
        const token = manager.generateCSRFToken(sessionId, {
          ip: req.ip,
          userAgent: req.headers['user-agent']
        })
        
        // Add token to response locals for templates
        res.locals.csrfToken = token
        
        // Set cookie if configured
        if (config?.cookieName) {
          res.cookie(config.cookieName, token, {
            httpOnly: config?.httpOnly,
            secure: config?.secure,
            sameSite: config?.sameSite,
            maxAge: config?.maxAge
          })
        }
      }
      return next()
    }

    // Validate token for state-changing methods
    const token = req.body?.[config?.tokenName || '_csrf'] || 
                 req.headers[config?.headerName?.toLowerCase() || 'x-csrf-token'] ||
                 req.cookies?.[config?.cookieName || '_csrf_token']

    const sessionId = req.session?.id || req.sessionID
    
    if (!sessionId) {
      return res.status(403).json({ error: 'No session found' })
    }

    const validation = manager.validateCSRFToken(token, sessionId, {
      method: req.method,
      origin: req.headers.origin,
      referer: req.headers.referer,
      ip: req.ip,
      userAgent: req.headers['user-agent']
    })

    if (!validation.valid) {
      return res.status(403).json({ 
        error: 'CSRF validation failed',
        reason: validation.reason
      })
    }

    next()
  }
}

/**
 * Global security headers manager instance
 */
export const securityHeadersManager = new SecurityHeadersManager()

/**
 * Security headers decorator
 */
export function SecureHeaders(config?: Partial<SecurityHeadersConfig>) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value

    descriptor.value = async function (this: any, req: any, res: any, ...args: any[]) {
      const manager = new SecurityHeadersManager(config)
      const headers = manager.generateHeaders({
        url: req?.url,
        method: req?.method,
        headers: req?.headers,
        ip: req?.ip,
        userAgent: req?.headers?.['user-agent']
      })

      // Apply headers if response object is available
      if (res && typeof res.setHeader === 'function') {
        for (const [name, value] of Object.entries(headers)) {
          res.setHeader(name, value)
        }
      }

      return await method.apply(this, [req, res, ...args])
    }

    return descriptor
  }
}