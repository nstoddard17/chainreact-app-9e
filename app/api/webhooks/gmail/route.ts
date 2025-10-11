import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { verifyGmailWebhook } from '@/lib/webhooks/gmail-verification'
import { processGmailEvent } from '@/lib/webhooks/gmail-processor'
import { logWebhookEvent } from '@/lib/webhooks/event-logger'

export async function POST(request: NextRequest) {
  console.log('🔔🔔🔔 GMAIL WEBHOOK ENDPOINT HIT! 🔔🔔🔔')

  // Log headers to debug
  const headers = Object.fromEntries(request.headers.entries())
  console.log('📋 Request headers:', headers)

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
    console.log(`📝 [${requestId}] Raw body received:`, body.substring(0, 500)) // Log first 500 chars

    // Check if body is empty or invalid
    if (!body || body.trim() === '') {
      console.warn(`⚠️ [${requestId}] Empty request body received, possibly aborted connection`)
      return new Response('OK', { status: 200 }) // Return OK to acknowledge receipt
    }

    let eventData: any

    try {
      const parsedBody = JSON.parse(body)
      console.log(`📦 [${requestId}] Parsed body structure:`, {
        hasMessage: !!parsedBody.message,
        hasMessageData: !!parsedBody.message?.data,
        messageKeys: parsedBody.message ? Object.keys(parsedBody.message) : [],
        subscription: parsedBody.subscription
      })

      // Check if this is a Pub/Sub message
      if (parsedBody.message && parsedBody.message.data) {
        console.log(`[${requestId}] Received Pub/Sub message from Gmail`)

        // Decode the Pub/Sub message data (base64 encoded)
        const decodedData = Buffer.from(parsedBody.message.data, 'base64').toString()
        console.log(`🔓 [${requestId}] Decoded Pub/Sub data:`, decodedData)

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

        // SECURITY: Don't log email addresses (PII)
        console.log(`[${requestId}] 🔍 Processing Gmail webhook, historyId: ${eventData.historyId}`)
      } else {
        // Direct webhook call (for testing or fallback)
        eventData = parsedBody
      }
    } catch (parseError: any) {
      // Handle specific JSON parsing errors
      if (parseError instanceof SyntaxError) {
        console.error(`[${requestId}] JSON parsing error:`, parseError.message)
        console.error(`[${requestId}] Body that failed to parse:`, body.substring(0, 100))

        // Check if this might be a connection reset issue
        if (body.length === 0) {
          console.warn(`[${requestId}] Received empty body, likely due to connection reset`)
          return new Response('OK', { status: 200 })
        }

        return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
      }

      console.error(`[${requestId}] Unexpected error parsing Gmail webhook:`, parseError)
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

    // Return 200 OK to acknowledge the Pub/Sub message
    // Google Pub/Sub expects a 2xx status code to consider the message delivered
    return NextResponse.json({
      success: true,
      service: 'gmail',
      requestId,
      processingTime
    }, { status: 200 })

  } catch (error: any) {
    // Handle connection reset errors gracefully
    if (error.code === 'ECONNRESET' || error.message?.includes('aborted')) {
      console.warn(`⚠️ [${requestId}] Connection reset/aborted during webhook processing`)
      // Return OK to prevent retries for connection issues
      return new Response('OK', { status: 200 })
    }

    console.error(`❌ [${requestId}] Gmail webhook error:`, error)

    // Log error
    await logWebhookEvent({
      provider: 'gmail',
      requestId: requestId,
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: error.code,
      timestamp: new Date().toISOString()
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  // Google Pub/Sub webhook verification
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  console.log('🔍 Gmail webhook GET request received, token:', token)

  // If this is a verification request from Google, echo back the challenge token
  if (token) {
    console.log('✅ Responding to Google Pub/Sub verification with token:', token)
    return new Response(token, { status: 200 })
  }

  // Health check endpoint
  return NextResponse.json({ 
    status: 'healthy', 
    provider: 'gmail',
    services: ['gmail'],
    timestamp: new Date().toISOString()
  })
} 