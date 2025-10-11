/**
 * Step Execution Controller for Test Mode
 *
 * Manages step-by-step workflow execution with controls for
 * skipping, retrying, and pausing during testing.
 */

import { Node, Edge } from '@xyflow/react'
import { triggerListeningManager } from './triggerListeningManager'
import { useWorkflowStepExecutionStore } from '@/stores/workflowStepExecutionStore'

export type ExecutionMode = 'continuous' | 'step-by-step' | 'breakpoint'
export type NodeExecutionStatus = 'pending' | 'waiting' | 'running' | 'success' | 'error' | 'skipped'

interface ExecutionNode {
  id: string
  type: string
  data: any
  position: { x: number; y: number }
}

interface ExecutionContext {
  workflowId: string
  userId: string
  nodes: ExecutionNode[]
  edges: Edge[]
  mode: 'sandbox' | 'live'
  executionMode: ExecutionMode
  breakpoints: Set<string>
  dataFlow: Map<string, any>
  executionHistory: ExecutionStep[]
  currentNodeIndex: number
  isPaused: boolean
  isStopped: boolean
}

interface ExecutionStep {
  nodeId: string
  nodeName: string
  status: NodeExecutionStatus
  startTime: number
  endTime?: number
  input?: any
  output?: any
  error?: string
  skipped?: boolean
  retryCount?: number
}

interface ExecutionCallbacks {
  onNodeStart?: (nodeId: string, nodeName: string) => void
  onNodeComplete?: (nodeId: string, status: NodeExecutionStatus, result?: any) => void
  onNodeError?: (nodeId: string, error: string) => void
  onExecutionComplete?: (history: ExecutionStep[]) => void
  onExecutionPaused?: (nodeId: string) => void
  onWaitingForUser?: (nodeId: string, message: string) => Promise<'continue' | 'skip' | 'retry' | 'stop'>
}

export class StepExecutionController {
  private context: ExecutionContext | null = null
  private callbacks: ExecutionCallbacks = {}
  private continueResolver?: (action: 'continue' | 'skip' | 'retry' | 'stop') => void

  /**
   * Initialize execution context
   */
  initialize(
    workflowId: string,
    userId: string,
    nodes: Node[],
    edges: Edge[],
    mode: 'sandbox' | 'live'
  ): void {
    this.context = {
      workflowId,
      userId,
      nodes: nodes as ExecutionNode[],
      edges,
      mode,
      executionMode: 'step-by-step',
      breakpoints: new Set(),
      dataFlow: new Map(),
      executionHistory: [],
      currentNodeIndex: 0,
      isPaused: false,
      isStopped: false
    }
  }

  /**
   * Set execution callbacks
   */
  setCallbacks(callbacks: ExecutionCallbacks): void {
    this.callbacks = callbacks
  }

  /**
   * Set execution mode
   */
  setExecutionMode(mode: ExecutionMode): void {
    if (this.context) {
      this.context.executionMode = mode
    }
  }

  /**
   * Add/remove breakpoint
   */
  toggleBreakpoint(nodeId: string): void {
    if (!this.context) return

    if (this.context.breakpoints.has(nodeId)) {
      this.context.breakpoints.delete(nodeId)
    } else {
      this.context.breakpoints.add(nodeId)
    }
  }

  /**
   * Start execution
   */
  async startExecution(): Promise<void> {
    if (!this.context) {
      throw new Error('Execution context not initialized')
    }

    this.context.isStopped = false
    this.context.isPaused = false

    // Find trigger node
    const triggerNode = this.context.nodes.find(n => n.data.isTrigger)
    if (!triggerNode) {
      throw new Error('No trigger node found in workflow')
    }

    // Start listening for trigger if in real trigger mode
    if (this.context.mode === 'sandbox' || this.context.mode === 'live') {
      const listeningStarted = await triggerListeningManager.startListening(
        this.context.workflowId,
        this.context.userId,
        triggerNode,
        this.context.mode
      )

      if (!listeningStarted) {
        console.error('Failed to start trigger listening')
        return
      }

      // Set up trigger callback
      triggerListeningManager.setCallbacks(
        async (event) => {
          // Trigger fired, start execution from trigger node
          await this.executeFromNode(triggerNode.id, event.data)
        },
        (nodeId, status) => {
          // Update node status in UI
          if (status === 'listening') {
            this.callbacks.onNodeStart?.(nodeId, 'Listening for trigger...')
          }
        }
      )

      // For manual triggers, fire immediately
      if (triggerNode.data.type === 'manual') {
        triggerListeningManager.manualTrigger(triggerNode.id, {
          timestamp: new Date().toISOString(),
          testMode: true
        })
      }
    }
  }

  /**
   * Execute workflow from a specific node
   */
  async executeFromNode(startNodeId: string, triggerData?: any): Promise<void> {
    if (!this.context || this.context.isStopped) return

    // Get execution path from this node
    const executionPath = this.getExecutionPath(startNodeId)

    // Store trigger data in dataflow
    if (triggerData) {
      this.context.dataFlow.set(startNodeId, triggerData)
    }

    // Execute nodes in sequence
    for (let i = 0; i < executionPath.length; i++) {
      if (this.context.isStopped) break

      const nodeId = executionPath[i]
      const node = this.context.nodes.find(n => n.id === nodeId)
      if (!node) continue

      // Check for breakpoint
      if (this.context.executionMode === 'breakpoint' && this.context.breakpoints.has(nodeId)) {
        this.context.isPaused = true
      }

      // Handle step-by-step mode
      if (this.context.executionMode === 'step-by-step' || this.context.isPaused) {
        const action = await this.waitForUserAction(nodeId, node.data.title || node.data.type)

        if (action === 'stop') {
          await this.stopExecution()
          return
        } else if (action === 'skip') {
          await this.skipNode(nodeId)
          continue
        } else if (action === 'retry' && i > 0) {
          i-- // Go back one step to retry
          continue
        }
      }

      // Execute the node
      await this.executeNode(node)
    }

    // Execution complete
    this.callbacks.onExecutionComplete?.(this.context.executionHistory)
  }

  /**
   * Execute a single node
   */
  private async executeNode(node: ExecutionNode): Promise<void> {
    if (!this.context) return

    const step: ExecutionStep = {
      nodeId: node.id,
      nodeName: node.data.title || node.data.type,
      status: 'running',
      startTime: Date.now()
    }

    // Notify start
    this.callbacks.onNodeStart?.(node.id, step.nodeName)

    // Get input data from previous nodes
    const inputData = this.getNodeInputData(node.id)
    step.input = inputData

    try {
      // Execute based on mode
      let result: any

      if (this.context.mode === 'sandbox') {
        // Simulate execution in sandbox mode
        result = await this.simulateNodeExecution(node, inputData)
      } else {
        // Real execution in live mode
        result = await this.executeNodeLive(node, inputData)
      }

      // Store result in dataflow
      this.context.dataFlow.set(node.id, result)

      step.status = 'success'
      step.output = result
      step.endTime = Date.now()

      // Notify completion
      this.callbacks.onNodeComplete?.(node.id, 'success', result)

    } catch (error: any) {
      step.status = 'error'
      step.error = error.message
      step.endTime = Date.now()

      // Notify error
      this.callbacks.onNodeError?.(node.id, error.message)

      // In step-by-step mode, ask user what to do
      if (this.context.executionMode === 'step-by-step') {
        const action = await this.waitForUserAction(
          node.id,
          `Error in ${step.nodeName}: ${error.message}. What would you like to do?`
        )

        if (action === 'retry') {
          step.retryCount = (step.retryCount || 0) + 1
          return await this.executeNode(node) // Retry
        } else if (action === 'skip') {
          step.skipped = true
          step.status = 'skipped'
        } else if (action === 'stop') {
          await this.stopExecution()
          return
        }
      }
    }

    // Add to history
    this.context.executionHistory.push(step)
  }

  /**
   * Simulate node execution in sandbox mode
   */
  private async simulateNodeExecution(node: ExecutionNode, inputData: any): Promise<any> {
    // Simulate processing time
    await new Promise(resolve => setTimeout(resolve, 500))

    // Generate mock output based on node type
    const mockData = this.generateMockData(node.data.type, inputData)

    // Log what would happen
    console.log(`🧪 [SANDBOX] Node ${node.id} would execute:`, {
      type: node.data.type,
      config: node.data.config,
      input: inputData,
      mockOutput: mockData
    })

    return mockData
  }

  /**
   * Execute node in live mode
   */
  private async executeNodeLive(node: ExecutionNode, inputData: any): Promise<any> {
    if (!this.context) throw new Error('No execution context')

    // Call the actual execution API
    const response = await fetch('/api/workflows/execute-node', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: this.context.workflowId,
        userId: this.context.userId,
        nodeId: node.id,
        nodeType: node.data.type,
        config: node.data.config,
        inputData,
        testMode: true
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(error)
    }

    return await response.json()
  }

  /**
   * Get execution path from a starting node
   */
  private getExecutionPath(startNodeId: string): string[] {
    if (!this.context) return []

    const path: string[] = []
    const visited = new Set<string>()
    const queue = [startNodeId]

    while (queue.length > 0) {
      const nodeId = queue.shift()!
      if (visited.has(nodeId)) continue

      visited.add(nodeId)
      path.push(nodeId)

      // Find outgoing edges
      const outgoingEdges = this.context.edges.filter(e => e.source === nodeId)
      for (const edge of outgoingEdges) {
        if (!visited.has(edge.target)) {
          queue.push(edge.target)
        }
      }
    }

    // Filter out UI-only nodes
    return path.filter(nodeId => {
      const node = this.context?.nodes.find(n => n.id === nodeId)
      return node && !['addAction', 'insertAction'].includes(node.data.type)
    })
  }

  /**
   * Get input data for a node from previous nodes
   */
  private getNodeInputData(nodeId: string): any {
    if (!this.context) return {}

    const incomingEdges = this.context.edges.filter(e => e.target === nodeId)
    const inputData: any = {}

    for (const edge of incomingEdges) {
      const sourceData = this.context.dataFlow.get(edge.source)
      if (sourceData) {
        Object.assign(inputData, sourceData)
      }
    }

    return inputData
  }

  /**
   * Generate mock data for sandbox mode
   */
  private generateMockData(nodeType: string, inputData: any): any {
    // Generate realistic mock data based on node type
    switch (nodeType) {
      case 'gmail_action_send':
        return {
          messageId: `mock_${ Date.now()}`,
          threadId: 'thread_123',
          status: 'sent',
          timestamp: new Date().toISOString()
        }

      case 'discord_action_send_message':
        return {
          messageId: `discord_${ Date.now()}`,
          channelId: inputData.channelId || 'channel_123',
          content: inputData.message || 'Test message',
          timestamp: new Date().toISOString()
        }

      case 'slack_action_post_message':
        return {
          ok: true,
          channel: inputData.channel || 'C123456',
          ts: Date.now().toString(),
          message: {
            text: inputData.text || 'Test message',
            user: 'U123456'
          }
        }

      case 'airtable_action_create':
        return {
          id: `rec${ Date.now()}`,
          fields: inputData.fields || {},
          createdTime: new Date().toISOString()
        }

      default:
        return {
          success: true,
          mockData: true,
          timestamp: new Date().toISOString(),
          ...inputData
        }
    }
  }

  /**
   * Wait for user action in step-by-step mode
   */
  private async waitForUserAction(
    nodeId: string,
    message: string
  ): Promise<'continue' | 'skip' | 'retry' | 'stop'> {
    return new Promise((resolve) => {
      this.continueResolver = resolve
      this.callbacks.onWaitingForUser?.(nodeId, message).then(action => {
        resolve(action || 'continue')
      })
    })
  }

  /**
   * Continue execution
   */
  continueExecution(): void {
    if (this.context) {
      this.context.isPaused = false
    }
    this.continueResolver?.('continue')
  }

  /**
   * Skip current node
   */
  async skipNode(nodeId: string): Promise<void> {
    if (!this.context) return

    const step: ExecutionStep = {
      nodeId,
      nodeName: 'Skipped',
      status: 'skipped',
      startTime: Date.now(),
      endTime: Date.now(),
      skipped: true
    }

    this.context.executionHistory.push(step)
    this.callbacks.onNodeComplete?.(nodeId, 'skipped')
  }

  /**
   * Retry current node
   */
  retryNode(): void {
    this.continueResolver?.('retry')
  }

  /**
   * Pause execution
   */
  pauseExecution(): void {
    if (this.context) {
      this.context.isPaused = true
      this.callbacks.onExecutionPaused?.(
        this.context.executionHistory[this.context.executionHistory.length - 1]?.nodeId || ''
      )
    }
  }

  /**
   * Stop execution
   */
  async stopExecution(): Promise<void> {
    if (this.context) {
      this.context.isStopped = true
      await triggerListeningManager.stopAllListeners()
    }
    this.continueResolver?.('stop')
  }

  /**
   * Get execution status
   */
  getExecutionStatus(): {
    isRunning: boolean
    isPaused: boolean
    currentNode: string | null
    completedNodes: number
    totalNodes: number
    history: ExecutionStep[]
  } {
    if (!this.context) {
      return {
        isRunning: false,
        isPaused: false,
        currentNode: null,
        completedNodes: 0,
        totalNodes: 0,
        history: []
      }
    }

    const currentStep = this.context.executionHistory[this.context.executionHistory.length - 1]

    return {
      isRunning: !this.context.isStopped,
      isPaused: this.context.isPaused,
      currentNode: currentStep?.nodeId || null,
      completedNodes: this.context.executionHistory.filter(s => s.status === 'success').length,
      totalNodes: this.context.nodes.filter(n => !['addAction', 'insertAction'].includes(n.data.type)).length,
      history: this.context.executionHistory
    }
  }
}

// Export singleton instance
export const stepExecutionController = new StepExecutionController()