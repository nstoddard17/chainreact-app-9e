import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import crypto from 'crypto'
import { processNotionEvent } from '@/lib/webhooks/processor'
import { logWebhookEvent } from '@/lib/webhooks/event-logger'
import { getWebhookUrl } from '@/lib/webhooks/utils'
import { createClient } from '@supabase/supabase-js'

import { logger } from '@/lib/utils/logger'

// Initialize Supabase client for webhook operations
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

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

/**
 * Validate Notion webhook signature using HMAC-SHA256
 * Notion sends signature in x-notion-signature header
 * See: https://developers.notion.com/reference/webhooks#signature-verification
 */
async function validateNotionSignature(
  signature: string | null,
  body: string,
  workflowId: string,
  nodeId: string
): Promise<boolean> {
  if (!signature) {
    logger.warn('[Notion Webhook] No signature provided - skipping validation')
    return true // Allow without signature for now (optional validation)
  }

  try {
    // Get the verification token from trigger_resources
    const supabase = getSupabase()
    const { data: resource } = await supabase
      .from('trigger_resources')
      .select('metadata')
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId)
      .eq('provider_id', 'notion')
      .single()

    const verificationToken = resource?.metadata?.verificationToken

    if (!verificationToken) {
      logger.warn('[Notion Webhook] No verification token found - cannot validate signature')
      return true // Allow without token
    }

    // Compute HMAC-SHA256 hash
    const hmac = crypto.createHmac('sha256', verificationToken)
    hmac.update(body)
    const expectedSignature = hmac.digest('hex')

    // Timing-safe comparison
    const isValid = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )

    if (!isValid) {
      logger.error('[Notion Webhook] Signature validation failed')
    }

    return isValid
  } catch (error) {
    logger.error('[Notion Webhook] Error validating signature:', error)
    return true // Allow on error to avoid blocking webhooks
  }
}

/**
 * Update trigger resource status when webhook is verified
 */
async function markWebhookAsVerified(workflowId: string, nodeId: string): Promise<void> {
  try {
    const supabase = getSupabase()

    // First get the existing resource to preserve metadata
    const { data: resource } = await supabase
      .from('trigger_resources')
      .select('metadata, status')
      .eq('workflow_id', workflowId)
      .eq('node_id', nodeId)
      .eq('provider_id', 'notion')
      .single()

    // Only update if not already verified
    if (resource && !resource.metadata?.webhookVerified) {
      const { error } = await supabase
        .from('trigger_resources')
        .update({
          status: 'active',
          metadata: {
            ...resource.metadata,
            webhookVerified: true,
            verifiedAt: new Date().toISOString(),
            lastWebhookReceived: new Date().toISOString()
          }
        })
        .eq('workflow_id', workflowId)
        .eq('node_id', nodeId)
        .eq('provider_id', 'notion')

      if (error) {
        logger.error('[Notion Webhook] Failed to update trigger resource status:', error)
      } else {
        logger.info(`[Notion Webhook] Marked webhook as verified for workflow ${workflowId}`)
      }
    } else if (resource) {
      // Just update last received timestamp
      await supabase
        .from('trigger_resources')
        .update({
          metadata: {
            ...resource.metadata,
            lastWebhookReceived: new Date().toISOString()
          }
        })
        .eq('workflow_id', workflowId)
        .eq('node_id', nodeId)
        .eq('provider_id', 'notion')
    }
  } catch (error) {
    logger.error('[Notion Webhook] Error marking webhook as verified:', error)
  }
}

export async function POST(req: NextRequest) {
  const requestId = crypto.randomBytes(16).toString('hex')
  const timestamp = new Date().toISOString()

  try {
    // Extract workflow and node IDs from query parameters
    const url = new URL(req.url)
    const workflowId = url.searchParams.get('workflowId')
    const nodeId = url.searchParams.get('nodeId')

    // Log incoming request details
    logSection('NOTION WEBHOOK RECEIVED', {
      timestamp,
      requestId,
      url: req.url,
      workflowId,
      nodeId,
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
      const supabase = getSupabase()

      // Store verification token in trigger_resources for signature validation
      if (workflowId && nodeId) {
        // Get existing metadata to preserve it
        const { data: resource } = await supabase
          .from('trigger_resources')
          .select('metadata')
          .eq('workflow_id', workflowId)
          .eq('node_id', nodeId)
          .eq('provider_id', 'notion')
          .single()

        await supabase
          .from('trigger_resources')
          .update({
            metadata: {
              ...resource?.metadata,
              verificationToken: body.token,
              verificationReceivedAt: new Date().toISOString()
            }
          })
          .eq('workflow_id', workflowId)
          .eq('node_id', nodeId)
          .eq('provider_id', 'notion')
      }

      // Also store in webhook_events for audit trail
      await supabase.from('webhook_events').insert({
        provider: 'notion',
        event_type: 'VERIFICATION_TOKEN',
        request_id: requestId,
        status: 'success',
        event_data: {
          token: body.token,
          challenge: body.challenge,
          workflowId,
          nodeId,
          timestamp: timestamp
        },
        created_at: new Date().toISOString()
      })

      logSection('URL VERIFICATION REQUEST DETECTED', {
        challenge: body.challenge,
        token: body.token,
        workflowId,
        nodeId,
        note: 'Token stored in trigger_resources and webhook_events'
      }, colors.magenta)

      // Respond with the challenge for verification
      const response = jsonResponse({ challenge: body.challenge })

      logSection('VERIFICATION RESPONSE', {
        status: 200,
        body: {
          challenge: body.challenge,
          note: 'Webhook verified successfully'
        }
      }, colors.green)

      return response
    }

    // Validate webhook signature (optional but recommended)
    const notionSignature = headers['x-notion-signature'] || headers['notion-signature']
    if (notionSignature && workflowId && nodeId) {
      const isValid = await validateNotionSignature(notionSignature, rawBody, workflowId, nodeId)
      if (!isValid) {
        logger.error('[Notion Webhook] Signature validation failed - rejecting webhook')
        return errorResponse('Invalid signature', 401)
      }
      logSection('SIGNATURE VALIDATED', {
        signature: notionSignature,
        valid: true
      }, colors.green)
    } else if (notionSignature) {
      logSection('NOTION SIGNATURE', {
        signature: notionSignature,
        note: 'Signature present but cannot validate without workflowId/nodeId'
      }, colors.yellow)
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

    // Mark webhook as verified on first successful event
    if (workflowId && nodeId) {
      await markWebhookAsVerified(workflowId, nodeId)
    }

    // Process the webhook event
    const webhookEvent = {
      id: body.id || requestId,
      provider: 'notion',
      eventType,
      eventData,
      requestId,
      timestamp: new Date(),
      workflowId,
      nodeId
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