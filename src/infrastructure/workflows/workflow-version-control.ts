import { EventEmitter } from 'events'
import { createHash } from 'crypto'
import { WorkflowDefinition, WorkflowStatus } from './workflow-engine'
import { auditLogger, AuditEventType } from '../security/audit-logger'

/**
 * Version change type
 */
export enum ChangeType {
  MAJOR = 'major',      // Breaking changes
  MINOR = 'minor',      // New features, backward compatible
  PATCH = 'patch',      // Bug fixes, backward compatible
  HOTFIX = 'hotfix'     // Emergency fixes
}

/**
 * Version status
 */
export enum VersionStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  DEPRECATED = 'deprecated',
  ARCHIVED = 'archived'
}

/**
 * Deployment strategy
 */
export enum DeploymentStrategy {
  IMMEDIATE = 'immediate',
  BLUE_GREEN = 'blue_green',
  CANARY = 'canary',
  ROLLING = 'rolling',
  SCHEDULED = 'scheduled'
}

/**
 * Change record
 */
export interface WorkflowChange {
  id: string
  workflowId: string
  version: number
  previousVersion?: number
  changeType: ChangeType
  changeset: WorkflowChangeset
  author: string
  timestamp: number
  message: string
  tags: string[]
  reviewers: string[]
  approved: boolean
  approvedBy?: string
  approvedAt?: number
}

/**
 * Changeset details
 */
export interface WorkflowChangeset {
  nodesAdded: Array<{ nodeId: string; type: string; data: any }>
  nodesRemoved: Array<{ nodeId: string; type: string }>
  nodesModified: Array<{
    nodeId: string
    field: string
    oldValue: any
    newValue: any
  }>
  edgesAdded: Array<{ edgeId: string; source: string; target: string }>
  edgesRemoved: Array<{ edgeId: string; source: string; target: string }>
  edgesModified: Array<{
    edgeId: string
    field: string
    oldValue: any
    newValue: any
  }>
  variablesAdded: Array<{ name: string; type: string; value: any }>
  variablesRemoved: Array<{ name: string }>
  variablesModified: Array<{
    name: string
    field: string
    oldValue: any
    newValue: any
  }>
  settingsModified: Array<{
    field: string
    oldValue: any
    newValue: any
  }>
  triggersAdded: Array<{ triggerId: string; type: string; config: any }>
  triggersRemoved: Array<{ triggerId: string }>
  triggersModified: Array<{
    triggerId: string
    field: string
    oldValue: any
    newValue: any
  }>
}

/**
 * Version metadata
 */
export interface WorkflowVersion {
  id: string
  workflowId: string
  version: number
  status: VersionStatus
  definition: WorkflowDefinition
  checksum: string
  createdBy: string
  createdAt: number
  publishedAt?: number
  deprecatedAt?: number
  archivedAt?: number
  parentVersion?: number
  childVersions: number[]
  changeLog: string
  tags: string[]
  metadata: {
    deploymentStrategy: DeploymentStrategy
    rollbackStrategy: string
    testResults?: TestResults
    performanceMetrics?: PerformanceMetrics
    securityScan?: SecurityScanResults
  }
}

/**
 * Test results
 */
export interface TestResults {
  passed: boolean
  totalTests: number
  passedTests: number
  failedTests: number
  coverage: number
  testSuites: Array<{
    name: string
    passed: boolean
    duration: number
    tests: Array<{
      name: string
      passed: boolean
      error?: string
      duration: number
    }>
  }>
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  averageExecutionTime: number
  memoryUsage: number
  cpuUsage: number
  throughput: number
  errorRate: number
  successRate: number
  benchmarkResults: Array<{
    scenario: string
    executionTime: number
    memoryPeak: number
    iterations: number
  }>
}

/**
 * Security scan results
 */
export interface SecurityScanResults {
  passed: boolean
  vulnerabilities: Array<{
    id: string
    severity: 'low' | 'medium' | 'high' | 'critical'
    type: string
    description: string
    location: string
    recommendation: string
  }>
  complianceChecks: Array<{
    framework: string
    passed: boolean
    requirements: Array<{
      requirement: string
      passed: boolean
      details: string
    }>
  }>
}

/**
 * Rollback options
 */
export interface RollbackOptions {
  targetVersion: number
  strategy: 'immediate' | 'gradual' | 'staged'
  preserveData: boolean
  notifyUsers: boolean
  createBackup: boolean
  validationSteps: string[]
}

/**
 * Deployment result
 */
export interface DeploymentResult {
  success: boolean
  version: number
  deployedAt: number
  strategy: DeploymentStrategy
  rollbackVersion?: number
  metrics: {
    deploymentTime: number
    validationTime: number
    rollbackTime?: number
  }
  issues: Array<{
    severity: string
    message: string
    component: string
  }>
}

/**
 * Advanced workflow version control system
 */
export class WorkflowVersionControl extends EventEmitter {
  private versions = new Map<string, Map<number, WorkflowVersion>>()
  private changes = new Map<string, WorkflowChange[]>()
  private activeVersions = new Map<string, number>()
  private branchingStrategy: 'linear' | 'feature_branch' | 'gitflow' = 'linear'
  private approvalRequired = true
  private maxVersionHistory = 100

  constructor() {
    super()
    console.log('📋 Workflow version control initialized')
  }

  /**
   * Create new version of workflow
   */
  async createVersion(
    workflowDefinition: WorkflowDefinition,
    changeType: ChangeType,
    changeMessage: string,
    author: string,
    options: {
      tags?: string[]
      parentVersion?: number
      deploymentStrategy?: DeploymentStrategy
    } = {}
  ): Promise<WorkflowVersion> {
    const workflowId = workflowDefinition.id
    
    // Get current version map or create new one
    if (!this.versions.has(workflowId)) {
      this.versions.set(workflowId, new Map())
    }
    const versionMap = this.versions.get(workflowId)!

    // Calculate next version number
    const currentVersion = this.getLatestVersion(workflowId)
    const nextVersion = this.calculateNextVersion(currentVersion?.version || 0, changeType)

    // Calculate changeset if previous version exists
    let changeset: WorkflowChangeset | undefined
    if (currentVersion) {
      changeset = this.calculateChangeset(currentVersion.definition, workflowDefinition)
    }

    // Create version
    const version: WorkflowVersion = {
      id: this.generateVersionId(workflowId, nextVersion),
      workflowId,
      version: nextVersion,
      status: VersionStatus.DRAFT,
      definition: { ...workflowDefinition, version: nextVersion },
      checksum: this.calculateChecksum(workflowDefinition),
      createdBy: author,
      createdAt: Date.now(),
      parentVersion: options.parentVersion || currentVersion?.version,
      childVersions: [],
      changeLog: changeMessage,
      tags: options.tags || [],
      metadata: {
        deploymentStrategy: options.deploymentStrategy || DeploymentStrategy.IMMEDIATE,
        rollbackStrategy: 'previous_version'
      }
    }

    // Update parent-child relationships
    if (version.parentVersion) {
      const parentVersion = versionMap.get(version.parentVersion)
      if (parentVersion) {
        parentVersion.childVersions.push(nextVersion)
      }
    }

    // Store version
    versionMap.set(nextVersion, version)

    // Record change
    if (changeset) {
      const change: WorkflowChange = {
        id: this.generateChangeId(),
        workflowId,
        version: nextVersion,
        previousVersion: currentVersion?.version,
        changeType,
        changeset,
        author,
        timestamp: Date.now(),
        message: changeMessage,
        tags: options.tags || [],
        reviewers: [],
        approved: !this.approvalRequired
      }

      if (!this.changes.has(workflowId)) {
        this.changes.set(workflowId, [])
      }
      this.changes.get(workflowId)!.push(change)
    }

    // Log version creation
    await auditLogger.logEvent({
      type: AuditEventType.DATA_CREATED,
      severity: 'info',
      action: 'version_created',
      outcome: 'success',
      description: `Workflow version created: ${workflowDefinition.name} v${nextVersion}`,
      userId: author,
      resource: workflowId,
      metadata: {
        version: nextVersion,
        changeType,
        deploymentStrategy: version.metadata.deploymentStrategy
      }
    })

    this.emit('versionCreated', version)
    console.log(`📝 Version created: ${workflowDefinition.name} v${nextVersion}`)

    return version
  }

  /**
   * Publish version
   */
  async publishVersion(
    workflowId: string,
    version: number,
    options: {
      deploymentStrategy?: DeploymentStrategy
      testResults?: TestResults
      performanceMetrics?: PerformanceMetrics
      securityScan?: SecurityScanResults
      skipValidation?: boolean
    } = {}
  ): Promise<DeploymentResult> {
    const versionRecord = this.getVersion(workflowId, version)
    if (!versionRecord) {
      throw new Error(`Version not found: ${workflowId} v${version}`)
    }

    if (versionRecord.status !== VersionStatus.DRAFT) {
      throw new Error(`Version is not in draft status: ${versionRecord.status}`)
    }

    // Check approval if required
    if (this.approvalRequired) {
      const change = this.getChangeForVersion(workflowId, version)
      if (!change?.approved) {
        throw new Error('Version has not been approved for publication')
      }
    }

    const deploymentStart = Date.now()

    try {
      // Run validation unless skipped
      if (!options.skipValidation) {
        await this.validateVersion(versionRecord, options)
      }

      const validationTime = Date.now() - deploymentStart

      // Deploy based on strategy
      const deploymentResult = await this.deployVersion(versionRecord, options)

      // Update version status
      versionRecord.status = VersionStatus.PUBLISHED
      versionRecord.publishedAt = Date.now()
      versionRecord.metadata.testResults = options.testResults
      versionRecord.metadata.performanceMetrics = options.performanceMetrics
      versionRecord.metadata.securityScan = options.securityScan

      // Update active version
      this.activeVersions.set(workflowId, version)

      // Deprecate previous versions if configured
      await this.deprecatePreviousVersions(workflowId, version)

      const result: DeploymentResult = {
        success: true,
        version,
        deployedAt: versionRecord.publishedAt,
        strategy: options.deploymentStrategy || DeploymentStrategy.IMMEDIATE,
        metrics: {
          deploymentTime: Date.now() - deploymentStart,
          validationTime
        },
        issues: []
      }

      await auditLogger.logEvent({
        type: AuditEventType.DATA_UPDATED,
        severity: 'info',
        action: 'version_published',
        outcome: 'success',
        description: `Workflow version published: ${versionRecord.definition.name} v${version}`,
        userId: versionRecord.createdBy,
        resource: workflowId,
        metadata: {
          version,
          deploymentStrategy: result.strategy,
          deploymentTime: result.metrics.deploymentTime
        }
      })

      this.emit('versionPublished', versionRecord, result)
      console.log(`🚀 Version published: ${versionRecord.definition.name} v${version}`)

      return result

    } catch (error: any) {
      const result: DeploymentResult = {
        success: false,
        version,
        deployedAt: Date.now(),
        strategy: options.deploymentStrategy || DeploymentStrategy.IMMEDIATE,
        metrics: {
          deploymentTime: Date.now() - deploymentStart,
          validationTime: 0
        },
        issues: [{
          severity: 'error',
          message: error.message,
          component: 'deployment'
        }]
      }

      await auditLogger.logEvent({
        type: AuditEventType.DATA_UPDATED,
        severity: 'error',
        action: 'version_publish_failed',
        outcome: 'failure',
        description: `Workflow version publish failed: ${versionRecord.definition.name} v${version}`,
        userId: versionRecord.createdBy,
        resource: workflowId,
        metadata: {
          version,
          error: error.message
        }
      })

      this.emit('versionPublishFailed', versionRecord, error)
      throw error
    }
  }

  /**
   * Rollback to previous version
   */
  async rollbackWorkflow(
    workflowId: string,
    options: RollbackOptions
  ): Promise<DeploymentResult> {
    const currentVersion = this.getActiveVersion(workflowId)
    if (!currentVersion) {
      throw new Error(`No active version found for workflow: ${workflowId}`)
    }

    const targetVersion = this.getVersion(workflowId, options.targetVersion)
    if (!targetVersion) {
      throw new Error(`Target version not found: ${workflowId} v${options.targetVersion}`)
    }

    if (targetVersion.status !== VersionStatus.PUBLISHED) {
      throw new Error(`Target version is not published: ${targetVersion.status}`)
    }

    const rollbackStart = Date.now()

    try {
      // Create backup of current version if requested
      if (options.createBackup) {
        await this.createBackup(currentVersion)
      }

      // Validate rollback target
      for (const step of options.validationSteps) {
        await this.executeValidationStep(step, targetVersion)
      }

      // Perform rollback based on strategy
      await this.executeRollback(targetVersion, currentVersion, options)

      // Update active version
      this.activeVersions.set(workflowId, options.targetVersion)

      const result: DeploymentResult = {
        success: true,
        version: options.targetVersion,
        deployedAt: Date.now(),
        strategy: DeploymentStrategy.IMMEDIATE,
        rollbackVersion: currentVersion.version,
        metrics: {
          deploymentTime: Date.now() - rollbackStart,
          validationTime: 0,
          rollbackTime: Date.now() - rollbackStart
        },
        issues: []
      }

      await auditLogger.logEvent({
        type: AuditEventType.DATA_UPDATED,
        severity: 'warning',
        action: 'workflow_rolled_back',
        outcome: 'success',
        description: `Workflow rolled back: ${targetVersion.definition.name} v${currentVersion.version} -> v${options.targetVersion}`,
        userId: 'system', // In production, get from context
        resource: workflowId,
        metadata: {
          fromVersion: currentVersion.version,
          toVersion: options.targetVersion,
          strategy: options.strategy
        }
      })

      this.emit('workflowRolledBack', currentVersion, targetVersion, result)
      console.log(`⏪ Workflow rolled back: ${targetVersion.definition.name} v${currentVersion.version} -> v${options.targetVersion}`)

      return result

    } catch (error: any) {
      const result: DeploymentResult = {
        success: false,
        version: options.targetVersion,
        deployedAt: Date.now(),
        strategy: DeploymentStrategy.IMMEDIATE,
        rollbackVersion: currentVersion.version,
        metrics: {
          deploymentTime: Date.now() - rollbackStart,
          validationTime: 0,
          rollbackTime: Date.now() - rollbackStart
        },
        issues: [{
          severity: 'error',
          message: error.message,
          component: 'rollback'
        }]
      }

      this.emit('rollbackFailed', currentVersion, targetVersion, error)
      throw error
    }
  }

  /**
   * Approve version for publication
   */
  async approveVersion(
    workflowId: string,
    version: number,
    approver: string,
    comments?: string
  ): Promise<boolean> {
    const change = this.getChangeForVersion(workflowId, version)
    if (!change) {
      throw new Error(`No change record found for version: ${workflowId} v${version}`)
    }

    change.approved = true
    change.approvedBy = approver
    change.approvedAt = Date.now()

    await auditLogger.logEvent({
      type: AuditEventType.PERMISSION_GRANTED,
      severity: 'info',
      action: 'version_approved',
      outcome: 'success',
      description: `Workflow version approved: ${workflowId} v${version}`,
      userId: approver,
      resource: workflowId,
      metadata: {
        version,
        comments,
        changeType: change.changeType
      }
    })

    this.emit('versionApproved', change, approver)
    console.log(`✅ Version approved: ${workflowId} v${version} by ${approver}`)

    return true
  }

  /**
   * Compare two versions
   */
  compareVersions(
    workflowId: string,
    version1: number,
    version2: number
  ): WorkflowChangeset {
    const v1 = this.getVersion(workflowId, version1)
    const v2 = this.getVersion(workflowId, version2)
    
    if (!v1 || !v2) {
      throw new Error('One or both versions not found')
    }

    return this.calculateChangeset(v1.definition, v2.definition)
  }

  /**
   * Get version history
   */
  getVersionHistory(workflowId: string): WorkflowVersion[] {
    const versionMap = this.versions.get(workflowId)
    if (!versionMap) return []

    return Array.from(versionMap.values())
      .sort((a, b) => b.version - a.version)
  }

  /**
   * Get change history
   */
  getChangeHistory(workflowId: string): WorkflowChange[] {
    return this.changes.get(workflowId) || []
  }

  /**
   * Get specific version
   */
  getVersion(workflowId: string, version: number): WorkflowVersion | undefined {
    return this.versions.get(workflowId)?.get(version)
  }

  /**
   * Get latest version
   */
  getLatestVersion(workflowId: string): WorkflowVersion | undefined {
    const versionMap = this.versions.get(workflowId)
    if (!versionMap || versionMap.size === 0) return undefined

    const versions = Array.from(versionMap.values())
    return versions.reduce((latest, current) => 
      current.version > latest.version ? current : latest
    )
  }

  /**
   * Get active (published) version
   */
  getActiveVersion(workflowId: string): WorkflowVersion | undefined {
    const activeVersionNumber = this.activeVersions.get(workflowId)
    if (!activeVersionNumber) return undefined

    return this.getVersion(workflowId, activeVersionNumber)
  }

  /**
   * Calculate next version number
   */
  private calculateNextVersion(currentVersion: number, changeType: ChangeType): number {
    if (currentVersion === 0) return 1

    const [major, minor = 0, patch = 0] = this.parseVersion(currentVersion)

    switch (changeType) {
      case ChangeType.MAJOR:
        return this.buildVersion(major + 1, 0, 0)
      case ChangeType.MINOR:
        return this.buildVersion(major, minor + 1, 0)
      case ChangeType.PATCH:
      case ChangeType.HOTFIX:
        return this.buildVersion(major, minor, patch + 1)
      default:
        return currentVersion + 1
    }
  }

  /**
   * Parse version number
   */
  private parseVersion(version: number): [number, number, number] {
    const versionStr = version.toString()
    if (versionStr.includes('.')) {
      const parts = versionStr.split('.').map(Number)
      return [parts[0] || 0, parts[1] || 0, parts[2] || 0]
    }
    return [Math.floor(version), 0, 0]
  }

  /**
   * Build version number
   */
  private buildVersion(major: number, minor: number, patch: number): number {
    return parseInt(`${major}${minor.toString().padStart(2, '0')}${patch.toString().padStart(2, '0')}`)
  }

  /**
   * Calculate changeset between two workflow definitions
   */
  private calculateChangeset(
    oldDefinition: WorkflowDefinition,
    newDefinition: WorkflowDefinition
  ): WorkflowChangeset {
    const changeset: WorkflowChangeset = {
      nodesAdded: [],
      nodesRemoved: [],
      nodesModified: [],
      edgesAdded: [],
      edgesRemoved: [],
      edgesModified: [],
      variablesAdded: [],
      variablesRemoved: [],
      variablesModified: [],
      settingsModified: [],
      triggersAdded: [],
      triggersRemoved: [],
      triggersModified: []
    }

    // Compare nodes
    const oldNodes = new Map(oldDefinition.nodes.map(n => [n.id, n]))
    const newNodes = new Map(newDefinition.nodes.map(n => [n.id, n]))

    // Find added nodes
    for (const [nodeId, node] of newNodes) {
      if (!oldNodes.has(nodeId)) {
        changeset.nodesAdded.push({
          nodeId,
          type: node.type,
          data: node.data
        })
      }
    }

    // Find removed nodes
    for (const [nodeId, node] of oldNodes) {
      if (!newNodes.has(nodeId)) {
        changeset.nodesRemoved.push({
          nodeId,
          type: node.type
        })
      }
    }

    // Find modified nodes
    for (const [nodeId, newNode] of newNodes) {
      const oldNode = oldNodes.get(nodeId)
      if (oldNode && JSON.stringify(oldNode) !== JSON.stringify(newNode)) {
        // Simple change detection - in production, use more sophisticated diffing
        changeset.nodesModified.push({
          nodeId,
          field: 'data',
          oldValue: oldNode.data,
          newValue: newNode.data
        })
      }
    }

    // Similar logic for edges, variables, settings, and triggers would go here
    // Simplified for brevity

    return changeset
  }

  /**
   * Calculate checksum for workflow definition
   */
  private calculateChecksum(definition: WorkflowDefinition): string {
    const definitionStr = JSON.stringify(definition, Object.keys(definition).sort())
    return createHash('sha256').update(definitionStr).digest('hex')
  }

  /**
   * Validate version before publication
   */
  private async validateVersion(
    version: WorkflowVersion,
    options: {
      testResults?: TestResults
      performanceMetrics?: PerformanceMetrics
      securityScan?: SecurityScanResults
    }
  ): Promise<void> {
    // Validate test results
    if (options.testResults && !options.testResults.passed) {
      throw new Error('Tests are failing, cannot publish version')
    }

    // Validate performance metrics
    if (options.performanceMetrics) {
      if (options.performanceMetrics.errorRate > 0.05) { // 5% error rate threshold
        throw new Error('Error rate too high, cannot publish version')
      }
    }

    // Validate security scan
    if (options.securityScan && !options.securityScan.passed) {
      const criticalVulns = options.securityScan.vulnerabilities
        .filter(v => v.severity === 'critical')
      if (criticalVulns.length > 0) {
        throw new Error('Critical security vulnerabilities found, cannot publish version')
      }
    }

    // Validate workflow definition
    this.validateWorkflowDefinition(version.definition)
  }

  /**
   * Validate workflow definition
   */
  private validateWorkflowDefinition(definition: WorkflowDefinition): void {
    if (!definition.nodes || definition.nodes.length === 0) {
      throw new Error('Workflow must have at least one node')
    }

    const triggerNodes = definition.nodes.filter(n => n.data.isTrigger)
    if (triggerNodes.length === 0) {
      throw new Error('Workflow must have at least one trigger node')
    }

    // Validate node references in edges
    const nodeIds = new Set(definition.nodes.map(n => n.id))
    for (const edge of definition.edges) {
      if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
        throw new Error(`Edge references unknown node: ${edge.source} -> ${edge.target}`)
      }
    }
  }

  /**
   * Deploy version based on strategy
   */
  private async deployVersion(
    version: WorkflowVersion,
    options: { deploymentStrategy?: DeploymentStrategy }
  ): Promise<void> {
    const strategy = options.deploymentStrategy || version.metadata.deploymentStrategy

    switch (strategy) {
      case DeploymentStrategy.IMMEDIATE:
        await this.deployImmediate(version)
        break
      case DeploymentStrategy.BLUE_GREEN:
        await this.deployBlueGreen(version)
        break
      case DeploymentStrategy.CANARY:
        await this.deployCanary(version)
        break
      case DeploymentStrategy.ROLLING:
        await this.deployRolling(version)
        break
      default:
        await this.deployImmediate(version)
    }
  }

  /**
   * Immediate deployment
   */
  private async deployImmediate(version: WorkflowVersion): Promise<void> {
    // Replace current version immediately
    // In production, this would update the workflow engine's active workflows
    console.log(`🚀 Immediate deployment: ${version.definition.name} v${version.version}`)
  }

  /**
   * Blue-green deployment
   */
  private async deployBlueGreen(version: WorkflowVersion): Promise<void> {
    // Deploy to "green" environment, then switch traffic
    console.log(`🔵🟢 Blue-green deployment: ${version.definition.name} v${version.version}`)
  }

  /**
   * Canary deployment
   */
  private async deployCanary(version: WorkflowVersion): Promise<void> {
    // Deploy to small subset of traffic first
    console.log(`🐦 Canary deployment: ${version.definition.name} v${version.version}`)
  }

  /**
   * Rolling deployment
   */
  private async deployRolling(version: WorkflowVersion): Promise<void> {
    // Gradually replace instances
    console.log(`🔄 Rolling deployment: ${version.definition.name} v${version.version}`)
  }

  /**
   * Deprecate previous versions
   */
  private async deprecatePreviousVersions(workflowId: string, currentVersion: number): Promise<void> {
    const versionMap = this.versions.get(workflowId)
    if (!versionMap) return

    for (const [versionNumber, version] of versionMap) {
      if (versionNumber < currentVersion && version.status === VersionStatus.PUBLISHED) {
        version.status = VersionStatus.DEPRECATED
        version.deprecatedAt = Date.now()
      }
    }
  }

  /**
   * Execute rollback
   */
  private async executeRollback(
    targetVersion: WorkflowVersion,
    currentVersion: WorkflowVersion,
    options: RollbackOptions
  ): Promise<void> {
    switch (options.strategy) {
      case 'immediate':
        await this.deployImmediate(targetVersion)
        break
      case 'gradual':
        await this.deployCanary(targetVersion)
        break
      case 'staged':
        await this.deployBlueGreen(targetVersion)
        break
    }
  }

  /**
   * Create backup of version
   */
  private async createBackup(version: WorkflowVersion): Promise<void> {
    // Create backup - in production, this would store to external storage
    console.log(`💾 Backup created for: ${version.definition.name} v${version.version}`)
  }

  /**
   * Execute validation step
   */
  private async executeValidationStep(step: string, version: WorkflowVersion): Promise<void> {
    // Execute custom validation step
    console.log(`✅ Validation step executed: ${step}`)
  }

  /**
   * Get change for specific version
   */
  private getChangeForVersion(workflowId: string, version: number): WorkflowChange | undefined {
    const changes = this.changes.get(workflowId) || []
    return changes.find(change => change.version === version)
  }

  /**
   * Generate version ID
   */
  private generateVersionId(workflowId: string, version: number): string {
    return `${workflowId}_v${version}`
  }

  /**
   * Generate change ID
   */
  private generateChangeId(): string {
    return `change_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get version control statistics
   */
  getVersionControlStats(): {
    totalWorkflows: number
    totalVersions: number
    draftVersions: number
    publishedVersions: number
    deprecatedVersions: number
    totalChanges: number
    pendingApprovals: number
    averageVersionsPerWorkflow: number
  } {
    let totalVersions = 0
    let draftVersions = 0
    let publishedVersions = 0
    let deprecatedVersions = 0
    let totalChanges = 0
    let pendingApprovals = 0

    for (const versionMap of this.versions.values()) {
      totalVersions += versionMap.size
      for (const version of versionMap.values()) {
        switch (version.status) {
          case VersionStatus.DRAFT:
            draftVersions++
            break
          case VersionStatus.PUBLISHED:
            publishedVersions++
            break
          case VersionStatus.DEPRECATED:
            deprecatedVersions++
            break
        }
      }
    }

    for (const changes of this.changes.values()) {
      totalChanges += changes.length
      pendingApprovals += changes.filter(c => !c.approved).length
    }

    const totalWorkflows = this.versions.size
    const averageVersionsPerWorkflow = totalWorkflows > 0 ? totalVersions / totalWorkflows : 0

    return {
      totalWorkflows,
      totalVersions,
      draftVersions,
      publishedVersions,
      deprecatedVersions,
      totalChanges,
      pendingApprovals,
      averageVersionsPerWorkflow
    }
  }

  /**
   * Cleanup old versions
   */
  async cleanupOldVersions(): Promise<void> {
    let cleanedUp = 0

    for (const [workflowId, versionMap] of this.versions.entries()) {
      const versions = Array.from(versionMap.values())
        .sort((a, b) => b.version - a.version)

      // Keep latest versions within limit
      if (versions.length > this.maxVersionHistory) {
        const versionsToArchive = versions.slice(this.maxVersionHistory)
        
        for (const version of versionsToArchive) {
          if (version.status === VersionStatus.DEPRECATED) {
            version.status = VersionStatus.ARCHIVED
            version.archivedAt = Date.now()
            cleanedUp++
          }
        }
      }
    }

    if (cleanedUp > 0) {
      console.log(`🧹 Version control cleanup: ${cleanedUp} versions archived`)
    }
  }

  /**
   * Shutdown version control system
   */
  shutdown(): void {
    this.versions.clear()
    this.changes.clear()
    this.activeVersions.clear()
    this.removeAllListeners()
    console.log('🛑 Workflow version control shutdown')
  }
}

/**
 * Global workflow version control instance
 */
export const workflowVersionControl = new WorkflowVersionControl()