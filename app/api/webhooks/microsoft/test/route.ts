import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'

// Force dynamic rendering
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

/**
 * Extract sessionId from URL path or query parameter
 * Supports both:
 * - /api/webhooks/microsoft/test?sessionId=xxx (query param)
 * - /api/webhooks/microsoft/test/xxx (path segment - parsed from URL)
 */
function getSessionId(request: NextRequest): string | null {
  // First try query parameter
  const querySessionId = request.nextUrl.searchParams.get('sessionId')
  if (querySessionId) return querySessionId

  // Then try to extract from path (for backwards compatibility)
  const pathname = request.nextUrl.pathname
  const match = pathname.match(/\/api\/webhooks\/microsoft\/test\/(.+)$/)
  if (match && match[1]) {
    return match[1]
  }

  return null
}

async function getValidationToken(request: NextRequest): Promise<string | null> {
  const validationToken = request.nextUrl.searchParams.get('validationToken') ||
    request.nextUrl.searchParams.get('validationtoken')

  if (validationToken) return validationToken

  // Check if it's a text/plain request (Microsoft sometimes sends token in body)
  if (request.headers.get('content-type')?.includes('text/plain')) {
    try {
      return await request.text()
    } catch {
      return null
    }
  }

  return null
}

async function maybeHandleValidation(request: NextRequest): Promise<NextResponse | null> {
  const validationToken = await getValidationToken(request)
  if (!validationToken) return null

  logger.debug('🧪 [Microsoft Test Webhook] Responding to validation request')
  return new NextResponse(validationToken, {
    status: 200,
    headers: { 'Content-Type': 'text/plain' }
  })
}

/**
 * Test Webhook Handler for Microsoft Graph
 *
 * This endpoint handles webhooks for TEST subscriptions only.
 * It is completely isolated from production workflows.
 *
 * URL format: /api/webhooks/microsoft/test?sessionId=xxx
 */
export async function POST(request: NextRequest) {
  const sessionId = getSessionId(request)
  const supabase = getSupabase()

  console.log(`🧪 [Microsoft Test Webhook] Received POST`, {
    sessionId,
    url: request.nextUrl.toString(),
    method: request.method
  })

  // Handle validation first (doesn't require sessionId)
  const validationResponse = await maybeHandleValidation(request)
  if (validationResponse) {
    return validationResponse
  }

  // Now we need sessionId for actual webhook processing
  if (!sessionId) {
    logger.warn('🧪 [Microsoft Test Webhook] Missing sessionId')
    return jsonResponse({
      success: false,
      message: 'Missing sessionId parameter'
    }, 400)
  }

  try {
    const startTime = Date.now()

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
      await supabase
        .from('workflow_test_sessions')
        .update({
          status: 'trigger_received',
          trigger_data: eventData
        })
        .eq('id', sessionId)

      logger.debug(`🧪 [Microsoft Test Webhook] Trigger data stored for session ${sessionId}`)
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
    if (sessionId) {
      await supabase
        .from('workflow_test_sessions')
        .update({
          status: 'failed',
          ended_at: new Date().toISOString()
        })
        .eq('id', sessionId)
    }

    return errorResponse('Internal server error', 500)
  }
}

export async function GET(request: NextRequest) {
  const sessionId = getSessionId(request)

  console.log(`🧪 [Microsoft Test Webhook] Received GET`, {
    sessionId,
    url: request.nextUrl.toString(),
    method: request.method
  })

  // Handle validation first
  const validationResponse = await maybeHandleValidation(request)
  if (validationResponse) {
    return validationResponse
  }

  // Health check / status endpoint
  if (!sessionId) {
    return jsonResponse({
      status: 'ok',
      provider: 'microsoft-test',
      message: 'Test webhook endpoint active. Provide sessionId parameter for session status.',
      timestamp: new Date().toISOString()
    })
  }

  // Get session status
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

export async function OPTIONS(request: NextRequest) {
  console.log(`🧪 [Microsoft Test Webhook] Received OPTIONS`, {
    url: request.nextUrl.toString()
  })

  // Handle validation
  const validationResponse = await maybeHandleValidation(request)
  if (validationResponse) {
    return validationResponse
  }

  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  })
}
