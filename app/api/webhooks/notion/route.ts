import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import crypto from 'crypto'
import { processNotionEvent } from '@/lib/webhooks/processor'
import { logWebhookEvent } from '@/lib/webhooks/event-logger'
import { getWebhookUrl } from '@/lib/webhooks/utils'
import { createClient } from '@supabase/supabase-js'

import { logger } from '@/lib/utils/logger'

// Comprehensive logging colors for terminal
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
}

function logSection(title: string, data: any, color: string = colors.cyan) {
  logger.debug(`\n${color}${colors.bright}${'='.repeat(60)}${colors.reset}`)
  logger.debug(`${color}${colors.bright}📌 ${title}${colors.reset}`)
  logger.debug(`${color}${'='.repeat(60)}${colors.reset}`)

  if (typeof data === 'object' && data !== null) {
    logger.debug(JSON.stringify(data, null, 2))
  } else {
    logger.debug(data)
  }
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomBytes(16).toString('hex')
  const timestamp = new Date().toISOString()

  try {
    // Log incoming request details
    logSection('NOTION WEBHOOK RECEIVED', {
      timestamp,
      requestId,
      url: req.url,
      method: req.method,
    }, colors.magenta)

    // Log all headers
    const headers: Record<string, string> = {}
    req.headers.forEach((value, key) => {
      headers[key] = value
    })
    logSection('REQUEST HEADERS', headers, colors.blue)

    // Get and log the raw body
    const rawBody = await req.text()
    logSection('RAW BODY (as string)', rawBody, colors.yellow)

    // Parse the body
    let body: any = {}
    try {
      body = JSON.parse(rawBody)
      logSection('PARSED BODY', body, colors.green)
    } catch (parseError) {
      logger.error(`${colors.red}❌ Failed to parse body as JSON${colors.reset}`)
      logger.error(parseError)
      body = { raw: rawBody }
    }

    // Check for verification token (Notion sends this in the initial verification)
    if (body.type === 'url_verification') {
      // CRITICAL: Store verification token in database so user can retrieve it
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )

      // Store token in webhook_events table with a special marker
      await supabase.from('webhook_events').insert({
        provider: 'notion',
        event_type: 'VERIFICATION_TOKEN',
        request_id: requestId,
        status: 'success',
        event_data: {
          token: body.token,
          challenge: body.challenge,
          timestamp: timestamp
        },
        created_at: new Date().toISOString()
      })

      logSection('URL VERIFICATION REQUEST DETECTED', {
        challenge: body.challenge,
        token: body.token,
        note: 'Token stored in database - query webhook_events table for event_type=VERIFICATION_TOKEN'
      }, colors.magenta)

      // Respond with the challenge for verification
      const response = jsonResponse({ challenge: body.challenge })

      logSection('VERIFICATION RESPONSE', {
        status: 200,
        body: {
          challenge: body.challenge,
          note: 'Token stored in database'
        }
      }, colors.green)

      return response
    }

    // Log webhook signature if present
    const notionSignature = headers['x-notion-signature'] || headers['notion-signature']
    if (notionSignature) {
      logSection('NOTION SIGNATURE', {
        signature: notionSignature,
        note: 'This should be validated with your webhook secret'
      }, colors.cyan)
    }

    // Log webhook type and event details
    const eventType = body.type || body.event_type || 'unknown'
    const eventData = body.data || body.payload || body

    logSection('EVENT DETAILS', {
      type: eventType,
      hasData: !!body.data,
      hasPayload: !!body.payload,
      dataKeys: body.data ? Object.keys(body.data) : [],
      payloadKeys: body.payload ? Object.keys(body.payload) : [],
      topLevelKeys: Object.keys(body),
    }, colors.magenta)

    // Process the webhook event
    const webhookEvent = {
      id: body.id || requestId,
      provider: 'notion',
      eventType,
      eventData,
      requestId,
      timestamp: new Date(),
    }

    logSection('PROCESSING WEBHOOK EVENT', webhookEvent, colors.cyan)

    // Process the event (this will trigger workflows)
    const result = await processNotionEvent(webhookEvent)

    logSection('PROCESSING RESULT', result, colors.green)

    // Log the event for audit
    await logWebhookEvent({
      provider: 'notion',
      requestId,
      eventType,
      status: 'success',
      processingTime: Date.now() - new Date(timestamp).getTime(),
      timestamp,
      result,
    })

    // Return success response
    const response = jsonResponse({
      success: true,
      requestId,
      processed: true,
      result,
    })

    logSection('FINAL RESPONSE', {
      status: 200,
      body: {
        success: true,
        requestId,
        processed: true,
        result,
      }
    }, colors.green)

    logger.debug(`\n${colors.green}${colors.bright}✅ Notion webhook processed successfully!${colors.reset}\n`)

    return response

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    logSection('ERROR PROCESSING WEBHOOK', {
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      requestId,
    }, colors.red)

    // Log error event
    await logWebhookEvent({
      provider: 'notion',
      requestId,
      eventType: 'error',
      status: 'error',
      processingTime: Date.now() - new Date(timestamp).getTime(),
      timestamp,
      error: errorMessage,
    })

    return errorResponse('Internal server error', 500, {
        requestId
      })
  }
}

// Handle GET requests for testing
export async function GET(req: NextRequest) {
  const webhookUrl = getWebhookUrl('/api/webhooks/notion', req)

  logSection('NOTION WEBHOOK ENDPOINT INFO', {
    status: 'ready',
    endpoint: webhookUrl,
    method: 'POST',
    actualUrl: webhookUrl,
    instructions: [
      '1. Use this URL in your Notion integration settings',
      '2. Notion will send a verification request first',
      '3. This endpoint will respond with the challenge',
      '4. After verification, Notion will send actual webhook events',
      '5. All data will be logged in your terminal'
    ],
    supportedEvents: [
      'page.created',
      'page.updated',
      'page.deleted',
      'database.created',
      'database.updated',
      'block.created',
      'block.updated',
      'block.deleted',
    ],
  }, colors.cyan)

  return jsonResponse({
    status: 'ready',
    endpoint: webhookUrl,
    environment: process.env.NODE_ENV,
    instructions: 'Use POST method to send webhook events',
  })
}