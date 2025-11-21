import { createClient } from "@supabase/supabase-js"
import { logger } from '@/lib/utils/logger'

/**
 * Service for caching and retrieving workflow node outputs
 * Enables running individual nodes using previously cached data from upstream nodes
 */
export class NodeOutputCache {
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  /**
   * Save a node's output to the cache
   */
  async saveNodeOutput(params: {
    workflowId: string
    userId: string
    nodeId: string
    nodeType: string
    output: any
    input?: any
    executionId?: string
  }): Promise<boolean> {
    try {
      const { workflowId, userId, nodeId, nodeType, output, input, executionId } = params

      const { error } = await this.supabase
        .from('workflow_node_outputs')
        .upsert({
          workflow_id: workflowId,
          user_id: userId,
          node_id: nodeId,
          node_type: nodeType,
          output_data: output || {},
          input_data: input || {},
          execution_id: executionId,
          executed_at: new Date().toISOString()
        }, {
          onConflict: 'workflow_id,node_id'
        })

      if (error) {
        logger.error('[NodeOutputCache] Failed to save output:', { nodeId, error: error.message })
        return false
      }

      logger.debug(`[NodeOutputCache] Saved output for node ${nodeId}`)
      return true
    } catch (error: any) {
      logger.error('[NodeOutputCache] Error saving output:', error)
      return false
    }
  }

  /**
   * Get a specific node's cached output
   */
  async getNodeOutput(workflowId: string, nodeId: string): Promise<any | null> {
    try {
      const { data, error } = await this.supabase
        .from('workflow_node_outputs')
        .select('*')
        .eq('workflow_id', workflowId)
        .eq('node_id', nodeId)
        .single()

      if (error || !data) {
        return null
      }

      return {
        nodeId: data.node_id,
        nodeType: data.node_type,
        output: data.output_data,
        input: data.input_data,
        executedAt: data.executed_at,
        executionId: data.execution_id
      }
    } catch (error: any) {
      logger.error('[NodeOutputCache] Error fetching output:', error)
      return null
    }
  }

  /**
   * Get all cached outputs for a workflow
   * Returns a map of nodeId -> output data
   */
  async getAllCachedOutputs(workflowId: string): Promise<Record<string, any>> {
    try {
      const { data, error } = await this.supabase
        .from('workflow_node_outputs')
        .select('*')
        .eq('workflow_id', workflowId)
        .order('executed_at', { ascending: false })

      if (error) {
        logger.error('[NodeOutputCache] Failed to fetch outputs:', error)
        return {}
      }

      const outputMap: Record<string, any> = {}
      for (const row of data || []) {
        // Store the output data directly, which matches what the node returned
        outputMap[row.node_id] = row.output_data
      }

      logger.debug(`[NodeOutputCache] Retrieved ${Object.keys(outputMap).length} cached outputs for workflow ${workflowId}`)
      return outputMap
    } catch (error: any) {
      logger.error('[NodeOutputCache] Error fetching all outputs:', error)
      return {}
    }
  }

  /**
   * Get outputs for specific upstream nodes
   * Useful for resolving variables from previous nodes
   */
  async getUpstreamOutputs(workflowId: string, nodeIds: string[]): Promise<Record<string, any>> {
    try {
      if (!nodeIds || nodeIds.length === 0) {
        return {}
      }

      const { data, error } = await this.supabase
        .from('workflow_node_outputs')
        .select('*')
        .eq('workflow_id', workflowId)
        .in('node_id', nodeIds)

      if (error) {
        logger.error('[NodeOutputCache] Failed to fetch upstream outputs:', error)
        return {}
      }

      const outputMap: Record<string, any> = {}
      for (const row of data || []) {
        outputMap[row.node_id] = row.output_data
      }

      return outputMap
    } catch (error: any) {
      logger.error('[NodeOutputCache] Error fetching upstream outputs:', error)
      return {}
    }
  }

  /**
   * Clear cached outputs for a workflow
   */
  async clearWorkflowCache(workflowId: string, nodeId?: string): Promise<boolean> {
    try {
      let query = this.supabase
        .from('workflow_node_outputs')
        .delete()
        .eq('workflow_id', workflowId)

      if (nodeId) {
        query = query.eq('node_id', nodeId)
      }

      const { error } = await query

      if (error) {
        logger.error('[NodeOutputCache] Failed to clear cache:', error)
        return false
      }

      logger.debug(`[NodeOutputCache] Cleared cache for workflow ${workflowId}${nodeId ? `, node ${nodeId}` : ''}`)
      return true
    } catch (error: any) {
      logger.error('[NodeOutputCache] Error clearing cache:', error)
      return false
    }
  }

  /**
   * Check if cached outputs exist for required upstream nodes
   */
  async hasCachedDataForNodes(workflowId: string, nodeIds: string[]): Promise<{
    available: boolean
    missingNodes: string[]
    availableNodes: string[]
  }> {
    try {
      if (!nodeIds || nodeIds.length === 0) {
        return { available: true, missingNodes: [], availableNodes: [] }
      }

      const { data, error } = await this.supabase
        .from('workflow_node_outputs')
        .select('node_id')
        .eq('workflow_id', workflowId)
        .in('node_id', nodeIds)

      if (error) {
        return { available: false, missingNodes: nodeIds, availableNodes: [] }
      }

      const cachedNodeIds = new Set((data || []).map(row => row.node_id))
      const availableNodes = nodeIds.filter(id => cachedNodeIds.has(id))
      const missingNodes = nodeIds.filter(id => !cachedNodeIds.has(id))

      return {
        available: missingNodes.length === 0,
        missingNodes,
        availableNodes
      }
    } catch (error: any) {
      logger.error('[NodeOutputCache] Error checking cache availability:', error)
      return { available: false, missingNodes: nodeIds, availableNodes: [] }
    }
  }
}

// Export a singleton instance
export const nodeOutputCache = new NodeOutputCache()
