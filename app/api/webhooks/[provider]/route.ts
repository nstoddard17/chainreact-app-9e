import { NextRequest, NextResponse } from 'next/server'
import { verifyWebhookSignature } from '@/lib/webhooks/verification'
import { processWebhookEvent } from '@/lib/webhooks/processor'
import { handleDropboxWebhookEvent } from '@/lib/webhooks/dropboxTriggerHandler'
import { logWebhookEvent } from '@/lib/webhooks/event-logger'

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
      console.error(`[${requestId}] Invalid ${provider} webhook signature`)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Parse the request body
    const body = await request.text()
    let eventData: any

    try {
      eventData = JSON.parse(body)
    } catch (parseError) {
      console.error(`[${requestId}] Failed to parse ${provider} webhook body:`, parseError)
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    // Log the parsed event
    await logWebhookEvent({
      provider,
      requestId,
      eventType: eventData.type || eventData.event_type || 'unknown',
      eventData: eventData,
      timestamp: new Date().toISOString()
    })

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

      return NextResponse.json({
        success: true,
        provider,
        requestId,
        processingTime,
        workflowsTriggered: dropboxResults.length,
        results: dropboxResults
      })
    }

    // Process the event based on provider
    const result = await processWebhookEvent({
      provider,
      eventData,
      requestId
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

    return NextResponse.json({ 
      success: true, 
      provider,
      requestId,
      processingTime 
    })

  } catch (error) {
    console.error('Webhook error:', error)
    
    // Log error
    await logWebhookEvent({
      provider: 'unknown',
      requestId: crypto.randomUUID(),
      status: 'error',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    })

    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params
  
  // Handle webhook verification challenges
  const url = new URL(request.url)
  const challenge = url.searchParams.get('challenge')
  
  console.log(`[Webhook GET] Provider: ${provider}, Challenge: ${challenge}`)
  
  // Dropbox webhook verification
  if (provider === 'dropbox' && challenge) {
    console.log(`[Dropbox] Responding to challenge: ${challenge}`)
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
    console.log(`[Slack] Responding to challenge: ${challenge}`)
    return NextResponse.json({ challenge })
  }
  
  // Other webhook verification patterns can be added here
  
  // Default health check endpoint
  return NextResponse.json({ 
    status: 'healthy', 
    provider,
    timestamp: new Date().toISOString()
  })
} 
