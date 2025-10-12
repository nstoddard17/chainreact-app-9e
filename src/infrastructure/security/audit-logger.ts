import { createHash, createHmac } from 'crypto'
import { EventEmitter } from 'events'

import { logger } from '@/lib/utils/logger'

/**
 * Audit event types
 */
export enum AuditEventType {
  // Authentication events
  USER_LOGIN = 'user_login',
  USER_LOGOUT = 'user_logout',
  LOGIN_FAILED = 'login_failed',
  PASSWORD_CHANGED = 'password_changed',
  MFA_ENABLED = 'mfa_enabled',
  MFA_DISABLED = 'mfa_disabled',
  
  // Authorization events
  PERMISSION_GRANTED = 'permission_granted',
  PERMISSION_DENIED = 'permission_denied',
  ROLE_ASSIGNED = 'role_assigned',
  ROLE_REMOVED = 'role_removed',
  
  // Data access events
  DATA_READ = 'data_read',
  DATA_CREATED = 'data_created',
  DATA_UPDATED = 'data_updated',
  DATA_DELETED = 'data_deleted',
  DATA_EXPORTED = 'data_exported',
  DATA_IMPORTED = 'data_imported',
  
  // System events
  SYSTEM_STARTUP = 'system_startup',
  SYSTEM_SHUTDOWN = 'system_shutdown',
  CONFIG_CHANGED = 'config_changed',
  BACKUP_CREATED = 'backup_created',
  BACKUP_RESTORED = 'backup_restored',
  
  // Security events
  SECURITY_ALERT = 'security_alert',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  BREACH_DETECTED = 'breach_detected',
  IP_BLOCKED = 'ip_blocked',
  USER_BLOCKED = 'user_blocked',
  
  // Integration events
  INTEGRATION_CONNECTED = 'integration_connected',
  INTEGRATION_DISCONNECTED = 'integration_disconnected',
  INTEGRATION_ERROR = 'integration_error',
  API_CALL = 'api_call',
  WEBHOOK_RECEIVED = 'webhook_received',
  
  // Compliance events
  GDPR_REQUEST = 'gdpr_request',
  DATA_RETENTION_POLICY_APPLIED = 'data_retention_policy_applied',
  COMPLIANCE_VIOLATION = 'compliance_violation',
  AUDIT_EXPORT = 'audit_export',
  
  // Token events
  TOKEN_CREATED = 'token_created',
  TOKEN_ACCESSED = 'token_accessed',
  TOKEN_REFRESHED = 'token_refreshed',
  TOKEN_REVOKED = 'token_revoked',
  TOKEN_EXPIRED = 'token_expired'
}

/**
 * Audit severity levels
 */
export enum AuditSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

/**
 * Compliance frameworks
 */
export enum ComplianceFramework {
  GDPR = 'gdpr',
  HIPAA = 'hipaa',
  SOX = 'sox',
  PCI_DSS = 'pci_dss',
  SOC2 = 'soc2',
  ISO27001 = 'iso27001',
  CCPA = 'ccpa'
}

/**
 * Audit event structure
 */
export interface AuditEvent {
  id: string
  type: AuditEventType
  severity: AuditSeverity
  timestamp: number
  userId?: string
  sessionId?: string
  ip?: string
  userAgent?: string
  resource?: string
  action: string
  outcome: 'success' | 'failure' | 'partial'
  description: string
  metadata?: Record<string, any>
  dataClassification?: 'public' | 'internal' | 'confidential' | 'restricted'
  complianceFrameworks?: ComplianceFramework[]
  retention: {
    retainUntil: number
    reasons: string[]
    canDelete: boolean
  }
  integrity: {
    hash: string
    signature?: string
  }
}

/**
 * Compliance rule configuration
 */
export interface ComplianceRule {
  id: string
  framework: ComplianceFramework
  name: string
  description: string
  eventTypes: AuditEventType[]
  retentionPeriod: number // milliseconds
  alertThreshold?: number
  monitoringEnabled: boolean
  automatedResponse?: string
}

/**
 * Audit search criteria
 */
export interface AuditSearchCriteria {
  eventTypes?: AuditEventType[]
  severities?: AuditSeverity[]
  userId?: string
  ip?: string
  resource?: string
  startTime?: number
  endTime?: number
  outcome?: 'success' | 'failure' | 'partial'
  complianceFramework?: ComplianceFramework
  limit?: number
  offset?: number
}

/**
 * Audit report configuration
 */
export interface AuditReportConfig {
  title: string
  description: string
  criteria: AuditSearchCriteria
  format: 'json' | 'csv' | 'pdf'
  includeMetadata: boolean
  complianceFramework?: ComplianceFramework
  recipient?: string
  schedule?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'quarterly'
    day?: number
    time?: string
  }
}

/**
 * Compliance status
 */
export interface ComplianceStatus {
  framework: ComplianceFramework
  compliant: boolean
  lastCheck: number
  violations: Array<{
    ruleId: string
    description: string
    severity: AuditSeverity
    detectedAt: number
    resolved: boolean
  }>
  recommendations: string[]
  nextReview: number
}

/**
 * Comprehensive audit logging system for security and compliance
 */
export class AuditLogger extends EventEmitter {
  private events: AuditEvent[] = []
  private complianceRules = new Map<string, ComplianceRule>()
  private reports = new Map<string, AuditReportConfig>()
  private integrityKey: Buffer
  private retentionCheckInterval: NodeJS.Timeout | null = null
  private complianceCheckInterval: NodeJS.Timeout | null = null

  constructor(integrityKey?: string) {
    super()
    
    this.integrityKey = Buffer.from(integrityKey || this.generateIntegrityKey(), 'base64')
    this.initializeComplianceRules()
    this.startRetentionMonitoring()
    this.startComplianceMonitoring()
    
    logger.debug('📋 Audit logger initialized with compliance monitoring')
  }

  /**
   * Log audit event
   */
  async logEvent(event: Omit<AuditEvent, 'id' | 'timestamp' | 'integrity' | 'retention'>): Promise<string> {
    const eventId = this.generateEventId()
    const timestamp = Date.now()
    
    // Determine retention based on compliance rules
    const retention = this.calculateRetention(event.type, event.complianceFrameworks)
    
    const fullEvent: AuditEvent = {
      ...event,
      id: eventId,
      timestamp,
      retention,
      integrity: {
        hash: '',
        signature: undefined
      }
    }
    
    // Calculate integrity hash
    fullEvent.integrity.hash = this.calculateEventHash(fullEvent)
    fullEvent.integrity.signature = this.signEvent(fullEvent)
    
    // Store event
    this.events.push(fullEvent)
    
    // Check compliance rules
    this.checkComplianceRules(fullEvent)
    
    // Emit event for real-time monitoring
    this.emit('eventLogged', fullEvent)
    
    logger.debug(`📝 Audit event logged: ${eventId} (${event.type})`)
    return eventId
  }

  /**
   * Log user authentication events
   */
  async logAuthentication(outcome: 'success' | 'failure', details: {
    userId?: string
    sessionId?: string
    ip?: string
    userAgent?: string
    method?: string
    reason?: string
  }): Promise<string> {
    return this.logEvent({
      type: outcome === 'success' ? AuditEventType.USER_LOGIN : AuditEventType.LOGIN_FAILED,
      severity: outcome === 'success' ? AuditSeverity.INFO : AuditSeverity.WARNING,
      action: 'authenticate',
      outcome,
      description: outcome === 'success' ? 'User authentication successful' : `User authentication failed: ${details.reason}`,
      userId: details.userId,
      sessionId: details.sessionId,
      ip: details.ip,
      userAgent: details.userAgent,
      metadata: {
        authMethod: details.method,
        failureReason: details.reason
      },
      complianceFrameworks: [ComplianceFramework.SOC2, ComplianceFramework.ISO27001]
    })
  }

  /**
   * Log data access events
   */
  async logDataAccess(operation: 'read' | 'create' | 'update' | 'delete' | 'export', details: {
    userId: string
    resource: string
    recordCount?: number
    dataClassification?: AuditEvent['dataClassification']
    outcome: 'success' | 'failure'
    reason?: string
    ip?: string
    sessionId?: string
  }): Promise<string> {
    const eventTypeMap = {
      read: AuditEventType.DATA_READ,
      create: AuditEventType.DATA_CREATED,
      update: AuditEventType.DATA_UPDATED,
      delete: AuditEventType.DATA_DELETED,
      export: AuditEventType.DATA_EXPORTED
    }

    const severity = details.outcome === 'failure' ? AuditSeverity.WARNING : 
                    details.dataClassification === 'restricted' ? AuditSeverity.WARNING : AuditSeverity.INFO

    return this.logEvent({
      type: eventTypeMap[operation],
      severity,
      action: `data_${operation}`,
      outcome: details.outcome,
      description: `Data ${operation} ${details.outcome} for resource: ${details.resource}`,
      userId: details.userId,
      sessionId: details.sessionId,
      ip: details.ip,
      resource: details.resource,
      dataClassification: details.dataClassification,
      metadata: {
        recordCount: details.recordCount,
        failureReason: details.reason
      },
      complianceFrameworks: [
        ComplianceFramework.GDPR,
        ComplianceFramework.HIPAA,
        ComplianceFramework.SOC2
      ]
    })
  }

  /**
   * Log security events
   */
  async logSecurityEvent(type: AuditEventType, details: {
    severity: AuditSeverity
    description: string
    userId?: string
    ip?: string
    resource?: string
    outcome: 'success' | 'failure'
    metadata?: Record<string, any>
  }): Promise<string> {
    return this.logEvent({
      type,
      severity: details.severity,
      action: 'security_event',
      outcome: details.outcome,
      description: details.description,
      userId: details.userId,
      ip: details.ip,
      resource: details.resource,
      metadata: details.metadata,
      complianceFrameworks: [
        ComplianceFramework.SOC2,
        ComplianceFramework.ISO27001,
        ComplianceFramework.PCI_DSS
      ]
    })
  }

  /**
   * Log integration events
   */
  async logIntegrationEvent(providerId: string, event: 'connected' | 'disconnected' | 'error' | 'api_call', details: {
    userId: string
    outcome: 'success' | 'failure'
    description: string
    endpoint?: string
    responseTime?: number
    metadata?: Record<string, any>
  }): Promise<string> {
    const eventTypeMap = {
      connected: AuditEventType.INTEGRATION_CONNECTED,
      disconnected: AuditEventType.INTEGRATION_DISCONNECTED,
      error: AuditEventType.INTEGRATION_ERROR,
      api_call: AuditEventType.API_CALL
    }

    return this.logEvent({
      type: eventTypeMap[event],
      severity: details.outcome === 'failure' ? AuditSeverity.ERROR : AuditSeverity.INFO,
      action: `integration_${event}`,
      outcome: details.outcome,
      description: details.description,
      userId: details.userId,
      resource: providerId,
      metadata: {
        providerId,
        endpoint: details.endpoint,
        responseTime: details.responseTime,
        ...details.metadata
      },
      complianceFrameworks: [ComplianceFramework.SOC2]
    })
  }

  /**
   * Search audit events
   */
  searchEvents(criteria: AuditSearchCriteria): AuditEvent[] {
    let results = this.events

    // Apply filters
    if (criteria.eventTypes) {
      results = results.filter(event => criteria.eventTypes!.includes(event.type))
    }
    
    if (criteria.severities) {
      results = results.filter(event => criteria.severities!.includes(event.severity))
    }
    
    if (criteria.userId) {
      results = results.filter(event => event.userId === criteria.userId)
    }
    
    if (criteria.ip) {
      results = results.filter(event => event.ip === criteria.ip)
    }
    
    if (criteria.resource) {
      results = results.filter(event => event.resource?.includes(criteria.resource!))
    }
    
    if (criteria.startTime) {
      results = results.filter(event => event.timestamp >= criteria.startTime!)
    }
    
    if (criteria.endTime) {
      results = results.filter(event => event.timestamp <= criteria.endTime!)
    }
    
    if (criteria.outcome) {
      results = results.filter(event => event.outcome === criteria.outcome)
    }
    
    if (criteria.complianceFramework) {
      results = results.filter(event => 
        event.complianceFrameworks?.includes(criteria.complianceFramework!)
      )
    }

    // Sort by timestamp (newest first)
    results.sort((a, b) => b.timestamp - a.timestamp)

    // Apply pagination
    if (criteria.offset) {
      results = results.slice(criteria.offset)
    }
    
    if (criteria.limit) {
      results = results.slice(0, criteria.limit)
    }

    return results
  }

  /**
   * Generate audit report
   */
  generateReport(config: AuditReportConfig): {
    metadata: {
      title: string
      generatedAt: number
      eventCount: number
      timeRange: { start?: number; end?: number }
    }
    events: AuditEvent[]
    summary: {
      byType: Record<string, number>
      bySeverity: Record<string, number>
      byOutcome: Record<string, number>
      byUser: Record<string, number>
    }
  } {
    const events = this.searchEvents(config.criteria)
    
    // Calculate summary statistics
    const byType: Record<string, number> = {}
    const bySeverity: Record<string, number> = {}
    const byOutcome: Record<string, number> = {}
    const byUser: Record<string, number> = {}
    
    for (const event of events) {
      byType[event.type] = (byType[event.type] || 0) + 1
      bySeverity[event.severity] = (bySeverity[event.severity] || 0) + 1
      byOutcome[event.outcome] = (byOutcome[event.outcome] || 0) + 1
      
      if (event.userId) {
        byUser[event.userId] = (byUser[event.userId] || 0) + 1
      }
    }
    
    return {
      metadata: {
        title: config.title,
        generatedAt: Date.now(),
        eventCount: events.length,
        timeRange: {
          start: config.criteria.startTime,
          end: config.criteria.endTime
        }
      },
      events: config.includeMetadata ? events : events.map(event => ({
        ...event,
        metadata: undefined
      })),
      summary: {
        byType,
        bySeverity,
        byOutcome,
        byUser
      }
    }
  }

  /**
   * Check compliance status
   */
  checkComplianceStatus(framework: ComplianceFramework): ComplianceStatus {
    const rules = Array.from(this.complianceRules.values())
      .filter(rule => rule.framework === framework)
    
    const violations: ComplianceStatus['violations'] = []
    let compliant = true
    
    for (const rule of rules) {
      if (!rule.monitoringEnabled) continue
      
      // Check for rule violations
      const recentEvents = this.searchEvents({
        eventTypes: rule.eventTypes,
        startTime: Date.now() - (24 * 60 * 60 * 1000) // Last 24 hours
      })
      
      if (rule.alertThreshold && recentEvents.length > rule.alertThreshold) {
        violations.push({
          ruleId: rule.id,
          description: `Threshold exceeded: ${recentEvents.length} events > ${rule.alertThreshold}`,
          severity: AuditSeverity.WARNING,
          detectedAt: Date.now(),
          resolved: false
        })
        compliant = false
      }
      
      // Check retention compliance
      const oldEvents = this.events.filter(event => 
        event.complianceFrameworks?.includes(framework) &&
        event.timestamp < Date.now() - rule.retentionPeriod
      )
      
      if (oldEvents.length > 0) {
        violations.push({
          ruleId: rule.id,
          description: `${oldEvents.length} events exceed retention period`,
          severity: AuditSeverity.ERROR,
          detectedAt: Date.now(),
          resolved: false
        })
        compliant = false
      }
    }
    
    const recommendations = this.generateComplianceRecommendations(framework, violations)
    
    return {
      framework,
      compliant,
      lastCheck: Date.now(),
      violations,
      recommendations,
      nextReview: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
    }
  }

  /**
   * Configure compliance rule
   */
  configureComplianceRule(rule: ComplianceRule): void {
    this.complianceRules.set(rule.id, rule)
    logger.debug(`📏 Compliance rule configured: ${rule.id} (${rule.framework})`)
  }

  /**
   * Export audit events for compliance
   */
  exportForCompliance(framework: ComplianceFramework, timeRange: { start: number; end: number }): {
    exportId: string
    eventCount: number
    integrity: {
      hash: string
      signature: string
    }
    events: AuditEvent[]
  } {
    const events = this.searchEvents({
      complianceFramework: framework,
      startTime: timeRange.start,
      endTime: timeRange.end
    })
    
    const exportId = this.generateEventId()
    const exportData = JSON.stringify(events)
    const hash = createHash('sha256').update(exportData).digest('hex')
    const signature = createHmac('sha256', this.integrityKey).update(exportData).digest('hex')
    
    // Log the export event
    this.logEvent({
      type: AuditEventType.AUDIT_EXPORT,
      severity: AuditSeverity.INFO,
      action: 'compliance_export',
      outcome: 'success',
      description: `Audit export for ${framework} compliance`,
      metadata: {
        exportId,
        framework,
        eventCount: events.length,
        timeRange
      },
      complianceFrameworks: [framework]
    })
    
    return {
      exportId,
      eventCount: events.length,
      integrity: { hash, signature },
      events
    }
  }

  /**
   * Verify event integrity
   */
  verifyEventIntegrity(event: AuditEvent): boolean {
    const originalHash = event.integrity.hash
    const tempEvent = { ...event, integrity: { hash: '', signature: undefined } }
    const calculatedHash = this.calculateEventHash(tempEvent)
    
    return originalHash === calculatedHash
  }

  /**
   * Get audit statistics
   */
  getAuditStatistics(): {
    totalEvents: number
    eventsByType: Record<AuditEventType, number>
    eventsBySeverity: Record<AuditSeverity, number>
    eventsLast24Hours: number
    complianceStatus: Record<ComplianceFramework, boolean>
    integrityStatus: { verified: number; failed: number }
  } {
    const eventsByType = {} as Record<AuditEventType, number>
    const eventsBySeverity = {} as Record<AuditSeverity, number>
    const complianceStatus = {} as Record<ComplianceFramework, boolean>
    
    let integrityVerified = 0
    let integrityFailed = 0
    
    const last24Hours = Date.now() - (24 * 60 * 60 * 1000)
    let eventsLast24Hours = 0
    
    for (const event of this.events) {
      // Count by type
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1
      
      // Count by severity
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1
      
      // Count recent events
      if (event.timestamp >= last24Hours) {
        eventsLast24Hours++
      }
      
      // Check integrity
      if (this.verifyEventIntegrity(event)) {
        integrityVerified++
      } else {
        integrityFailed++
      }
    }
    
    // Check compliance status for each framework
    for (const framework of Object.values(ComplianceFramework)) {
      const status = this.checkComplianceStatus(framework)
      complianceStatus[framework] = status.compliant
    }
    
    return {
      totalEvents: this.events.length,
      eventsByType,
      eventsBySeverity,
      eventsLast24Hours,
      complianceStatus,
      integrityStatus: {
        verified: integrityVerified,
        failed: integrityFailed
      }
    }
  }

  /**
   * Calculate event hash for integrity verification
   */
  private calculateEventHash(event: Omit<AuditEvent, 'integrity'>): string {
    const eventString = JSON.stringify({
      id: event.id,
      type: event.type,
      timestamp: event.timestamp,
      userId: event.userId,
      action: event.action,
      outcome: event.outcome,
      resource: event.resource,
      description: event.description
    })
    
    return createHash('sha256').update(eventString).digest('hex')
  }

  /**
   * Sign event for non-repudiation
   */
  private signEvent(event: AuditEvent): string {
    return createHmac('sha256', this.integrityKey)
      .update(event.integrity.hash)
      .digest('hex')
  }

  /**
   * Calculate retention period based on compliance rules
   */
  private calculateRetention(eventType: AuditEventType, frameworks?: ComplianceFramework[]): AuditEvent['retention'] {
    let maxRetention = 0
    const reasons: string[] = []
    
    // Check applicable compliance rules
    for (const rule of this.complianceRules.values()) {
      if (rule.eventTypes.includes(eventType)) {
        if (rule.retentionPeriod > maxRetention) {
          maxRetention = rule.retentionPeriod
        }
        reasons.push(`${rule.framework}: ${rule.name}`)
      }
    }
    
    // Default retention if no rules apply
    if (maxRetention === 0) {
      maxRetention = 7 * 365 * 24 * 60 * 60 * 1000 // 7 years default
      reasons.push('Default retention policy')
    }
    
    return {
      retainUntil: Date.now() + maxRetention,
      reasons,
      canDelete: false // Never allow deletion of audit events
    }
  }

  /**
   * Check compliance rules against new event
   */
  private checkComplianceRules(event: AuditEvent): void {
    for (const rule of this.complianceRules.values()) {
      if (!rule.monitoringEnabled || !rule.eventTypes.includes(event.type)) {
        continue
      }
      
      if (rule.alertThreshold) {
        const recentEvents = this.searchEvents({
          eventTypes: [event.type],
          startTime: Date.now() - (60 * 60 * 1000) // Last hour
        })
        
        if (recentEvents.length >= rule.alertThreshold) {
          this.emit('complianceAlert', {
            ruleId: rule.id,
            framework: rule.framework,
            message: `Threshold exceeded for ${event.type}`,
            eventCount: recentEvents.length,
            threshold: rule.alertThreshold
          })
        }
      }
      
      if (rule.automatedResponse) {
        this.emit('automatedResponse', {
          rule,
          event,
          response: rule.automatedResponse
        })
      }
    }
  }

  /**
   * Generate compliance recommendations
   */
  private generateComplianceRecommendations(framework: ComplianceFramework, violations: ComplianceStatus['violations']): string[] {
    const recommendations: string[] = []
    
    if (violations.length === 0) {
      recommendations.push(`${framework} compliance status is good`)
    } else {
      recommendations.push('Address the following compliance violations:')
      for (const violation of violations) {
        recommendations.push(`- ${violation.description}`)
      }
    }
    
    // Framework-specific recommendations
    switch (framework) {
      case ComplianceFramework.GDPR:
        recommendations.push('Ensure data subject rights are properly implemented')
        recommendations.push('Review data processing activities regularly')
        break
      case ComplianceFramework.HIPAA:
        recommendations.push('Implement proper PHI access controls')
        recommendations.push('Conduct regular risk assessments')
        break
      case ComplianceFramework.SOC2:
        recommendations.push('Maintain detailed access logs')
        recommendations.push('Implement monitoring and alerting')
        break
    }
    
    return recommendations
  }

  /**
   * Initialize default compliance rules
   */
  private initializeComplianceRules(): void {
    const defaultRules: ComplianceRule[] = [
      {
        id: 'gdpr-data-access',
        framework: ComplianceFramework.GDPR,
        name: 'GDPR Data Access Monitoring',
        description: 'Monitor data access for GDPR compliance',
        eventTypes: [AuditEventType.DATA_READ, AuditEventType.DATA_EXPORTED],
        retentionPeriod: 6 * 365 * 24 * 60 * 60 * 1000, // 6 years
        alertThreshold: 100,
        monitoringEnabled: true
      },
      {
        id: 'soc2-security-events',
        framework: ComplianceFramework.SOC2,
        name: 'SOC2 Security Event Monitoring',
        description: 'Monitor security events for SOC2 compliance',
        eventTypes: [
          AuditEventType.LOGIN_FAILED,
          AuditEventType.PERMISSION_DENIED,
          AuditEventType.SUSPICIOUS_ACTIVITY
        ],
        retentionPeriod: 3 * 365 * 24 * 60 * 60 * 1000, // 3 years
        alertThreshold: 10,
        monitoringEnabled: true
      },
      {
        id: 'hipaa-phi-access',
        framework: ComplianceFramework.HIPAA,
        name: 'HIPAA PHI Access Monitoring',
        description: 'Monitor PHI access for HIPAA compliance',
        eventTypes: [
          AuditEventType.DATA_READ,
          AuditEventType.DATA_CREATED,
          AuditEventType.DATA_UPDATED,
          AuditEventType.DATA_DELETED
        ],
        retentionPeriod: 6 * 365 * 24 * 60 * 60 * 1000, // 6 years
        monitoringEnabled: true
      }
    ]
    
    for (const rule of defaultRules) {
      this.configureComplianceRule(rule)
    }
  }

  /**
   * Start retention monitoring
   */
  private startRetentionMonitoring(): void {
    this.retentionCheckInterval = setInterval(() => {
      this.performRetentionCheck()
    }, 24 * 60 * 60 * 1000) // Check daily
  }

  /**
   * Start compliance monitoring
   */
  private startComplianceMonitoring(): void {
    this.complianceCheckInterval = setInterval(() => {
      this.performComplianceCheck()
    }, 60 * 60 * 1000) // Check hourly
  }

  /**
   * Perform retention check
   */
  private performRetentionCheck(): void {
    const now = Date.now()
    let expiredCount = 0
    
    // Note: In a real implementation, we would archive rather than delete
    for (const event of this.events) {
      if (event.retention.retainUntil <= now && event.retention.canDelete) {
        // Archive the event (placeholder for actual archiving logic)
        expiredCount++
      }
    }
    
    if (expiredCount > 0) {
      logger.debug(`📦 Retention check: ${expiredCount} events ready for archival`)
    }
  }

  /**
   * Perform compliance check
   */
  private performComplianceCheck(): void {
    const frameworks = Object.values(ComplianceFramework)
    let violationCount = 0
    
    for (const framework of frameworks) {
      const status = this.checkComplianceStatus(framework)
      if (!status.compliant) {
        violationCount += status.violations.length
        this.emit('complianceViolation', status)
      }
    }
    
    if (violationCount > 0) {
      logger.warn(`⚠️ Compliance check: ${violationCount} violations detected`)
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Generate integrity key
   */
  private generateIntegrityKey(): string {
    return require('crypto').randomBytes(32).toString('base64')
  }

  /**
   * Shutdown audit logger
   */
  shutdown(): void {
    if (this.retentionCheckInterval) {
      clearInterval(this.retentionCheckInterval)
      this.retentionCheckInterval = null
    }
    
    if (this.complianceCheckInterval) {
      clearInterval(this.complianceCheckInterval)
      this.complianceCheckInterval = null
    }
    
    this.removeAllListeners()
    logger.debug('🛑 Audit logger shutdown')
  }
}

/**
 * Global audit logger instance
 */
export const auditLogger = new AuditLogger(process.env.AUDIT_INTEGRITY_KEY)

/**
 * Audit logging decorator
 */
export function Audited(options: {
  eventType: AuditEventType
  description?: string
  severity?: AuditSeverity
  dataClassification?: AuditEvent['dataClassification']
  complianceFrameworks?: ComplianceFramework[]
} = { eventType: AuditEventType.API_CALL }) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value

    descriptor.value = async function (this: any, ...args: any[]) {
      const userId = args[args.length - 1] // Assume last arg is userId
      const providerId = this.providerId || 'unknown'
      
      const startTime = Date.now()
      let outcome: 'success' | 'failure' = 'success'
      let error: Error | undefined
      
      try {
        const result = await method.apply(this, args)
        return result
      } catch (err: any) {
        outcome = 'failure'
        error = err
        throw err
      } finally {
        const endTime = Date.now()
        
        await auditLogger.logEvent({
          type: options.eventType,
          severity: options.severity || (outcome === 'failure' ? AuditSeverity.ERROR : AuditSeverity.INFO),
          action: propertyName,
          outcome,
          description: options.description || `${propertyName} operation ${outcome}`,
          userId,
          resource: providerId,
          dataClassification: options.dataClassification,
          complianceFrameworks: options.complianceFrameworks,
          metadata: {
            method: propertyName,
            duration: endTime - startTime,
            error: error?.message,
            providerId
          }
        })
      }
    }

    return descriptor
  }
}