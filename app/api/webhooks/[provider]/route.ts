import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import crypto from 'crypto'
import { verifyWebhookSignature } from '@/lib/webhooks/verification'
import { processWebhookEvent } from '@/lib/webhooks/processor'
import { handleDropboxWebhookEvent } from '@/lib/webhooks/dropboxTriggerHandler'
import { logWebhookEvent } from '@/lib/webhooks/event-logger'
import { normalizeWebhookEvent } from '@/lib/webhooks/normalizer'

import { logger } from '@/lib/utils/logger'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const { provider } = await params
    const startTime = Date.now()
    const requestId = crypto.randomUUID()
    
    // Log incoming webhook
    await logWebhookEvent({
      provider,
      requestId,
      method: 'POST',
      headers: Object.fromEntries(request.headers.entries()),
      timestamp: new Date().toISOString()
    })

    // Verify webhook signature based on provider
    const requestForVerification = request.clone()
    const isValid = await verifyWebhookSignature(requestForVerification, provider)
    if (!isValid) {
      logger.error(`[${requestId}] Invalid ${provider} webhook signature`)
      return errorResponse('Unauthorized' , 401)
    }

    // Parse the request body
    const body = await request.text()
    let eventData: any

    try {
      eventData = JSON.parse(body)
    } catch (parseError) {
      logger.error(`[${requestId}] Failed to parse ${provider} webhook body:`, parseError)
      return errorResponse('Invalid payload' , 400)
    }

    // Log the parsed event
    await logWebhookEvent({
      provider,
      requestId,
      eventType: eventData.type || eventData.event_type || 'unknown',
      eventData: eventData,
      timestamp: new Date().toISOString()
    })

    if (provider === 'slack' && eventData?.type === 'url_verification' && eventData?.challenge) {
      logger.info(`[${requestId}] Responding to Slack URL verification challenge`);
      return jsonResponse({ challenge: eventData.challenge })
    }

    // Process Dropbox directly through trigger handler
    if (provider === 'dropbox') {
      const dropboxResults = await handleDropboxWebhookEvent(
        eventData,
        Object.fromEntries(request.headers.entries()),
        requestId
      )

      const processingTime = Date.now() - startTime

      await logWebhookEvent({
        provider,
        requestId,
        status: 'success',
        processingTime,
        result: {
          workflowsTriggered: dropboxResults.length,
          results: dropboxResults
        },
        timestamp: new Date().toISOString()
      })

      return jsonResponse({
        success: true,
        provider,
        requestId,
        processingTime,
        workflowsTriggered: dropboxResults.length,
        results: dropboxResults
      })
    }

    // Process the event based on provider
    const { eventType, normalizedData, eventId, ignore } = normalizeWebhookEvent(provider, eventData, requestId)

    // INFO-level logging to trace webhook processing
    if (provider === 'slack') {
      logger.info(`[${requestId}] 🔵 SLACK WEBHOOK: eventType=${eventType}, channel=${normalizedData?.message?.channel}, channelType=${normalizedData?.message?.channelType}, team=${normalizedData?.message?.team}`)
    }

    if (ignore) {
      logger.info(`[${requestId}] Ignoring ${provider} event based on normalization rules`, {
        provider,
        eventType,
        eventId
      })
      return jsonResponse({ success: true, ignored: true })
    }

    logger.info(`[${requestId}] Normalized ${provider} webhook event`, {
      eventType,
      eventId,
      summary: normalizedData && typeof normalizedData === 'object' ? {
        channel: normalizedData.message?.channel,
        user: normalizedData.message?.user,
        subtype: normalizedData.message?.raw?.subtype
      } : undefined
    })

    const result = await processWebhookEvent({
      id: eventId || requestId,
      provider,
      eventType,
      eventData: normalizedData,
      requestId,
      timestamp: new Date()
    })

    const processingTime = Date.now() - startTime
    
    // Log successful processing
    await logWebhookEvent({
      provider,
      requestId,
      status: 'success',
      processingTime,
      result,
      timestamp: new Date().toISOString()
    })

    return jsonResponse({ 
      success: true, 
      provider,
      requestId,
      processingTime 
    })

  } catch (error) {
    logger.error('Webhook error:', error)
    
    // Log error
    await logWebhookEvent({
      provider: 'unknown',
      requestId: crypto.randomUUID(),
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    })

    return errorResponse('Internal server error' , 500)
  }
}



export async function HEAD(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params
  logger.info(`[Webhook HEAD] Provider: ${provider}`)
  return new Response(null, {
    status: 200,
    headers: {
      'X-Webhook-Provider': provider,
      'X-Webhook-Status': 'ready'
    }
  })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params
  
  // Handle webhook verification challenges
  const url = new URL(request.url)
  const challenge = url.searchParams.get('challenge')
  
  logger.info(`[Webhook GET] Provider: ${provider}, Challenge: ${challenge}`)
  
  // Dropbox webhook verification
  if (provider === 'dropbox' && challenge) {
    logger.info(`[Dropbox] Responding to challenge: ${challenge}`)
    // Return ONLY the challenge string as plain text, nothing else
    return new Response(challenge, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'X-Content-Type-Options': 'nosniff'
      }
    })
  }
  
  // Slack webhook verification
  if (provider === 'slack' && challenge) {
    logger.info(`[Slack] Responding to challenge: ${challenge}`)
    return jsonResponse({ challenge })
  }

  // Trello webhook verification - echo the challenge string
  if (provider === 'trello' && challenge) {
    logger.info(`[Trello] Responding to challenge: ${challenge}`)
    return new Response(challenge, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'X-Webhook-Provider': 'trello'
      }
    })
  }

  if (provider === 'trello') {
    // Trello expects a 200 even without challenge to keep webhook alive
    return new Response('OK', {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'X-Webhook-Provider': 'trello'
      }
    })
  }
  
  // Other webhook verification patterns can be added here
  
  // Default health check endpoint
  return jsonResponse({
    status: 'healthy', 
    provider,
    timestamp: new Date().toISOString()
  })
} 


// normalizeWebhookEvent is now in @/lib/webhooks/normalizer.ts
