import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphAuth } from '@/lib/microsoft-graph/auth'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'
import { logger } from '@/lib/utils/logger'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const subscriptionManager = new MicrosoftGraphSubscriptionManager()
const graphAuth = new MicrosoftGraphAuth()

/**
 * Microsoft Graph Lifecycle Notification Endpoint
 *
 * Handles subscription lifecycle events:
 * - subscriptionRemoved: Subscription was deleted or expired
 * - reauthorizationRequired: User needs to re-consent to permissions
 * - missed: Some notifications were missed (requires reauthorization)
 *
 * Required for subscriptions with expiration > 1 hour
 *
 * @see https://docs.microsoft.com/en-us/graph/webhooks-lifecycle
 */

interface LifecycleNotification {
  subscriptionId: string
  subscriptionExpirationDateTime?: string
  lifecycleEvent: 'subscriptionRemoved' | 'reauthorizationRequired' | 'missed'
  clientState?: string
  tenantId?: string
}

export async function POST(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const validationToken = url.searchParams.get('validationToken') || url.searchParams.get('validationtoken')
    const body = await request.text()
    const headers = Object.fromEntries(request.headers.entries())

    logger.debug('📥 Microsoft Graph lifecycle webhook received:', {
      headers: Object.keys(headers),
      bodyLength: body.length,
      hasValidationToken: !!validationToken,
      timestamp: new Date().toISOString()
    })

    // Handle validation request from Microsoft
    if (validationToken || headers['content-type']?.includes('text/plain')) {
      const token = validationToken || body
      logger.debug('🔍 Lifecycle validation request received')
      return new NextResponse(token, { status: 200, headers: { 'Content-Type': 'text/plain' } })
    }

    // Handle empty body
    if (!body || body.length === 0) {
      logger.debug('⚠️ Empty lifecycle webhook payload received, skipping')
      return jsonResponse({ success: true, empty: true })
    }

    // Parse payload
    let payload: any
    try {
      payload = JSON.parse(body)
    } catch (error) {
      logger.error('❌ Failed to parse lifecycle webhook payload:', error)
      return errorResponse('Invalid JSON payload' , 400)
    }

    // Lifecycle notifications arrive as an array in payload.value
    const notifications: LifecycleNotification[] = Array.isArray(payload?.value) ? payload.value : []

    logger.debug('📋 Lifecycle webhook payload analysis:', {
      hasValue: !!payload?.value,
      valueIsArray: Array.isArray(payload?.value),
      notificationCount: notifications.length,
      payloadKeys: Object.keys(payload || {})
    })

    if (notifications.length === 0) {
      logger.warn('⚠️ Lifecycle webhook payload has no notifications')
      return jsonResponse({ success: true, empty: true })
    }

    // Process each lifecycle notification
    for (const notification of notifications) {
      try {
        const { subscriptionId, lifecycleEvent, subscriptionExpirationDateTime, clientState } = notification

        logger.debug('🔄 Processing lifecycle notification:', {
          subscriptionId,
          lifecycleEvent,
          expiresAt: subscriptionExpirationDateTime,
          hasClientState: !!clientState
        })

        // Look up subscription in trigger_resources
        const { data: triggerResource, error: lookupError } = await getSupabase()
          .from('trigger_resources')
          .select('*')
          .eq('external_id', subscriptionId)
          .eq('resource_type', 'subscription')
          .like('provider_id', 'microsoft%')
          .maybeSingle()

        if (!triggerResource) {
          logger.warn('⚠️ Subscription not found in trigger_resources:', {
            subscriptionId,
            lifecycleEvent
          })
          continue
        }

        // Verify clientState if present
        if (clientState && triggerResource.config?.clientState) {
          if (clientState !== triggerResource.config.clientState) {
            logger.warn('⚠️ Invalid clientState for lifecycle notification:', {
              subscriptionId,
              lifecycleEvent
            })
            continue
          }
        }

        const { user_id: userId, workflow_id: workflowId } = triggerResource

        // Handle different lifecycle events
        switch (lifecycleEvent) {
          case 'subscriptionRemoved':
            // Subscription was deleted or expired
            logger.debug('🗑️ Subscription removed:', subscriptionId)

            // Mark as expired in trigger_resources
            await getSupabase()
              .from('trigger_resources')
              .update({
                status: 'expired',
                updated_at: new Date().toISOString()
              })
              .eq('id', triggerResource.id)

            // TODO: Optionally notify user or attempt to recreate subscription
            break

          case 'reauthorizationRequired':
            // User needs to re-consent to permissions
            logger.warn('⚠️ Reauthorization required for subscription:', subscriptionId)

            // Mark as requiring reauth
            await getSupabase()
              .from('trigger_resources')
              .update({
                status: 'reauth_required',
                updated_at: new Date().toISOString()
              })
              .eq('id', triggerResource.id)

            // TODO: Notify user to reconnect their Microsoft account
            break

          case 'missed':
            // Some notifications were missed - requires reauthorization
            logger.warn('⚠️ Missed notifications for subscription:', subscriptionId)

            // Mark as requiring reauth
            await getSupabase()
              .from('trigger_resources')
              .update({
                status: 'reauth_required',
                updated_at: new Date().toISOString()
              })
              .eq('id', triggerResource.id)

            // TODO: Notify user to reconnect their Microsoft account
            break

          default:
            logger.warn('⚠️ Unknown lifecycle event:', {
              subscriptionId,
              lifecycleEvent
            })
        }

      } catch (error) {
        logger.error('❌ Error processing lifecycle notification:', error)
        // Continue processing other notifications
      }
    }

    // Return 202 Accepted
    return new NextResponse(null, { status: 202 })

  } catch (error: any) {
    logger.error('❌ Lifecycle webhook error:', error)
    return errorResponse('Internal server error' , 500)
  }
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const validationToken = url.searchParams.get('validationToken') || url.searchParams.get('validationtoken')

  if (validationToken) {
    logger.debug('🔍 Lifecycle validation request (GET) received')
    return new NextResponse(validationToken, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  return jsonResponse({
    message: "Microsoft Graph lifecycle webhook endpoint active",
    provider: "microsoft-graph",
    type: "lifecycle",
    methods: ["POST"],
    timestamp: new Date().toISOString(),
    description: "Lifecycle webhook endpoint for Microsoft Graph subscriptions. Handles expiration and reauthorization events."
  })
}
