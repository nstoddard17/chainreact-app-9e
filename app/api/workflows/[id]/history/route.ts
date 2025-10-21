import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { executionHistoryService } from '@/lib/services/executionHistoryService'

import { logger } from '@/lib/utils/logger'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return errorResponse('Unauthorized' , 401)
    }

    const { id: workflowId } = await params

    // Verify user owns the workflow
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id, user_id')
      .eq('id', workflowId)
      .single()

    if (workflowError || !workflow) {
      return errorResponse('Workflow not found' , 404)
    }

    if (workflow.user_id !== user.id) {
      return errorResponse('Unauthorized' , 403)
    }

    // Get execution history
    const history = await executionHistoryService.getWorkflowHistory(workflowId, 100)

    return jsonResponse({ history })
  } catch (error) {
    logger.error('Error fetching workflow history:', error)
    return errorResponse('Failed to fetch workflow history' , 500)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createSupabaseRouteHandlerClient()

    // Check authentication
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return errorResponse('Unauthorized' , 401)
    }

    const { id: workflowId } = await params

    // Verify user owns the workflow
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id, user_id')
      .eq('id', workflowId)
      .single()

    if (workflowError || !workflow) {
      return errorResponse('Workflow not found' , 404)
    }

    if (workflow.user_id !== user.id) {
      return errorResponse('Unauthorized' , 403)
    }

    // Delete execution history
    await executionHistoryService.deleteWorkflowHistory(workflowId)

    return jsonResponse({ success: true })
  } catch (error) {
    logger.error('Error deleting workflow history:', error)
    return errorResponse('Failed to delete workflow history' , 500)
  }
}