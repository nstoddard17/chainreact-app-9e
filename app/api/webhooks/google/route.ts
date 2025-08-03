import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { verifyGoogleWebhook } from '@/lib/webhooks/google-verification'
import { processGoogleEvent } from '@/lib/webhooks/google-processor'
import { logWebhookEvent } from '@/lib/webhooks/event-logger'

export async function POST(request: NextRequest) {
  try {
    const startTime = Date.now()
    const requestId = crypto.randomUUID()
    
    // Log incoming webhook
    await logWebhookEvent({
      provider: 'google',
      requestId,
      method: 'POST',
      headers: Object.fromEntries(request.headers.entries()),
      timestamp: new Date().toISOString()
    })

    // Verify Google webhook signature
    const isValid = await verifyGoogleWebhook(request)
    if (!isValid) {
      console.error(`[${requestId}] Invalid Google webhook signature`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse the request body
    const body = await request.text()
    let eventData: any

    try {
      // Google Pub/Sub sends base64-encoded data
      const decodedData = Buffer.from(body, 'base64').toString('utf-8')
      eventData = JSON.parse(decodedData)
    } catch (parseError) {
      console.error(`[${requestId}] Failed to parse webhook body:`, parseError)
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
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
    services: ['drive', 'calendar', 'docs', 'sheets'],
    timestamp: new Date().toISOString()
  })
} 