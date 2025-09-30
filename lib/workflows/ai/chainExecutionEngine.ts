/**
 * Chain Execution Engine for AI Agent Workflows
 *
 * This engine handles the execution of action chains selected by the AI agent,
 * similar to N8N's workflow execution but with AI-driven routing and field generation.
 */

import { executeNode } from '../executeNode'
import { resolveValue } from '../actions/core/resolveValue'

// Types
export interface AIAgentExecutionContext {
  input: {
    triggerData: any
    workflowData: any
    nodeOutputs: Record<string, any>
  }
  chains: ChainDefinition[]
  config: {
    model: string
    prompt?: string
    temperature: number
    apiSource: 'chainreact' | 'custom'
    apiKey?: string
    autoSelectChain: boolean
    parallelExecution: boolean
  }
  metadata: {
    executionId: string
    workflowId: string
    userId: string
    timestamp: string
    testMode: boolean
  }
}

export interface ChainDefinition {
  id: string
  name: string
  description?: string
  nodes: any[]
  edges: any[]
  conditions?: ChainCondition[]
}

export interface ChainCondition {
  field: string
  operator: 'equals' | 'contains' | 'matches' | 'exists' | 'gt' | 'lt'
  value: any
}

export interface ChainSelectionResult {
  selectedChains: SelectedChain[]
  unselectedChains: UnselectedChain[]
  executionPlan: ExecutionPlan
}

export interface SelectedChain {
  chainId: string
  reasoning: string
  priority: number
  confidence: number
  inputMapping?: Record<string, any>
}

export interface UnselectedChain {
  chainId: string
  reasoning: string
}

export interface ExecutionPlan {
  parallel: boolean
  maxConcurrency: number
  continueOnError: boolean
}

export interface ChainExecutionResult {
  chains: ChainResult[]
  summary: string | null
  errors: any[]
}

export interface ChainResult {
  chainId: string
  success: boolean
  output: Record<string, any>
  executionTime: number
  error?: any
}

/**
 * Main Chain Execution Engine
 */
export class ChainExecutionEngine {
  private executionContext: AIAgentExecutionContext

  constructor(context: AIAgentExecutionContext) {
    this.executionContext = context
  }

  /**
   * Execute selected chains based on the execution plan
   */
  async executeChains(
    selection: ChainSelectionResult
  ): Promise<ChainExecutionResult> {
    const results: ChainExecutionResult = {
      chains: [],
      summary: null,
      errors: []
    }

    const startTime = Date.now()

    try {
      if (selection.executionPlan.parallel) {
        // Execute chains in parallel with concurrency control
        results.chains = await this.executeParallel(
          selection.selectedChains,
          selection.executionPlan
        )
      } else {
        // Execute chains sequentially with data flow
        results.chains = await this.executeSequential(
          selection.selectedChains,
          selection.executionPlan
        )
      }
    } catch (error) {
      console.error('Chain execution failed:', error)
      results.errors.push(error)
    }

    // Generate execution summary
    results.summary = this.generateExecutionSummary(results, Date.now() - startTime)

    return results
  }

  /**
   * Execute chains in parallel with concurrency control
   */
  private async executeParallel(
    chains: SelectedChain[],
    plan: ExecutionPlan
  ): Promise<ChainResult[]> {
    const results: ChainResult[] = []

    // Sort chains by priority
    const sortedChains = [...chains].sort((a, b) => a.priority - b.priority)

    // Split into chunks based on max concurrency
    const chunks = this.chunkArray(sortedChains, plan.maxConcurrency)

    for (const chunk of chunks) {
      const chunkPromises = chunk.map(chain =>
        this.executeChain(chain).catch(error => {
          if (!plan.continueOnError) throw error
          return {
            chainId: chain.chainId,
            success: false,
            output: {},
            executionTime: 0,
            error
          }
        })
      )

      const chunkResults = await Promise.all(chunkPromises)
      results.push(...chunkResults)
    }

    return results
  }

  /**
   * Execute chains sequentially, passing output between them
   */
  private async executeSequential(
    chains: SelectedChain[],
    plan: ExecutionPlan
  ): Promise<ChainResult[]> {
    const results: ChainResult[] = []
    let flowData = { ...this.executionContext.input.workflowData }

    // Sort chains by priority
    const sortedChains = [...chains].sort((a, b) => a.priority - b.priority)

    for (const chain of sortedChains) {
      try {
        // Merge flow data with chain-specific input mapping
        const chainInput = {
          ...this.executionContext.input,
          workflowData: { ...flowData, ...chain.inputMapping }
        }

        const result = await this.executeChain(chain, chainInput)

        if (result.success) {
          // Pass output to next chain
          flowData = { ...flowData, ...result.output }
        }

        results.push(result)

        if (!result.success && !plan.continueOnError) {
          break
        }
      } catch (error) {
        if (!plan.continueOnError) {
          throw error
        }
        results.push({
          chainId: chain.chainId,
          success: false,
          output: {},
          executionTime: 0,
          error
        })
      }
    }

    return results
  }

  /**
   * Execute a single chain
   */
  private async executeChain(
    chain: SelectedChain,
    customInput?: any
  ): Promise<ChainResult> {
    const startTime = Date.now()
    const input = customInput || this.executionContext.input

    try {
      // Find chain definition
      const chainDef = this.executionContext.chains.find(c => c.id === chain.chainId)
      if (!chainDef) {
        throw new Error(`Chain definition not found: ${chain.chainId}`)
      }

      // Execute nodes in the chain
      const nodeResults = await this.executeChainNodes(chainDef, input)

      return {
        chainId: chain.chainId,
        success: true,
        output: nodeResults,
        executionTime: Date.now() - startTime
      }
    } catch (error) {
      console.error(`Chain execution failed: ${chain.chainId}`, error)
      return {
        chainId: chain.chainId,
        success: false,
        output: {},
        executionTime: Date.now() - startTime,
        error
      }
    }
  }

  /**
   * Execute nodes within a chain
   */
  private async executeChainNodes(
    chain: ChainDefinition,
    input: any
  ): Promise<Record<string, any>> {
    const nodeResults: Record<string, any> = {}
    const executionOrder = this.determineExecutionOrder(chain.nodes, chain.edges)

    for (const node of executionOrder) {
      try {

        // Resolve AI fields in configuration
        const resolvedConfig = await this.resolveAIFields(
          node.data?.config || {},
          { ...input, nodeOutputs: nodeResults }
        )

        // Build execution context for the node
        const nodeContext = {
          session: { user_id: this.executionContext.metadata.userId },
          data: {
            ...input.workflowData,
            ...nodeResults
          },
          testMode: this.executionContext.metadata.testMode,
          dataFlowManager: {
            resolveVariable: (path: string) => {
              return this.resolveVariable(path, { ...input, nodeOutputs: nodeResults })
            }
          }
        }

        // Execute the node
        const result = await executeNode(
          node,
          nodeContext,
          this.executionContext.metadata.userId
        )

        nodeResults[node.id] = result

      } catch (error) {
        console.error(`Node execution failed: ${node.id}`, error)
        nodeResults[node.id] = {
          success: false,
          error: error.message || 'Node execution failed'
        }

        // Stop chain execution on node failure
        throw error
      }
    }

    return nodeResults
  }

  /**
   * Resolve AI-generated field values
   */
  private async resolveAIFields(
    config: Record<string, any>,
    context: any
  ): Promise<Record<string, any>> {
    const resolved = { ...config }

    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'string' && value.startsWith('{{AI_FIELD:')) {
        const fieldName = value.match(/{{AI_FIELD:(.+)}}/)?.[1]

        if (fieldName) {
          // Generate value using AI
          resolved[key] = await this.generateFieldValue(fieldName, context)
        }
      } else if (typeof value === 'object' && value !== null) {
        // Recursively resolve nested objects
        resolved[key] = await this.resolveAIFields(value, context)
      }
    }

    return resolved
  }

  /**
   * Generate a field value using AI
   */
  private async generateFieldValue(
    fieldName: string,
    context: any
  ): Promise<any> {
    try {
      // Import AI service dynamically
      const { generateAIFieldValue } = await import('./aiFieldGenerator')

      return await generateAIFieldValue(
        fieldName,
        context,
        this.executionContext.config
      )
    } catch (error) {
      console.error(`Failed to generate AI value for field: ${fieldName}`, error)

      // Return a default value based on field name
      if (fieldName.toLowerCase().includes('message')) {
        return 'Generated message content'
      }
      if (fieldName.toLowerCase().includes('subject')) {
        return 'Generated subject'
      }

      return `AI_FIELD_${fieldName}`
    }
  }

  /**
   * Resolve variable paths in the context
   */
  private resolveVariable(path: string, context: any): any {
    const parts = path.split('.')
    let value = context

    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part]
      } else {
        return undefined
      }
    }

    return value
  }

  /**
   * Determine the execution order of nodes based on edges
   */
  private determineExecutionOrder(nodes: any[], edges: any[]): any[] {
    // Build adjacency list
    const graph: Map<string, string[]> = new Map()
    const inDegree: Map<string, number> = new Map()

    // Initialize
    nodes.forEach(node => {
      graph.set(node.id, [])
      inDegree.set(node.id, 0)
    })

    // Build graph
    edges.forEach(edge => {
      const source = edge.source
      const target = edge.target

      if (graph.has(source) && inDegree.has(target)) {
        graph.get(source)!.push(target)
        inDegree.set(target, inDegree.get(target)! + 1)
      }
    })

    // Topological sort using Kahn's algorithm
    const queue: string[] = []
    const result: any[] = []

    // Find nodes with no incoming edges
    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) {
        queue.push(nodeId)
      }
    })

    while (queue.length > 0) {
      const nodeId = queue.shift()!
      const node = nodes.find(n => n.id === nodeId)

      if (node) {
        result.push(node)
      }

      // Process neighbors
      const neighbors = graph.get(nodeId) || []
      neighbors.forEach(neighbor => {
        const degree = inDegree.get(neighbor)! - 1
        inDegree.set(neighbor, degree)

        if (degree === 0) {
          queue.push(neighbor)
        }
      })
    }

    // If we couldn't sort all nodes, there's a cycle or disconnected nodes
    // Return remaining nodes in original order
    if (result.length < nodes.length) {
      const sortedIds = new Set(result.map(n => n.id))
      const remaining = nodes.filter(n => !sortedIds.has(n.id))
      result.push(...remaining)
    }

    return result
  }

  /**
   * Split array into chunks
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }

  /**
   * Generate execution summary
   */
  private generateExecutionSummary(
    results: ChainExecutionResult,
    totalTime: number
  ): string {
    const successful = results.chains.filter(c => c.success).length
    const failed = results.chains.filter(c => !c.success).length

    return `Execution completed in ${totalTime}ms. ` +
           `${successful} chain(s) successful, ${failed} failed. ` +
           results.errors.length > 0
             ? `Errors: ${results.errors.map(e => e.message || e).join(', ')}`
             : ''
  }
}