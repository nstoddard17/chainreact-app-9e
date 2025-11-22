import { createSupabaseRouteHandlerClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

/**
 * GET /api/workflows/cached-outputs?workflowId=xxx
 * Get all cached node outputs for a workflow
 *
 * GET /api/workflows/cached-outputs?workflowId=xxx&nodeId=yyy
 * Get cached output for a specific node
 */
export async function GET(request: Request) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Authentication required", 401)
    }

    const { searchParams } = new URL(request.url)
    const workflowId = searchParams.get('workflowId')
    const nodeId = searchParams.get('nodeId')

    if (!workflowId) {
      return errorResponse("workflowId is required", 400)
    }

    let query = supabase
      .from('workflow_node_outputs')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('user_id', user.id)

    if (nodeId) {
      query = query.eq('node_id', nodeId)
    }

    const { data: outputs, error } = await query.order('executed_at', { ascending: false })

    if (error) {
      logger.error('[cached-outputs] Database error:', error)
      return errorResponse("Failed to fetch cached outputs", 500)
    }

    // Transform into a map for easy access
    // The output_data contains the full ActionResult: { success, output: {...}, message }
    // We need to extract the actual output fields for variable resolution
    const outputMap: Record<string, any> = {}
    for (const row of outputs || []) {
      const outputData = row.output_data

      // Extract the actual output fields from the ActionResult structure
      let extractedOutput = outputData
      if (outputData && typeof outputData === 'object' && outputData.output && typeof outputData.output === 'object') {
        // ActionResult structure: { success, output: { field1, field2, ... }, message }
        extractedOutput = {
          ...outputData.output,
          __success: outputData.success,
          __message: outputData.message
        }
      }

      outputMap[row.node_id] = {
        nodeId: row.node_id,
        nodeType: row.node_type,
        output: extractedOutput,
        input: row.input_data,
        executedAt: row.executed_at,
        executionId: row.execution_id
      }
    }

    return jsonResponse({
      success: true,
      workflowId,
      cachedOutputs: outputMap,
      nodeCount: Object.keys(outputMap).length
    })

  } catch (error: any) {
    logger.error("[cached-outputs] GET error:", error)
    return errorResponse(error.message || "Failed to get cached outputs", 500)
  }
}

/**
 * POST /api/workflows/cached-outputs
 * Save/update cached output for a node
 *
 * Body: {
 *   workflowId: string,
 *   nodeId: string,
 *   nodeType: string,
 *   output: any,
 *   input?: any,
 *   executionId?: string
 * }
 */
export async function POST(request: Request) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Authentication required", 401)
    }

    const body = await request.json()
    const { workflowId, nodeId, nodeType, output, input, executionId } = body

    if (!workflowId || !nodeId || !nodeType) {
      return errorResponse("workflowId, nodeId, and nodeType are required", 400)
    }

    // Upsert the node output (update if exists, insert if not)
    const { data, error } = await supabase
      .from('workflow_node_outputs')
      .upsert({
        workflow_id: workflowId,
        user_id: user.id,
        node_id: nodeId,
        node_type: nodeType,
        output_data: output || {},
        input_data: input || {},
        execution_id: executionId,
        executed_at: new Date().toISOString()
      }, {
        onConflict: 'workflow_id,node_id'
      })
      .select()
      .single()

    if (error) {
      logger.error('[cached-outputs] Save error:', error)
      return errorResponse("Failed to save cached output", 500)
    }

    logger.debug(`[cached-outputs] Saved output for node ${nodeId} in workflow ${workflowId}`)

    return jsonResponse({
      success: true,
      saved: {
        nodeId,
        nodeType,
        executedAt: data.executed_at
      }
    })

  } catch (error: any) {
    logger.error("[cached-outputs] POST error:", error)
    return errorResponse(error.message || "Failed to save cached output", 500)
  }
}

/**
 * DELETE /api/workflows/cached-outputs
 * Clear cached outputs for a workflow or specific node
 *
 * Body: {
 *   workflowId: string,
 *   nodeId?: string  // If not provided, clears all cached outputs for the workflow
 * }
 */
export async function DELETE(request: Request) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: userError } = await supabase.auth.getUser()

    if (userError || !user) {
      return errorResponse("Authentication required", 401)
    }

    const body = await request.json()
    const { workflowId, nodeId } = body

    if (!workflowId) {
      return errorResponse("workflowId is required", 400)
    }

    let query = supabase
      .from('workflow_node_outputs')
      .delete()
      .eq('workflow_id', workflowId)
      .eq('user_id', user.id)

    if (nodeId) {
      query = query.eq('node_id', nodeId)
    }

    const { error } = await query

    if (error) {
      logger.error('[cached-outputs] Delete error:', error)
      return errorResponse("Failed to clear cached outputs", 500)
    }

    logger.debug(`[cached-outputs] Cleared outputs for workflow ${workflowId}${nodeId ? `, node ${nodeId}` : ''}`)

    return jsonResponse({
      success: true,
      message: nodeId
        ? `Cleared cached output for node ${nodeId}`
        : `Cleared all cached outputs for workflow`
    })

  } catch (error: any) {
    logger.error("[cached-outputs] DELETE error:", error)
    return errorResponse(error.message || "Failed to clear cached outputs", 500)
  }
}
