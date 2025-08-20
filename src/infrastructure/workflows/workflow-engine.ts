import { EventEmitter } from 'events'
import { auditLogger, AuditEventType } from '../security/audit-logger'
import { performanceMonitor, MetricType } from '../performance/performance-monitor'

/**
 * Workflow execution status
 */
export enum WorkflowStatus {
  DRAFT = 'draft',
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  ARCHIVED = 'archived'
}

/**
 * Workflow execution priority
 */
export enum ExecutionPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * Workflow trigger types
 */
export enum TriggerType {
  MANUAL = 'manual',
  WEBHOOK = 'webhook',
  SCHEDULE = 'schedule',
  EVENT = 'event',
  API = 'api',
  FILE_CHANGE = 'file_change',
  EMAIL = 'email',
  INTEGRATION = 'integration'
}

/**
 * Node execution state
 */
export interface NodeExecution {
  nodeId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
  startTime?: number
  endTime?: number
  duration?: number
  input?: Record<string, any>
  output?: Record<string, any>
  error?: string
  retryCount: number
  logs: string[]
}

/**
 * Workflow execution context
 */
export interface WorkflowExecution {
  id: string
  workflowId: string
  workflowVersion: number
  userId: string
  status: WorkflowStatus
  priority: ExecutionPriority
  trigger: {
    type: TriggerType
    source?: string
    data?: Record<string, any>
  }
  startTime: number
  endTime?: number
  duration?: number
  nodeExecutions: Map<string, NodeExecution>
  variables: Record<string, any>
  parallelBranches: Map<string, WorkflowExecution>
  parentExecutionId?: string
  childExecutionIds: string[]
  retryCount: number
  maxRetries: number
  metadata: {
    ip?: string
    userAgent?: string
    environment: string
    debugMode: boolean
  }
}

/**
 * Workflow definition
 */
export interface WorkflowDefinition {
  id: string
  name: string
  description: string
  version: number
  userId: string
  organizationId?: string
  status: WorkflowStatus
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
  variables: WorkflowVariable[]
  settings: WorkflowSettings
  triggers: WorkflowTrigger[]
  createdAt: number
  updatedAt: number
  tags: string[]
  category: string
}

/**
 * Workflow node definition
 */
export interface WorkflowNode {
  id: string
  type: string
  position: { x: number; y: number }
  data: {
    label: string
    config: Record<string, any>
    retryPolicy?: RetryPolicy
    timeout?: number
    condition?: string
    isTrigger?: boolean
    isParallel?: boolean
    parallelBranches?: number
  }
}

/**
 * Workflow edge definition
 */
export interface WorkflowEdge {
  id: string
  source: string
  target: string
  type: 'default' | 'conditional' | 'error'
  condition?: string
  label?: string
}

/**
 * Workflow variable
 */
export interface WorkflowVariable {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  value?: any
  encrypted?: boolean
  required?: boolean
  description?: string
}

/**
 * Workflow trigger configuration
 */
export interface WorkflowTrigger {
  id: string
  type: TriggerType
  enabled: boolean
  config: Record<string, any>
  conditions?: TriggerCondition[]
}

/**
 * Trigger condition
 */
export interface TriggerCondition {
  field: string
  operator: 'equals' | 'contains' | 'startsWith' | 'endsWith' | 'regex' | 'gt' | 'lt' | 'gte' | 'lte'
  value: any
  caseSensitive?: boolean
}

/**
 * Workflow settings
 */
export interface WorkflowSettings {
  concurrentExecutions: number
  executionTimeout: number
  retryPolicy: RetryPolicy
  errorHandling: ErrorHandling
  logging: LoggingSettings
  notifications: NotificationSettings
  performance: PerformanceSettings
}

/**
 * Retry policy configuration
 */
export interface RetryPolicy {
  enabled: boolean
  maxRetries: number
  backoffStrategy: 'fixed' | 'exponential' | 'linear'
  baseDelay: number
  maxDelay: number
  retryableErrors: string[]
  skipRetryConditions?: string[]
}

/**
 * Error handling configuration
 */
export interface ErrorHandling {
  strategy: 'fail_fast' | 'continue' | 'rollback' | 'compensate'
  fallbackActions: string[]
  errorNotifications: boolean
  captureStackTrace: boolean
  sensitiveDataMasking: boolean
}

/**
 * Logging settings
 */
export interface LoggingSettings {
  level: 'debug' | 'info' | 'warn' | 'error'
  includeInput: boolean
  includeOutput: boolean
  includeTimings: boolean
  includeHeaders: boolean
  retention: number
  redactFields: string[]
}

/**
 * Notification settings
 */
export interface NotificationSettings {
  onSuccess: boolean
  onFailure: boolean
  onTimeout: boolean
  channels: NotificationChannel[]
}

/**
 * Notification channel
 */
export interface NotificationChannel {
  type: 'email' | 'slack' | 'webhook' | 'sms'
  config: Record<string, any>
  events: string[]
}

/**
 * Performance settings
 */
export interface PerformanceSettings {
  enableMetrics: boolean
  enableTracing: boolean
  samplingRate: number
  metricsRetention: number
  alertThresholds: {
    executionTime: number
    errorRate: number
    memoryUsage: number
  }
}

/**
 * Advanced workflow engine with enhanced execution capabilities
 */
export class AdvancedWorkflowEngine extends EventEmitter {
  private workflows = new Map<string, WorkflowDefinition>()
  private executions = new Map<string, WorkflowExecution>()
  private nodeHandlers = new Map<string, Function>()
  private activeExecutions = new Set<string>()
  private scheduledExecutions = new Map<string, NodeJS.Timeout>()
  private executionQueue: string[] = []
  private maxConcurrentExecutions: number
  private isProcessingQueue = false

  constructor(maxConcurrentExecutions = 10) {
    super()
    this.maxConcurrentExecutions = maxConcurrentExecutions
    this.initializeBuiltInHandlers()
    console.log('🚀 Advanced workflow engine initialized')
  }

  /**
   * Register workflow definition
   */
  async registerWorkflow(workflow: WorkflowDefinition): Promise<void> {
    // Validate workflow
    this.validateWorkflow(workflow)
    
    this.workflows.set(workflow.id, workflow)
    
    // Log workflow registration
    await auditLogger.logEvent({
      type: AuditEventType.SYSTEM_STARTUP,
      severity: 'info',
      action: 'workflow_registered',
      outcome: 'success',
      description: `Workflow registered: ${workflow.name}`,
      userId: workflow.userId,
      resource: workflow.id,
      metadata: {
        version: workflow.version,
        nodeCount: workflow.nodes.length,
        triggers: workflow.triggers.length
      }
    })

    this.emit('workflowRegistered', workflow)
    console.log(`📋 Workflow registered: ${workflow.name} (v${workflow.version})`)
  }

  /**
   * Execute workflow with enhanced capabilities
   */
  async executeWorkflow(
    workflowId: string,
    trigger: WorkflowExecution['trigger'],
    variables: Record<string, any> = {},
    options: {
      priority?: ExecutionPriority
      parentExecutionId?: string
      debugMode?: boolean
      timeout?: number
    } = {}
  ): Promise<string> {
    const workflow = this.workflows.get(workflowId)
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`)
    }

    if (workflow.status !== WorkflowStatus.ACTIVE) {
      throw new Error(`Workflow is not active: ${workflow.status}`)
    }

    // Create execution context
    const executionId = this.generateExecutionId()
    const execution: WorkflowExecution = {
      id: executionId,
      workflowId,
      workflowVersion: workflow.version,
      userId: workflow.userId,
      status: WorkflowStatus.ACTIVE,
      priority: options.priority || ExecutionPriority.NORMAL,
      trigger,
      startTime: Date.now(),
      nodeExecutions: new Map(),
      variables: { ...variables },
      parallelBranches: new Map(),
      parentExecutionId: options.parentExecutionId,
      childExecutionIds: [],
      retryCount: 0,
      maxRetries: workflow.settings.retryPolicy.maxRetries,
      metadata: {
        environment: process.env.NODE_ENV || 'development',
        debugMode: options.debugMode || false
      }
    }

    this.executions.set(executionId, execution)

    // Log execution start
    await auditLogger.logEvent({
      type: AuditEventType.SYSTEM_STARTUP,
      severity: 'info',
      action: 'workflow_execution_started',
      outcome: 'success',
      description: `Workflow execution started: ${workflow.name}`,
      userId: workflow.userId,
      resource: workflowId,
      metadata: {
        executionId,
        trigger: trigger.type,
        priority: execution.priority
      }
    })

    // Add to execution queue
    this.executionQueue.push(executionId)
    this.processExecutionQueue()

    this.emit('executionStarted', execution)
    return executionId
  }

  /**
   * Process execution queue with concurrency control
   */
  private async processExecutionQueue(): Promise<void> {
    if (this.isProcessingQueue || this.activeExecutions.size >= this.maxConcurrentExecutions) {
      return
    }

    this.isProcessingQueue = true

    while (this.executionQueue.length > 0 && this.activeExecutions.size < this.maxConcurrentExecutions) {
      const executionId = this.executionQueue.shift()
      if (!executionId) continue

      const execution = this.executions.get(executionId)
      if (!execution) continue

      // Sort by priority
      const sortedQueue = [...this.executionQueue]
        .map(id => this.executions.get(id))
        .filter(Boolean)
        .sort((a, b) => this.getPriorityWeight(b!.priority) - this.getPriorityWeight(a!.priority))

      this.executionQueue = sortedQueue.map(e => e!.id)

      this.activeExecutions.add(executionId)
      this.executeWorkflowInternal(executionId).finally(() => {
        this.activeExecutions.delete(executionId)
        this.processExecutionQueue()
      })
    }

    this.isProcessingQueue = false
  }

  /**
   * Internal workflow execution logic
   */
  private async executeWorkflowInternal(executionId: string): Promise<void> {
    const execution = this.executions.get(executionId)
    if (!execution) return

    const workflow = this.workflows.get(execution.workflowId)
    if (!workflow) return

    const requestId = performanceMonitor.startRequest(
      executionId,
      'workflow',
      `execute_${workflow.name}`
    )

    try {
      // Find trigger node
      const triggerNode = workflow.nodes.find(node => node.data.isTrigger)
      if (!triggerNode) {
        throw new Error('No trigger node found')
      }

      // Execute workflow graph
      await this.executeNodeGraph(execution, workflow, triggerNode.id)

      // Mark execution as completed
      execution.status = WorkflowStatus.COMPLETED
      execution.endTime = Date.now()
      execution.duration = execution.endTime - execution.startTime

      await performanceMonitor.endRequest(requestId, 'success')

      await auditLogger.logEvent({
        type: AuditEventType.SYSTEM_STARTUP,
        severity: 'info',
        action: 'workflow_execution_completed',
        outcome: 'success',
        description: `Workflow execution completed: ${workflow.name}`,
        userId: workflow.userId,
        resource: execution.workflowId,
        metadata: {
          executionId,
          duration: execution.duration,
          nodeCount: execution.nodeExecutions.size
        }
      })

      this.emit('executionCompleted', execution)

    } catch (error: any) {
      execution.status = WorkflowStatus.FAILED
      execution.endTime = Date.now()
      execution.duration = execution.endTime - execution.startTime

      await performanceMonitor.endRequest(requestId, 'error', { error: error.message })

      await auditLogger.logEvent({
        type: AuditEventType.SYSTEM_STARTUP,
        severity: 'error',
        action: 'workflow_execution_failed',
        outcome: 'failure',
        description: `Workflow execution failed: ${workflow.name}`,
        userId: workflow.userId,
        resource: execution.workflowId,
        metadata: {
          executionId,
          error: error.message,
          duration: execution.duration
        }
      })

      this.emit('executionFailed', execution, error)
      console.error(`❌ Workflow execution failed: ${executionId}`, error)
    }
  }

  /**
   * Execute node graph with advanced flow control
   */
  private async executeNodeGraph(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    startNodeId: string
  ): Promise<void> {
    const visitedNodes = new Set<string>()
    const nodeQueue: Array<{ nodeId: string; input: Record<string, any> }> = [
      { nodeId: startNodeId, input: execution.variables }
    ]

    while (nodeQueue.length > 0) {
      const { nodeId, input } = nodeQueue.shift()!
      
      if (visitedNodes.has(nodeId)) {
        continue // Prevent infinite loops
      }

      const node = workflow.nodes.find(n => n.id === nodeId)
      if (!node) {
        throw new Error(`Node not found: ${nodeId}`)
      }

      visitedNodes.add(nodeId)

      try {
        // Execute node
        const nodeExecution = await this.executeNode(execution, workflow, node, input)
        execution.nodeExecutions.set(nodeId, nodeExecution)

        // Handle parallel execution
        if (node.data.isParallel) {
          await this.handleParallelExecution(execution, workflow, node, nodeExecution.output || {})
        }

        // Find next nodes based on edges
        const nextNodes = this.getNextNodes(workflow, nodeId, nodeExecution.output || {})
        for (const nextNode of nextNodes) {
          nodeQueue.push({
            nodeId: nextNode.targetId,
            input: { ...nodeExecution.output, ...execution.variables }
          })
        }

      } catch (error: any) {
        const nodeExecution: NodeExecution = {
          nodeId,
          status: 'failed',
          startTime: Date.now(),
          endTime: Date.now(),
          duration: 0,
          input,
          error: error.message,
          retryCount: 0,
          logs: [error.message]
        }

        execution.nodeExecutions.set(nodeId, nodeExecution)

        // Handle error based on workflow settings
        if (workflow.settings.errorHandling.strategy === 'fail_fast') {
          throw error
        } else if (workflow.settings.errorHandling.strategy === 'continue') {
          console.warn(`⚠️ Node failed but continuing: ${nodeId}`, error)
          continue
        }
      }
    }
  }

  /**
   * Execute individual node with retry logic
   */
  private async executeNode(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    node: WorkflowNode,
    input: Record<string, any>
  ): Promise<NodeExecution> {
    const nodeExecution: NodeExecution = {
      nodeId: node.id,
      status: 'running',
      startTime: Date.now(),
      input,
      retryCount: 0,
      logs: []
    }

    const retryPolicy = node.data.retryPolicy || workflow.settings.retryPolicy
    const timeout = node.data.timeout || workflow.settings.executionTimeout

    for (let attempt = 0; attempt <= retryPolicy.maxRetries; attempt++) {
      try {
        nodeExecution.retryCount = attempt

        // Execute with timeout
        const result = await Promise.race([
          this.executeNodeHandler(node, input, execution),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Node execution timeout')), timeout)
          )
        ])

        nodeExecution.status = 'completed'
        nodeExecution.endTime = Date.now()
        nodeExecution.duration = nodeExecution.endTime - nodeExecution.startTime
        nodeExecution.output = result as Record<string, any>
        nodeExecution.logs.push(`Node completed successfully on attempt ${attempt + 1}`)

        return nodeExecution

      } catch (error: any) {
        nodeExecution.logs.push(`Attempt ${attempt + 1} failed: ${error.message}`)

        if (attempt === retryPolicy.maxRetries) {
          nodeExecution.status = 'failed'
          nodeExecution.endTime = Date.now()
          nodeExecution.duration = nodeExecution.endTime - nodeExecution.startTime
          nodeExecution.error = error.message
          throw error
        }

        // Calculate backoff delay
        const delay = this.calculateBackoffDelay(retryPolicy, attempt)
        nodeExecution.logs.push(`Retrying in ${delay}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw new Error('Max retries exceeded')
  }

  /**
   * Execute node handler
   */
  private async executeNodeHandler(
    node: WorkflowNode,
    input: Record<string, any>,
    execution: WorkflowExecution
  ): Promise<Record<string, any>> {
    const handler = this.nodeHandlers.get(node.type)
    if (!handler) {
      throw new Error(`No handler registered for node type: ${node.type}`)
    }

    return await handler({
      node,
      input,
      execution,
      context: {
        workflowId: execution.workflowId,
        executionId: execution.id,
        userId: execution.userId,
        variables: execution.variables
      }
    })
  }

  /**
   * Handle parallel execution
   */
  private async handleParallelExecution(
    execution: WorkflowExecution,
    workflow: WorkflowDefinition,
    node: WorkflowNode,
    output: Record<string, any>
  ): Promise<void> {
    const branchCount = node.data.parallelBranches || 2
    const promises: Promise<void>[] = []

    for (let i = 0; i < branchCount; i++) {
      const branchExecution: WorkflowExecution = {
        ...execution,
        id: `${execution.id}_branch_${i}`,
        parentExecutionId: execution.id,
        variables: { ...execution.variables, branchIndex: i }
      }

      execution.parallelBranches.set(branchExecution.id, branchExecution)
      execution.childExecutionIds.push(branchExecution.id)

      promises.push(this.executeWorkflowInternal(branchExecution.id))
    }

    // Wait for all parallel branches to complete
    await Promise.all(promises)
  }

  /**
   * Get next nodes based on edge conditions
   */
  private getNextNodes(
    workflow: WorkflowDefinition,
    nodeId: string,
    output: Record<string, any>
  ): Array<{ targetId: string; edge: WorkflowEdge }> {
    const edges = workflow.edges.filter(edge => edge.source === nodeId)
    const nextNodes: Array<{ targetId: string; edge: WorkflowEdge }> = []

    for (const edge of edges) {
      if (edge.type === 'conditional' && edge.condition) {
        // Evaluate condition
        if (this.evaluateCondition(edge.condition, output)) {
          nextNodes.push({ targetId: edge.target, edge })
        }
      } else if (edge.type === 'default') {
        nextNodes.push({ targetId: edge.target, edge })
      }
    }

    return nextNodes
  }

  /**
   * Evaluate condition expression
   */
  private evaluateCondition(condition: string, data: Record<string, any>): boolean {
    try {
      // Simple condition evaluation (in production, use a proper expression evaluator)
      const func = new Function('data', `return ${condition}`)
      return func(data)
    } catch {
      return false
    }
  }

  /**
   * Calculate backoff delay for retries
   */
  private calculateBackoffDelay(retryPolicy: RetryPolicy, attempt: number): number {
    switch (retryPolicy.backoffStrategy) {
      case 'exponential':
        return Math.min(retryPolicy.baseDelay * Math.pow(2, attempt), retryPolicy.maxDelay)
      case 'linear':
        return Math.min(retryPolicy.baseDelay * (attempt + 1), retryPolicy.maxDelay)
      case 'fixed':
      default:
        return retryPolicy.baseDelay
    }
  }

  /**
   * Get priority weight for sorting
   */
  private getPriorityWeight(priority: ExecutionPriority): number {
    switch (priority) {
      case ExecutionPriority.CRITICAL: return 4
      case ExecutionPriority.HIGH: return 3
      case ExecutionPriority.NORMAL: return 2
      case ExecutionPriority.LOW: return 1
      default: return 2
    }
  }

  /**
   * Validate workflow definition
   */
  private validateWorkflow(workflow: WorkflowDefinition): void {
    if (!workflow.id || !workflow.name) {
      throw new Error('Workflow must have id and name')
    }

    if (!workflow.nodes || workflow.nodes.length === 0) {
      throw new Error('Workflow must have at least one node')
    }

    const triggerNodes = workflow.nodes.filter(node => node.data.isTrigger)
    if (triggerNodes.length === 0) {
      throw new Error('Workflow must have at least one trigger node')
    }

    if (triggerNodes.length > 1) {
      throw new Error('Workflow can only have one trigger node')
    }

    // Validate node references in edges
    for (const edge of workflow.edges) {
      if (!workflow.nodes.find(n => n.id === edge.source)) {
        throw new Error(`Edge references unknown source node: ${edge.source}`)
      }
      if (!workflow.nodes.find(n => n.id === edge.target)) {
        throw new Error(`Edge references unknown target node: ${edge.target}`)
      }
    }
  }

  /**
   * Initialize built-in node handlers
   */
  private initializeBuiltInHandlers(): void {
    // Delay handler
    this.nodeHandlers.set('delay', async ({ node, input }) => {
      const delay = node.data.config.delay || 1000
      await new Promise(resolve => setTimeout(resolve, delay))
      return input
    })

    // Condition handler
    this.nodeHandlers.set('condition', async ({ node, input }) => {
      const condition = node.data.config.condition
      const result = this.evaluateCondition(condition, input)
      return { ...input, conditionResult: result }
    })

    // Transform handler
    this.nodeHandlers.set('transform', async ({ node, input }) => {
      const transformFunction = node.data.config.transform
      try {
        const func = new Function('input', `return ${transformFunction}`)
        return func(input)
      } catch (error) {
        throw new Error(`Transform function error: ${error}`)
      }
    })
  }

  /**
   * Register custom node handler
   */
  registerNodeHandler(type: string, handler: Function): void {
    this.nodeHandlers.set(type, handler)
    console.log(`🔧 Node handler registered: ${type}`)
  }

  /**
   * Generate unique execution ID
   */
  private generateExecutionId(): string {
    return `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get execution status
   */
  getExecution(executionId: string): WorkflowExecution | undefined {
    return this.executions.get(executionId)
  }

  /**
   * Cancel execution
   */
  async cancelExecution(executionId: string, reason: string = 'User cancelled'): Promise<boolean> {
    const execution = this.executions.get(executionId)
    if (!execution) return false

    execution.status = WorkflowStatus.CANCELLED
    execution.endTime = Date.now()
    execution.duration = execution.endTime - execution.startTime

    // Cancel any scheduled timeouts
    const scheduledTimeout = this.scheduledExecutions.get(executionId)
    if (scheduledTimeout) {
      clearTimeout(scheduledTimeout)
      this.scheduledExecutions.delete(executionId)
    }

    this.activeExecutions.delete(executionId)

    await auditLogger.logEvent({
      type: AuditEventType.SYSTEM_SHUTDOWN,
      severity: 'info',
      action: 'workflow_execution_cancelled',
      outcome: 'success',
      description: `Workflow execution cancelled: ${reason}`,
      userId: execution.userId,
      resource: execution.workflowId,
      metadata: { executionId, reason }
    })

    this.emit('executionCancelled', execution, reason)
    return true
  }

  /**
   * Get workflow statistics
   */
  getWorkflowStats(): {
    totalWorkflows: number
    activeWorkflows: number
    totalExecutions: number
    activeExecutions: number
    completedExecutions: number
    failedExecutions: number
    averageExecutionTime: number
  } {
    const totalWorkflows = this.workflows.size
    const activeWorkflows = Array.from(this.workflows.values())
      .filter(w => w.status === WorkflowStatus.ACTIVE).length

    const executions = Array.from(this.executions.values())
    const totalExecutions = executions.length
    const activeExecutions = executions.filter(e => e.status === WorkflowStatus.ACTIVE).length
    const completedExecutions = executions.filter(e => e.status === WorkflowStatus.COMPLETED).length
    const failedExecutions = executions.filter(e => e.status === WorkflowStatus.FAILED).length

    const completedWithDuration = executions.filter(e => e.status === WorkflowStatus.COMPLETED && e.duration)
    const averageExecutionTime = completedWithDuration.length > 0
      ? completedWithDuration.reduce((sum, e) => sum + e.duration!, 0) / completedWithDuration.length
      : 0

    return {
      totalWorkflows,
      activeWorkflows,
      totalExecutions,
      activeExecutions,
      completedExecutions,
      failedExecutions,
      averageExecutionTime
    }
  }

  /**
   * Shutdown workflow engine
   */
  shutdown(): void {
    // Cancel all active executions
    for (const executionId of this.activeExecutions) {
      this.cancelExecution(executionId, 'Engine shutdown')
    }

    // Clear all scheduled timeouts
    for (const timeout of this.scheduledExecutions.values()) {
      clearTimeout(timeout)
    }

    this.workflows.clear()
    this.executions.clear()
    this.nodeHandlers.clear()
    this.activeExecutions.clear()
    this.scheduledExecutions.clear()
    this.executionQueue.length = 0

    this.removeAllListeners()
    console.log('🛑 Advanced workflow engine shutdown')
  }
}

/**
 * Global workflow engine instance
 */
export const workflowEngine = new AdvancedWorkflowEngine()