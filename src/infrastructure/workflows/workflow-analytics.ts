import { EventEmitter } from 'events'
import { WorkflowExecution, WorkflowStatus, ExecutionPriority, WorkflowDefinition } from './workflow-engine'
import { performanceMonitor } from '../performance/performance-monitor'

/**
 * Metric types for workflow analytics
 */
export enum MetricType {
  EXECUTION_COUNT = 'execution_count',
  EXECUTION_TIME = 'execution_time',
  SUCCESS_RATE = 'success_rate',
  ERROR_RATE = 'error_rate',
  THROUGHPUT = 'throughput',
  RESOURCE_USAGE = 'resource_usage',
  USER_ACTIVITY = 'user_activity',
  NODE_PERFORMANCE = 'node_performance',
  INTEGRATION_HEALTH = 'integration_health'
}

/**
 * Time period for analytics
 */
export enum TimePeriod {
  LAST_HOUR = 'last_hour',
  LAST_24_HOURS = 'last_24_hours',
  LAST_7_DAYS = 'last_7_days',
  LAST_30_DAYS = 'last_30_days',
  LAST_90_DAYS = 'last_90_days',
  CUSTOM = 'custom'
}

/**
 * Aggregation type
 */
export enum AggregationType {
  SUM = 'sum',
  AVERAGE = 'average',
  MIN = 'min',
  MAX = 'max',
  COUNT = 'count',
  PERCENTILE = 'percentile'
}

/**
 * Analytics data point
 */
export interface DataPoint {
  timestamp: number
  value: number
  metadata?: Record<string, any>
}

/**
 * Time series data
 */
export interface TimeSeries {
  metric: MetricType
  data: DataPoint[]
  aggregation: AggregationType
  period: TimePeriod
  startTime: number
  endTime: number
}

/**
 * Workflow metrics
 */
export interface WorkflowMetrics {
  workflowId: string
  workflowName: string
  totalExecutions: number
  successfulExecutions: number
  failedExecutions: number
  averageExecutionTime: number
  minExecutionTime: number
  maxExecutionTime: number
  successRate: number
  errorRate: number
  throughput: number // executions per hour
  lastExecution?: number
  trends: {
    executionCount: TimeSeries
    executionTime: TimeSeries
    successRate: TimeSeries
    errorRate: TimeSeries
  }
  nodeMetrics: Map<string, NodeMetrics>
  integrationMetrics: Map<string, IntegrationMetrics>
}

/**
 * Node performance metrics
 */
export interface NodeMetrics {
  nodeId: string
  nodeType: string
  totalExecutions: number
  successfulExecutions: number
  failedExecutions: number
  averageExecutionTime: number
  minExecutionTime: number
  maxExecutionTime: number
  errorRate: number
  commonErrors: Array<{
    error: string
    count: number
    lastOccurrence: number
  }>
  performance: {
    cpuUsage: number
    memoryUsage: number
    networkLatency?: number
  }
}

/**
 * Integration health metrics
 */
export interface IntegrationMetrics {
  providerId: string
  totalCalls: number
  successfulCalls: number
  failedCalls: number
  averageResponseTime: number
  errorRate: number
  rateLimitHits: number
  quotaUsage: number
  uptime: number
  lastFailure?: {
    timestamp: number
    error: string
    statusCode?: number
  }
  healthScore: number // 0-100
}

/**
 * User activity metrics
 */
export interface UserActivityMetrics {
  userId: string
  totalWorkflows: number
  activeWorkflows: number
  totalExecutions: number
  successfulExecutions: number
  averageExecutionTime: number
  mostUsedIntegrations: Array<{
    providerId: string
    count: number
  }>
  activityByHour: number[] // 24 hours
  activityByDay: number[] // 7 days
}

/**
 * System health metrics
 */
export interface SystemHealthMetrics {
  timestamp: number
  activeWorkflows: number
  runningExecutions: number
  queuedExecutions: number
  systemLoad: {
    cpu: number
    memory: number
    disk: number
    network: number
  }
  databaseMetrics: {
    connectionCount: number
    activeQueries: number
    averageQueryTime: number
    slowQueries: number
  }
  cacheMetrics: {
    hitRate: number
    missRate: number
    size: number
    evictions: number
  }
  errorMetrics: {
    totalErrors: number
    errorRate: number
    criticalErrors: number
    errorsByType: Record<string, number>
  }
}

/**
 * Alert configuration
 */
export interface AlertConfig {
  id: string
  name: string
  description: string
  enabled: boolean
  metric: MetricType
  workflowId?: string
  conditions: Array<{
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte'
    threshold: number
    duration: number // minutes
  }>
  notifications: Array<{
    type: 'email' | 'slack' | 'webhook' | 'sms'
    config: Record<string, any>
  }>
  cooldown: number // minutes
  severity: 'low' | 'medium' | 'high' | 'critical'
}

/**
 * Alert instance
 */
export interface Alert {
  id: string
  configId: string
  triggeredAt: number
  resolvedAt?: number
  metric: MetricType
  value: number
  threshold: number
  workflowId?: string
  message: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  acknowledged: boolean
  acknowledgedBy?: string
  acknowledgedAt?: number
}

/**
 * Dashboard widget configuration
 */
export interface DashboardWidget {
  id: string
  type: 'metric' | 'chart' | 'table' | 'heatmap' | 'gauge' | 'counter'
  title: string
  description: string
  position: { x: number; y: number; width: number; height: number }
  config: {
    metric?: MetricType
    workflowIds?: string[]
    timePeriod: TimePeriod
    aggregation: AggregationType
    chartType?: 'line' | 'bar' | 'pie' | 'area'
    refreshInterval: number // seconds
    displayOptions: Record<string, any>
  }
}

/**
 * Dashboard configuration
 */
export interface Dashboard {
  id: string
  name: string
  description: string
  userId: string
  organizationId?: string
  widgets: DashboardWidget[]
  layout: {
    columns: number
    rows: number
    responsive: boolean
  }
  sharing: {
    public: boolean
    allowedUsers: string[]
    allowedRoles: string[]
  }
  createdAt: number
  updatedAt: number
}

/**
 * Advanced workflow analytics and monitoring system
 */
export class WorkflowAnalytics extends EventEmitter {
  private executions = new Map<string, WorkflowExecution>()
  private workflowMetrics = new Map<string, WorkflowMetrics>()
  private userMetrics = new Map<string, UserActivityMetrics>()
  private systemMetrics: SystemHealthMetrics[] = []
  private alertConfigs = new Map<string, AlertConfig>()
  private activeAlerts = new Map<string, Alert>()
  private dashboards = new Map<string, Dashboard>()
  private dataRetentionDays = 90
  private metricsCollectionInterval: NodeJS.Timeout | null = null
  private alertCheckInterval: NodeJS.Timeout | null = null

  constructor() {
    super()
    this.startMetricsCollection()
    this.startAlertMonitoring()
    console.log('📊 Workflow analytics initialized')
  }

  /**
   * Record workflow execution
   */
  recordExecution(execution: WorkflowExecution): void {
    this.executions.set(execution.id, execution)
    
    // Update workflow metrics
    this.updateWorkflowMetrics(execution)
    
    // Update user metrics
    this.updateUserMetrics(execution)
    
    this.emit('executionRecorded', execution)
  }

  /**
   * Update workflow execution
   */
  updateExecution(execution: WorkflowExecution): void {
    this.executions.set(execution.id, execution)
    this.updateWorkflowMetrics(execution)
    this.updateUserMetrics(execution)
    
    this.emit('executionUpdated', execution)
  }

  /**
   * Get workflow metrics
   */
  getWorkflowMetrics(
    workflowId: string,
    period: TimePeriod = TimePeriod.LAST_24_HOURS,
    customRange?: { start: number; end: number }
  ): WorkflowMetrics | undefined {
    const metrics = this.workflowMetrics.get(workflowId)
    if (!metrics) return undefined

    // Filter and aggregate metrics based on period
    const { startTime, endTime } = this.getTimeRange(period, customRange)
    
    return this.aggregateWorkflowMetrics(workflowId, startTime, endTime)
  }

  /**
   * Get multiple workflow metrics
   */
  getMultipleWorkflowMetrics(
    workflowIds: string[],
    period: TimePeriod = TimePeriod.LAST_24_HOURS,
    customRange?: { start: number; end: number }
  ): Map<string, WorkflowMetrics> {
    const results = new Map<string, WorkflowMetrics>()
    
    for (const workflowId of workflowIds) {
      const metrics = this.getWorkflowMetrics(workflowId, period, customRange)
      if (metrics) {
        results.set(workflowId, metrics)
      }
    }
    
    return results
  }

  /**
   * Get user activity metrics
   */
  getUserMetrics(
    userId: string,
    period: TimePeriod = TimePeriod.LAST_24_HOURS
  ): UserActivityMetrics | undefined {
    return this.userMetrics.get(userId)
  }

  /**
   * Get system health metrics
   */
  getSystemMetrics(
    period: TimePeriod = TimePeriod.LAST_HOUR,
    customRange?: { start: number; end: number }
  ): SystemHealthMetrics[] {
    const { startTime, endTime } = this.getTimeRange(period, customRange)
    
    return this.systemMetrics.filter(metric => 
      metric.timestamp >= startTime && metric.timestamp <= endTime
    )
  }

  /**
   * Get top performing workflows
   */
  getTopPerformingWorkflows(
    metric: 'executions' | 'success_rate' | 'throughput' = 'executions',
    limit = 10,
    period: TimePeriod = TimePeriod.LAST_24_HOURS
  ): Array<{ workflowId: string; workflowName: string; value: number }> {
    const workflows = Array.from(this.workflowMetrics.values())
    
    const sorted = workflows.sort((a, b) => {
      switch (metric) {
        case 'executions':
          return b.totalExecutions - a.totalExecutions
        case 'success_rate':
          return b.successRate - a.successRate
        case 'throughput':
          return b.throughput - a.throughput
        default:
          return 0
      }
    })
    
    return sorted.slice(0, limit).map(w => ({
      workflowId: w.workflowId,
      workflowName: w.workflowName,
      value: metric === 'executions' ? w.totalExecutions :
             metric === 'success_rate' ? w.successRate :
             w.throughput
    }))
  }

  /**
   * Get workflow performance trends
   */
  getWorkflowTrends(
    workflowId: string,
    metrics: MetricType[],
    period: TimePeriod = TimePeriod.LAST_7_DAYS,
    granularity: 'hour' | 'day' = 'hour'
  ): Map<MetricType, TimeSeries> {
    const { startTime, endTime } = this.getTimeRange(period)
    const trends = new Map<MetricType, TimeSeries>()
    
    for (const metric of metrics) {
      const timeSeries = this.generateTimeSeries(
        workflowId,
        metric,
        startTime,
        endTime,
        granularity
      )
      trends.set(metric, timeSeries)
    }
    
    return trends
  }

  /**
   * Get node performance analysis
   */
  getNodePerformanceAnalysis(
    workflowId: string,
    period: TimePeriod = TimePeriod.LAST_24_HOURS
  ): Map<string, NodeMetrics> {
    const workflowMetrics = this.workflowMetrics.get(workflowId)
    if (!workflowMetrics) return new Map()
    
    return workflowMetrics.nodeMetrics
  }

  /**
   * Get integration health dashboard
   */
  getIntegrationHealthDashboard(): Map<string, IntegrationMetrics> {
    const integrationHealth = new Map<string, IntegrationMetrics>()
    
    // Aggregate integration metrics across all workflows
    for (const workflowMetrics of this.workflowMetrics.values()) {
      for (const [providerId, metrics] of workflowMetrics.integrationMetrics) {
        if (integrationHealth.has(providerId)) {
          const existing = integrationHealth.get(providerId)!
          // Merge metrics
          existing.totalCalls += metrics.totalCalls
          existing.successfulCalls += metrics.successfulCalls
          existing.failedCalls += metrics.failedCalls
          existing.averageResponseTime = 
            (existing.averageResponseTime + metrics.averageResponseTime) / 2
          existing.errorRate = existing.failedCalls / existing.totalCalls
          existing.healthScore = Math.min(existing.healthScore, metrics.healthScore)
        } else {
          integrationHealth.set(providerId, { ...metrics })
        }
      }
    }
    
    return integrationHealth
  }

  /**
   * Create alert configuration
   */
  createAlert(config: Omit<AlertConfig, 'id'>): string {
    const alertId = this.generateAlertId()
    const fullConfig: AlertConfig = {
      ...config,
      id: alertId
    }
    
    this.alertConfigs.set(alertId, fullConfig)
    
    this.emit('alertConfigCreated', fullConfig)
    console.log(`🚨 Alert created: ${fullConfig.name}`)
    
    return alertId
  }

  /**
   * Update alert configuration
   */
  updateAlert(alertId: string, updates: Partial<AlertConfig>): boolean {
    const config = this.alertConfigs.get(alertId)
    if (!config) return false
    
    Object.assign(config, updates)
    
    this.emit('alertConfigUpdated', config)
    return true
  }

  /**
   * Delete alert configuration
   */
  deleteAlert(alertId: string): boolean {
    const deleted = this.alertConfigs.delete(alertId)
    if (deleted) {
      this.emit('alertConfigDeleted', alertId)
    }
    return deleted
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(severity?: 'low' | 'medium' | 'high' | 'critical'): Alert[] {
    let alerts = Array.from(this.activeAlerts.values())
    
    if (severity) {
      alerts = alerts.filter(alert => alert.severity === severity)
    }
    
    return alerts.sort((a, b) => b.triggeredAt - a.triggeredAt)
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.activeAlerts.get(alertId)
    if (!alert) return false
    
    alert.acknowledged = true
    alert.acknowledgedBy = acknowledgedBy
    alert.acknowledgedAt = Date.now()
    
    this.emit('alertAcknowledged', alert)
    return true
  }

  /**
   * Create dashboard
   */
  createDashboard(dashboard: Omit<Dashboard, 'id' | 'createdAt' | 'updatedAt'>): string {
    const dashboardId = this.generateDashboardId()
    const fullDashboard: Dashboard = {
      ...dashboard,
      id: dashboardId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
    
    this.dashboards.set(dashboardId, fullDashboard)
    
    this.emit('dashboardCreated', fullDashboard)
    console.log(`📊 Dashboard created: ${fullDashboard.name}`)
    
    return dashboardId
  }

  /**
   * Get dashboard data
   */
  getDashboardData(dashboardId: string): any {
    const dashboard = this.dashboards.get(dashboardId)
    if (!dashboard) return null
    
    const data: any = {
      dashboard,
      widgets: {}
    }
    
    for (const widget of dashboard.widgets) {
      data.widgets[widget.id] = this.getWidgetData(widget)
    }
    
    return data
  }

  /**
   * Generate real-time metrics report
   */
  generateRealTimeReport(): {
    summary: {
      activeWorkflows: number
      runningExecutions: number
      successRate: number
      averageExecutionTime: number
      totalExecutionsToday: number
    }
    topWorkflows: Array<{
      workflowId: string
      name: string
      executions: number
      successRate: number
    }>
    systemHealth: {
      overall: 'healthy' | 'warning' | 'critical'
      cpu: number
      memory: number
      activeAlerts: number
    }
    integrationStatus: Array<{
      providerId: string
      status: 'healthy' | 'degraded' | 'down'
      responseTime: number
      errorRate: number
    }>
  } {
    const now = Date.now()
    const todayStart = new Date(now).setHours(0, 0, 0, 0)
    
    // Calculate summary metrics
    const activeWorkflows = Array.from(this.workflowMetrics.values())
      .filter(w => w.lastExecution && now - w.lastExecution < 24 * 60 * 60 * 1000).length
    
    const runningExecutions = Array.from(this.executions.values())
      .filter(e => e.status === WorkflowStatus.ACTIVE).length
    
    const todayExecutions = Array.from(this.executions.values())
      .filter(e => e.startTime >= todayStart)
    
    const successfulToday = todayExecutions.filter(e => e.status === WorkflowStatus.COMPLETED).length
    const successRate = todayExecutions.length > 0 ? successfulToday / todayExecutions.length : 0
    
    const completedToday = todayExecutions.filter(e => e.duration)
    const averageExecutionTime = completedToday.length > 0
      ? completedToday.reduce((sum, e) => sum + e.duration!, 0) / completedToday.length
      : 0
    
    // Get top workflows
    const topWorkflows = this.getTopPerformingWorkflows('executions', 5, TimePeriod.LAST_24_HOURS)
      .map(w => ({
        workflowId: w.workflowId,
        name: w.workflowName,
        executions: w.value,
        successRate: this.workflowMetrics.get(w.workflowId)?.successRate || 0
      }))
    
    // Get system health
    const latestSystemMetrics = this.systemMetrics[this.systemMetrics.length - 1]
    const activeAlerts = this.getActiveAlerts().length
    
    let systemHealthStatus: 'healthy' | 'warning' | 'critical' = 'healthy'
    if (activeAlerts > 0 || (latestSystemMetrics && latestSystemMetrics.systemLoad.cpu > 80)) {
      systemHealthStatus = 'warning'
    }
    if (activeAlerts > 5 || (latestSystemMetrics && latestSystemMetrics.systemLoad.cpu > 95)) {
      systemHealthStatus = 'critical'
    }
    
    // Get integration status
    const integrationHealth = this.getIntegrationHealthDashboard()
    const integrationStatus = Array.from(integrationHealth.values()).map(metrics => ({
      providerId: metrics.providerId,
      status: metrics.healthScore > 80 ? 'healthy' as const :
              metrics.healthScore > 50 ? 'degraded' as const : 'down' as const,
      responseTime: metrics.averageResponseTime,
      errorRate: metrics.errorRate
    }))
    
    return {
      summary: {
        activeWorkflows,
        runningExecutions,
        successRate,
        averageExecutionTime,
        totalExecutionsToday: todayExecutions.length
      },
      topWorkflows,
      systemHealth: {
        overall: systemHealthStatus,
        cpu: latestSystemMetrics?.systemLoad.cpu || 0,
        memory: latestSystemMetrics?.systemLoad.memory || 0,
        activeAlerts
      },
      integrationStatus
    }
  }

  /**
   * Update workflow metrics
   */
  private updateWorkflowMetrics(execution: WorkflowExecution): void {
    const workflowId = execution.workflowId
    
    if (!this.workflowMetrics.has(workflowId)) {
      this.workflowMetrics.set(workflowId, {
        workflowId,
        workflowName: `Workflow ${workflowId}`, // In production, get from workflow definition
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        minExecutionTime: Infinity,
        maxExecutionTime: 0,
        successRate: 0,
        errorRate: 0,
        throughput: 0,
        trends: {
          executionCount: this.createEmptyTimeSeries(MetricType.EXECUTION_COUNT),
          executionTime: this.createEmptyTimeSeries(MetricType.EXECUTION_TIME),
          successRate: this.createEmptyTimeSeries(MetricType.SUCCESS_RATE),
          errorRate: this.createEmptyTimeSeries(MetricType.ERROR_RATE)
        },
        nodeMetrics: new Map(),
        integrationMetrics: new Map()
      })
    }
    
    const metrics = this.workflowMetrics.get(workflowId)!
    
    // Update basic metrics
    metrics.totalExecutions++
    metrics.lastExecution = execution.startTime
    
    if (execution.status === WorkflowStatus.COMPLETED) {
      metrics.successfulExecutions++
    } else if (execution.status === WorkflowStatus.FAILED) {
      metrics.failedExecutions++
    }
    
    if (execution.duration) {
      metrics.minExecutionTime = Math.min(metrics.minExecutionTime, execution.duration)
      metrics.maxExecutionTime = Math.max(metrics.maxExecutionTime, execution.duration)
      
      // Update average execution time
      const totalDuration = metrics.averageExecutionTime * (metrics.totalExecutions - 1) + execution.duration
      metrics.averageExecutionTime = totalDuration / metrics.totalExecutions
    }
    
    // Update rates
    metrics.successRate = metrics.successfulExecutions / metrics.totalExecutions
    metrics.errorRate = metrics.failedExecutions / metrics.totalExecutions
    
    // Calculate throughput (executions per hour)
    const hourAgo = Date.now() - 60 * 60 * 1000
    const recentExecutions = Array.from(this.executions.values())
      .filter(e => e.workflowId === workflowId && e.startTime >= hourAgo)
    metrics.throughput = recentExecutions.length
    
    // Update node metrics
    for (const [nodeId, nodeExecution] of execution.nodeExecutions) {
      this.updateNodeMetrics(metrics, nodeId, nodeExecution)
    }
  }

  /**
   * Update node metrics
   */
  private updateNodeMetrics(workflowMetrics: WorkflowMetrics, nodeId: string, nodeExecution: any): void {
    if (!workflowMetrics.nodeMetrics.has(nodeId)) {
      workflowMetrics.nodeMetrics.set(nodeId, {
        nodeId,
        nodeType: 'unknown', // In production, get from node definition
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        minExecutionTime: Infinity,
        maxExecutionTime: 0,
        errorRate: 0,
        commonErrors: [],
        performance: {
          cpuUsage: 0,
          memoryUsage: 0
        }
      })
    }
    
    const nodeMetrics = workflowMetrics.nodeMetrics.get(nodeId)!
    
    nodeMetrics.totalExecutions++
    
    if (nodeExecution.status === 'completed') {
      nodeMetrics.successfulExecutions++
    } else if (nodeExecution.status === 'failed') {
      nodeMetrics.failedExecutions++
      
      // Track common errors
      if (nodeExecution.error) {
        const existingError = nodeMetrics.commonErrors.find(e => e.error === nodeExecution.error)
        if (existingError) {
          existingError.count++
          existingError.lastOccurrence = Date.now()
        } else {
          nodeMetrics.commonErrors.push({
            error: nodeExecution.error,
            count: 1,
            lastOccurrence: Date.now()
          })
        }
      }
    }
    
    if (nodeExecution.duration) {
      nodeMetrics.minExecutionTime = Math.min(nodeMetrics.minExecutionTime, nodeExecution.duration)
      nodeMetrics.maxExecutionTime = Math.max(nodeMetrics.maxExecutionTime, nodeExecution.duration)
      
      const totalDuration = nodeMetrics.averageExecutionTime * (nodeMetrics.totalExecutions - 1) + nodeExecution.duration
      nodeMetrics.averageExecutionTime = totalDuration / nodeMetrics.totalExecutions
    }
    
    nodeMetrics.errorRate = nodeMetrics.failedExecutions / nodeMetrics.totalExecutions
  }

  /**
   * Update user metrics
   */
  private updateUserMetrics(execution: WorkflowExecution): void {
    const userId = execution.userId
    
    if (!this.userMetrics.has(userId)) {
      this.userMetrics.set(userId, {
        userId,
        totalWorkflows: 0,
        activeWorkflows: 0,
        totalExecutions: 0,
        successfulExecutions: 0,
        averageExecutionTime: 0,
        mostUsedIntegrations: [],
        activityByHour: new Array(24).fill(0),
        activityByDay: new Array(7).fill(0)
      })
    }
    
    const userMetrics = this.userMetrics.get(userId)!
    
    userMetrics.totalExecutions++
    
    if (execution.status === WorkflowStatus.COMPLETED) {
      userMetrics.successfulExecutions++
    }
    
    if (execution.duration) {
      const totalDuration = userMetrics.averageExecutionTime * (userMetrics.totalExecutions - 1) + execution.duration
      userMetrics.averageExecutionTime = totalDuration / userMetrics.totalExecutions
    }
    
    // Update activity patterns
    const executionDate = new Date(execution.startTime)
    const hour = executionDate.getHours()
    const day = executionDate.getDay()
    
    userMetrics.activityByHour[hour]++
    userMetrics.activityByDay[day]++
  }

  /**
   * Generate time series data
   */
  private generateTimeSeries(
    workflowId: string,
    metric: MetricType,
    startTime: number,
    endTime: number,
    granularity: 'hour' | 'day'
  ): TimeSeries {
    const data: DataPoint[] = []
    const interval = granularity === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000
    
    for (let time = startTime; time <= endTime; time += interval) {
      const value = this.calculateMetricValue(workflowId, metric, time, time + interval)
      data.push({
        timestamp: time,
        value
      })
    }
    
    return {
      metric,
      data,
      aggregation: AggregationType.AVERAGE,
      period: TimePeriod.CUSTOM,
      startTime,
      endTime
    }
  }

  /**
   * Calculate metric value for time range
   */
  private calculateMetricValue(
    workflowId: string,
    metric: MetricType,
    startTime: number,
    endTime: number
  ): number {
    const executions = Array.from(this.executions.values())
      .filter(e => 
        e.workflowId === workflowId &&
        e.startTime >= startTime &&
        e.startTime < endTime
      )
    
    switch (metric) {
      case MetricType.EXECUTION_COUNT:
        return executions.length
      
      case MetricType.EXECUTION_TIME:
        const completedExecutions = executions.filter(e => e.duration)
        return completedExecutions.length > 0
          ? completedExecutions.reduce((sum, e) => sum + e.duration!, 0) / completedExecutions.length
          : 0
      
      case MetricType.SUCCESS_RATE:
        const successful = executions.filter(e => e.status === WorkflowStatus.COMPLETED).length
        return executions.length > 0 ? successful / executions.length : 0
      
      case MetricType.ERROR_RATE:
        const failed = executions.filter(e => e.status === WorkflowStatus.FAILED).length
        return executions.length > 0 ? failed / executions.length : 0
      
      default:
        return 0
    }
  }

  /**
   * Get time range for period
   */
  private getTimeRange(
    period: TimePeriod,
    customRange?: { start: number; end: number }
  ): { startTime: number; endTime: number } {
    const now = Date.now()
    
    if (period === TimePeriod.CUSTOM && customRange) {
      return { startTime: customRange.start, endTime: customRange.end }
    }
    
    switch (period) {
      case TimePeriod.LAST_HOUR:
        return { startTime: now - 60 * 60 * 1000, endTime: now }
      case TimePeriod.LAST_24_HOURS:
        return { startTime: now - 24 * 60 * 60 * 1000, endTime: now }
      case TimePeriod.LAST_7_DAYS:
        return { startTime: now - 7 * 24 * 60 * 60 * 1000, endTime: now }
      case TimePeriod.LAST_30_DAYS:
        return { startTime: now - 30 * 24 * 60 * 60 * 1000, endTime: now }
      case TimePeriod.LAST_90_DAYS:
        return { startTime: now - 90 * 24 * 60 * 60 * 1000, endTime: now }
      default:
        return { startTime: now - 24 * 60 * 60 * 1000, endTime: now }
    }
  }

  /**
   * Aggregate workflow metrics for time range
   */
  private aggregateWorkflowMetrics(
    workflowId: string,
    startTime: number,
    endTime: number
  ): WorkflowMetrics | undefined {
    const baseMetrics = this.workflowMetrics.get(workflowId)
    if (!baseMetrics) return undefined
    
    // Filter executions for time range
    const filteredExecutions = Array.from(this.executions.values())
      .filter(e => 
        e.workflowId === workflowId &&
        e.startTime >= startTime &&
        e.startTime <= endTime
      )
    
    // Recalculate metrics for filtered data
    const totalExecutions = filteredExecutions.length
    const successfulExecutions = filteredExecutions.filter(e => e.status === WorkflowStatus.COMPLETED).length
    const failedExecutions = filteredExecutions.filter(e => e.status === WorkflowStatus.FAILED).length
    
    const completedExecutions = filteredExecutions.filter(e => e.duration)
    const averageExecutionTime = completedExecutions.length > 0
      ? completedExecutions.reduce((sum, e) => sum + e.duration!, 0) / completedExecutions.length
      : 0
    
    return {
      ...baseMetrics,
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      averageExecutionTime,
      successRate: totalExecutions > 0 ? successfulExecutions / totalExecutions : 0,
      errorRate: totalExecutions > 0 ? failedExecutions / totalExecutions : 0
    }
  }

  /**
   * Create empty time series
   */
  private createEmptyTimeSeries(metric: MetricType): TimeSeries {
    return {
      metric,
      data: [],
      aggregation: AggregationType.AVERAGE,
      period: TimePeriod.LAST_24_HOURS,
      startTime: Date.now() - 24 * 60 * 60 * 1000,
      endTime: Date.now()
    }
  }

  /**
   * Get widget data
   */
  private getWidgetData(widget: DashboardWidget): any {
    switch (widget.type) {
      case 'metric':
        return this.getMetricWidgetData(widget)
      case 'chart':
        return this.getChartWidgetData(widget)
      case 'table':
        return this.getTableWidgetData(widget)
      default:
        return {}
    }
  }

  /**
   * Get metric widget data
   */
  private getMetricWidgetData(widget: DashboardWidget): any {
    if (!widget.config.metric) return { value: 0 }
    
    // Aggregate metric across specified workflows
    const workflowIds = widget.config.workflowIds || []
    let totalValue = 0
    
    for (const workflowId of workflowIds) {
      const metrics = this.getWorkflowMetrics(workflowId, widget.config.timePeriod)
      if (metrics) {
        switch (widget.config.metric) {
          case MetricType.EXECUTION_COUNT:
            totalValue += metrics.totalExecutions
            break
          case MetricType.SUCCESS_RATE:
            totalValue += metrics.successRate
            break
          case MetricType.ERROR_RATE:
            totalValue += metrics.errorRate
            break
          case MetricType.EXECUTION_TIME:
            totalValue += metrics.averageExecutionTime
            break
        }
      }
    }
    
    return {
      value: workflowIds.length > 0 ? totalValue / workflowIds.length : totalValue,
      metric: widget.config.metric,
      timestamp: Date.now()
    }
  }

  /**
   * Get chart widget data
   */
  private getChartWidgetData(widget: DashboardWidget): any {
    if (!widget.config.metric) return { series: [] }
    
    const series = []
    const workflowIds = widget.config.workflowIds || []
    
    for (const workflowId of workflowIds) {
      const trends = this.getWorkflowTrends(
        workflowId,
        [widget.config.metric],
        widget.config.timePeriod
      )
      
      const timeSeries = trends.get(widget.config.metric)
      if (timeSeries) {
        series.push({
          name: workflowId,
          data: timeSeries.data.map(point => ({
            x: point.timestamp,
            y: point.value
          }))
        })
      }
    }
    
    return { series }
  }

  /**
   * Get table widget data
   */
  private getTableWidgetData(widget: DashboardWidget): any {
    const workflowIds = widget.config.workflowIds || []
    const rows = []
    
    for (const workflowId of workflowIds) {
      const metrics = this.getWorkflowMetrics(workflowId, widget.config.timePeriod)
      if (metrics) {
        rows.push({
          workflowId,
          workflowName: metrics.workflowName,
          executions: metrics.totalExecutions,
          successRate: metrics.successRate,
          averageTime: metrics.averageExecutionTime
        })
      }
    }
    
    return { rows }
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    this.metricsCollectionInterval = setInterval(() => {
      this.collectSystemMetrics()
    }, 60000) // Collect every minute
  }

  /**
   * Start alert monitoring
   */
  private startAlertMonitoring(): void {
    this.alertCheckInterval = setInterval(() => {
      this.checkAlerts()
    }, 30000) // Check every 30 seconds
  }

  /**
   * Collect system metrics
   */
  private collectSystemMetrics(): void {
    const metrics: SystemHealthMetrics = {
      timestamp: Date.now(),
      activeWorkflows: Array.from(this.workflowMetrics.values())
        .filter(w => w.lastExecution && Date.now() - w.lastExecution < 24 * 60 * 60 * 1000).length,
      runningExecutions: Array.from(this.executions.values())
        .filter(e => e.status === WorkflowStatus.ACTIVE).length,
      queuedExecutions: 0, // Would come from workflow engine
      systemLoad: {
        cpu: Math.random() * 100, // In production, get from system monitor
        memory: Math.random() * 100,
        disk: Math.random() * 100,
        network: Math.random() * 100
      },
      databaseMetrics: {
        connectionCount: 10,
        activeQueries: 5,
        averageQueryTime: 50,
        slowQueries: 0
      },
      cacheMetrics: {
        hitRate: 0.85,
        missRate: 0.15,
        size: 1024,
        evictions: 0
      },
      errorMetrics: {
        totalErrors: 0,
        errorRate: 0,
        criticalErrors: 0,
        errorsByType: {}
      }
    }
    
    this.systemMetrics.push(metrics)
    
    // Keep only last 24 hours of system metrics
    const cutoff = Date.now() - 24 * 60 * 60 * 1000
    this.systemMetrics = this.systemMetrics.filter(m => m.timestamp >= cutoff)
    
    this.emit('systemMetricsCollected', metrics)
  }

  /**
   * Check alerts
   */
  private checkAlerts(): void {
    for (const config of this.alertConfigs.values()) {
      if (!config.enabled) continue
      
      this.evaluateAlert(config)
    }
  }

  /**
   * Evaluate alert condition
   */
  private evaluateAlert(config: AlertConfig): void {
    // Get current metric value
    const currentValue = this.getCurrentMetricValue(config.metric, config.workflowId)
    
    for (const condition of config.conditions) {
      const triggered = this.evaluateCondition(currentValue, condition)
      
      if (triggered && !this.activeAlerts.has(config.id)) {
        // Trigger alert
        const alert: Alert = {
          id: this.generateAlertId(),
          configId: config.id,
          triggeredAt: Date.now(),
          metric: config.metric,
          value: currentValue,
          threshold: condition.threshold,
          workflowId: config.workflowId,
          message: `${config.name}: ${config.metric} is ${currentValue} (threshold: ${condition.threshold})`,
          severity: config.severity,
          acknowledged: false
        }
        
        this.activeAlerts.set(config.id, alert)
        this.emit('alertTriggered', alert)
        console.warn(`🚨 Alert triggered: ${config.name}`)
        
      } else if (!triggered && this.activeAlerts.has(config.id)) {
        // Resolve alert
        const alert = this.activeAlerts.get(config.id)!
        alert.resolvedAt = Date.now()
        this.activeAlerts.delete(config.id)
        this.emit('alertResolved', alert)
        console.log(`✅ Alert resolved: ${config.name}`)
      }
    }
  }

  /**
   * Get current metric value
   */
  private getCurrentMetricValue(metric: MetricType, workflowId?: string): number {
    switch (metric) {
      case MetricType.EXECUTION_COUNT:
        if (workflowId) {
          const workflowMetrics = this.workflowMetrics.get(workflowId)
          return workflowMetrics?.totalExecutions || 0
        }
        return Array.from(this.workflowMetrics.values())
          .reduce((sum, m) => sum + m.totalExecutions, 0)
      
      case MetricType.ERROR_RATE:
        if (workflowId) {
          const workflowMetrics = this.workflowMetrics.get(workflowId)
          return workflowMetrics?.errorRate || 0
        }
        const allMetrics = Array.from(this.workflowMetrics.values())
        const totalExecutions = allMetrics.reduce((sum, m) => sum + m.totalExecutions, 0)
        const totalFailed = allMetrics.reduce((sum, m) => sum + m.failedExecutions, 0)
        return totalExecutions > 0 ? totalFailed / totalExecutions : 0
      
      default:
        return 0
    }
  }

  /**
   * Evaluate alert condition
   */
  private evaluateCondition(value: number, condition: any): boolean {
    switch (condition.operator) {
      case 'gt': return value > condition.threshold
      case 'lt': return value < condition.threshold
      case 'eq': return value === condition.threshold
      case 'gte': return value >= condition.threshold
      case 'lte': return value <= condition.threshold
      default: return false
    }
  }

  /**
   * Generate alert ID
   */
  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Generate dashboard ID
   */
  private generateDashboardId(): string {
    return `dashboard_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Cleanup old data
   */
  async cleanup(): Promise<void> {
    const cutoff = Date.now() - this.dataRetentionDays * 24 * 60 * 60 * 1000
    
    // Clean up old executions
    const executionsToDelete = []
    for (const [id, execution] of this.executions.entries()) {
      if (execution.startTime < cutoff) {
        executionsToDelete.push(id)
      }
    }
    
    for (const id of executionsToDelete) {
      this.executions.delete(id)
    }
    
    // Clean up old system metrics
    this.systemMetrics = this.systemMetrics.filter(m => m.timestamp >= cutoff)
    
    console.log(`🧹 Analytics cleanup: removed ${executionsToDelete.length} old executions`)
  }

  /**
   * Shutdown analytics system
   */
  shutdown(): void {
    if (this.metricsCollectionInterval) {
      clearInterval(this.metricsCollectionInterval)
    }
    
    if (this.alertCheckInterval) {
      clearInterval(this.alertCheckInterval)
    }
    
    this.executions.clear()
    this.workflowMetrics.clear()
    this.userMetrics.clear()
    this.alertConfigs.clear()
    this.activeAlerts.clear()
    this.dashboards.clear()
    this.systemMetrics.length = 0
    
    this.removeAllListeners()
    console.log('🛑 Workflow analytics shutdown')
  }
}

/**
 * Global workflow analytics instance
 */
export const workflowAnalytics = new WorkflowAnalytics()