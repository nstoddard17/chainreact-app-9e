import { createClient } from "@supabase/supabase-js"

export interface OptimizationSuggestion {
  id: string
  type: "performance" | "reliability" | "cost" | "maintainability"
  severity: "low" | "medium" | "high" | "critical"
  title: string
  description: string
  impact: string
  effort: "low" | "medium" | "high"
  autoFixable: boolean
  nodeIds: string[]
  suggestedChanges: any
}

export interface PerformanceMetrics {
  executionTime: number
  memoryUsage: number
  apiCalls: number
  errorRate: number
  throughput: number
  bottlenecks: string[]
}

export class WorkflowOptimizer {
  private supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  async analyzeWorkflow(workflowId: string): Promise<{
    metrics: PerformanceMetrics
    suggestions: OptimizationSuggestion[]
    score: number
  }> {
    // Get workflow data
    const { data: workflow } = await this.supabase.from("workflows").select("*").eq("id", workflowId).single()

    if (!workflow) throw new Error("Workflow not found")

    // Get execution history for analysis
    const { data: executions } = await this.supabase
      .from("workflow_execution_sessions")
      .select("*")
      .eq("workflow_id", workflowId)
      .order("created_at", { ascending: false })
      .limit(100)

    // Analyze performance metrics
    const metrics = await this.calculatePerformanceMetrics(workflow, executions || [])

    // Generate optimization suggestions
    const suggestions = await this.generateOptimizationSuggestions(workflow, metrics)

    // Calculate overall optimization score
    const score = this.calculateOptimizationScore(metrics, suggestions)

    return { metrics, suggestions, score }
  }

  private async calculatePerformanceMetrics(workflow: any, executions: any[]): Promise<PerformanceMetrics> {
    const completedExecutions = executions.filter((e) => e.status === "completed")

    if (completedExecutions.length === 0) {
      return {
        executionTime: 0,
        memoryUsage: 0,
        apiCalls: 0,
        errorRate: 0,
        throughput: 0,
        bottlenecks: [],
      }
    }

    // Calculate average execution time
    const executionTimes = completedExecutions
      .filter((e) => e.started_at && e.completed_at)
      .map((e) => new Date(e.completed_at).getTime() - new Date(e.started_at).getTime())

    const avgExecutionTime =
      executionTimes.length > 0 ? executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length : 0

    // Calculate error rate
    const totalExecutions = executions.length
    const failedExecutions = executions.filter((e) => e.status === "failed").length
    const errorRate = totalExecutions > 0 ? (failedExecutions / totalExecutions) * 100 : 0

    // Analyze workflow structure for bottlenecks
    const bottlenecks = this.identifyBottlenecks(workflow)

    // Calculate throughput (executions per hour)
    const recentExecutions = executions.filter(
      (e) => new Date(e.created_at).getTime() > Date.now() - 24 * 60 * 60 * 1000,
    )
    const throughput = recentExecutions.length / 24

    return {
      executionTime: avgExecutionTime,
      memoryUsage: this.estimateMemoryUsage(workflow),
      apiCalls: this.countApiCalls(workflow),
      errorRate,
      throughput,
      bottlenecks,
    }
  }

  private identifyBottlenecks(workflow: any): string[] {
    const bottlenecks: string[] = []
    const nodes = workflow.nodes || []
    const connections = workflow.connections || []

    // Find sequential chains that could be parallelized
    const sequentialChains = this.findSequentialChains(nodes, connections)
    sequentialChains.forEach((chain) => {
      if (chain.length > 3) {
        bottlenecks.push(`Sequential chain of ${chain.length} nodes: ${chain.join(" → ")}`)
      }
    })

    // Find nodes with high fan-out (potential bottlenecks)
    nodes.forEach((node: any) => {
      const outgoingConnections = connections.filter((c: any) => c.source === node.id)
      if (outgoingConnections.length > 5) {
        bottlenecks.push(`High fan-out node: ${node.id} (${outgoingConnections.length} connections)`)
      }
    })

    // Find synchronous API calls that could be async
    const syncApiNodes = nodes.filter((node: any) => node.data.type === "api" && node.data.config?.async !== true)
    if (syncApiNodes.length > 0) {
      bottlenecks.push(`${syncApiNodes.length} synchronous API calls`)
    }

    return bottlenecks
  }

  private findSequentialChains(nodes: any[], connections: any[]): string[][] {
    const chains: string[][] = []
    const visited = new Set<string>()

    nodes.forEach((node) => {
      if (visited.has(node.id)) return

      const chain = this.buildChainFromNode(node.id, connections, visited)
      if (chain.length > 1) {
        chains.push(chain)
      }
    })

    return chains
  }

  private buildChainFromNode(nodeId: string, connections: any[], visited: Set<string>): string[] {
    const chain = [nodeId]
    visited.add(nodeId)

    let currentNode = nodeId
    while (true) {
      const outgoing = connections.filter((c) => c.source === currentNode)
      const incoming = connections.filter((c) => c.target === currentNode)

      // Stop if node has multiple inputs or outputs (not a simple chain)
      if (outgoing.length !== 1 || incoming.length > 1) break

      const nextNode = outgoing[0].target
      if (visited.has(nextNode)) break

      chain.push(nextNode)
      visited.add(nextNode)
      currentNode = nextNode
    }

    return chain
  }

  private estimateMemoryUsage(workflow: any): number {
    const nodes = workflow.nodes || []
    let memoryEstimate = 0

    nodes.forEach((node: any) => {
      switch (node.data.type) {
        case "dataTransform":
          memoryEstimate += 50 // MB
          break
        case "fileProcessor":
          memoryEstimate += 100 // MB
          break
        case "database":
          memoryEstimate += 25 // MB
          break
        case "api":
          memoryEstimate += 10 // MB
          break
        default:
          memoryEstimate += 5 // MB
      }
    })

    return memoryEstimate
  }

  private countApiCalls(workflow: any): number {
    const nodes = workflow.nodes || []
    return nodes.filter((node: any) => node.data.type === "api").length
  }

  private async generateOptimizationSuggestions(
    workflow: any,
    metrics: PerformanceMetrics,
  ): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = []
    const nodes = workflow.nodes || []
    const connections = workflow.connections || []

    // Performance suggestions
    if (metrics.executionTime > 30000) {
      // > 30 seconds
      suggestions.push({
        id: "perf-001",
        type: "performance",
        severity: "high",
        title: "Long Execution Time",
        description: "Workflow execution time is longer than recommended",
        impact: "Reduces user experience and increases resource costs",
        effort: "medium",
        autoFixable: false,
        nodeIds: [],
        suggestedChanges: {
          type: "parallelization",
          description: "Consider parallelizing independent operations",
        },
      })
    }

    // Reliability suggestions
    if (metrics.errorRate > 5) {
      // > 5% error rate
      suggestions.push({
        id: "rel-001",
        type: "reliability",
        severity: "critical",
        title: "High Error Rate",
        description: `Error rate of ${metrics.errorRate.toFixed(1)}% is above acceptable threshold`,
        impact: "Workflow failures affect business operations",
        effort: "high",
        autoFixable: false,
        nodeIds: [],
        suggestedChanges: {
          type: "error_handling",
          description: "Add retry logic and error handling nodes",
        },
      })
    }

    // API optimization suggestions
    const apiNodes = nodes.filter((node: any) => node.data.type === "api")
    if (apiNodes.length > 10) {
      suggestions.push({
        id: "perf-002",
        type: "performance",
        severity: "medium",
        title: "Too Many API Calls",
        description: `${apiNodes.length} API calls may cause rate limiting`,
        impact: "May hit API rate limits and slow execution",
        effort: "medium",
        autoFixable: true,
        nodeIds: apiNodes.map((n: any) => n.id),
        suggestedChanges: {
          type: "api_batching",
          description: "Batch API calls or use caching",
        },
      })
    }

    // Parallelization suggestions
    const sequentialChains = this.findSequentialChains(nodes, connections)
    sequentialChains.forEach((chain, index) => {
      if (chain.length > 4) {
        suggestions.push({
          id: `perf-par-${index}`,
          type: "performance",
          severity: "medium",
          title: "Parallelization Opportunity",
          description: `Sequential chain of ${chain.length} nodes can be optimized`,
          impact: "Could reduce execution time by up to 50%",
          effort: "low",
          autoFixable: true,
          nodeIds: chain,
          suggestedChanges: {
            type: "parallelization",
            description: "Split chain into parallel branches where possible",
          },
        })
      }
    })

    // Memory optimization
    if (metrics.memoryUsage > 500) {
      // > 500MB
      suggestions.push({
        id: "perf-003",
        type: "performance",
        severity: "medium",
        title: "High Memory Usage",
        description: `Estimated memory usage of ${metrics.memoryUsage}MB is high`,
        impact: "May cause out-of-memory errors or increased costs",
        effort: "medium",
        autoFixable: false,
        nodeIds: [],
        suggestedChanges: {
          type: "memory_optimization",
          description: "Optimize data processing and add streaming where possible",
        },
      })
    }

    // Maintainability suggestions
    if (nodes.length > 50) {
      suggestions.push({
        id: "main-001",
        type: "maintainability",
        severity: "medium",
        title: "Complex Workflow",
        description: `Workflow has ${nodes.length} nodes, consider breaking into sub-workflows`,
        impact: "Difficult to maintain and debug",
        effort: "high",
        autoFixable: false,
        nodeIds: [],
        suggestedChanges: {
          type: "modularization",
          description: "Break into smaller, reusable sub-workflows",
        },
      })
    }

    return suggestions
  }

  private calculateOptimizationScore(metrics: PerformanceMetrics, suggestions: OptimizationSuggestion[]): number {
    let score = 100

    // Deduct points for performance issues
    if (metrics.executionTime > 30000) score -= 20
    if (metrics.errorRate > 5) score -= 30
    if (metrics.memoryUsage > 500) score -= 15
    if (metrics.apiCalls > 10) score -= 10

    // Deduct points for suggestions
    suggestions.forEach((suggestion) => {
      switch (suggestion.severity) {
        case "critical":
          score -= 25
          break
        case "high":
          score -= 15
          break
        case "medium":
          score -= 10
          break
        case "low":
          score -= 5
          break
      }
    })

    return Math.max(0, score)
  }

  async applyAutoFix(
    workflowId: string,
    suggestionId: string,
  ): Promise<{
    success: boolean
    changes: any[]
    error?: string
  }> {
    try {
      const { data: workflow } = await this.supabase.from("workflows").select("*").eq("id", workflowId).single()

      if (!workflow) throw new Error("Workflow not found")

      const analysis = await this.analyzeWorkflow(workflowId)
      const suggestion = analysis.suggestions.find((s) => s.id === suggestionId)

      if (!suggestion || !suggestion.autoFixable) {
        throw new Error("Suggestion not found or not auto-fixable")
      }

      const changes = await this.generateAutoFix(workflow, suggestion)

      // Apply changes to workflow
      const updatedWorkflow = this.applyChangesToWorkflow(workflow, changes)

      // Save updated workflow
      await this.supabase
        .from("workflows")
        .update({
          nodes: updatedWorkflow.nodes,
          connections: updatedWorkflow.connections,
          updated_at: new Date().toISOString(),
        })
        .eq("id", workflowId)

      return { success: true, changes }
    } catch (error: any) {
      return { success: false, changes: [], error: error.message }
    }
  }

  private async generateAutoFix(workflow: any, suggestion: OptimizationSuggestion): Promise<any[]> {
    const changes: any[] = []

    switch (suggestion.suggestedChanges.type) {
      case "api_batching":
        changes.push(...this.generateApiBatchingChanges(workflow, suggestion.nodeIds))
        break

      case "parallelization":
        changes.push(...this.generateParallelizationChanges(workflow, suggestion.nodeIds))
        break

      default:
        throw new Error(`Auto-fix not implemented for ${suggestion.suggestedChanges.type}`)
    }

    return changes
  }

  private generateApiBatchingChanges(workflow: any, nodeIds: string[]): any[] {
    const changes: any[] = []

    // Group consecutive API nodes
    const apiNodes = workflow.nodes.filter((n: any) => nodeIds.includes(n.id))

    // Create batch API node
    const batchNode = {
      id: `batch-api-${Date.now()}`,
      type: "custom",
      position: { x: 0, y: 0 },
      data: {
        type: "batchApi",
        label: "Batch API Calls",
        config: {
          apis: apiNodes.map((n: any) => n.data.config),
          batchSize: 5,
        },
      },
    }

    changes.push({
      type: "node_add",
      data: batchNode,
    })

    // Remove individual API nodes
    nodeIds.forEach((nodeId) => {
      changes.push({
        type: "node_delete",
        data: { nodeId },
      })
    })

    return changes
  }

  private generateParallelizationChanges(workflow: any, nodeIds: string[]): any[] {
    const changes: any[] = []

    // Create parallel gateway nodes
    const splitNode = {
      id: `split-${Date.now()}`,
      type: "custom",
      position: { x: 0, y: 0 },
      data: {
        type: "parallelSplit",
        label: "Parallel Split",
      },
    }

    const joinNode = {
      id: `join-${Date.now()}`,
      type: "custom",
      position: { x: 200, y: 0 },
      data: {
        type: "parallelJoin",
        label: "Parallel Join",
      },
    }

    changes.push({ type: "node_add", data: splitNode }, { type: "node_add", data: joinNode })

    // Update connections for parallel execution
    // This is a simplified implementation
    changes.push({
      type: "connections_update",
      data: {
        newConnections: [
          { source: splitNode.id, target: nodeIds[0] },
          { source: nodeIds[nodeIds.length - 1], target: joinNode.id },
        ],
      },
    })

    return changes
  }

  private applyChangesToWorkflow(workflow: any, changes: any[]): any {
    const updatedWorkflow = { ...workflow }

    changes.forEach((change) => {
      switch (change.type) {
        case "node_add":
          updatedWorkflow.nodes = [...updatedWorkflow.nodes, change.data]
          break

        case "node_delete":
          updatedWorkflow.nodes = updatedWorkflow.nodes.filter((n: any) => n.id !== change.data.nodeId)
          updatedWorkflow.connections = updatedWorkflow.connections.filter(
            (c: any) => c.source !== change.data.nodeId && c.target !== change.data.nodeId,
          )
          break

        case "connections_update":
          updatedWorkflow.connections = [...updatedWorkflow.connections, ...change.data.newConnections]
          break
      }
    })

    return updatedWorkflow
  }
}
