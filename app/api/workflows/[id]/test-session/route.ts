import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'

import { logger } from '@/lib/utils/logger'

/**
 * Start a live test session for a workflow
 * Ensures webhook is registered and ready to receive events
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workflowId } = await params
    const body = await request.json().catch(() => ({}))
    const { testModeConfig, timeout = 30 * 60 * 1000 } = body // Accept test mode config and custom timeout

    logger.debug('Starting test session with config:', { testModeConfig, timeout })

    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    // Get workflow metadata
    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id, name, user_id')
      .eq('id', workflowId)
      .eq('user_id', user.id)
      .single()

    if (workflowError || !workflow) {
      return errorResponse('Workflow not found' , 404)
    }

    // Load workflow nodes from normalized table
    const { data: dbNodes } = await supabase
      .from('workflow_nodes')
      .select('*')
      .eq('workflow_id', workflowId)
      .order('display_order')

    const nodes = (dbNodes || []).map((n: any) => ({
      id: n.id,
      type: n.node_type,
      position: { x: n.position_x, y: n.position_y },
      data: {
        type: n.node_type,
        label: n.label,
        config: n.config || {},
        isTrigger: n.is_trigger,
        providerId: n.provider_id
      }
    }))

    // Find the trigger node
    const triggerNode = nodes.find(
      (node: any) => node.data?.isTrigger === true
    )

    if (!triggerNode) {
      return errorResponse('No trigger node found in workflow' , 400)
    }

    const triggerType = triggerNode.data?.type

    // Check if this is a webhook-based trigger
    const webhookTriggers = [
      'gmail_trigger_new_email',
      'airtable_trigger_new_record',
      'airtable_trigger_record_updated',
      'github_trigger_new_issue',
      'github_trigger_pr_updated',
      'slack_trigger_new_message',
      'discord_trigger_new_message',
      'notion_trigger_page_updated',
      'trello_trigger_card_moved',
      // Microsoft Teams triggers
      'teams_trigger_new_message',
      'teams_trigger_new_reply',
      'teams_trigger_channel_mention',
      'teams_trigger_new_chat_message',
      'teams_trigger_new_chat',
      'teams_trigger_new_channel',
    ]

    if (!webhookTriggers.includes(triggerType)) {
      return errorResponse('This trigger type does not support webhook-based live testing', 400, {
          triggerType
        })
    }

    // Create test session record FIRST (we need the session ID for webhook isolation)
    const sessionId = `test-${workflowId}-${Date.now()}`
    const { error: sessionError } = await supabase
      .from('workflow_test_sessions')
      .insert({
        id: sessionId,
        workflow_id: workflowId,
        user_id: user.id,
        status: 'listening',
        trigger_type: triggerType,
        test_mode_config: testModeConfig || {
          nodes: nodes,
          workflowName: workflow.name,
        },
        started_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + timeout).toISOString(),
      })

    if (sessionError) {
      logger.error('Failed to create test session:', sessionError)
      return errorResponse('Failed to create test session', 500, { details: sessionError.message })
    }

    // Register webhook/trigger with external service (Gmail, Airtable, etc.)
    // Use TEST MODE to ensure isolated webhook URL that won't trigger production workflows
    const { triggerLifecycleManager } = await import('@/lib/triggers')

    logger.debug('🧪 Registering trigger for live test mode with isolated webhook...')
    const result = await triggerLifecycleManager.activateWorkflowTriggers(
      workflowId,
      user.id,
      nodes,
      { isTest: true, testSessionId: sessionId } // TEST MODE - uses separate webhook URL
    )

    if (!result.success && result.errors.length > 0) {
      logger.error('❌ Trigger activation failed:', result.errors)
      // Clean up the test session since activation failed
      await supabase
        .from('workflow_test_sessions')
        .delete()
        .eq('id', sessionId)
      return errorResponse('Failed to register webhook with external service', 500, { details: result.errors })
    }

    logger.debug('✅ Test trigger registered successfully with isolated webhook')

    return jsonResponse({
      success: true,
      sessionId,
      status: 'listening',
      message: 'Webhook registered. Waiting for trigger event...',
      triggerType,
      testModeConfig,
      expiresIn: timeout,
    })
  } catch (error: any) {
    logger.error('Error starting test session:', error)
    return errorResponse(error.message || 'Failed to start test session' , 500)
  }
}

/**
 * Stop a live test session
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workflowId } = await params
    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    // Find the active test session to get its ID for cleanup
    const { data: testSession } = await supabase
      .from('workflow_test_sessions')
      .select('id')
      .eq('workflow_id', workflowId)
      .eq('user_id', user.id)
      .eq('status', 'listening')
      .order('started_at', { ascending: false })
      .limit(1)
      .single()

    const testSessionId = testSession?.id

    // Unregister ONLY the test webhook (not production webhooks)
    const { triggerLifecycleManager } = await import('@/lib/triggers')

    if (testSessionId) {
      logger.debug(`🧪 Deactivating test trigger for session ${testSessionId}...`)
      await triggerLifecycleManager.deactivateWorkflowTriggers(workflowId, user.id, testSessionId)
      logger.debug('✅ Test trigger deactivated (production triggers unaffected)')
    } else {
      logger.debug('⚠️ No active test session found to deactivate')
    }

    // Update test session to stopped
    await supabase
      .from('workflow_test_sessions')
      .update({
        status: 'stopped',
        ended_at: new Date().toISOString(),
      })
      .eq('workflow_id', workflowId)
      .eq('user_id', user.id)
      .eq('status', 'listening')

    return jsonResponse({
      success: true,
      message: 'Test session stopped and test webhook unregistered',
      testSessionId,
    })
  } catch (error: any) {
    logger.error('Error stopping test session:', error)
    return errorResponse(error.message || 'Failed to stop test session', 500)
  }
}

/**
 * Get current test session status
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: workflowId } = await params
    const supabase = await createSupabaseRouteHandlerClient()

    // Get current user
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    // Get active test session
    const { data: session, error: sessionError } = await supabase
      .from('workflow_test_sessions')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('user_id', user.id)
      .in('status', ['listening', 'executing'])
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (sessionError) {
      logger.error('Error fetching test session:', sessionError)
    }

    if (!session) {
      return jsonResponse({
        active: false,
        session: null,
      })
    }

    // Check if session expired
    if (new Date(session.expires_at) < new Date()) {
      await supabase
        .from('workflow_test_sessions')
        .update({
          status: 'expired',
          ended_at: new Date().toISOString(),
        })
        .eq('id', session.id)

      return jsonResponse({
        active: false,
        session: { ...session, status: 'expired' },
      })
    }

    // If executing, get the execution details
    let executionDetails = null
    if (session.status === 'executing' && session.execution_id) {
      const { data: execution } = await supabase
        .from('executions')
        .select('*')
        .eq('id', session.execution_id)
        .single()

      executionDetails = execution
    }

    return jsonResponse({
      active: true,
      session,
      execution: executionDetails,
    })
  } catch (error: any) {
    logger.error('Error getting test session:', error)
    return errorResponse(error.message || 'Failed to get test session' , 500)
  }
}
