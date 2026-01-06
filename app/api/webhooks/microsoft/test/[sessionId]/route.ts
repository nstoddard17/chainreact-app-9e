import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'

// Force dynamic rendering to ensure this route works with dynamic segments
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

async function getValidationToken(request: NextRequest): Promise<string | null> {
  const validationToken = request.nextUrl.searchParams.get('validationToken') ||
    request.nextUrl.searchParams.get('validationtoken')

  if (validationToken) return validationToken

  if (request.headers.get('content-type')?.includes('text/plain')) {
    return request.text()
  }

  return null
}

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

  console.log(`dYŚ [Microsoft Test Webhook] Received POST for session: ${sessionId}`, {
    url: request.nextUrl.toString(),
    method: request.method
  })

  try {
    const startTime = Date.now()

    // Handle Microsoft Graph subscription validation
    const validationToken = await getValidationToken(request)
    if (validationToken) {
      logger.debug('?? [Microsoft Test Webhook] Responding to validation request')
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

      // Build event data from notification
      const eventData = {
        subscriptionId,
        changeType: notification?.changeType,
        resource: notification?.resource,
        resourceData: notification?.resourceData,
        tenantId: notification?.tenantId,
        _testSession: true
      }

      // Store trigger_data so test-trigger API can poll for it
      // This allows the frontend to execute via SSE for real-time updates
      await supabase
        .from('workflow_test_sessions')
        .update({
          status: 'trigger_received',
          trigger_data: eventData
        })
        .eq('id', sessionId)

      logger.debug(`🧪 [Microsoft Test Webhook] Trigger data stored for session ${sessionId}`)

      // The test-trigger API will poll and find this trigger_data,
      // then return it to the frontend for execution via SSE.
      // We don't execute the workflow here - that happens on the frontend
      // for real-time progress visualization.
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
  console.log(`dYŚ [Microsoft Test Webhook] Received GET for session: ${sessionId}`, {
    url: request.nextUrl.toString(),
    method: request.method
  })
  const validationToken = await getValidationToken(request)
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    })
  }

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

export async function OPTIONS(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  console.log(`dYŚ [Microsoft Test Webhook] Received OPTIONS for session: ${sessionId}`, {
    url: request.nextUrl.toString(),
    method: request.method
  })
  return new NextResponse(null, { status: 200 })
}

export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params
  console.log(`dY?s [Microsoft Test Webhook] Received HEAD for session: ${sessionId}`, {
    url: request.nextUrl.toString(),
    method: request.method
  })
  const validationToken = await getValidationToken(request)
  if (validationToken) {
    return new NextResponse(validationToken, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' }
    })
  }

  return new NextResponse(null, { status: 200 })
}
