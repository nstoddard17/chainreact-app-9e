import { type NextRequest, NextResponse } from 'next/server'
import { createHmac } from 'crypto'
import { logger } from '@/lib/utils/logger'
import { handleCorsPreFlight, addCorsHeaders } from '@/lib/utils/cors'

/**
 * Monday.com Webhook Handler
 * Receives real-time notifications from Monday.com for workflow triggers
 *
 * Webhook events:
 * - create_item (New Item Created trigger)
 * - change_column_value (Column Value Changed trigger)
 * - create_board (New Board trigger)
 * - move_item_to_group (Item Moved to Group trigger)
 * - create_subitem (New Subitem Created trigger)
 * - create_update (New Update Posted trigger)
 *
 * Security: Validates requests using HMAC signature
 * Docs: https://developer.monday.com/apps/docs/webhooks
 */

// Handle preflight CORS requests
export async function OPTIONS(request: NextRequest) {
  return handleCorsPreFlight(request, {
    allowCredentials: true,
    allowedMethods: ['POST', 'OPTIONS'],
  })
}

/**
 * Verify Monday.com webhook signature
 * Uses HMAC SHA256 to validate request authenticity
 */
function verifySignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) {
    logger.warn('[Monday Webhook] No signature provided')
    return false
  }

  try {
    const hmac = createHmac('sha256', secret)
    hmac.update(payload)
    const expectedSignature = hmac.digest('hex')

    // Constant-time comparison to prevent timing attacks
    const bufferA = Buffer.from(signature)
    const bufferB = Buffer.from(expectedSignature)

    if (bufferA.length !== bufferB.length) {
      return false
    }

    return bufferA.equals(bufferB)
  } catch (error) {
    logger.error('[Monday Webhook] Signature verification error', { error })
    return false
  }
}

export async function POST(request: NextRequest) {
  try {
    // Get raw body for signature verification
    const rawBody = await request.text()

    // Get signature from headers
    const signature = request.headers.get('x-monday-signature')

    // Verify signature if signing secret is configured
    const signingSecret = process.env.MONDAY_SIGNING_SECRET
    if (signingSecret) {
      const isValid = verifySignature(rawBody, signature, signingSecret)
      if (!isValid) {
        logger.warn('[Monday Webhook] Invalid signature')
        const response = NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        )
        return addCorsHeaders(response, request, { allowCredentials: true })
      }
    } else {
      logger.warn('[Monday Webhook] No signing secret configured - signature verification skipped')
    }

    // Parse webhook payload
    const payload = JSON.parse(rawBody)
    const { event, challenge } = payload

    // Handle Monday.com challenge verification
    // When you first configure a webhook, Monday.com sends a challenge
    if (challenge) {
      logger.info('[Monday Webhook] Challenge received', { challenge })
      const response = NextResponse.json({ challenge })
      return addCorsHeaders(response, request, { allowCredentials: true })
    }

    // Log the webhook event
    logger.info('[Monday Webhook] Event received', {
      event: event?.type,
      boardId: event?.boardId,
      itemId: event?.itemId,
      userId: event?.userId,
    })

    // TODO: Process webhook events and trigger workflows
    // This will be implemented when adding trigger lifecycle handlers
    // For now, just acknowledge receipt

    /**
     * Event processing will look like:
     *
     * 1. Identify the event type (event.type)
     * 2. Find all active workflows with matching trigger
     * 3. Verify the workflow's integration is still connected
     * 4. Extract relevant data from the event payload
     * 5. Queue workflow execution with the event data
     *
     * Example:
     * if (event.type === 'create_item') {
     *   await triggerWorkflows('monday_trigger_new_item', {
     *     itemId: event.itemId,
     *     boardId: event.boardId,
     *     itemName: event.itemName,
     *     // ... other fields
     *   })
     * }
     */

    const response = NextResponse.json({
      received: true,
      eventType: event?.type,
    })

    return addCorsHeaders(response, request, { allowCredentials: true })
  } catch (error: any) {
    logger.error('[Monday Webhook] Error processing webhook', {
      error: error.message,
      stack: error.stack,
    })

    const response = NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )

    return addCorsHeaders(response, request, { allowCredentials: true })
  }
}
