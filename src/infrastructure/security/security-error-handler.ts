/**
 * Security error types and classifications
 */
export enum SecurityErrorType {
  AUTHENTICATION_FAILED = 'authentication_failed',
  AUTHORIZATION_DENIED = 'authorization_denied',
  TOKEN_EXPIRED = 'token_expired',
  TOKEN_INVALID = 'token_invalid',
  TOKEN_MISSING = 'token_missing',
  INSUFFICIENT_PERMISSIONS = 'insufficient_permissions',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  DATA_BREACH_ATTEMPT = 'data_breach_attempt',
  INJECTION_ATTEMPT = 'injection_attempt',
  XSS_ATTEMPT = 'xss_attempt',
  CSRF_ATTEMPT = 'csrf_attempt',
  INVALID_INPUT = 'invalid_input',
  ENCRYPTION_FAILED = 'encryption_failed',
  DECRYPTION_FAILED = 'decryption_failed',
  SIGNATURE_INVALID = 'signature_invalid',
  NETWORK_SECURITY = 'network_security',
  COMPLIANCE_VIOLATION = 'compliance_violation',
  UNKNOWN_SECURITY = 'unknown_security'
}

/**
 * Security severity levels
 */
export enum SecuritySeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Security error details
 */
export interface SecurityErrorDetails {
  type: SecurityErrorType
  severity: SecuritySeverity
  message: string
  userId?: string
  providerId?: string
  endpoint?: string
  ip?: string
  userAgent?: string
  timestamp: number
  requestId?: string
  metadata?: Record<string, any>
  remediation?: string[]
  shouldAlert: boolean
  shouldLog: boolean
  shouldBlock: boolean
}

/**
 * Security incident tracking
 */
export interface SecurityIncident {
  id: string
  type: SecurityErrorType
  severity: SecuritySeverity
  description: string
  affectedUsers: string[]
  affectedProviders: string[]
  startTime: number
  endTime?: number
  status: 'open' | 'investigating' | 'resolved' | 'false_positive'
  actions: Array<{
    timestamp: number
    action: string
    performer: string
    result: string
  }>
  evidence: Array<{
    type: 'log' | 'screenshot' | 'network' | 'file'
    description: string
    location: string
    timestamp: number
  }>
}

/**
 * Security alert configuration
 */
export interface SecurityAlertConfig {
  errorType: SecurityErrorType
  severity: SecuritySeverity
  threshold: number // Number of occurrences
  timeWindow: number // Time window in milliseconds
  escalationDelay: number // Time before escalation
  recipients: string[]
  enabled: boolean
}

/**
 * Comprehensive security error handler
 */
export class SecurityErrorHandler {
  private errorCounts = new Map<string, { count: number; firstOccurrence: number; lastOccurrence: number }>()
  private incidents = new Map<string, SecurityIncident>()
  private alertConfigs = new Map<SecurityErrorType, SecurityAlertConfig>()
  private blockedIPs = new Set<string>()
  private blockedUsers = new Set<string>()
  private suspiciousActivity = new Map<string, Array<{ timestamp: number; action: string; details: any }>>()
  private cleanupInterval: NodeJS.Timeout

  constructor() {
    this.initializeDefaultAlerts()
    this.cleanupInterval = setInterval(() => this.cleanup(), 300000) // 5 minutes
    
    console.log('🛡️ Security error handler initialized')
  }

  /**
   * Handle and classify security errors
   */
  handleSecurityError(error: Error | SecurityErrorDetails, context?: {
    userId?: string
    providerId?: string
    endpoint?: string
    ip?: string
    userAgent?: string
    requestId?: string
    metadata?: Record<string, any>
  }): SecurityErrorDetails {
    let errorDetails: SecurityErrorDetails

    if (this.isSecurityErrorDetails(error)) {
      errorDetails = error
    } else {
      errorDetails = this.classifyError(error as Error, context)
    }

    // Add context if not already present
    if (context) {
      errorDetails = { ...errorDetails, ...context }
    }

    // Log the security error
    if (errorDetails.shouldLog) {
      this.logSecurityError(errorDetails)
    }

    // Check for patterns and suspicious activity
    this.analyzeSecurityPattern(errorDetails)

    // Handle blocking if required
    if (errorDetails.shouldBlock) {
      this.handleBlocking(errorDetails)
    }

    // Check alert thresholds
    if (errorDetails.shouldAlert) {
      this.checkAlertThresholds(errorDetails)
    }

    // Create or update incident if severe
    if (errorDetails.severity === SecuritySeverity.HIGH || errorDetails.severity === SecuritySeverity.CRITICAL) {
      this.createOrUpdateIncident(errorDetails)
    }

    console.log(`🚨 Security error handled: ${errorDetails.type} (${errorDetails.severity})`)
    
    return errorDetails
  }

  /**
   * Classify error into security categories
   */
  classifyError(error: Error, context?: any): SecurityErrorDetails {
    const message = error.message.toLowerCase()
    const stack = error.stack?.toLowerCase() || ''
    
    let type: SecurityErrorType = SecurityErrorType.UNKNOWN_SECURITY
    let severity: SecuritySeverity = SecuritySeverity.LOW
    let shouldAlert = false
    const shouldLog = true
    let shouldBlock = false
    let remediation: string[] = []

    // Authentication errors
    if (message.includes('unauthorized') || message.includes('authentication failed') || 
        message.includes('invalid credentials') || message.includes('login failed')) {
      type = SecurityErrorType.AUTHENTICATION_FAILED
      severity = SecuritySeverity.MEDIUM
      shouldAlert = true
      remediation = [
        'Verify user credentials',
        'Check authentication configuration',
        'Review recent login attempts'
      ]
    }

    // Authorization errors
    else if (message.includes('forbidden') || message.includes('access denied') || 
             message.includes('insufficient permissions')) {
      type = SecurityErrorType.AUTHORIZATION_DENIED
      severity = SecuritySeverity.MEDIUM
      shouldAlert = true
      remediation = [
        'Verify user permissions',
        'Check role assignments',
        'Review access policies'
      ]
    }

    // Token errors
    else if (message.includes('token expired') || message.includes('jwt expired')) {
      type = SecurityErrorType.TOKEN_EXPIRED
      severity = SecuritySeverity.LOW
      remediation = ['Refresh authentication token', 'Re-authenticate user']
    }
    else if (message.includes('invalid token') || message.includes('malformed token') || 
             message.includes('token verification failed')) {
      type = SecurityErrorType.TOKEN_INVALID
      severity = SecuritySeverity.HIGH
      shouldAlert = true
      shouldBlock = this.isRepeatedOffense(context?.userId, context?.ip)
      remediation = ['Validate token format', 'Check token signing', 'Investigate potential tampering']
    }
    else if (message.includes('token missing') || message.includes('no token provided')) {
      type = SecurityErrorType.TOKEN_MISSING
      severity = SecuritySeverity.MEDIUM
      remediation = ['Ensure token is included in request', 'Check authentication headers']
    }

    // Rate limiting
    else if (message.includes('rate limit') || message.includes('too many requests') || 
             message.includes('quota exceeded')) {
      type = SecurityErrorType.RATE_LIMIT_EXCEEDED
      severity = SecuritySeverity.MEDIUM
      shouldAlert = this.isRepeatedOffense(context?.userId, context?.ip)
      remediation = ['Implement exponential backoff', 'Review request patterns', 'Check for automation']
    }

    // Injection attempts
    else if (this.detectInjectionAttempt(message, stack, context)) {
      type = SecurityErrorType.INJECTION_ATTEMPT
      severity = SecuritySeverity.CRITICAL
      shouldAlert = true
      shouldBlock = true
      remediation = [
        'Block source immediately',
        'Review input validation',
        'Investigate payload',
        'Check for data corruption'
      ]
    }

    // XSS attempts
    else if (this.detectXSSAttempt(message, context)) {
      type = SecurityErrorType.XSS_ATTEMPT
      severity = SecuritySeverity.HIGH
      shouldAlert = true
      shouldBlock = true
      remediation = [
        'Sanitize user input',
        'Review output encoding',
        'Check CSP headers',
        'Block malicious content'
      ]
    }

    // CSRF attempts
    else if (message.includes('csrf') || message.includes('cross-site request') || 
             this.detectCSRFAttempt(context)) {
      type = SecurityErrorType.CSRF_ATTEMPT
      severity = SecuritySeverity.HIGH
      shouldAlert = true
      remediation = ['Verify CSRF tokens', 'Check request origin', 'Review session handling']
    }

    // Encryption/Decryption errors
    else if (message.includes('encryption failed') || message.includes('cipher')) {
      type = SecurityErrorType.ENCRYPTION_FAILED
      severity = SecuritySeverity.HIGH
      shouldAlert = true
      remediation = ['Check encryption keys', 'Verify algorithm configuration', 'Review key rotation']
    }
    else if (message.includes('decryption failed') || message.includes('decrypt')) {
      type = SecurityErrorType.DECRYPTION_FAILED
      severity = SecuritySeverity.HIGH
      shouldAlert = true
      remediation = ['Verify decryption keys', 'Check data integrity', 'Review encryption format']
    }

    // Network security
    else if (message.includes('ssl') || message.includes('tls') || message.includes('certificate') || 
             message.includes('secure connection')) {
      type = SecurityErrorType.NETWORK_SECURITY
      severity = SecuritySeverity.HIGH
      shouldAlert = true
      remediation = ['Check SSL/TLS configuration', 'Verify certificates', 'Review network policies']
    }

    // Suspicious activity patterns
    if (this.detectSuspiciousActivity(context)) {
      severity = SecuritySeverity.HIGH
      shouldAlert = true
      if (type === SecurityErrorType.UNKNOWN_SECURITY) {
        type = SecurityErrorType.SUSPICIOUS_ACTIVITY
      }
    }

    return {
      type,
      severity,
      message: this.sanitizeErrorMessage(error.message),
      timestamp: Date.now(),
      shouldAlert,
      shouldLog,
      shouldBlock,
      remediation
    }
  }

  /**
   * Check if IP or user is blocked
   */
  isBlocked(userId?: string, ip?: string): boolean {
    if (userId && this.blockedUsers.has(userId)) return true
    if (ip && this.blockedIPs.has(ip)) return true
    return false
  }

  /**
   * Block user or IP
   */
  blockUser(userId: string, reason: string, duration?: number): void {
    this.blockedUsers.add(userId)
    
    if (duration) {
      setTimeout(() => {
        this.blockedUsers.delete(userId)
        console.log(`🔓 User unblocked: ${userId}`)
      }, duration)
    }
    
    console.log(`🚫 User blocked: ${userId} (${reason})`)
  }

  /**
   * Block IP address
   */
  blockIP(ip: string, reason: string, duration?: number): void {
    this.blockedIPs.add(ip)
    
    if (duration) {
      setTimeout(() => {
        this.blockedIPs.delete(ip)
        console.log(`🔓 IP unblocked: ${ip}`)
      }, duration)
    }
    
    console.log(`🚫 IP blocked: ${ip} (${reason})`)
  }

  /**
   * Get security incidents
   */
  getIncidents(status?: SecurityIncident['status']): SecurityIncident[] {
    const incidents = Array.from(this.incidents.values())
    return status ? incidents.filter(i => i.status === status) : incidents
  }

  /**
   * Get security statistics
   */
  getSecurityStats(): {
    totalErrors: number
    errorsByType: Map<SecurityErrorType, number>
    errorsBySeverity: Map<SecuritySeverity, number>
    activeIncidents: number
    blockedUsers: number
    blockedIPs: number
    suspiciousActivities: number
  } {
    const errorsByType = new Map<SecurityErrorType, number>()
    const errorsBySeverity = new Map<SecuritySeverity, number>()
    
    // This would be populated from actual error tracking
    // For now, return empty stats structure
    
    return {
      totalErrors: Array.from(this.errorCounts.values()).reduce((sum, data) => sum + data.count, 0),
      errorsByType,
      errorsBySeverity,
      activeIncidents: this.getIncidents('open').length,
      blockedUsers: this.blockedUsers.size,
      blockedIPs: this.blockedIPs.size,
      suspiciousActivities: this.suspiciousActivity.size
    }
  }

  /**
   * Configure security alerts
   */
  configureAlert(config: SecurityAlertConfig): void {
    this.alertConfigs.set(config.errorType, config)
    console.log(`🔔 Security alert configured: ${config.errorType}`)
  }

  /**
   * Detect injection attempts
   */
  private detectInjectionAttempt(message: string, stack: string, context?: any): boolean {
    const injectionPatterns = [
      /union\s+select/i,
      /drop\s+table/i,
      /insert\s+into/i,
      /delete\s+from/i,
      /update\s+.*set/i,
      /<script[^>]*>/i,
      /javascript:/i,
      /onload\s*=/i,
      /onerror\s*=/i,
      /eval\s*\(/i,
      /\.\.\/\.\./,
      /\/etc\/passwd/,
      /\/proc\/self\//,
      /cmd\.exe/i,
      /powershell/i
    ]

    const checkString = `${message} ${stack} ${JSON.stringify(context?.metadata || {})}`
    return injectionPatterns.some(pattern => pattern.test(checkString))
  }

  /**
   * Detect XSS attempts
   */
  private detectXSSAttempt(message: string, context?: any): boolean {
    const xssPatterns = [
      /<script[^>]*>.*<\/script>/i,
      /javascript:/i,
      /onload\s*=/i,
      /onerror\s*=/i,
      /onclick\s*=/i,
      /onmouseover\s*=/i,
      /<iframe[^>]*>/i,
      /<object[^>]*>/i,
      /<embed[^>]*>/i,
      /document\.cookie/i,
      /window\.location/i,
      /alert\s*\(/i
    ]

    const checkString = `${message} ${JSON.stringify(context?.metadata || {})}`
    return xssPatterns.some(pattern => pattern.test(checkString))
  }

  /**
   * Detect CSRF attempts
   */
  private detectCSRFAttempt(context?: any): boolean {
    if (!context) return false
    
    // Check for suspicious referrer patterns
    const referrer = context.metadata?.referrer
    const origin = context.metadata?.origin
    const expectedOrigin = context.metadata?.expectedOrigin
    
    if (referrer && expectedOrigin && !referrer.startsWith(expectedOrigin)) {
      return true
    }
    
    if (origin && expectedOrigin && origin !== expectedOrigin) {
      return true
    }
    
    return false
  }

  /**
   * Detect suspicious activity patterns
   */
  private detectSuspiciousActivity(context?: any): boolean {
    if (!context?.userId && !context?.ip) return false
    
    const identifier = context.userId || context.ip
    const activities = this.suspiciousActivity.get(identifier) || []
    
    // Check for rapid successive requests
    const now = Date.now()
    const recentActivities = activities.filter(a => now - a.timestamp < 60000) // Last minute
    
    if (recentActivities.length > 50) { // More than 50 requests per minute
      return true
    }
    
    // Check for unusual patterns
    const uniqueEndpoints = new Set(recentActivities.map(a => a.details?.endpoint))
    if (uniqueEndpoints.size > 20) { // Accessing too many different endpoints
      return true
    }
    
    return false
  }

  /**
   * Check if this is a repeated offense
   */
  private isRepeatedOffense(userId?: string, ip?: string): boolean {
    const identifier = userId || ip
    if (!identifier) return false
    
    const errorData = this.errorCounts.get(identifier)
    return errorData ? errorData.count > 5 : false
  }

  /**
   * Log security error
   */
  private logSecurityError(error: SecurityErrorDetails): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: this.severityToLogLevel(error.severity),
      type: 'SECURITY_ERROR',
      errorType: error.type,
      severity: error.severity,
      message: error.message,
      userId: error.userId,
      providerId: error.providerId,
      endpoint: error.endpoint,
      ip: error.ip,
      userAgent: error.userAgent,
      requestId: error.requestId,
      metadata: error.metadata,
      remediation: error.remediation
    }
    
    // In production, this would go to a secure log storage
    console.error('🔒 SECURITY ERROR:', JSON.stringify(logEntry, null, 2))
  }

  /**
   * Analyze security patterns
   */
  private analyzeSecurityPattern(error: SecurityErrorDetails): void {
    const identifier = error.userId || error.ip || 'unknown'
    
    // Track error counts
    const existing = this.errorCounts.get(identifier)
    if (existing) {
      existing.count++
      existing.lastOccurrence = error.timestamp
    } else {
      this.errorCounts.set(identifier, {
        count: 1,
        firstOccurrence: error.timestamp,
        lastOccurrence: error.timestamp
      })
    }
    
    // Track suspicious activity
    if (identifier !== 'unknown') {
      const activities = this.suspiciousActivity.get(identifier) || []
      activities.push({
        timestamp: error.timestamp,
        action: error.type,
        details: {
          endpoint: error.endpoint,
          providerId: error.providerId,
          severity: error.severity
        }
      })
      
      // Keep only last 100 activities
      if (activities.length > 100) {
        activities.splice(0, activities.length - 100)
      }
      
      this.suspiciousActivity.set(identifier, activities)
    }
  }

  /**
   * Handle blocking logic
   */
  private handleBlocking(error: SecurityErrorDetails): void {
    const blockDuration = this.calculateBlockDuration(error)
    
    if (error.userId) {
      this.blockUser(error.userId, `${error.type}: ${error.message}`, blockDuration)
    }
    
    if (error.ip) {
      this.blockIP(error.ip, `${error.type}: ${error.message}`, blockDuration)
    }
  }

  /**
   * Calculate block duration based on severity
   */
  private calculateBlockDuration(error: SecurityErrorDetails): number {
    const identifier = error.userId || error.ip
    const errorData = identifier ? this.errorCounts.get(identifier) : null
    const repeatOffenses = errorData ? errorData.count : 1
    
    let baseDuration = 0
    
    switch (error.severity) {
      case SecuritySeverity.LOW:
        baseDuration = 60000 // 1 minute
        break
      case SecuritySeverity.MEDIUM:
        baseDuration = 300000 // 5 minutes
        break
      case SecuritySeverity.HIGH:
        baseDuration = 1800000 // 30 minutes
        break
      case SecuritySeverity.CRITICAL:
        baseDuration = 7200000 // 2 hours
        break
    }
    
    // Increase duration for repeat offenses
    return baseDuration * Math.min(repeatOffenses, 10)
  }

  /**
   * Check alert thresholds
   */
  private checkAlertThresholds(error: SecurityErrorDetails): void {
    const alertConfig = this.alertConfigs.get(error.type)
    if (!alertConfig || !alertConfig.enabled) return
    
    const identifier = `${error.type}:${error.userId || error.ip || 'global'}`
    const errorData = this.errorCounts.get(identifier)
    
    if (errorData && errorData.count >= alertConfig.threshold) {
      const timeWindow = error.timestamp - errorData.firstOccurrence
      if (timeWindow <= alertConfig.timeWindow) {
        this.triggerSecurityAlert(error, alertConfig, errorData.count)
      }
    }
  }

  /**
   * Trigger security alert
   */
  private triggerSecurityAlert(error: SecurityErrorDetails, config: SecurityAlertConfig, count: number): void {
    const alert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: error.type,
      severity: error.severity,
      message: `Security alert: ${count} occurrences of ${error.type}`,
      error,
      config,
      triggeredAt: Date.now()
    }
    
    console.error(`🚨 SECURITY ALERT: ${alert.message}`)
    
    // In production, this would trigger notifications to security team
    this.sendSecurityAlert(alert)
  }

  /**
   * Send security alert (placeholder for actual implementation)
   */
  private sendSecurityAlert(alert: any): void {
    // Implementation would send to:
    // - Security team via email/SMS
    // - SIEM system
    // - Incident response platform
    // - Monitoring dashboards
    
    console.log('📧 Security alert sent to incident response team')
  }

  /**
   * Create or update security incident
   */
  private createOrUpdateIncident(error: SecurityErrorDetails): void {
    const incidentKey = `${error.type}:${error.userId || error.ip || 'global'}`
    const existing = this.incidents.get(incidentKey)
    
    if (existing && existing.status === 'open') {
      // Update existing incident
      existing.affectedUsers = Array.from(new Set([...existing.affectedUsers, error.userId || 'unknown']))
      existing.affectedProviders = Array.from(new Set([...existing.affectedProviders, error.providerId || 'unknown']))
      existing.actions.push({
        timestamp: error.timestamp,
        action: 'Additional occurrence detected',
        performer: 'system',
        result: `Error count increased`
      })
    } else {
      // Create new incident
      const incident: SecurityIncident = {
        id: `incident_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: error.type,
        severity: error.severity,
        description: `Security incident: ${error.message}`,
        affectedUsers: [error.userId || 'unknown'],
        affectedProviders: [error.providerId || 'unknown'],
        startTime: error.timestamp,
        status: 'open',
        actions: [{
          timestamp: error.timestamp,
          action: 'Incident created',
          performer: 'system',
          result: 'Security incident automatically created'
        }],
        evidence: [{
          type: 'log',
          description: 'Security error log entry',
          location: 'security-logs',
          timestamp: error.timestamp
        }]
      }
      
      this.incidents.set(incidentKey, incident)
      console.log(`📋 Security incident created: ${incident.id}`)
    }
  }

  /**
   * Sanitize error message to prevent information leakage
   */
  private sanitizeErrorMessage(message: string): string {
    // Remove sensitive information from error messages
    return message
      .replace(/password[s]?[\s]*[:=][\s]*[\w\d!@#$%^&*()]+/gi, 'password=[REDACTED]')
      .replace(/token[s]?[\s]*[:=][\s]*[\w\d\-_\.]+/gi, 'token=[REDACTED]')
      .replace(/key[s]?[\s]*[:=][\s]*[\w\d\-_\.]+/gi, 'key=[REDACTED]')
      .replace(/secret[s]?[\s]*[:=][\s]*[\w\d\-_\.]+/gi, 'secret=[REDACTED]')
      .replace(/\b\d{16}\b/g, '[CARD_NUMBER_REDACTED]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN_REDACTED]')
  }

  /**
   * Convert severity to log level
   */
  private severityToLogLevel(severity: SecuritySeverity): string {
    switch (severity) {
      case SecuritySeverity.LOW: return 'info'
      case SecuritySeverity.MEDIUM: return 'warn'
      case SecuritySeverity.HIGH: return 'error'
      case SecuritySeverity.CRITICAL: return 'fatal'
    }
  }

  /**
   * Initialize default alert configurations
   */
  private initializeDefaultAlerts(): void {
    const defaultAlerts: SecurityAlertConfig[] = [
      {
        errorType: SecurityErrorType.AUTHENTICATION_FAILED,
        severity: SecuritySeverity.MEDIUM,
        threshold: 5,
        timeWindow: 300000, // 5 minutes
        escalationDelay: 900000, // 15 minutes
        recipients: ['security@company.com'],
        enabled: true
      },
      {
        errorType: SecurityErrorType.INJECTION_ATTEMPT,
        severity: SecuritySeverity.CRITICAL,
        threshold: 1,
        timeWindow: 60000, // 1 minute
        escalationDelay: 300000, // 5 minutes
        recipients: ['security@company.com', 'incident-response@company.com'],
        enabled: true
      },
      {
        errorType: SecurityErrorType.SUSPICIOUS_ACTIVITY,
        severity: SecuritySeverity.HIGH,
        threshold: 3,
        timeWindow: 600000, // 10 minutes
        escalationDelay: 1800000, // 30 minutes
        recipients: ['security@company.com'],
        enabled: true
      }
    ]
    
    for (const alert of defaultAlerts) {
      this.configureAlert(alert)
    }
  }

  /**
   * Check if error is SecurityErrorDetails
   */
  private isSecurityErrorDetails(error: any): error is SecurityErrorDetails {
    return error && typeof error === 'object' && 'type' in error && 'severity' in error
  }

  /**
   * Cleanup old data
   */
  private cleanup(): void {
    const now = Date.now()
    const cleanupAge = 24 * 60 * 60 * 1000 // 24 hours
    let cleaned = 0
    
    // Cleanup old error counts
    for (const [key, data] of this.errorCounts.entries()) {
      if (now - data.lastOccurrence > cleanupAge) {
        this.errorCounts.delete(key)
        cleaned++
      }
    }
    
    // Cleanup old suspicious activity
    for (const [key, activities] of this.suspiciousActivity.entries()) {
      const filtered = activities.filter(a => now - a.timestamp < cleanupAge)
      if (filtered.length === 0) {
        this.suspiciousActivity.delete(key)
        cleaned++
      } else if (filtered.length !== activities.length) {
        this.suspiciousActivity.set(key, filtered)
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Security data cleanup: ${cleaned} entries removed`)
    }
  }

  /**
   * Shutdown security error handler
   */
  shutdown(): void {
    clearInterval(this.cleanupInterval)
    
    this.errorCounts.clear()
    this.incidents.clear()
    this.alertConfigs.clear()
    this.blockedIPs.clear()
    this.blockedUsers.clear()
    this.suspiciousActivity.clear()
    
    console.log('🛑 Security error handler shutdown')
  }
}

/**
 * Global security error handler instance
 */
export const securityErrorHandler = new SecurityErrorHandler()

/**
 * Security error decorator for automatic error handling
 */
export function SecurityMonitored(options: {
  errorType?: SecurityErrorType
  severity?: SecuritySeverity
  autoBlock?: boolean
} = {}) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value

    descriptor.value = async function (this: any, ...args: any[]) {
      const userId = args[args.length - 1] // Assume last arg is userId
      const providerId = this.providerId
      
      try {
        return await method.apply(this, args)
      } catch (error: any) {
        const errorDetails = securityErrorHandler.handleSecurityError(error, {
          userId,
          providerId,
          endpoint: propertyName,
          requestId: `${propertyName}_${Date.now()}`
        })
        
        // Override classification if specified
        if (options.errorType) {
          errorDetails.type = options.errorType
        }
        if (options.severity) {
          errorDetails.severity = options.severity
        }
        if (options.autoBlock) {
          errorDetails.shouldBlock = true
        }
        
        throw error
      }
    }

    return descriptor
  }
}