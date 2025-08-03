import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { verifyGmailWebhook } from '@/lib/webhooks/gmail-verification'
import { processGmailEvent } from '@/lib/webhooks/gmail-processor'
import { logWebhookEvent } from '@/lib/webhooks/event-logger'

export async function POST(request: NextRequest) {
  try {
    const startTime = Date.now()
    const requestId = crypto.randomUUID()
    
    // Log incoming webhook
    await logWebhookEvent({
      provider: 'gmail',
      requestId,
      method: 'POST',
      headers: Object.fromEntries(request.headers.entries()),
      timestamp: new Date().toISOString()
    })

    // Verify Gmail webhook signature
    const isValid = await verifyGmailWebhook(request)
    if (!isValid) {
      console.error(`[${requestId}] Invalid Gmail webhook signature`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse the request body
    const body = await request.text()
    let eventData: any

    try {
      // Gmail sends JSON data directly
      eventData = JSON.parse(body)
    } catch (parseError) {
      console.error(`[${requestId}] Failed to parse Gmail webhook body:`, parseError)
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
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

    return NextResponse.json({ 
      success: true, 
      service: 'gmail',
      requestId,
      processingTime 
    })

  } catch (error) {
    console.error('Gmail webhook error:', error)
    
    // Log error
    await logWebhookEvent({
      provider: 'gmail',
      requestId: crypto.randomUUID(),
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  // Health check endpoint
  return NextResponse.json({ 
    status: 'healthy', 
    provider: 'gmail',
    services: ['gmail'],
    timestamp: new Date().toISOString()
  })
} 