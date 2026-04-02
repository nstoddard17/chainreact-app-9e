import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { verifyGmailWebhook } from '@/lib/webhooks/gmail-verification'
import { processGmailEvent } from '@/lib/webhooks/gmail-processor'
import { logWebhookEvent } from '@/lib/webhooks/event-logger'

import { logger } from '@/lib/utils/logger'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export async function POST(request: NextRequest) {
  logger.info('🔔🔔🔔 GMAIL WEBHOOK ENDPOINT HIT! 🔔🔔🔔')

  // Log headers to debug
  const headers = Object.fromEntries(request.headers.entries())
  logger.info('📋 Request headers:', headers)

  // Define requestId before try block so it's accessible in catch
  const testRunId = process.env.WEBHOOK_TEST_MODE === 'true'
    ? request.headers.get('x-test-run-id')
    : null
  const requestId = testRunId || crypto.randomUUID()
  const startTime = Date.now()

  try {

    logger.info(`📨 [${requestId}] Gmail webhook request received at ${new Date().toISOString()}`)

    // Log incoming webhook
    await logWebhookEvent({
      provider: 'gmail',
      requestId,
      method: 'POST',
      headers: Object.fromEntries(request.headers.entries()),
      timestamp: new Date().toISOString()
    })

    // Parse the request body
    const body = await request.text()
    logger.debug(`[${requestId}] Webhook body received, length: ${body.length}`)

    // Check if body is empty or invalid
    if (!body || body.trim() === '') {
      logger.warn(`⚠️ [${requestId}] Empty request body received, possibly aborted connection`)
      return new Response('OK', { status: 200 }) // Return OK to acknowledge receipt
    }

    let eventData: any

    try {
      const parsedBody = JSON.parse(body)
      logger.info(`📦 [${requestId}] Parsed body structure:`, {
        hasMessage: !!parsedBody.message,
        hasMessageData: !!parsedBody.message?.data,
        messageKeys: parsedBody.message ? Object.keys(parsedBody.message) : [],
        subscription: parsedBody.subscription
      })

      // Check if this is a Pub/Sub message
      if (parsedBody.message && parsedBody.message.data) {
        logger.info(`[${requestId}] Received Pub/Sub message from Gmail`)

        // Decode the Pub/Sub message data (base64 encoded)
        const decodedData = Buffer.from(parsedBody.message.data, 'base64').toString()
        logger.info(`🔓 [${requestId}] Decoded Pub/Sub data:`, decodedData)

        const gmailNotification = JSON.parse(decodedData)

        // Gmail Pub/Sub notifications contain emailAddress and historyId
        eventData = {
          type: 'gmail_new_email',
          emailAddress: gmailNotification.emailAddress,
          historyId: gmailNotification.historyId,
          messageId: parsedBody.message.messageId,
          publishTime: parsedBody.message.publishTime,
          // Pass through test trigger data when in test mode (ignored in production by processor)
          ...(process.env.WEBHOOK_TEST_MODE === 'true' && gmailNotification._testTriggerData
            ? { _testTriggerData: gmailNotification._testTriggerData }
            : {}),
        }

        logger.info(`[${requestId}] 📧 Gmail notification received:`, {
          emailAddress: eventData.emailAddress,
          historyId: eventData.historyId,
          messageId: parsedBody.message.messageId,
          publishTime: parsedBody.message.publishTime
        })

        // SECURITY: Don't log email addresses (PII)
        logger.info(`[${requestId}] 🔍 Processing Gmail webhook, historyId: ${eventData.historyId}`)
      } else {
        // Direct webhook call (for testing or fallback)
        eventData = parsedBody
      }
    } catch (parseError: any) {
      // Handle specific JSON parsing errors
      if (parseError instanceof SyntaxError) {
        logger.error(`[${requestId}] JSON parsing error:`, parseError.message)
        logger.error(`[${requestId}] Body that failed to parse:`, body.substring(0, 100))

        // Check if this might be a connection reset issue
        if (body.length === 0) {
          logger.warn(`[${requestId}] Received empty body, likely due to connection reset`)
          return new Response('OK', { status: 200 })
        }

        return errorResponse('Invalid JSON payload' , 400)
      }

      logger.error(`[${requestId}] Unexpected error parsing Gmail webhook:`, parseError)
      return errorResponse('Invalid payload' , 400)
    }

    // Log the parsed event
    await logWebhookEvent({
      provider: 'gmail',
      requestId,
      service: 'gmail',
      eventType: eventData.type || 'unknown',
      eventData: eventData,
      timestamp: new Date().toISOString()
    })

    // Store webhook event for audit trail (canonical receipt contract)
    try {
      const supabase = getSupabase()
      await supabase.from('webhook_events').insert({
        provider: 'gmail',
        request_id: requestId,
        event_data: { ...eventData, _meta: { originalRequestId: requestId } },
        status: 'received',
        timestamp: new Date().toISOString(),
      })
    } catch (e) {
      logger.warn(`[${requestId}] Failed to store canonical webhook event:`, e)
    }

    // Process the Gmail event
    const result = await processGmailEvent({
      eventData,
      requestId
    })

    const processingTime = Date.now() - startTime
    
    // Log successful processing
    await logWebhookEvent({
      provider: 'gmail',
      requestId,
      service: 'gmail',
      status: 'success',
      processingTime,
      result,
      timestamp: new Date().toISOString()
    })

    // Return 200 OK to acknowledge the Pub/Sub message
    // Google Pub/Sub expects a 2xx status code to consider the message delivered
    return jsonResponse({
      success: true,
      service: 'gmail',
      requestId,
      processingTime
    }, { status: 200 })

  } catch (error: any) {
    // Handle connection reset errors gracefully
    if (error.code === 'ECONNRESET' || error.message?.includes('aborted')) {
      logger.warn(`⚠️ [${requestId}] Connection reset/aborted during webhook processing`)
      // Return OK to prevent retries for connection issues
      return new Response('OK', { status: 200 })
    }

    logger.error(`❌ [${requestId}] Gmail webhook error:`, error)

    // Log error
    await logWebhookEvent({
      provider: 'gmail',
      requestId: requestId,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: error.code,
      timestamp: new Date().toISOString()
    })

    return errorResponse('Internal server error' , 500)
  }
}

export async function GET(request: NextRequest) {
  // Google Pub/Sub webhook verification
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  logger.info('Gmail webhook GET request received')

  // If this is a verification request from Google, echo back the challenge token
  if (token) {
    logger.debug('Responding to Google Pub/Sub verification')
    return new Response(token, { status: 200 })
  }

  // Health check endpoint
  return jsonResponse({ 
    status: 'healthy', 
    provider: 'gmail',
    services: ['gmail'],
    timestamp: new Date().toISOString()
  })
} 