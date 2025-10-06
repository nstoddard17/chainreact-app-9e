import { createClient } from '@supabase/supabase-js'

export interface ExecutionProgressUpdate {
  currentNodeId?: string
  currentNodeName?: string
  completedNodes?: string[]
  pendingNodes?: string[]
  failedNodes?: Array<{ nodeId: string; error: string }>
  nodeOutputs?: Record<string, any>
  status?: 'running' | 'completed' | 'failed'
  errorMessage?: string
  progressPercentage?: number
}

export class ExecutionProgressTracker {
  private supabase: ReturnType<typeof createClient>
  private progressId: string | null = null
  private completedNodes: Set<string> = new Set()
  private failedNodes: Array<{ nodeId: string; error: string }> = []

  constructor() {
    this.supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
  }

  /**
   * Initialize progress tracking for an execution
   */
  async initialize(
    executionId: string,
    workflowId: string,
    userId: string,
    totalNodes: number
  ): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('execution_progress')
        .insert({
          execution_id: executionId,
          workflow_id: workflowId,
          user_id: userId,
          status: 'running',
          completed_nodes: [],
          pending_nodes: [],
          failed_nodes: [],
          node_outputs: {},
          progress_percentage: 0,
          started_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (error) {
        console.error('Failed to initialize execution progress:', error)
        return
      }

      this.progressId = data.id

      // Also check if this execution is part of a test session
      const { data: testSession } = await this.supabase
        .from('workflow_test_sessions')
        .select('id')
        .eq('workflow_id', workflowId)
        .eq('status', 'listening')
        .single()

      if (testSession) {
        // Update test session to executing status
        await this.supabase
          .from('workflow_test_sessions')
          .update({
            status: 'executing',
            execution_id: executionId,
          })
          .eq('id', testSession.id)
      }

      console.log('✅ Execution progress tracker initialized:', this.progressId)
    } catch (error) {
      console.error('Error initializing execution progress:', error)
    }
  }

  /**
   * Update execution progress
   */
  async update(update: ExecutionProgressUpdate): Promise<void> {
    if (!this.progressId) {
      console.warn('Progress tracker not initialized, skipping update')
      return
    }

    try {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      }

      if (update.currentNodeId !== undefined) {
        updateData.current_node_id = update.currentNodeId
      }

      if (update.currentNodeName !== undefined) {
        updateData.current_node_name = update.currentNodeName
      }

      if (update.completedNodes !== undefined) {
        updateData.completed_nodes = update.completedNodes
      }

      if (update.pendingNodes !== undefined) {
        updateData.pending_nodes = update.pendingNodes
      }

      if (update.failedNodes !== undefined) {
        updateData.failed_nodes = update.failedNodes
      }

      if (update.nodeOutputs !== undefined) {
        updateData.node_outputs = update.nodeOutputs
      }

      if (update.status !== undefined) {
        updateData.status = update.status

        if (update.status === 'completed' || update.status === 'failed') {
          updateData.completed_at = new Date().toISOString()
          updateData.current_node_id = null
          updateData.current_node_name = null
        }
      }

      if (update.errorMessage !== undefined) {
        updateData.error_message = update.errorMessage
      }

      if (update.progressPercentage !== undefined) {
        updateData.progress_percentage = Math.min(100, Math.max(0, update.progressPercentage))
      }

      const { error } = await this.supabase
        .from('execution_progress')
        .update(updateData)
        .eq('id', this.progressId)

      if (error) {
        console.error('Failed to update execution progress:', error)
      }
    } catch (error) {
      console.error('Error updating execution progress:', error)
    }
  }

  /**
   * Update when a node completes successfully
   */
  async updateNodeCompleted(nodeId: string, result?: any): Promise<void> {
    this.completedNodes.add(nodeId)

    const completedArray = Array.from(this.completedNodes)
    const nodeOutputs: Record<string, any> = {}
    if (result) {
      nodeOutputs[nodeId] = result
    }

    await this.update({
      completedNodes: completedArray,
      nodeOutputs,
      currentNodeId: undefined, // Clear current node
      currentNodeName: undefined,
    })
  }

  /**
   * Update when a node fails
   */
  async updateNodeFailed(nodeId: string, error: string): Promise<void> {
    this.failedNodes.push({ nodeId, error })

    await this.update({
      failedNodes: this.failedNodes,
      currentNodeId: undefined, // Clear current node
      currentNodeName: undefined,
      errorMessage: error,
    })
  }

  /**
   * Mark execution as completed
   */
  async complete(success: boolean, errorMessage?: string): Promise<void> {
    await this.update({
      status: success ? 'completed' : 'failed',
      errorMessage,
      progressPercentage: 100,
    })

    console.log(`✅ Execution ${success ? 'completed' : 'failed'}`)
  }

  /**
   * Get current progress for an execution
   */
  static async getProgress(executionId: string): Promise<any> {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await supabase
      .from('execution_progress')
      .select('*')
      .eq('execution_id', executionId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error('Failed to get execution progress:', error)
      return null
    }

    return data
  }
}
