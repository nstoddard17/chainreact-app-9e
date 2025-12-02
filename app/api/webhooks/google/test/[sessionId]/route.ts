import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { verifyGoogleWebhook } from '@/lib/webhooks/google-verification'
import { processGoogleEventForTestSession } from '@/lib/webhooks/google-processor'
import { logWebhookEvent } from '@/lib/webhooks/event-logger'
import { logger } from '@/lib/utils/logger'

/**
 * Test Webhook Handler for Google Services
 *
 * This endpoint handles webhooks for TEST subscriptions only.
 * It is completely isolated from production workflows.
 *
 * URL format: /api/webhooks/google/test/[sessionId]
 *
 * When a test subscription is created, it registers this URL with Google.
 * Events sent to this URL will ONLY trigger the test session workflow,
 * never any production workflows.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params

  console.log(`🧪 [Google Test Webhook] Received POST for session: ${sessionId}`)

  try {
    const startTime = Date.now()
    const requestId = crypto.randomUUID()

    const headersObject = Object.fromEntries(request.headers.entries())
    console.log('🧪 [Google Test Webhook] Headers:', JSON.stringify(headersObject, null, 2))

    // Log incoming test webhook
    await logWebhookEvent({
      provider: 'google-test',
      requestId,
      method: 'POST',
      headers: headersObject,
      metadata: { testSessionId: sessionId },
      timestamp: new Date().toISOString()
    })

    // Verify Google webhook signature
    const isValid = await verifyGoogleWebhook(request)
    if (!isValid) {
      logger.error(`[${requestId}] Invalid Google test webhook signature`)
      return errorResponse('Unauthorized', 401)
    }

    // Validate the test session exists and is listening
    const supabase = await createSupabaseServiceClient()
    const { data: testSession, error: sessionError } = await supabase
      .from('workflow_test_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('status', 'listening')
      .single()

    if (sessionError || !testSession) {
      logger.warn(`[${requestId}] Test session not found or not listening: ${sessionId}`)
      // Return 200 to acknowledge receipt (don't want Google to retry)
      // but don't process the event
      return jsonResponse({
        success: false,
        message: 'Test session not found or expired',
        sessionId
      })
    }

    // Parse the request body
    const rawBody = await request.text()
    let eventData: any = null

    if (rawBody && rawBody.trim().length > 0) {
      try {
        const bodyJson = JSON.parse(rawBody)

        // Gmail Pub/Sub format: { message: { data: base64, attributes: {} } }
        if (bodyJson.message && bodyJson.message.data) {
          const decodedData = Buffer.from(bodyJson.message.data, 'base64').toString('utf-8')
          eventData = JSON.parse(decodedData)
          eventData._isPubSub = true
        } else {
          eventData = bodyJson
        }
      } catch (jsonError) {
        try {
          const decodedBody = Buffer.from(rawBody, 'base64').toString('utf-8')
          eventData = JSON.parse(decodedBody)
        } catch (base64Error) {
          logger.warn(`[${requestId}] Unable to parse test webhook body`)
        }
      }
    }

    if (!eventData) {
      const channelToken = headersObject['x-goog-channel-token'] || null
      let tokenMetadata: any = null
      if (channelToken) {
        try {
          tokenMetadata = JSON.parse(channelToken)
        } catch (tokenError) {
          logger.warn(`[${requestId}] Failed to parse channel token metadata`)
        }
      }

      eventData = {
        resource: headersObject['x-goog-resource-uri'] || null,
        resourceState: headersObject['x-goog-resource-state'] || null,
        messageNumber: headersObject['x-goog-message-number'] || null,
        resourceId: headersObject['x-goog-resource-id'] || null,
        channelId: headersObject['x-goog-channel-id'] || null,
        channelToken,
        channelExpiration: headersObject['x-goog-channel-expiration'] || null,
        token: channelToken,
        metadata: tokenMetadata,
        headers: headersObject
      }
    }

    // Determine the source service
    const sourceService = determineGoogleService(eventData)

    // Log the parsed event
    await logWebhookEvent({
      provider: 'google-test',
      requestId,
      service: sourceService,
      eventType: eventData.type || 'unknown',
      eventData: eventData,
      metadata: { testSessionId: sessionId },
      timestamp: new Date().toISOString()
    })

    // Process the event ONLY for this test session
    // This will NOT trigger any production workflows
    const result = await processGoogleEventForTestSession({
      service: sourceService,
      eventData,
      requestId,
      testSessionId: sessionId,
      testSession
    })

    const processingTime = Date.now() - startTime

    // Log successful processing
    await logWebhookEvent({
      provider: 'google-test',
      requestId,
      service: sourceService,
      status: 'success',
      processingTime,
      result,
      metadata: { testSessionId: sessionId },
      timestamp: new Date().toISOString()
    })

    return jsonResponse({
      success: true,
      service: sourceService,
      requestId,
      processingTime,
      testSessionId: sessionId
    })

  } catch (error) {
    logger.error('Google test webhook error:', error)

    await logWebhookEvent({
      provider: 'google-test',
      requestId: crypto.randomUUID(),
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      metadata: { testSessionId: sessionId },
      timestamp: new Date().toISOString()
    })

    return errorResponse('Internal server error', 500)
  }
}

function determineGoogleService(eventData: any): string {
  // Gmail Pub/Sub messages have emailAddress and historyId
  if (eventData.emailAddress && eventData.historyId) {
    return 'gmail'
  }

  if (eventData.resource && eventData.resource.includes('drive')) {
    return 'drive'
  }
  if (eventData.resource && eventData.resource.includes('calendar')) {
    return 'calendar'
  }
  if (eventData.resource && eventData.resource.includes('docs')) {
    return 'docs'
  }
  if (eventData.resource && eventData.resource.includes('sheets')) {
    return 'sheets'
  }

  const eventType = eventData.type || ''
  if (eventType.includes('gmail') || eventType.includes('email')) return 'gmail'
  if (eventType.includes('drive')) return 'drive'
  if (eventType.includes('calendar')) return 'calendar'
  if (eventType.includes('docs')) return 'docs'
  if (eventType.includes('sheets')) return 'sheets'

  return 'unknown'
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params

  // Health check endpoint for test session
  const supabase = await createSupabaseServiceClient()
  const { data: testSession } = await supabase
    .from('workflow_test_sessions')
    .select('id, status, workflow_id, created_at, expires_at')
    .eq('id', sessionId)
    .single()

  return jsonResponse({
    status: testSession ? 'active' : 'not_found',
    provider: 'google-test',
    testSessionId: sessionId,
    session: testSession,
    timestamp: new Date().toISOString()
  })
}
