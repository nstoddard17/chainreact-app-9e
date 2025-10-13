import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseServiceClient } from '@/utils/supabase/server'

import { logger } from '@/lib/utils/logger'

/**
 * Cleanup endpoint for test sessions
 * Designed to work with navigator.sendBeacon (POST only)
 * Uses service role client to avoid cookie/auth issues during page unload
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workflowId } = await params

    // Parse the request body
    let sessionId = null
    let userId = null

    try {
      const bodyText = await request.text()
      if (bodyText && bodyText.trim()) {
        const body = JSON.parse(bodyText)
        sessionId = body.sessionId
        userId = body.userId
      }
    } catch {
      // Invalid body, can't proceed
      return errorResponse('Invalid request' , 400)
    }

    if (!sessionId || !userId) {
      return errorResponse('Missing sessionId or userId' , 400)
    }

    // Use service role client to avoid auth issues during page unload
    const supabase = await createSupabaseServiceClient()

    logger.debug(`🧹 Cleanup request received for session ${sessionId}`)

    // Verify session exists and belongs to this workflow
    const { data: session } = await supabase
      .from('workflow_test_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('workflow_id', workflowId)
      .eq('user_id', userId)
      .single()

    if (!session) {
      logger.debug('Session not found or already cleaned up')
      return jsonResponse({ success: true })
    }

    // Get workflow to deactivate triggers
    const { data: workflow } = await supabase
      .from('workflows')
      .select('nodes')
      .eq('id', workflowId)
      .single()

    // Unregister webhook/trigger from external service
    if (workflow?.nodes) {
      try {
        const { triggerLifecycleManager } = await import('@/lib/triggers')
        logger.debug('🔄 Deactivating trigger for live test mode...')
        await triggerLifecycleManager.deactivateWorkflowTriggers(workflowId, userId)
        logger.debug('✅ Trigger deactivated successfully')
      } catch (error) {
        logger.error('Error deactivating triggers:', error)
        // Continue with cleanup even if deactivation fails
      }
    }

    // Update test session to stopped
    await supabase
      .from('workflow_test_sessions')
      .update({
        status: 'stopped',
        ended_at: new Date().toISOString(),
      })
      .eq('id', sessionId)

    logger.debug(`✅ Test session ${sessionId} cleaned up successfully`)

    return jsonResponse({
      success: true,
      message: 'Test session cleaned up',
    })
  } catch (error: any) {
    logger.error('Error during cleanup:', error)
    // Don't fail during cleanup - best effort
    return jsonResponse({ success: true })
  }
}