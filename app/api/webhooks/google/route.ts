import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { verifyGoogleWebhook } from '@/lib/webhooks/google-verification'
import { processGoogleEvent } from '@/lib/webhooks/google-processor'
import { logWebhookEvent } from '@/lib/webhooks/event-logger'

export async function POST(request: NextRequest) {
  try {
    const startTime = Date.now()
    const requestId = crypto.randomUUID()
    
    const headersObject = Object.fromEntries(request.headers.entries())

    // Log incoming webhook
    await logWebhookEvent({
      provider: 'google',
      requestId,
      method: 'POST',
      headers: headersObject,
      timestamp: new Date().toISOString()
    })

    // Verify Google webhook signature
    const isValid = await verifyGoogleWebhook(request)
    if (!isValid) {
      console.error(`[${requestId}] Invalid Google webhook signature`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse the request body (may be empty for some Google services)
    const rawBody = await request.text()
    let eventData: any = null
    let pubsubMessage: any = null

    if (rawBody && rawBody.trim().length > 0) {
      try {
        // First try to parse as JSON (Pub/Sub format)
        const bodyJson = JSON.parse(rawBody)

        // Gmail Pub/Sub format: { message: { data: base64, attributes: {} } }
        if (bodyJson.message && bodyJson.message.data) {
          pubsubMessage = bodyJson
          const decodedData = Buffer.from(bodyJson.message.data, 'base64').toString('utf-8')
          eventData = JSON.parse(decodedData)
          eventData._isPubSub = true
        } else {
          eventData = bodyJson
        }
      } catch (jsonError) {
        // If not JSON, try base64 decode
        try {
          const decodedBody = Buffer.from(rawBody, 'base64').toString('utf-8')
          eventData = JSON.parse(decodedBody)
        } catch (base64Error) {
          console.warn(`[${requestId}] Unable to parse Google webhook body; falling back to header metadata`, {
            base64Error: (base64Error as Error).message,
            jsonError: (jsonError as Error).message
          })
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
          console.warn(`[${requestId}] Failed to parse channel token metadata:`, tokenError)
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

    // Determine the source service from the event data
    const sourceService = determineGoogleService(eventData)
    
    // Log the parsed event
    await logWebhookEvent({
      provider: 'google',
      requestId,
      service: sourceService,
      eventType: eventData.type || 'unknown',
      eventData: eventData,
      timestamp: new Date().toISOString()
    })

    // Process the event based on the service
    const result = await processGoogleEvent({
      service: sourceService,
      eventData,
      requestId
    })

    const processingTime = Date.now() - startTime
    
    // Log successful processing
    await logWebhookEvent({
      provider: 'google',
      requestId,
      service: sourceService,
      status: 'success',
      processingTime,
      result,
      timestamp: new Date().toISOString()
    })

    return NextResponse.json({ 
      success: true, 
      service: sourceService,
      requestId,
      processingTime 
    })

  } catch (error) {
    console.error('Google webhook error:', error)
    
    // Log error
    await logWebhookEvent({
      provider: 'google',
      requestId: crypto.randomUUID(),
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

function determineGoogleService(eventData: any): string {
  // Gmail Pub/Sub messages have emailAddress and historyId
  if (eventData.emailAddress && eventData.historyId) {
    return 'gmail'
  }

  // Determine the service based on event data structure
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

  // Fallback based on event type
  const eventType = eventData.type || ''
  if (eventType.includes('gmail') || eventType.includes('email')) return 'gmail'
  if (eventType.includes('drive')) return 'drive'
  if (eventType.includes('calendar')) return 'calendar'
  if (eventType.includes('docs')) return 'docs'
  if (eventType.includes('sheets')) return 'sheets'

  return 'unknown'
}

export async function GET(request: NextRequest) {
  // Health check endpoint
  return NextResponse.json({
    status: 'healthy',
    provider: 'google',
    services: ['gmail', 'drive', 'calendar', 'docs', 'sheets'],
    timestamp: new Date().toISOString()
  })
} 
