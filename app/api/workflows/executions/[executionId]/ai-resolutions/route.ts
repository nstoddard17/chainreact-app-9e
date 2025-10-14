import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseServerClient } from '@/utils/supabase/server'

import { logger } from '@/lib/utils/logger'

/**
 * GET /api/workflows/executions/[executionId]/ai-resolutions
 * Retrieve AI field resolution history for a specific execution
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ executionId: string }> }
) {
  try {
    const supabase = await createSupabaseServerClient()
    const { executionId } = await params

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    // Fetch AI field resolutions for this execution
    const { data: resolutions, error } = await supabase
      .from('ai_field_resolutions_detailed')
      .select('*')
      .eq('execution_id', executionId)
      .eq('user_id', user.id)
      .order('resolved_at', { ascending: true })

    if (error) {
      logger.error('Error fetching AI field resolutions:', error)
      return errorResponse('Failed to fetch AI field resolutions' , 500)
    }

    // Group resolutions by node for easier display
    const groupedResolutions = resolutions?.reduce((acc: any, resolution: any) => {
      if (!acc[resolution.node_id]) {
        acc[resolution.node_id] = {
          nodeId: resolution.node_id,
          nodeType: resolution.node_type,
          nodeLabel: resolution.node_label,
          fields: []
        }
      }
      
      acc[resolution.node_id].fields.push({
        fieldName: resolution.field_name,
        fieldType: resolution.field_type,
        originalValue: resolution.original_value,
        resolvedValue: resolution.resolved_value,
        availableOptions: resolution.available_options,
        reasoning: resolution.resolution_reasoning,
        tokensUsed: resolution.tokens_used,
        cost: resolution.cost,
        resolvedAt: resolution.resolved_at
      })
      
      return acc
    }, {})

    // Convert to array
    const result = Object.values(groupedResolutions || {})

    return jsonResponse({
      success: true,
      executionId,
      resolutions: result,
      totalResolutions: resolutions?.length || 0,
      totalCost: resolutions?.reduce((sum: number, r: any) => sum + (r.cost || 0), 0) || 0,
      totalTokens: resolutions?.reduce((sum: number, r: any) => sum + (r.tokens_used || 0), 0) || 0
    })
  } catch (error) {
    logger.error('Error in AI resolutions API:', error)
    return errorResponse('Internal server error' , 500)
  }
}

/**
 * GET /api/workflows/[workflowId]/ai-resolutions
 * Retrieve all AI field resolutions for a workflow
 */
export async function GET_WORKFLOW(
  request: NextRequest,
  workflowId: string
) {
  try {
    const supabase = await createSupabaseServerClient()

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    // Fetch all AI field resolutions for this workflow
    const { data: resolutions, error } = await supabase
      .from('ai_field_resolutions_detailed')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('user_id', user.id)
      .order('resolved_at', { ascending: false })
      .limit(100) // Limit to last 100 resolutions

    if (error) {
      logger.error('Error fetching workflow AI resolutions:', error)
      return errorResponse('Failed to fetch AI field resolutions' , 500)
    }

    // Group by execution for overview
    const executionGroups = resolutions?.reduce((acc: any, resolution: any) => {
      if (!acc[resolution.execution_id]) {
        acc[resolution.execution_id] = {
          executionId: resolution.execution_id,
          executionStatus: resolution.execution_status,
          executionStartedAt: resolution.execution_started_at,
          executionCompletedAt: resolution.execution_completed_at,
          resolutions: [],
          totalCost: 0,
          totalTokens: 0
        }
      }
      
      acc[resolution.execution_id].resolutions.push(resolution)
      acc[resolution.execution_id].totalCost += resolution.cost || 0
      acc[resolution.execution_id].totalTokens += resolution.tokens_used || 0
      
      return acc
    }, {})

    return jsonResponse({
      success: true,
      workflowId,
      executionGroups: Object.values(executionGroups || {}),
      totalExecutions: Object.keys(executionGroups || {}).length
    })
  } catch (error) {
    logger.error('Error in workflow AI resolutions API:', error)
    return errorResponse('Internal server error' , 500)
  }
}