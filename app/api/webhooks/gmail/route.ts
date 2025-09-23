import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { verifyGmailWebhook } from '@/lib/webhooks/gmail-verification'
import { processGmailEvent } from '@/lib/webhooks/gmail-processor'
import { logWebhookEvent } from '@/lib/webhooks/event-logger'

export async function POST(request: NextRequest) {
  console.log('🔔🔔🔔 GMAIL WEBHOOK ENDPOINT HIT! 🔔🔔🔔')

  try {
    const startTime = Date.now()
    const requestId = crypto.randomUUID()

    console.log(`📨 [${requestId}] Gmail webhook request received at ${new Date().toISOString()}`)

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
    let eventData: any

    try {
      const parsedBody = JSON.parse(body)

      // Check if this is a Pub/Sub message
      if (parsedBody.message && parsedBody.message.data) {
        console.log(`[${requestId}] Received Pub/Sub message from Gmail`)

        // Decode the Pub/Sub message data (base64 encoded)
        const decodedData = Buffer.from(parsedBody.message.data, 'base64').toString()
        const gmailNotification = JSON.parse(decodedData)

        // Gmail Pub/Sub notifications contain emailAddress and historyId
        eventData = {
          type: 'gmail_new_email',
          emailAddress: gmailNotification.emailAddress,
          historyId: gmailNotification.historyId,
          messageId: parsedBody.message.messageId,
          publishTime: parsedBody.message.publishTime
        }

        console.log(`[${requestId}] 📧 Gmail notification received:`, {
          emailAddress: eventData.emailAddress,
          historyId: eventData.historyId,
          messageId: parsedBody.message.messageId,
          publishTime: parsedBody.message.publishTime
        })

        console.log(`[${requestId}] 🔍 Processing Gmail webhook for email from:`, eventData.emailAddress)
      } else {
        // Direct webhook call (for testing or fallback)
        eventData = parsedBody
      }
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