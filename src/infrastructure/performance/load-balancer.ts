import { EventEmitter } from 'events'
import { performanceMonitor } from './performance-monitor'
import { circuitBreakerRegistry } from './circuit-breaker'

/**
 * Load balancing strategies
 */
export enum LoadBalancingStrategy {
  ROUND_ROBIN = 'round_robin',
  WEIGHTED_ROUND_ROBIN = 'weighted_round_robin',
  LEAST_CONNECTIONS = 'least_connections',
  WEIGHTED_LEAST_CONNECTIONS = 'weighted_least_connections',
  LEAST_RESPONSE_TIME = 'least_response_time',
  WEIGHTED_RESPONSE_TIME = 'weighted_response_time',
  RANDOM = 'random',
  WEIGHTED_RANDOM = 'weighted_random',
  HASH = 'hash',
  RESOURCE_BASED = 'resource_based',
  ADAPTIVE = 'adaptive'
}

/**
 * Server/instance configuration
 */
export interface ServerConfig {
  id: string
  endpoint: string
  weight: number
  maxConnections: number
  healthCheckPath?: string
  metadata?: Record<string, any>
  priority?: number // Higher priority = preferred
  region?: string
  capabilities?: string[]
}

/**
 * Server health status
 */
export interface ServerHealth {
  serverId: string
  healthy: boolean
  responseTime: number
  errorRate: number
  connections: number
  lastCheckTime: number
  consecutiveFailures: number
  lastError?: string
}

/**
 * Load balancing context
 */
export interface LoadBalancingContext {
  userId?: string
  sessionId?: string
  requestId?: string
  operation?: string
  priority?: 'low' | 'normal' | 'high' | 'critical'
  requiredCapabilities?: string[]
  metadata?: Record<string, any>
}

/**
 * Load balancer configuration
 */
export interface LoadBalancerConfig {
  strategy: LoadBalancingStrategy
  healthCheckInterval: number
  healthCheckTimeout: number
  maxRetries: number
  retryDelay: number
  stickySessions: boolean
  sessionTimeout: number
  failover: boolean
  adaptiveWeighting: boolean
  performanceThreshold: number // ms
}

/**
 * Load balancer statistics
 */
export interface LoadBalancerStats {
  totalRequests: number
  successfulRequests: number
  failedRequests: number
  averageResponseTime: number
  requestsPerSecond: number
  activeConnections: number
  serverStats: Map<string, {
    requests: number
    failures: number
    averageResponseTime: number
    connections: number
    weight: number
  }>
}

/**
 * Intelligent load balancer with multiple strategies and health monitoring
 */
export class LoadBalancer extends EventEmitter {
  private servers = new Map<string, ServerConfig>()
  private serverHealth = new Map<string, ServerHealth>()
  private connections = new Map<string, number>() // Active connections per server
  private sessions = new Map<string, string>() // Session -> Server mapping
  private currentIndex = 0 // For round robin
  private stats: LoadBalancerStats
  private config: LoadBalancerConfig
  private healthCheckTimer: NodeJS.Timeout | null = null
  private performanceHistory = new Map<string, number[]>() // Response time history

  constructor(
    private name: string,
    config: Partial<LoadBalancerConfig> = {}
  ) {
    super()
    
    this.config = {
      strategy: LoadBalancingStrategy.WEIGHTED_ROUND_ROBIN,
      healthCheckInterval: 30000, // 30 seconds
      healthCheckTimeout: 5000,   // 5 seconds
      maxRetries: 3,
      retryDelay: 1000,
      stickySessions: false,
      sessionTimeout: 3600000,    // 1 hour
      failover: true,
      adaptiveWeighting: true,
      performanceThreshold: 2000, // 2 seconds
      ...config
    }

    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      requestsPerSecond: 0,
      activeConnections: 0,
      serverStats: new Map()
    }

    this.startHealthChecks()
    
    console.log(`⚖️ Load balancer initialized: ${name} (strategy: ${this.config.strategy})`)
  }

  /**
   * Add server to load balancer
   */
  addServer(server: ServerConfig): void {
    this.servers.set(server.id, server)
    this.connections.set(server.id, 0)
    this.performanceHistory.set(server.id, [])
    
    // Initialize health status
    this.serverHealth.set(server.id, {
      serverId: server.id,
      healthy: true, // Assume healthy initially
      responseTime: 0,
      errorRate: 0,
      connections: 0,
      lastCheckTime: Date.now(),
      consecutiveFailures: 0
    })

    // Initialize stats
    this.stats.serverStats.set(server.id, {
      requests: 0,
      failures: 0,
      averageResponseTime: 0,
      connections: 0,
      weight: server.weight
    })

    console.log(`➕ Server added: ${server.id} (weight: ${server.weight})`)
    this.emit('serverAdded', server)
  }

  /**
   * Remove server from load balancer
   */
  removeServer(serverId: string): boolean {
    const server = this.servers.get(serverId)
    if (!server) return false

    this.servers.delete(serverId)
    this.serverHealth.delete(serverId)
    this.connections.delete(serverId)
    this.performanceHistory.delete(serverId)
    this.stats.serverStats.delete(serverId)

    // Remove from sessions
    for (const [sessionId, serverIdInSession] of this.sessions.entries()) {
      if (serverIdInSession === serverId) {
        this.sessions.delete(sessionId)
      }
    }

    console.log(`➖ Server removed: ${serverId}`)
    this.emit('serverRemoved', server)
    return true
  }

  /**
   * Get next server based on load balancing strategy
   */
  async getServer(context: LoadBalancingContext = {}): Promise<string | null> {
    const availableServers = this.getHealthyServers(context)
    
    if (availableServers.length === 0) {
      console.warn(`⚠️ No healthy servers available in load balancer: ${this.name}`)
      return null
    }

    // Check for sticky session
    if (this.config.stickySessions && context.sessionId) {
      const stickyServer = this.sessions.get(context.sessionId)
      if (stickyServer && availableServers.find(s => s.id === stickyServer)) {
        return stickyServer
      }
    }

    // Select server based on strategy
    let selectedServer: ServerConfig | null = null

    switch (this.config.strategy) {
      case LoadBalancingStrategy.ROUND_ROBIN:
        selectedServer = this.selectRoundRobin(availableServers)
        break
      
      case LoadBalancingStrategy.WEIGHTED_ROUND_ROBIN:
        selectedServer = this.selectWeightedRoundRobin(availableServers)
        break
      
      case LoadBalancingStrategy.LEAST_CONNECTIONS:
        selectedServer = this.selectLeastConnections(availableServers)
        break
      
      case LoadBalancingStrategy.WEIGHTED_LEAST_CONNECTIONS:
        selectedServer = this.selectWeightedLeastConnections(availableServers)
        break
      
      case LoadBalancingStrategy.LEAST_RESPONSE_TIME:
        selectedServer = this.selectLeastResponseTime(availableServers)
        break
      
      case LoadBalancingStrategy.WEIGHTED_RESPONSE_TIME:
        selectedServer = this.selectWeightedResponseTime(availableServers)
        break
      
      case LoadBalancingStrategy.RANDOM:
        selectedServer = this.selectRandom(availableServers)
        break
      
      case LoadBalancingStrategy.WEIGHTED_RANDOM:
        selectedServer = this.selectWeightedRandom(availableServers)
        break
      
      case LoadBalancingStrategy.HASH:
        selectedServer = this.selectHash(availableServers, context)
        break
      
      case LoadBalancingStrategy.RESOURCE_BASED:
        selectedServer = this.selectResourceBased(availableServers, context)
        break
      
      case LoadBalancingStrategy.ADAPTIVE:
        selectedServer = this.selectAdaptive(availableServers, context)
        break
      
      default:
        selectedServer = this.selectRoundRobin(availableServers)
    }

    if (!selectedServer) return null

    // Create sticky session if enabled
    if (this.config.stickySessions && context.sessionId) {
      this.sessions.set(context.sessionId, selectedServer.id)
      
      // Set session timeout
      setTimeout(() => {
        this.sessions.delete(context.sessionId!)
      }, this.config.sessionTimeout)
    }

    return selectedServer.id
  }

  /**
   * Execute request with load balancing and retry logic
   */
  async execute<T>(
    fn: (endpoint: string, serverId: string) => Promise<T>,
    context: LoadBalancingContext = {}
  ): Promise<T> {
    const startTime = Date.now()
    let lastError: Error | null = null
    
    this.stats.totalRequests++

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      const serverId = await this.getServer(context)
      
      if (!serverId) {
        throw new Error(`No healthy servers available in load balancer: ${this.name}`)
      }

      const server = this.servers.get(serverId)!
      
      try {
        // Track connection
        this.incrementConnections(serverId)
        
        // Execute request
        const result = await fn(server.endpoint, serverId)
        const responseTime = Date.now() - startTime
        
        // Record success
        this.recordSuccess(serverId, responseTime)
        this.stats.successfulRequests++
        
        this.emit('requestSuccess', {
          serverId,
          responseTime,
          attempt: attempt + 1,
          context
        })

        return result
        
      } catch (error: any) {
        lastError = error
        const responseTime = Date.now() - startTime
        
        // Record failure
        this.recordFailure(serverId, responseTime, error)
        
        this.emit('requestFailure', {
          serverId,
          error,
          responseTime,
          attempt: attempt + 1,
          context
        })

        // Check if we should retry
        if (attempt < this.config.maxRetries - 1 && this.shouldRetry(error)) {
          console.log(`🔄 Retrying request (attempt ${attempt + 2}/${this.config.maxRetries})`)
          await this.delay(this.config.retryDelay * Math.pow(2, attempt)) // Exponential backoff
        }
        
      } finally {
        this.decrementConnections(serverId)
      }
    }

    this.stats.failedRequests++
    throw lastError || new Error('All retry attempts failed')
  }

  /**
   * Get server health status
   */
  getServerHealth(serverId: string): ServerHealth | null {
    return this.serverHealth.get(serverId) || null
  }

  /**
   * Get all server health statuses
   */
  getAllServerHealth(): Map<string, ServerHealth> {
    return new Map(this.serverHealth)
  }

  /**
   * Get load balancer statistics
   */
  getStats(): LoadBalancerStats {
    this.updateStats()
    return { ...this.stats }
  }

  /**
   * Force health check on all servers
   */
  async performHealthCheck(): Promise<void> {
    const healthPromises = Array.from(this.servers.values()).map(server => 
      this.checkServerHealth(server)
    )
    
    await Promise.allSettled(healthPromises)
    this.emit('healthCheckCompleted')
  }

  /**
   * Get healthy servers based on context
   */
  private getHealthyServers(context: LoadBalancingContext): ServerConfig[] {
    return Array.from(this.servers.values()).filter(server => {
      const health = this.serverHealth.get(server.id)
      if (!health || !health.healthy) return false
      
      // Check required capabilities
      if (context.requiredCapabilities) {
        const hasCapabilities = context.requiredCapabilities.every(cap => 
          server.capabilities?.includes(cap)
        )
        if (!hasCapabilities) return false
      }
      
      // Check connection limits
      const connections = this.connections.get(server.id) || 0
      if (connections >= server.maxConnections) return false
      
      return true
    })
  }

  /**
   * Round robin selection
   */
  private selectRoundRobin(servers: ServerConfig[]): ServerConfig {
    const server = servers[this.currentIndex % servers.length]
    this.currentIndex = (this.currentIndex + 1) % servers.length
    return server
  }

  /**
   * Weighted round robin selection
   */
  private selectWeightedRoundRobin(servers: ServerConfig[]): ServerConfig {
    const totalWeight = servers.reduce((sum, server) => sum + server.weight, 0)
    let randomWeight = Math.random() * totalWeight
    
    for (const server of servers) {
      randomWeight -= server.weight
      if (randomWeight <= 0) {
        return server
      }
    }
    
    return servers[0] // Fallback
  }

  /**
   * Least connections selection
   */
  private selectLeastConnections(servers: ServerConfig[]): ServerConfig {
    return servers.reduce((best, server) => {
      const serverConnections = this.connections.get(server.id) || 0
      const bestConnections = this.connections.get(best.id) || 0
      return serverConnections < bestConnections ? server : best
    })
  }

  /**
   * Weighted least connections selection
   */
  private selectWeightedLeastConnections(servers: ServerConfig[]): ServerConfig {
    return servers.reduce((best, server) => {
      const serverRatio = (this.connections.get(server.id) || 0) / server.weight
      const bestRatio = (this.connections.get(best.id) || 0) / best.weight
      return serverRatio < bestRatio ? server : best
    })
  }

  /**
   * Least response time selection
   */
  private selectLeastResponseTime(servers: ServerConfig[]): ServerConfig {
    return servers.reduce((best, server) => {
      const serverHealth = this.serverHealth.get(server.id)!
      const bestHealth = this.serverHealth.get(best.id)!
      return serverHealth.responseTime < bestHealth.responseTime ? server : best
    })
  }

  /**
   * Weighted response time selection
   */
  private selectWeightedResponseTime(servers: ServerConfig[]): ServerConfig {
    return servers.reduce((best, server) => {
      const serverHealth = this.serverHealth.get(server.id)!
      const bestHealth = this.serverHealth.get(best.id)!
      const serverScore = serverHealth.responseTime / server.weight
      const bestScore = bestHealth.responseTime / best.weight
      return serverScore < bestScore ? server : best
    })
  }

  /**
   * Random selection
   */
  private selectRandom(servers: ServerConfig[]): ServerConfig {
    const randomIndex = Math.floor(Math.random() * servers.length)
    return servers[randomIndex]
  }

  /**
   * Weighted random selection
   */
  private selectWeightedRandom(servers: ServerConfig[]): ServerConfig {
    const totalWeight = servers.reduce((sum, server) => sum + server.weight, 0)
    let randomWeight = Math.random() * totalWeight
    
    for (const server of servers) {
      randomWeight -= server.weight
      if (randomWeight <= 0) {
        return server
      }
    }
    
    return servers[0] // Fallback
  }

  /**
   * Hash-based selection (consistent hashing)
   */
  private selectHash(servers: ServerConfig[], context: LoadBalancingContext): ServerConfig {
    const hashInput = context.userId || context.sessionId || context.requestId || 'default'
    const hash = this.simpleHash(hashInput)
    const index = hash % servers.length
    return servers[index]
  }

  /**
   * Resource-based selection
   */
  private selectResourceBased(servers: ServerConfig[], context: LoadBalancingContext): ServerConfig {
    // Score servers based on multiple factors
    return servers.reduce((best, server) => {
      const bestScore = this.calculateResourceScore(best)
      const serverScore = this.calculateResourceScore(server)
      return serverScore > bestScore ? server : best
    })
  }

  /**
   * Adaptive selection based on performance
   */
  private selectAdaptive(servers: ServerConfig[], context: LoadBalancingContext): ServerConfig {
    // Adjust weights based on performance and use weighted selection
    const adaptiveServers = servers.map(server => {
      const adaptiveWeight = this.calculateAdaptiveWeight(server)
      return { ...server, weight: adaptiveWeight }
    })
    
    return this.selectWeightedRandom(adaptiveServers)
  }

  /**
   * Calculate resource score for a server
   */
  private calculateResourceScore(server: ServerConfig): number {
    const health = this.serverHealth.get(server.id)!
    const connections = this.connections.get(server.id) || 0
    
    let score = server.weight * 100 // Base score from weight
    
    // Penalize high response time
    score -= health.responseTime / 10
    
    // Penalize high connection count
    score -= (connections / server.maxConnections) * 50
    
    // Penalize high error rate
    score -= health.errorRate * 2
    
    // Boost for priority
    score += (server.priority || 0) * 20
    
    return Math.max(0, score)
  }

  /**
   * Calculate adaptive weight based on performance
   */
  private calculateAdaptiveWeight(server: ServerConfig): number {
    if (!this.config.adaptiveWeighting) {
      return server.weight
    }

    const health = this.serverHealth.get(server.id)!
    const baseWeight = server.weight
    
    // Start with base weight
    let adaptiveWeight = baseWeight
    
    // Adjust based on response time
    if (health.responseTime > this.config.performanceThreshold) {
      adaptiveWeight *= 0.5 // Reduce weight for slow servers
    } else if (health.responseTime < this.config.performanceThreshold / 2) {
      adaptiveWeight *= 1.5 // Increase weight for fast servers
    }
    
    // Adjust based on error rate
    if (health.errorRate > 10) {
      adaptiveWeight *= 0.3 // Heavily penalize high error rates
    } else if (health.errorRate < 1) {
      adaptiveWeight *= 1.2 // Reward low error rates
    }
    
    return Math.max(0.1, adaptiveWeight) // Minimum weight
  }

  /**
   * Check if error should trigger retry
   */
  private shouldRetry(error: Error): boolean {
    const message = error.message.toLowerCase()
    
    // Don't retry authentication errors
    if (message.includes('unauthorized') || message.includes('forbidden')) {
      return false
    }
    
    // Don't retry validation errors
    if (message.includes('invalid') || message.includes('bad request')) {
      return false
    }
    
    // Retry network errors, timeouts, and server errors
    return true
  }

  /**
   * Record successful request
   */
  private recordSuccess(serverId: string, responseTime: number): void {
    const health = this.serverHealth.get(serverId)!
    const stats = this.stats.serverStats.get(serverId)!
    
    // Update health
    health.consecutiveFailures = 0
    health.responseTime = this.updateAverage(health.responseTime, responseTime, 10)
    health.lastCheckTime = Date.now()
    
    // Update stats
    stats.requests++
    stats.averageResponseTime = this.updateAverage(
      stats.averageResponseTime, 
      responseTime, 
      stats.requests
    )
    
    // Update performance history
    const history = this.performanceHistory.get(serverId)!
    history.push(responseTime)
    if (history.length > 100) {
      history.shift() // Keep last 100 measurements
    }
    
    this.updateServerErrorRate(serverId)
  }

  /**
   * Record failed request
   */
  private recordFailure(serverId: string, responseTime: number, error: Error): void {
    const health = this.serverHealth.get(serverId)!
    const stats = this.stats.serverStats.get(serverId)!
    
    // Update health
    health.consecutiveFailures++
    health.lastError = error.message
    health.lastCheckTime = Date.now()
    
    // Mark as unhealthy after consecutive failures
    if (health.consecutiveFailures >= 3) {
      health.healthy = false
      console.warn(`⚠️ Server marked unhealthy: ${serverId} (${health.consecutiveFailures} failures)`)
      this.emit('serverUnhealthy', serverId, health)
    }
    
    // Update stats
    stats.requests++
    stats.failures++
    
    this.updateServerErrorRate(serverId)
  }

  /**
   * Update server error rate
   */
  private updateServerErrorRate(serverId: string): void {
    const stats = this.stats.serverStats.get(serverId)!
    const health = this.serverHealth.get(serverId)!
    
    health.errorRate = stats.requests > 0 ? (stats.failures / stats.requests) * 100 : 0
  }

  /**
   * Increment active connections
   */
  private incrementConnections(serverId: string): void {
    const current = this.connections.get(serverId) || 0
    this.connections.set(serverId, current + 1)
    
    const health = this.serverHealth.get(serverId)!
    const stats = this.stats.serverStats.get(serverId)!
    health.connections = current + 1
    stats.connections = current + 1
  }

  /**
   * Decrement active connections
   */
  private decrementConnections(serverId: string): void {
    const current = this.connections.get(serverId) || 0
    this.connections.set(serverId, Math.max(0, current - 1))
    
    const health = this.serverHealth.get(serverId)!
    const stats = this.stats.serverStats.get(serverId)!
    health.connections = Math.max(0, current - 1)
    stats.connections = Math.max(0, current - 1)
  }

  /**
   * Start health checks
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck()
    }, this.config.healthCheckInterval)
  }

  /**
   * Check health of a single server
   */
  private async checkServerHealth(server: ServerConfig): Promise<void> {
    const health = this.serverHealth.get(server.id)!
    const startTime = Date.now()

    try {
      // Simulate health check (in real implementation, make HTTP request)
      const healthCheckPath = server.healthCheckPath || '/health'
      const healthCheckUrl = `${server.endpoint}${healthCheckPath}`
      
      // For now, just simulate a successful check
      await this.delay(Math.random() * 100) // Random delay 0-100ms
      
      const responseTime = Date.now() - startTime
      
      // Mark as healthy
      if (!health.healthy) {
        console.log(`✅ Server recovered: ${server.id}`)
        this.emit('serverRecovered', server.id, health)
      }
      
      health.healthy = true
      health.consecutiveFailures = 0
      health.responseTime = this.updateAverage(health.responseTime, responseTime, 10)
      health.lastCheckTime = Date.now()
      
    } catch (error: any) {
      health.consecutiveFailures++
      health.lastError = error.message
      health.lastCheckTime = Date.now()
      
      if (health.consecutiveFailures >= 3) {
        health.healthy = false
        console.warn(`❌ Health check failed: ${server.id} (${error.message})`)
        this.emit('serverUnhealthy', server.id, health)
      }
    }
  }

  /**
   * Update running average
   */
  private updateAverage(current: number, newValue: number, windowSize: number): number {
    if (current === 0) return newValue
    const weight = Math.min(1, 1 / windowSize)
    return current * (1 - weight) + newValue * weight
  }

  /**
   * Simple hash function
   */
  private simpleHash(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }

  /**
   * Update overall statistics
   */
  private updateStats(): void {
    this.stats.activeConnections = Array.from(this.connections.values())
      .reduce((sum, conn) => sum + conn, 0)
    
    const totalRequests = this.stats.totalRequests
    if (totalRequests > 0) {
      const totalResponseTime = Array.from(this.stats.serverStats.values())
        .reduce((sum, stats) => sum + (stats.averageResponseTime * stats.requests), 0)
      
      this.stats.averageResponseTime = totalResponseTime / totalRequests
    }
    
    // Calculate requests per second (simplified)
    this.stats.requestsPerSecond = totalRequests / (Date.now() / 1000) // Very rough estimate
  }

  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Shutdown load balancer
   */
  shutdown(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
    
    this.servers.clear()
    this.serverHealth.clear()
    this.connections.clear()
    this.sessions.clear()
    this.performanceHistory.clear()
    
    this.removeAllListeners()
    console.log(`🛑 Load balancer shutdown: ${this.name}`)
  }
}

/**
 * Load balancer pool for managing multiple load balancers
 */
export class LoadBalancerPool extends EventEmitter {
  private loadBalancers = new Map<string, LoadBalancer>()
  private globalStats = {
    totalRequests: 0,
    totalServers: 0,
    healthyServers: 0,
    activeConnections: 0
  }

  constructor() {
    super()
  }

  /**
   * Create load balancer
   */
  createLoadBalancer(name: string, config?: Partial<LoadBalancerConfig>): LoadBalancer {
    if (this.loadBalancers.has(name)) {
      throw new Error(`Load balancer '${name}' already exists`)
    }

    const loadBalancer = new LoadBalancer(name, config)
    
    // Forward events
    loadBalancer.on('requestSuccess', (data) => {
      this.globalStats.totalRequests++
      this.emit('requestSuccess', name, data)
    })
    
    loadBalancer.on('requestFailure', (data) => {
      this.globalStats.totalRequests++
      this.emit('requestFailure', name, data)
    })
    
    loadBalancer.on('serverUnhealthy', (serverId, health) => {
      this.emit('serverUnhealthy', name, serverId, health)
    })

    this.loadBalancers.set(name, loadBalancer)
    console.log(`🏗️ Load balancer created: ${name}`)
    
    return loadBalancer
  }

  /**
   * Get load balancer
   */
  getLoadBalancer(name: string): LoadBalancer | null {
    return this.loadBalancers.get(name) || null
  }

  /**
   * Remove load balancer
   */
  removeLoadBalancer(name: string): boolean {
    const loadBalancer = this.loadBalancers.get(name)
    if (loadBalancer) {
      loadBalancer.shutdown()
      this.loadBalancers.delete(name)
      console.log(`🗑️ Load balancer removed: ${name}`)
      return true
    }
    return false
  }

  /**
   * Get global statistics
   */
  getGlobalStats(): typeof this.globalStats {
    this.updateGlobalStats()
    return { ...this.globalStats }
  }

  /**
   * Get all load balancer stats
   */
  getAllStats(): Map<string, LoadBalancerStats> {
    const allStats = new Map<string, LoadBalancerStats>()
    
    for (const [name, lb] of this.loadBalancers.entries()) {
      allStats.set(name, lb.getStats())
    }
    
    return allStats
  }

  /**
   * Perform health check on all load balancers
   */
  async performGlobalHealthCheck(): Promise<void> {
    const healthPromises = Array.from(this.loadBalancers.values()).map(lb => 
      lb.performHealthCheck()
    )
    
    await Promise.allSettled(healthPromises)
    this.emit('globalHealthCheckCompleted')
  }

  /**
   * Update global statistics
   */
  private updateGlobalStats(): void {
    let totalServers = 0
    let healthyServers = 0
    let activeConnections = 0

    for (const lb of this.loadBalancers.values()) {
      const stats = lb.getStats()
      totalServers += stats.serverStats.size
      activeConnections += stats.activeConnections
      
      // Count healthy servers
      for (const [serverId] of stats.serverStats.entries()) {
        const health = lb.getServerHealth(serverId)
        if (health?.healthy) {
          healthyServers++
        }
      }
    }

    this.globalStats.totalServers = totalServers
    this.globalStats.healthyServers = healthyServers
    this.globalStats.activeConnections = activeConnections
  }

  /**
   * Shutdown all load balancers
   */
  shutdown(): void {
    for (const lb of this.loadBalancers.values()) {
      lb.shutdown()
    }
    
    this.loadBalancers.clear()
    this.removeAllListeners()
    console.log('🛑 Load balancer pool shutdown')
  }
}

/**
 * Global load balancer pool
 */
export const loadBalancerPool = new LoadBalancerPool()

/**
 * Create provider-specific load balancer
 */
export function createProviderLoadBalancer(providerId: string, servers: ServerConfig[]): LoadBalancer {
  const loadBalancer = loadBalancerPool.createLoadBalancer(`provider:${providerId}`, {
    strategy: LoadBalancingStrategy.WEIGHTED_RESPONSE_TIME,
    healthCheckInterval: 30000,
    failover: true,
    adaptiveWeighting: true
  })
  
  for (const server of servers) {
    loadBalancer.addServer(server)
  }
  
  return loadBalancer
}

/**
 * Load balancing decorator
 */
export function LoadBalanced(loadBalancerName: string) {
  return function (target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value

    descriptor.value = async function (this: any, ...args: any[]) {
      const loadBalancer = loadBalancerPool.getLoadBalancer(loadBalancerName)
      
      if (!loadBalancer) {
        // No load balancer - execute directly
        return method.apply(this, args)
      }

      const context: LoadBalancingContext = {
        userId: args[args.length - 1], // Assume last arg is userId
        operation: propertyName,
        requestId: `${propertyName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      }

      return loadBalancer.execute(async (endpoint: string, serverId: string) => {
        // Replace base URL with load balanced endpoint
        const originalBaseUrl = this.config?.baseUrl
        if (originalBaseUrl) {
          this.config.baseUrl = endpoint
        }
        
        try {
          return await method.apply(this, args)
        } finally {
          // Restore original base URL
          if (originalBaseUrl) {
            this.config.baseUrl = originalBaseUrl
          }
        }
      }, context)
    }

    return descriptor
  }
}