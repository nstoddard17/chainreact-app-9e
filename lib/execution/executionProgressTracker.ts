import { createClient } from '@supabase/supabase-js'

import { logger } from '@/lib/utils/logger'

// Helper to safely clone data and remove circular references
function safeClone(obj: any, seen = new WeakSet()): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof Array) return obj.map(item => safeClone(item, seen));
  if (seen.has(obj)) return '[Circular Reference]';

  seen.add(obj);

  const cloned: any = {};
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      try {
        cloned[key] = safeClone(obj[key], seen);
      } catch (e) {
        cloned[key] = '[Error cloning property]';
      }
    }
  }

  return cloned;
}

export interface ExecutionProgressUpdate {
  currentNodeId?: string
  currentNodeName?: string
  completedNodes?: string[]
  pendingNodes?: string[]
  failedNodes?: Array<{ nodeId: string; error: string }>
  nodeOutputs?: Record<string, any>
  status?: 'running' | 'completed' | 'failed' | 'paused'
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
      process.env.SUPABASE_SECRET_KEY!
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
      logger.debug('🔄 ExecutionProgressTracker.initialize called', {
        executionId,
        workflowId,
        userId,
        totalNodes
      })

      const { data, error } = await this.supabase
        .from('execution_progress')
        .insert({
          execution_id: executionId,
          workflow_id: workflowId,
          user_id: userId,
          status: 'running',
          current_node_id: null,
          current_node_name: 'Starting execution...',
          completed_nodes: [],
          pending_nodes: [],
          failed_nodes: [],
          node_outputs: {},
          progress_percentage: 0,
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (error) {
        logger.error('Failed to initialize execution progress:', error)

        // Check if this is a table doesn't exist error
        if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
          logger.debug('⚠️ execution_progress table does not exist. Please create it using the SQL script.')
          logger.debug('Continuing without progress tracking...')
        } else {
          logger.debug('Will continue without progress tracking due to error:', error.message)
        }

        return
      }

      if (data) {
        this.progressId = data.id
        logger.debug('✅ Execution progress tracker initialized:', this.progressId)
      }

      // Also check if this execution is part of a test session
      try {
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

          logger.debug('📝 Updated test session status to executing:', testSession.id)
        }
      } catch (testSessionError) {
        logger.debug('Test session check skipped:', testSessionError)
      }
    } catch (error) {
      logger.error('Error initializing execution progress:', error)
    }
  }

  /**
   * Update execution progress
   */
  async update(update: ExecutionProgressUpdate): Promise<void> {
    if (!this.progressId) {
      logger.warn('Progress tracker not initialized, skipping update')
      return
    }

    logger.debug('Updating execution progress:', update)

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
        logger.error('Failed to update execution progress:', error)
      }
    } catch (error) {
      logger.error('Error updating execution progress:', error)
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
      // Use safeClone to avoid circular references when storing outputs
      nodeOutputs[nodeId] = safeClone(result)
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
   * Pause execution (for HITL)
   */
  async pause(nodeId?: string, nodeName?: string): Promise<void> {
    await this.update({
      status: 'paused',
      currentNodeId: nodeId,
      currentNodeName: nodeName || 'Paused for human input',
    })

    logger.debug(`⏸️  Execution paused${nodeId ? ` at node ${nodeId}` : ''}`)
  }

  /**
   * Resume an existing execution (for HITL resume)
   * Instead of creating a new record, this finds and continues the existing one
   */
  async resume(executionId: string): Promise<boolean> {
    try {
      logger.debug('🔄 ExecutionProgressTracker.resume called', { executionId })

      // Find the existing progress record
      const { data, error } = await this.supabase
        .from('execution_progress')
        .select('*')
        .eq('execution_id', executionId)
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        logger.error('Failed to find execution progress for resume:', error)
        return false
      }

      if (!data) {
        logger.warn('No existing progress record found for resume:', executionId)
        return false
      }

      this.progressId = data.id

      // Restore completed nodes from existing record
      if (data.completed_nodes && Array.isArray(data.completed_nodes)) {
        data.completed_nodes.forEach((nodeId: string) => this.completedNodes.add(nodeId))
      }

      // Restore failed nodes
      if (data.failed_nodes && Array.isArray(data.failed_nodes)) {
        this.failedNodes = data.failed_nodes
      }

      // Update status to running
      await this.update({
        status: 'running',
        currentNodeName: 'Resuming execution...',
      })

      logger.debug('✅ Execution progress tracker resumed:', this.progressId)
      return true
    } catch (error) {
      logger.error('Error resuming execution progress:', error)
      return false
    }
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

    logger.debug(`✅ Execution ${success ? 'completed' : 'failed'}`)
  }

  /**
   * Get current progress for an execution
   */
  static async getProgress(executionId: string): Promise<any> {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SECRET_KEY!
    )

    const { data, error } = await supabase
      .from('execution_progress')
      .select('*')
      .eq('execution_id', executionId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      logger.error('Failed to get execution progress:', error)
      return null
    }

    return data
  }
}
