import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
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

    if (provider === 'slack' && eventData?.type === 'url_verification' && eventData?.challenge) {
      console.log(`[${requestId}] Responding to Slack URL verification challenge`);
      return NextResponse.json({ challenge: eventData.challenge })
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
    const { eventType, normalizedData, eventId, ignore } = normalizeWebhookEvent(provider, eventData, requestId)

    if (ignore) {
      console.log(`[${requestId}] Ignoring ${provider} event based on normalization rules`, {
        provider,
        eventType,
        eventId
      })
      return NextResponse.json({ success: true, ignored: true })
    }

    console.log(`[${requestId}] Normalized ${provider} webhook event`, {
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


function normalizeWebhookEvent(provider: string, rawEvent: any, requestId: string) {
  switch (provider) {
    case 'slack': {
      const envelope = rawEvent || {}
      const slackEvent = envelope.event || rawEvent || {}
      const subtype = slackEvent.subtype

      if (subtype === 'message_deleted') {
        return {
          eventType: 'slack_trigger_message_deleted',
          normalizedData: slackEvent,
          eventId: slackEvent.deleted_ts || slackEvent.event_ts || envelope.event_id,
          ignore: true
        }
      }

      let eventType = 'slack_trigger_new_message'
      const channel = slackEvent.channel || slackEvent.channel_id
      const channelType = slackEvent.channel_type
      const isPublicChannel = channelType === 'channel' || (typeof channel === 'string' && channel.startsWith('C'))

      if (slackEvent.type === 'message' && isPublicChannel) {
        eventType = 'slack_trigger_message_channels'
      }

      const normalizedData = {
        message: {
          id: slackEvent.client_msg_id || slackEvent.ts || envelope.event_id || requestId,
          text: slackEvent.text || '',
          user: slackEvent.user || slackEvent.user_id,
          channel,
          channelType,
          team: slackEvent.team || envelope.team_id || slackEvent.team_id,
          timestamp: slackEvent.ts || envelope.event_ts,
          threadTs: slackEvent.thread_ts,
          raw: slackEvent
        }
      }

      return {
        eventType,
        normalizedData,
        eventId: normalizedData.message.id
      }
    }

    default:
      return {
        eventType: `${provider}_trigger_event`,
        normalizedData: rawEvent,
        eventId: (rawEvent && (rawEvent.id || rawEvent.event_id)) || requestId
      }
  }
}
