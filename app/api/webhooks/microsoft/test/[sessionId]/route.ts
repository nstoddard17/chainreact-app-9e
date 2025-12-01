import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine'
import { logger } from '@/lib/utils/logger'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

/**
 * Test Webhook Handler for Microsoft Graph
 *
 * This endpoint handles webhooks for TEST subscriptions only.
 * It is completely isolated from production workflows.
 *
 * URL format: /api/webhooks/microsoft/test/[sessionId]
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  const supabase = getSupabase()

  console.log(`🧪 [Microsoft Test Webhook] Received POST for session: ${sessionId}`)

  try {
    const startTime = Date.now()

    // Handle Microsoft Graph subscription validation
    const validationToken = request.nextUrl.searchParams.get('validationToken')
    if (validationToken) {
      logger.debug('🧪 [Microsoft Test Webhook] Responding to validation request')
      return new NextResponse(validationToken, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' }
      })
    }

    // Validate the test session exists and is listening
    const { data: testSession, error: sessionError } = await supabase
      .from('workflow_test_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('status', 'listening')
      .single()

    if (sessionError || !testSession) {
      logger.warn(`🧪 [Microsoft Test Webhook] Test session not found or not listening: ${sessionId}`)
      return jsonResponse({
        success: false,
        message: 'Test session not found or expired',
        sessionId
      })
    }

    // Parse the payload
    const payload = await request.json()
    const notifications = payload?.value || []

    if (notifications.length === 0) {
      logger.debug('🧪 [Microsoft Test Webhook] No notifications in payload')
      return jsonResponse({ success: true, message: 'No notifications to process' })
    }

    // Verify the subscription belongs to this test session
    for (const notification of notifications) {
      const subscriptionId = notification?.subscriptionId
      if (!subscriptionId) continue

      // Check that this subscription is for this test session
      const { data: triggerResource } = await supabase
        .from('trigger_resources')
        .select('*')
        .eq('external_id', subscriptionId)
        .eq('test_session_id', sessionId)
        .single()

      if (!triggerResource) {
        logger.warn(`🧪 [Microsoft Test Webhook] Subscription ${subscriptionId} not found for test session ${sessionId}`)
        continue
      }

      // Verify clientState
      const bodyClientState = notification?.clientState
      if (bodyClientState && triggerResource.config?.clientState) {
        if (bodyClientState !== triggerResource.config.clientState) {
          logger.warn('🧪 [Microsoft Test Webhook] Invalid clientState, skipping')
          continue
        }
      }

      // Get workflow data from test_mode_config
      const testConfig = testSession.test_mode_config as any
      if (!testConfig?.nodes) {
        logger.error(`🧪 [Microsoft Test Webhook] No workflow nodes in test_mode_config`)
        continue
      }

      const workflow = {
        id: testSession.workflow_id,
        user_id: testSession.user_id,
        nodes: testConfig.nodes,
        connections: testConfig.connections || [],
        name: testConfig.workflowName || 'Test Workflow'
      }

      // Build event data from notification
      const eventData = {
        subscriptionId,
        changeType: notification?.changeType,
        resource: notification?.resource,
        resourceData: notification?.resourceData,
        tenantId: notification?.tenantId,
        _testSession: true
      }

      // Update test session status to executing
      await supabase
        .from('workflow_test_sessions')
        .update({ status: 'executing' })
        .eq('id', sessionId)

      // Create and run execution
      const executionEngine = new AdvancedExecutionEngine()
      const executionSession = await executionEngine.createExecutionSession(
        workflow.id,
        testSession.user_id,
        'webhook',
        {
          triggerData: eventData,
          source: 'microsoft_test_webhook',
          testSessionId: sessionId,
          isTestExecution: true
        }
      )

      // Update test session with execution ID
      await supabase
        .from('workflow_test_sessions')
        .update({
          execution_id: executionSession.id,
          status: 'executing'
        })
        .eq('id', sessionId)

      logger.debug(`🧪 [Microsoft Test Webhook] Starting workflow execution`, {
        workflowId: workflow.id,
        executionId: executionSession.id,
        testSessionId: sessionId
      })

      // Execute workflow
      await executionEngine.executeWorkflow(
        executionSession.id,
        workflow.nodes,
        workflow.connections,
        { triggerOutput: eventData }
      )

      logger.debug(`🧪 [Microsoft Test Webhook] Execution complete for session ${sessionId}`)
    }

    const processingTime = Date.now() - startTime
    return jsonResponse({
      success: true,
      testSessionId: sessionId,
      processingTime,
      notificationsProcessed: notifications.length
    })

  } catch (error) {
    logger.error('🧪 [Microsoft Test Webhook] Error:', error)

    // Update test session to failed
    await supabase
      .from('workflow_test_sessions')
      .update({
        status: 'failed',
        ended_at: new Date().toISOString()
      })
      .eq('id', sessionId)

    return errorResponse('Internal server error', 500)
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params

  // Health check for test session
  const supabase = getSupabase()
  const { data: testSession } = await supabase
    .from('workflow_test_sessions')
    .select('id, status, workflow_id, created_at, expires_at')
    .eq('id', sessionId)
    .single()

  return jsonResponse({
    status: testSession ? 'active' : 'not_found',
    provider: 'microsoft-test',
    testSessionId: sessionId,
    session: testSession,
    timestamp: new Date().toISOString()
  })
}
