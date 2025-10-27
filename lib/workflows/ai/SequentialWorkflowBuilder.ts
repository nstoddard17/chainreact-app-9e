/**
 * Sequential Workflow Builder
 *
 * Builds workflows one node at a time, Kadabra-style:
 * 1. Generate plan
 * 2. Get user approval
 * 3. For each node:
 *    - Check auth
 *    - Collect config
 *    - Create node
 *    - Run tutorial
 *    - Test node
 * 4. Move to next node
 */

import type { Node, Edge } from '@xyflow/react'

export interface NodePlan {
  id: string
  step: number
  title: string
  description: string
  nodeType: string
  providerId: string
  category: 'trigger' | 'action' | 'condition' | 'ai' | 'utility'
  needsAuth: boolean
  authProvider?: string
  configFields: ConfigField[]
  outputFields: OutputField[]
  reasoning: string
}

export interface ConfigField {
  name: string
  label: string
  type: 'text' | 'text_array' | 'number' | 'select' | 'boolean'
  description: string
  required: boolean
  placeholder?: string
  options?: Array<{ label: string; value: string }>
  defaultValue?: any
}

export interface OutputField {
  name: string
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  label: string
  description: string
}

export interface WorkflowPlan {
  workflowName: string
  workflowDescription: string
  estimatedTime: string
  nodes: NodePlan[]
}

export type BuilderEvent =
  | { type: 'plan_generated'; plan: WorkflowPlan }
  | { type: 'awaiting_plan_approval' }
  | { type: 'plan_approved' }
  | { type: 'plan_rejected' }
  | { type: 'node_starting'; node: NodePlan; currentStep: number; totalSteps: number }
  | { type: 'checking_auth'; provider: string }
  | { type: 'needs_auth'; provider: string; authUrl: string }
  | { type: 'auth_complete'; provider: string }
  | { type: 'collecting_config'; field: ConfigField; nodeTitle: string }
  | { type: 'config_collected'; fieldName: string; value: any }
  | { type: 'config_complete'; config: Record<string, any> }
  | { type: 'node_creating'; nodeId: string }
  | { type: 'node_created'; node: Node }
  | { type: 'tutorial_starting'; nodeId: string }
  | { type: 'tutorial_step'; step: string; description: string }
  | { type: 'tutorial_complete' }
  | { type: 'testing_node'; nodeId: string }
  | { type: 'node_tested'; nodeId: string; success: boolean; result?: any; error?: string }
  | { type: 'node_complete'; nodeId: string }
  | { type: 'workflow_complete'; nodes: Node[]; edges: Edge[] }
  | { type: 'error'; message: string; details?: any }

export interface BuilderState {
  currentNodeIndex: number
  currentFieldIndex: number
  completedNodes: Node[]
  completedEdges: Edge[]
  nodeConfigs: Map<string, Record<string, any>>
  isAuthenticated: Map<string, boolean>
}

export class SequentialWorkflowBuilder {
  private plan: WorkflowPlan | null = null
  private state: BuilderState = {
    currentNodeIndex: 0,
    currentFieldIndex: 0,
    completedNodes: [],
    completedEdges: [],
    nodeConfigs: new Map(),
    isAuthenticated: new Map()
  }

  private eventCallback: (event: BuilderEvent) => void
  private abortController: AbortController | null = null

  constructor(eventCallback: (event: BuilderEvent) => void) {
    this.eventCallback = eventCallback
  }

  /**
   * Generate workflow plan from user prompt
   */
  async generatePlan(prompt: string, userId: string, organizationId: string): Promise<void> {
    try {
      this.abortController = new AbortController()

      const response = await fetch('/api/ai/generate-workflow-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, userId, organizationId }),
        signal: this.abortController.signal
      })

      if (!response.ok) {
        throw new Error(`Plan generation failed: ${response.statusText}`)
      }

      const plan: WorkflowPlan = await response.json()
      this.plan = plan

      this.emit({ type: 'plan_generated', plan })
      this.emit({ type: 'awaiting_plan_approval' })
    } catch (error: any) {
      if (error.name === 'AbortError') return
      this.emit({ type: 'error', message: 'Failed to generate plan', details: error })
    }
  }

  /**
   * User approves the plan
   */
  async approvePlan(): Promise<void> {
    if (!this.plan) {
      this.emit({ type: 'error', message: 'No plan to approve' })
      return
    }

    this.emit({ type: 'plan_approved' })
    await this.buildNextNode()
  }

  /**
   * User rejects the plan (can provide feedback)
   */
  rejectPlan(feedback?: string): void {
    this.emit({ type: 'plan_rejected' })
    this.plan = null
    this.state = {
      currentNodeIndex: 0,
      currentFieldIndex: 0,
      completedNodes: [],
      completedEdges: [],
      nodeConfigs: new Map(),
      isAuthenticated: new Map()
    }
  }

  /**
   * Build the next node in sequence
   */
  private async buildNextNode(): Promise<void> {
    if (!this.plan) return

    if (this.state.currentNodeIndex >= this.plan.nodes.length) {
      // All nodes complete - create edges
      const edges = this.createEdges()
      this.emit({
        type: 'workflow_complete',
        nodes: this.state.completedNodes,
        edges
      })
      return
    }

    const nodePlan = this.plan.nodes[this.state.currentNodeIndex]
    const totalSteps = this.plan.nodes.length

    this.emit({
      type: 'node_starting',
      node: nodePlan,
      currentStep: this.state.currentNodeIndex + 1,
      totalSteps
    })

    // Step 1: Check authentication
    if (nodePlan.needsAuth && nodePlan.authProvider) {
      await this.checkAuthentication(nodePlan.authProvider)
    }

    // Step 2: Collect configuration
    await this.collectNodeConfig(nodePlan)
  }

  /**
   * Check if user is authenticated with provider
   */
  private async checkAuthentication(provider: string): Promise<void> {
    this.emit({ type: 'checking_auth', provider })

    try {
      // Get all integrations for the user
      const response = await fetch('/api/integrations')

      if (!response.ok) {
        throw new Error(`Failed to check auth: ${response.statusText}`)
      }

      const { data: integrations } = await response.json()

      // Check if this provider is connected
      const integration = integrations?.find((i: any) => i.provider === provider)
      const isConnected = integration && integration.status === 'connected'

      if (isConnected) {
        this.state.isAuthenticated.set(provider, true)
        this.emit({ type: 'auth_complete', provider })
      } else {
        // Need to connect - emit event with auth URL
        const authUrl = `/api/auth/${provider}/connect`
        this.emit({ type: 'needs_auth', provider, authUrl })

        // Wait for auth complete (will be triggered by external callback)
        await this.waitForAuth(provider)
      }
    } catch (error: any) {
      this.emit({ type: 'error', message: `Auth check failed for ${provider}`, details: error })
    }
  }

  /**
   * Wait for authentication to complete
   */
  private waitForAuth(provider: string): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.state.isAuthenticated.get(provider)) {
          clearInterval(checkInterval)
          this.emit({ type: 'auth_complete', provider })
          resolve()
        }
      }, 1000)
    })
  }

  /**
   * Mark authentication as complete (called from external auth callback)
   */
  markAuthComplete(provider: string): void {
    this.state.isAuthenticated.set(provider, true)
  }

  /**
   * Collect configuration for a node
   */
  private async collectNodeConfig(nodePlan: NodePlan): Promise<void> {
    this.state.currentFieldIndex = 0
    const config: Record<string, any> = {}

    // Collect each field one by one
    for (let i = 0; i < nodePlan.configFields.length; i++) {
      const field = nodePlan.configFields[i]
      this.state.currentFieldIndex = i

      this.emit({
        type: 'collecting_config',
        field,
        nodeTitle: nodePlan.title
      })

      // Wait for field value (will be provided by UI)
      const value = await this.waitForFieldValue(field.name)
      config[field.name] = value

      this.emit({
        type: 'config_collected',
        fieldName: field.name,
        value
      })
    }

    this.state.nodeConfigs.set(nodePlan.id, config)
    this.emit({ type: 'config_complete', config })

    // Move to node creation
    await this.createNode(nodePlan, config)
  }

  /**
   * Wait for user to provide field value
   */
  private fieldValueResolvers: Map<string, (value: any) => void> = new Map()

  private waitForFieldValue(fieldName: string): Promise<any> {
    return new Promise((resolve) => {
      this.fieldValueResolvers.set(fieldName, resolve)
    })
  }

  /**
   * Provide field value (called from UI)
   */
  provideFieldValue(fieldName: string, value: any): void {
    const resolver = this.fieldValueResolvers.get(fieldName)
    if (resolver) {
      resolver(value)
      this.fieldValueResolvers.delete(fieldName)
    }
  }

  /**
   * Skip current field (use default or leave empty)
   */
  skipCurrentField(): void {
    if (!this.plan) return

    const nodePlan = this.plan.nodes[this.state.currentNodeIndex]
    const field = nodePlan.configFields[this.state.currentFieldIndex]

    this.provideFieldValue(field.name, field.defaultValue || null)
  }

  /**
   * Create the node with collected config
   */
  private async createNode(nodePlan: NodePlan, config: Record<string, any>): Promise<void> {
    this.emit({ type: 'node_creating', nodeId: nodePlan.id })

    const node: Node = {
      id: nodePlan.id,
      type: 'custom',
      position: this.calculatePosition(this.state.currentNodeIndex),
      data: {
        title: nodePlan.title,
        type: nodePlan.nodeType,
        providerId: nodePlan.providerId,
        category: nodePlan.category,
        config,
        outputSchema: {
          fields: nodePlan.outputFields
        },
        configFields: nodePlan.configFields
      }
    }

    this.state.completedNodes.push(node)
    this.emit({ type: 'node_created', node })

    // Run tutorial
    await this.runTutorial(nodePlan.id)

    // Test node
    await this.testNode(nodePlan.id, config)

    // Mark node complete and move to next
    this.emit({ type: 'node_complete', nodeId: nodePlan.id })
    this.state.currentNodeIndex++

    // Small delay before next node
    setTimeout(() => this.buildNextNode(), 1000)
  }

  /**
   * Run animated tutorial for node
   */
  private async runTutorial(nodeId: string): Promise<void> {
    this.emit({ type: 'tutorial_starting', nodeId })

    const steps = [
      { step: 'move_to_node', description: 'Moving to node on canvas' },
      { step: 'double_click', description: 'Opening configuration' },
      { step: 'scroll_config', description: 'Showing where your data is stored' },
      { step: 'close_config', description: 'Closing configuration' },
      { step: 'right_click', description: 'Opening context menu' },
      { step: 'click_test', description: 'Testing the node' }
    ]

    for (const step of steps) {
      this.emit({ type: 'tutorial_step', step: step.step, description: step.description })
      await this.delay(800) // Delay between tutorial steps
    }

    this.emit({ type: 'tutorial_complete' })
  }

  /**
   * Test the node
   */
  private async testNode(nodeId: string, config: Record<string, any>): Promise<void> {
    this.emit({ type: 'testing_node', nodeId })

    try {
      const response = await fetch('/api/workflows/test-node', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId, config })
      })

      if (!response.ok) {
        throw new Error('Node test failed')
      }

      const result = await response.json()

      this.emit({
        type: 'node_tested',
        nodeId,
        success: true,
        result
      })
    } catch (error: any) {
      this.emit({
        type: 'node_tested',
        nodeId,
        success: false,
        error: error.message
      })
    }
  }

  /**
   * Create edges between nodes with auto-mapped variables
   */
  private createEdges(): Edge[] {
    const edges: Edge[] = []

    for (let i = 0; i < this.state.completedNodes.length - 1; i++) {
      const sourceNode = this.state.completedNodes[i]
      const targetNode = this.state.completedNodes[i + 1]

      const sourceOutputs = sourceNode.data.outputSchema?.fields || []
      const targetInputs = targetNode.data.configFields || []

      // Auto-map variables
      const variableMapping = this.autoMapVariables(sourceOutputs, targetInputs)

      const edge: Edge = {
        id: `${sourceNode.id}-${targetNode.id}`,
        source: sourceNode.id,
        target: targetNode.id,
        type: 'default',
        data: {
          variables: variableMapping,
          label: `${Object.keys(variableMapping).length} variables mapped`
        }
      }

      edges.push(edge)
      this.state.completedEdges.push(edge)
    }

    return edges
  }

  /**
   * Auto-map variables from source outputs to target inputs
   */
  private autoMapVariables(
    sourceOutputs: OutputField[],
    targetInputs: ConfigField[]
  ): Record<string, string> {
    const mapping: Record<string, string> = {}

    targetInputs.forEach(input => {
      // Try exact name match
      let match = sourceOutputs.find(output =>
        output.name.toLowerCase() === input.name.toLowerCase()
      )

      // Try partial match
      if (!match) {
        match = sourceOutputs.find(output =>
          input.name.toLowerCase().includes(output.name.toLowerCase()) ||
          output.name.toLowerCase().includes(input.name.toLowerCase())
        )
      }

      if (match) {
        mapping[input.name] = `{{${match.name}}}`
      }
    })

    return mapping
  }

  /**
   * Calculate node position on canvas
   */
  private calculatePosition(index: number): { x: number; y: number } {
    return {
      x: 400,
      y: 100 + (index * 180)
    }
  }

  /**
   * Emit event to callback
   */
  private emit(event: BuilderEvent): void {
    this.eventCallback(event)
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Abort current build process
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort()
    }
    this.plan = null
    this.state = {
      currentNodeIndex: 0,
      currentFieldIndex: 0,
      completedNodes: [],
      completedEdges: [],
      nodeConfigs: new Map(),
      isAuthenticated: new Map()
    }
  }

  /**
   * Get current state
   */
  getState(): BuilderState {
    return { ...this.state }
  }

  /**
   * Get current plan
   */
  getPlan(): WorkflowPlan | null {
    return this.plan
  }
}
