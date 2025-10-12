import { EventEmitter } from 'events'
import { CronJob } from 'cron'
import { workflowEngine, TriggerType, ExecutionPriority } from './workflow-engine'
import { auditLogger, AuditEventType } from '../security/audit-logger'

import { logger } from '@/lib/utils/logger'

/**
 * Schedule types
 */
export enum ScheduleType {
  CRON = 'cron',
  INTERVAL = 'interval',
  FIXED_RATE = 'fixed_rate',
  ONE_TIME = 'one_time',
  CONDITIONAL = 'conditional'
}

/**
 * Schedule status
 */
export enum ScheduleStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

/**
 * Time zone support
 */
export interface TimeZoneConfig {
  timezone: string
  dstHandling: 'auto' | 'ignore' | 'manual'
  fallbackTimezone: string
}

/**
 * Schedule condition
 */
export interface ScheduleCondition {
  type: 'data_available' | 'file_exists' | 'api_status' | 'custom'
  config: Record<string, any>
  timeout: number
  retryInterval: number
  maxRetries: number
}

/**
 * Schedule definition
 */
export interface WorkflowSchedule {
  id: string
  workflowId: string
  name: string
  description: string
  type: ScheduleType
  status: ScheduleStatus
  config: {
    // Cron configuration
    cronExpression?: string
    timezone?: string
    
    // Interval configuration
    interval?: number
    intervalUnit?: 'seconds' | 'minutes' | 'hours' | 'days'
    
    // One-time configuration
    executeAt?: number
    
    // Fixed rate configuration
    rate?: number
    rateUnit?: 'seconds' | 'minutes' | 'hours'
    initialDelay?: number
    
    // Conditional configuration
    conditions?: ScheduleCondition[]
    pollInterval?: number
  }
  execution: {
    priority: ExecutionPriority
    timeout: number
    retryPolicy: {
      enabled: boolean
      maxRetries: number
      backoffStrategy: 'fixed' | 'exponential' | 'linear'
      baseDelay: number
    }
    variables: Record<string, any>
    notifications: {
      onSuccess: boolean
      onFailure: boolean
      onSkip: boolean
      channels: string[]
    }
  }
  constraints: {
    maxConcurrentExecutions: number
    skipIfRunning: boolean
    allowOverlap: boolean
    executionWindow: {
      start?: string // HH:MM format
      end?: string // HH:MM format
      days?: number[] // 0-6, Sunday=0
      excludeDates?: string[] // YYYY-MM-DD format
    }
    resourceLimits: {
      maxMemory?: number
      maxCpu?: number
      maxDuration?: number
    }
  }
  history: {
    lastExecution?: number
    nextExecution?: number
    totalExecutions: number
    successfulExecutions: number
    failedExecutions: number
    averageExecutionTime: number
    lastExecutionId?: string
  }
  metadata: {
    createdBy: string
    createdAt: number
    updatedAt: number
    tags: string[]
    environment: string
  }
}

/**
 * Schedule execution result
 */
export interface ScheduleExecutionResult {
  scheduleId: string
  executionId?: string
  status: 'executed' | 'skipped' | 'failed'
  reason?: string
  startTime: number
  endTime: number
  duration: number
  nextExecution?: number
}

/**
 * Advanced workflow scheduler with cron job management
 */
export class WorkflowScheduler extends EventEmitter {
  private schedules = new Map<string, WorkflowSchedule>()
  private cronJobs = new Map<string, CronJob>()
  private intervalJobs = new Map<string, NodeJS.Timeout>()
  private conditionPollers = new Map<string, NodeJS.Timeout>()
  private runningExecutions = new Map<string, Set<string>>()
  private isShuttingDown = false

  constructor() {
    super()
    this.startMaintenanceTask()
    logger.debug('⏰ Workflow scheduler initialized')
  }

  /**
   * Create new schedule
   */
  async createSchedule(schedule: Omit<WorkflowSchedule, 'id' | 'history' | 'metadata'>): Promise<string> {
    const scheduleId = this.generateScheduleId()
    
    const fullSchedule: WorkflowSchedule = {
      ...schedule,
      id: scheduleId,
      history: {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0
      },
      metadata: {
        createdBy: 'system', // In production, get from context
        createdAt: Date.now(),
        updatedAt: Date.now(),
        tags: [],
        environment: process.env.NODE_ENV || 'development'
      }
    }

    // Validate schedule
    this.validateSchedule(fullSchedule)

    this.schedules.set(scheduleId, fullSchedule)

    // Start the schedule if active
    if (fullSchedule.status === ScheduleStatus.ACTIVE) {
      await this.startSchedule(scheduleId)
    }

    // Log schedule creation
    await auditLogger.logEvent({
      type: AuditEventType.SYSTEM_STARTUP,
      severity: 'info',
      action: 'schedule_created',
      outcome: 'success',
      description: `Workflow schedule created: ${fullSchedule.name}`,
      userId: fullSchedule.metadata.createdBy,
      resource: fullSchedule.workflowId,
      metadata: {
        scheduleId,
        type: fullSchedule.type,
        cronExpression: fullSchedule.config.cronExpression
      }
    })

    this.emit('scheduleCreated', fullSchedule)
    logger.debug(`📅 Schedule created: ${fullSchedule.name} (${fullSchedule.type})`)
    
    return scheduleId
  }

  /**
   * Start schedule execution
   */
  async startSchedule(scheduleId: string): Promise<boolean> {
    const schedule = this.schedules.get(scheduleId)
    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`)
    }

    if (schedule.status !== ScheduleStatus.ACTIVE) {
      schedule.status = ScheduleStatus.ACTIVE
    }

    try {
      switch (schedule.type) {
        case ScheduleType.CRON:
          await this.startCronSchedule(schedule)
          break
        case ScheduleType.INTERVAL:
          await this.startIntervalSchedule(schedule)
          break
        case ScheduleType.FIXED_RATE:
          await this.startFixedRateSchedule(schedule)
          break
        case ScheduleType.ONE_TIME:
          await this.startOneTimeSchedule(schedule)
          break
        case ScheduleType.CONDITIONAL:
          await this.startConditionalSchedule(schedule)
          break
        default:
          throw new Error(`Unsupported schedule type: ${schedule.type}`)
      }

      this.emit('scheduleStarted', schedule)
      logger.debug(`▶️ Schedule started: ${schedule.name}`)
      return true

    } catch (error: any) {
      schedule.status = ScheduleStatus.FAILED
      
      await auditLogger.logEvent({
        type: AuditEventType.SYSTEM_STARTUP,
        severity: 'error',
        action: 'schedule_start_failed',
        outcome: 'failure',
        description: `Failed to start schedule: ${schedule.name}`,
        userId: schedule.metadata.createdBy,
        resource: schedule.workflowId,
        metadata: { scheduleId, error: error.message }
      })

      this.emit('scheduleError', schedule, error)
      throw error
    }
  }

  /**
   * Start cron-based schedule
   */
  private async startCronSchedule(schedule: WorkflowSchedule): Promise<void> {
    if (!schedule.config.cronExpression) {
      throw new Error('Cron expression is required for cron schedule')
    }

    const cronJob = new CronJob(
      schedule.config.cronExpression,
      async () => await this.executeScheduledWorkflow(schedule),
      null,
      false,
      schedule.config.timezone || 'UTC'
    )

    this.cronJobs.set(schedule.id, cronJob)
    cronJob.start()

    // Calculate next execution time
    schedule.history.nextExecution = cronJob.nextDate().getTime()
    
    logger.debug(`⏰ Cron schedule started: ${schedule.config.cronExpression}`)
  }

  /**
   * Start interval-based schedule
   */
  private async startIntervalSchedule(schedule: WorkflowSchedule): Promise<void> {
    if (!schedule.config.interval || !schedule.config.intervalUnit) {
      throw new Error('Interval and unit are required for interval schedule')
    }

    const intervalMs = this.convertToMilliseconds(schedule.config.interval, schedule.config.intervalUnit)
    
    const intervalJob = setInterval(
      async () => await this.executeScheduledWorkflow(schedule),
      intervalMs
    )

    this.intervalJobs.set(schedule.id, intervalJob)
    
    // Calculate next execution time
    schedule.history.nextExecution = Date.now() + intervalMs
    
    logger.debug(`⏲️ Interval schedule started: every ${schedule.config.interval} ${schedule.config.intervalUnit}`)
  }

  /**
   * Start fixed rate schedule
   */
  private async startFixedRateSchedule(schedule: WorkflowSchedule): Promise<void> {
    if (!schedule.config.rate || !schedule.config.rateUnit) {
      throw new Error('Rate and unit are required for fixed rate schedule')
    }

    const rateMs = this.convertToMilliseconds(schedule.config.rate, schedule.config.rateUnit)
    const initialDelay = schedule.config.initialDelay || 0

    const executeWithFixedRate = async () => {
      const startTime = Date.now()
      await this.executeScheduledWorkflow(schedule)
      const executionTime = Date.now() - startTime
      
      // Schedule next execution to maintain fixed rate
      const nextDelay = Math.max(0, rateMs - executionTime)
      setTimeout(executeWithFixedRate, nextDelay)
    }

    // Start after initial delay
    const timeoutId = setTimeout(executeWithFixedRate, initialDelay)
    this.intervalJobs.set(schedule.id, timeoutId)
    
    schedule.history.nextExecution = Date.now() + initialDelay
    
    logger.debug(`🔄 Fixed rate schedule started: ${schedule.config.rate} ${schedule.config.rateUnit}`)
  }

  /**
   * Start one-time schedule
   */
  private async startOneTimeSchedule(schedule: WorkflowSchedule): Promise<void> {
    if (!schedule.config.executeAt) {
      throw new Error('Execute time is required for one-time schedule')
    }

    const delay = schedule.config.executeAt - Date.now()
    if (delay <= 0) {
      throw new Error('Execute time must be in the future')
    }

    const timeoutId = setTimeout(async () => {
      await this.executeScheduledWorkflow(schedule)
      schedule.status = ScheduleStatus.COMPLETED
      this.intervalJobs.delete(schedule.id)
    }, delay)

    this.intervalJobs.set(schedule.id, timeoutId)
    schedule.history.nextExecution = schedule.config.executeAt
    
    logger.debug(`⏰ One-time schedule set for: ${new Date(schedule.config.executeAt).toISOString()}`)
  }

  /**
   * Start conditional schedule
   */
  private async startConditionalSchedule(schedule: WorkflowSchedule): Promise<void> {
    if (!schedule.config.conditions || schedule.config.conditions.length === 0) {
      throw new Error('Conditions are required for conditional schedule')
    }

    const pollInterval = schedule.config.pollInterval || 60000 // Default 1 minute

    const pollConditions = async () => {
      try {
        const conditionsMet = await this.evaluateScheduleConditions(schedule.config.conditions!)
        
        if (conditionsMet) {
          await this.executeScheduledWorkflow(schedule)
        }
      } catch (error) {
        logger.error(`❌ Error evaluating conditions for schedule ${schedule.id}:`, error)
      }
    }

    const pollerId = setInterval(pollConditions, pollInterval)
    this.conditionPollers.set(schedule.id, pollerId)
    
    schedule.history.nextExecution = Date.now() + pollInterval
    
    logger.debug(`🔍 Conditional schedule started with ${schedule.config.conditions.length} conditions`)
  }

  /**
   * Execute scheduled workflow
   */
  private async executeScheduledWorkflow(schedule: WorkflowSchedule): Promise<ScheduleExecutionResult> {
    const startTime = Date.now()
    
    const result: ScheduleExecutionResult = {
      scheduleId: schedule.id,
      status: 'skipped',
      startTime,
      endTime: startTime,
      duration: 0
    }

    try {
      // Check execution constraints
      const canExecute = await this.checkExecutionConstraints(schedule)
      if (!canExecute.allowed) {
        result.status = 'skipped'
        result.reason = canExecute.reason
        result.endTime = Date.now()
        result.duration = result.endTime - result.startTime
        return result
      }

      // Check concurrent executions
      const runningExecutions = this.runningExecutions.get(schedule.id) || new Set()
      if (schedule.constraints.maxConcurrentExecutions > 0 && 
          runningExecutions.size >= schedule.constraints.maxConcurrentExecutions) {
        
        if (schedule.constraints.skipIfRunning) {
          result.status = 'skipped'
          result.reason = 'Previous execution still running'
          result.endTime = Date.now()
          result.duration = result.endTime - result.startTime
          return result
        } else if (!schedule.constraints.allowOverlap) {
          // Wait for previous execution to complete
          await this.waitForExecutionsToComplete(schedule.id)
        }
      }

      // Execute workflow
      const executionId = await workflowEngine.executeWorkflow(
        schedule.workflowId,
        {
          type: TriggerType.SCHEDULE,
          source: schedule.id,
          data: { scheduleId: schedule.id, scheduleName: schedule.name }
        },
        schedule.execution.variables,
        {
          priority: schedule.execution.priority,
          timeout: schedule.execution.timeout
        }
      )

      // Track execution
      if (!this.runningExecutions.has(schedule.id)) {
        this.runningExecutions.set(schedule.id, new Set())
      }
      this.runningExecutions.get(schedule.id)!.add(executionId)

      result.executionId = executionId
      result.status = 'executed'
      result.endTime = Date.now()
      result.duration = result.endTime - result.startTime

      // Update schedule history
      schedule.history.lastExecution = startTime
      schedule.history.lastExecutionId = executionId
      schedule.history.totalExecutions++
      schedule.history.successfulExecutions++
      
      // Update average execution time
      const totalTime = schedule.history.averageExecutionTime * (schedule.history.totalExecutions - 1) + result.duration
      schedule.history.averageExecutionTime = totalTime / schedule.history.totalExecutions

      // Calculate next execution time
      result.nextExecution = this.calculateNextExecution(schedule)
      schedule.history.nextExecution = result.nextExecution

      // Listen for execution completion to clean up tracking
      workflowEngine.once('executionCompleted', (execution) => {
        if (execution.id === executionId) {
          this.runningExecutions.get(schedule.id)?.delete(executionId)
        }
      })

      workflowEngine.once('executionFailed', (execution) => {
        if (execution.id === executionId) {
          this.runningExecutions.get(schedule.id)?.delete(executionId)
          schedule.history.failedExecutions++
        }
      })

      this.emit('scheduleExecuted', schedule, result)
      logger.debug(`✅ Scheduled workflow executed: ${schedule.name}`)

    } catch (error: any) {
      result.status = 'failed'
      result.reason = error.message
      result.endTime = Date.now()
      result.duration = result.endTime - result.startTime

      schedule.history.failedExecutions++

      await auditLogger.logEvent({
        type: AuditEventType.SYSTEM_STARTUP,
        severity: 'error',
        action: 'scheduled_execution_failed',
        outcome: 'failure',
        description: `Scheduled workflow execution failed: ${schedule.name}`,
        userId: schedule.metadata.createdBy,
        resource: schedule.workflowId,
        metadata: {
          scheduleId: schedule.id,
          error: error.message
        }
      })

      this.emit('scheduleExecutionFailed', schedule, error)
      logger.error(`❌ Scheduled workflow execution failed: ${schedule.name}`, error)
    }

    return result
  }

  /**
   * Check execution constraints
   */
  private async checkExecutionConstraints(schedule: WorkflowSchedule): Promise<{ allowed: boolean; reason?: string }> {
    const now = new Date()
    const constraints = schedule.constraints

    // Check execution window
    if (constraints.executionWindow) {
      const window = constraints.executionWindow

      // Check time window
      if (window.start && window.end) {
        const currentTime = now.getHours() * 60 + now.getMinutes()
        const [startHour, startMin] = window.start.split(':').map(Number)
        const [endHour, endMin] = window.end.split(':').map(Number)
        const startTime = startHour * 60 + startMin
        const endTime = endHour * 60 + endMin

        if (currentTime < startTime || currentTime > endTime) {
          return { allowed: false, reason: 'Outside execution window' }
        }
      }

      // Check allowed days
      if (window.days && window.days.length > 0) {
        const currentDay = now.getDay()
        if (!window.days.includes(currentDay)) {
          return { allowed: false, reason: 'Day not allowed' }
        }
      }

      // Check excluded dates
      if (window.excludeDates && window.excludeDates.length > 0) {
        const currentDate = now.toISOString().split('T')[0]
        if (window.excludeDates.includes(currentDate)) {
          return { allowed: false, reason: 'Date excluded' }
        }
      }
    }

    return { allowed: true }
  }

  /**
   * Evaluate schedule conditions
   */
  private async evaluateScheduleConditions(conditions: ScheduleCondition[]): Promise<boolean> {
    for (const condition of conditions) {
      try {
        const result = await this.evaluateCondition(condition)
        if (!result) {
          return false
        }
      } catch (error) {
        logger.error(`❌ Error evaluating condition:`, error)
        return false
      }
    }
    return true
  }

  /**
   * Evaluate individual condition
   */
  private async evaluateCondition(condition: ScheduleCondition): Promise<boolean> {
    switch (condition.type) {
      case 'data_available':
        return await this.checkDataAvailable(condition.config)
      case 'file_exists':
        return await this.checkFileExists(condition.config)
      case 'api_status':
        return await this.checkApiStatus(condition.config)
      case 'custom':
        return await this.evaluateCustomCondition(condition.config)
      default:
        return false
    }
  }

  /**
   * Check if data is available
   */
  private async checkDataAvailable(config: Record<string, any>): Promise<boolean> {
    // Implementation would depend on data source
    // This is a placeholder
    return true
  }

  /**
   * Check if file exists
   */
  private async checkFileExists(config: Record<string, any>): Promise<boolean> {
    const fs = require('fs').promises
    try {
      await fs.access(config.filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Check API status
   */
  private async checkApiStatus(config: Record<string, any>): Promise<boolean> {
    try {
      const response = await fetch(config.url, {
        method: config.method || 'GET',
        timeout: config.timeout || 5000
      })
      return response.status === (config.expectedStatus || 200)
    } catch {
      return false
    }
  }

  /**
   * Evaluate custom condition
   */
  private async evaluateCustomCondition(config: Record<string, any>): Promise<boolean> {
    try {
      const func = new Function('config', `return ${config.expression}`)
      return func(config)
    } catch {
      return false
    }
  }

  /**
   * Wait for executions to complete
   */
  private async waitForExecutionsToComplete(scheduleId: string, timeout = 300000): Promise<void> {
    const startTime = Date.now()
    
    while (Date.now() - startTime < timeout) {
      const runningExecutions = this.runningExecutions.get(scheduleId)
      if (!runningExecutions || runningExecutions.size === 0) {
        return
      }
      
      // Wait 1 second before checking again
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    throw new Error('Timeout waiting for executions to complete')
  }

  /**
   * Calculate next execution time
   */
  private calculateNextExecution(schedule: WorkflowSchedule): number | undefined {
    switch (schedule.type) {
      case ScheduleType.CRON:
        const cronJob = this.cronJobs.get(schedule.id)
        return cronJob ? cronJob.nextDate().getTime() : undefined
        
      case ScheduleType.INTERVAL:
        if (schedule.config.interval && schedule.config.intervalUnit) {
          const intervalMs = this.convertToMilliseconds(schedule.config.interval, schedule.config.intervalUnit)
          return Date.now() + intervalMs
        }
        return undefined
        
      case ScheduleType.FIXED_RATE:
        if (schedule.config.rate && schedule.config.rateUnit) {
          const rateMs = this.convertToMilliseconds(schedule.config.rate, schedule.config.rateUnit)
          return Date.now() + rateMs
        }
        return undefined
        
      case ScheduleType.ONE_TIME:
        return undefined // One-time schedules don't have next execution
        
      case ScheduleType.CONDITIONAL:
        const pollInterval = schedule.config.pollInterval || 60000
        return Date.now() + pollInterval
        
      default:
        return undefined
    }
  }

  /**
   * Convert time units to milliseconds
   */
  private convertToMilliseconds(value: number, unit: string): number {
    switch (unit) {
      case 'seconds': return value * 1000
      case 'minutes': return value * 60 * 1000
      case 'hours': return value * 60 * 60 * 1000
      case 'days': return value * 24 * 60 * 60 * 1000
      default: return value
    }
  }

  /**
   * Pause schedule
   */
  async pauseSchedule(scheduleId: string): Promise<boolean> {
    const schedule = this.schedules.get(scheduleId)
    if (!schedule) return false

    schedule.status = ScheduleStatus.PAUSED
    
    // Stop cron job
    const cronJob = this.cronJobs.get(scheduleId)
    if (cronJob) {
      cronJob.stop()
    }

    // Clear interval
    const intervalJob = this.intervalJobs.get(scheduleId)
    if (intervalJob) {
      clearTimeout(intervalJob)
      this.intervalJobs.delete(scheduleId)
    }

    // Clear condition poller
    const poller = this.conditionPollers.get(scheduleId)
    if (poller) {
      clearInterval(poller)
      this.conditionPollers.delete(scheduleId)
    }

    this.emit('schedulePaused', schedule)
    logger.debug(`⏸️ Schedule paused: ${schedule.name}`)
    return true
  }

  /**
   * Resume schedule
   */
  async resumeSchedule(scheduleId: string): Promise<boolean> {
    const schedule = this.schedules.get(scheduleId)
    if (!schedule) return false

    if (schedule.status !== ScheduleStatus.PAUSED) {
      throw new Error(`Schedule is not paused: ${schedule.status}`)
    }

    return await this.startSchedule(scheduleId)
  }

  /**
   * Delete schedule
   */
  async deleteSchedule(scheduleId: string): Promise<boolean> {
    const schedule = this.schedules.get(scheduleId)
    if (!schedule) return false

    // Stop schedule first
    await this.pauseSchedule(scheduleId)

    // Remove from maps
    this.schedules.delete(scheduleId)
    this.cronJobs.delete(scheduleId)
    this.runningExecutions.delete(scheduleId)

    await auditLogger.logEvent({
      type: AuditEventType.SYSTEM_SHUTDOWN,
      severity: 'info',
      action: 'schedule_deleted',
      outcome: 'success',
      description: `Schedule deleted: ${schedule.name}`,
      userId: schedule.metadata.createdBy,
      resource: schedule.workflowId,
      metadata: { scheduleId }
    })

    this.emit('scheduleDeleted', schedule)
    logger.debug(`🗑️ Schedule deleted: ${schedule.name}`)
    return true
  }

  /**
   * Get schedule by ID
   */
  getSchedule(scheduleId: string): WorkflowSchedule | undefined {
    return this.schedules.get(scheduleId)
  }

  /**
   * List schedules by workflow
   */
  getSchedulesByWorkflow(workflowId: string): WorkflowSchedule[] {
    return Array.from(this.schedules.values())
      .filter(schedule => schedule.workflowId === workflowId)
  }

  /**
   * Get all schedules
   */
  getAllSchedules(): WorkflowSchedule[] {
    return Array.from(this.schedules.values())
  }

  /**
   * Validate schedule definition
   */
  private validateSchedule(schedule: WorkflowSchedule): void {
    if (!schedule.workflowId) {
      throw new Error('Workflow ID is required')
    }

    if (!schedule.name || !schedule.type) {
      throw new Error('Schedule name and type are required')
    }

    switch (schedule.type) {
      case ScheduleType.CRON:
        if (!schedule.config.cronExpression) {
          throw new Error('Cron expression is required for cron schedule')
        }
        // Validate cron expression format
        try {
          new CronJob(schedule.config.cronExpression, () => {}, null, false)
        } catch (error) {
          throw new Error(`Invalid cron expression: ${schedule.config.cronExpression}`)
        }
        break

      case ScheduleType.INTERVAL:
        if (!schedule.config.interval || !schedule.config.intervalUnit) {
          throw new Error('Interval and unit are required for interval schedule')
        }
        break

      case ScheduleType.FIXED_RATE:
        if (!schedule.config.rate || !schedule.config.rateUnit) {
          throw new Error('Rate and unit are required for fixed rate schedule')
        }
        break

      case ScheduleType.ONE_TIME:
        if (!schedule.config.executeAt) {
          throw new Error('Execute time is required for one-time schedule')
        }
        if (schedule.config.executeAt <= Date.now()) {
          throw new Error('Execute time must be in the future')
        }
        break

      case ScheduleType.CONDITIONAL:
        if (!schedule.config.conditions || schedule.config.conditions.length === 0) {
          throw new Error('Conditions are required for conditional schedule')
        }
        break

      default:
        throw new Error(`Unsupported schedule type: ${schedule.type}`)
    }
  }

  /**
   * Start maintenance task
   */
  private startMaintenanceTask(): void {
    // Run maintenance every hour
    setInterval(() => {
      this.performMaintenance()
    }, 3600000)
  }

  /**
   * Perform maintenance tasks
   */
  private async performMaintenance(): Promise<void> {
    if (this.isShuttingDown) return

    try {
      let cleanedUp = 0

      // Clean up completed one-time schedules
      for (const [scheduleId, schedule] of this.schedules.entries()) {
        if (schedule.type === ScheduleType.ONE_TIME && schedule.status === ScheduleStatus.COMPLETED) {
          // Keep for 24 hours after completion
          const completionTime = schedule.history.lastExecution || 0
          if (Date.now() - completionTime > 24 * 60 * 60 * 1000) {
            await this.deleteSchedule(scheduleId)
            cleanedUp++
          }
        }
      }

      // Clean up stale execution tracking
      for (const [scheduleId, executions] of this.runningExecutions.entries()) {
        const activeExecutions = new Set<string>()
        for (const executionId of executions) {
          const execution = workflowEngine.getExecution(executionId)
          if (execution && (execution.status === 'active' || execution.status === 'paused')) {
            activeExecutions.add(executionId)
          }
        }
        this.runningExecutions.set(scheduleId, activeExecutions)
      }

      if (cleanedUp > 0) {
        logger.debug(`🧹 Scheduler maintenance: cleaned up ${cleanedUp} completed schedules`)
      }

    } catch (error) {
      logger.error('❌ Scheduler maintenance error:', error)
    }
  }

  /**
   * Get scheduler statistics
   */
  getSchedulerStats(): {
    totalSchedules: number
    activeSchedules: number
    pausedSchedules: number
    totalExecutions: number
    successfulExecutions: number
    failedExecutions: number
    averageExecutionTime: number
    upcomingExecutions: Array<{
      scheduleId: string
      scheduleName: string
      nextExecution: number
    }>
  } {
    const schedules = Array.from(this.schedules.values())
    
    const totalSchedules = schedules.length
    const activeSchedules = schedules.filter(s => s.status === ScheduleStatus.ACTIVE).length
    const pausedSchedules = schedules.filter(s => s.status === ScheduleStatus.PAUSED).length
    
    const totalExecutions = schedules.reduce((sum, s) => sum + s.history.totalExecutions, 0)
    const successfulExecutions = schedules.reduce((sum, s) => sum + s.history.successfulExecutions, 0)
    const failedExecutions = schedules.reduce((sum, s) => sum + s.history.failedExecutions, 0)
    
    const averageExecutionTime = schedules.length > 0
      ? schedules.reduce((sum, s) => sum + s.history.averageExecutionTime, 0) / schedules.length
      : 0

    const upcomingExecutions = schedules
      .filter(s => s.history.nextExecution)
      .map(s => ({
        scheduleId: s.id,
        scheduleName: s.name,
        nextExecution: s.history.nextExecution!
      }))
      .sort((a, b) => a.nextExecution - b.nextExecution)
      .slice(0, 10)

    return {
      totalSchedules,
      activeSchedules,
      pausedSchedules,
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      averageExecutionTime,
      upcomingExecutions
    }
  }

  /**
   * Generate unique schedule ID
   */
  private generateScheduleId(): string {
    return `schedule_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Shutdown scheduler
   */
  shutdown(): void {
    this.isShuttingDown = true

    // Stop all cron jobs
    for (const cronJob of this.cronJobs.values()) {
      cronJob.stop()
    }

    // Clear all intervals
    for (const intervalJob of this.intervalJobs.values()) {
      clearTimeout(intervalJob)
    }

    // Clear all condition pollers
    for (const poller of this.conditionPollers.values()) {
      clearInterval(poller)
    }

    this.schedules.clear()
    this.cronJobs.clear()
    this.intervalJobs.clear()
    this.conditionPollers.clear()
    this.runningExecutions.clear()

    this.removeAllListeners()
    logger.debug('🛑 Workflow scheduler shutdown')
  }
}

/**
 * Global workflow scheduler instance
 */
export const workflowScheduler = new WorkflowScheduler()