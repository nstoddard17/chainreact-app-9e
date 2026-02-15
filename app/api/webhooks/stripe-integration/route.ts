import { NextRequest } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine'

import { logger } from '@/lib/utils/logger'

// This webhook handles Stripe integration triggers for workflows
// It processes events from connected Stripe accounts (Connect webhooks).

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const getStripeClient = (): Stripe => {
  const platformSecret = process.env.STRIPE_CLIENT_SECRET

  if (!platformSecret) {
    throw new Error('Missing STRIPE_CLIENT_SECRET environment variable')
  }

  return new Stripe(platformSecret, {
    apiVersion: '2025-05-28.basil'
  })
}

const getEventsForTrigger = (triggerType: string): string[] => {
  const eventMap: Record<string, string[]> = {
    stripe_trigger_new_payment: ['payment_intent.succeeded', 'charge.succeeded'],
    stripe_trigger_payment_failed: ['payment_intent.payment_failed'],
    stripe_trigger_charge_succeeded: ['charge.succeeded'],
    stripe_trigger_charge_failed: ['charge.failed'],
    stripe_trigger_refunded_charge: ['charge.refunded'],
    stripe_trigger_subscription_created: ['customer.subscription.created'],
    stripe_trigger_subscription_updated: ['customer.subscription.updated'],
    stripe_trigger_subscription_deleted: ['customer.subscription.deleted'],
    stripe_trigger_invoice_created: ['invoice.created'],
    stripe_trigger_invoice_paid: ['invoice.paid'],
    stripe_trigger_invoice_payment_failed: ['invoice.payment_failed'],
    stripe_trigger_customer_created: ['customer.created'],
    stripe_trigger_customer_updated: ['customer.updated'],
    stripe_trigger_new_dispute: ['charge.dispute.created'],
    stripe_trigger_checkout_session_completed: ['checkout.session.completed']
  }

  return eventMap[triggerType] || []
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase()

  try {
    logger.info('[Stripe Integration Webhook] Incoming request', {
      url: request.nextUrl.pathname + request.nextUrl.search,
      fullUrl: request.url,
      hasSignature: !!request.headers.get('stripe-signature'),
      method: request.method,
      contentLength: request.headers.get('content-length') || 'unknown',
    })

    // Read body and signature early (before DB queries) so fallback mode can use them
    const body = await request.text()
    const signature = request.headers.get('stripe-signature')

    if (!signature) {
      logger.error('[Stripe Integration Webhook] Missing Stripe signature')
      return errorResponse('Missing Stripe signature', 400)
    }

    // workflowId is optional — when missing, we resolve it via signature matching
    const workflowIdParam = request.nextUrl.searchParams.get('workflowId')

    // Query trigger resources, optionally filtered by workflowId
    let resourceQuery = supabase
      .from('trigger_resources')
      .select('id, workflow_id, trigger_type, config, status, external_id')
      .eq('provider_id', 'stripe')
      .eq('status', 'active')

    if (workflowIdParam) {
      resourceQuery = resourceQuery.eq('workflow_id', workflowIdParam)
    }

    const { data: resources, error: resourcesError } = await resourceQuery

    if (resourcesError) {
      logger.error('[Stripe Integration Webhook] Failed to load trigger resources:', resourcesError)
      return errorResponse('Failed to resolve webhook configuration', 500)
    }

    if (!resources || resources.length === 0) {
      logger.warn('[Stripe Integration Webhook] No active Stripe trigger resources found', {
        workflowIdParam: workflowIdParam || 'none',
        mode: workflowIdParam ? 'targeted' : 'fallback'
      })
      return jsonResponse({ received: true, skipped: true, reason: 'no_active_resources' })
    }

    logger.info('[Stripe Integration Webhook] Loaded trigger resources', {
      workflowIdParam: workflowIdParam || 'none',
      resourceCount: resources.length,
      triggerTypes: resources.map((r: any) => r.trigger_type),
      resourcesWithSecrets: resources.filter((r: any) => r?.config?.webhookSecret).length,
      resourceEndpointIds: resources.map((r: any) => r.external_id || 'none'),
    })

    const stripe = getStripeClient()

    let event: Stripe.Event | null = null
    let matchedSecret: string | null = null
    let matchedResource: any = null

    for (const resource of resources) {
      const candidateSecret = resource?.config?.webhookSecret
      if (!candidateSecret || typeof candidateSecret !== 'string') {
        continue
      }

      try {
        event = stripe.webhooks.constructEvent(body, signature, candidateSecret)
        matchedSecret = candidateSecret
        matchedResource = resource
        break
      } catch (verifyError: any) {
        logger.warn('[Stripe Integration Webhook] Secret did not match for resource', {
          resourceId: resource.id,
          workflowId: resource.workflow_id,
          triggerType: resource.trigger_type,
          externalEndpointId: resource?.external_id || 'unknown',
          storedSecretPrefix: candidateSecret ? candidateSecret.substring(0, 8) + '...' : 'empty',
          errorMessage: verifyError?.message || 'Unknown verification error',
          errorType: verifyError?.type || verifyError?.code || 'unknown',
        })
      }
    }

    if (!event || !matchedSecret || !matchedResource) {
      logger.error('[Stripe Integration Webhook] Signature verification failed for all stored endpoint secrets', {
        workflowIdParam: workflowIdParam || 'none',
        mode: workflowIdParam ? 'targeted' : 'fallback',
        resourceCount: resources.length,
        resourcesWithSecrets: resources.filter((r: any) => r?.config?.webhookSecret).length,
        triggerTypes: resources.map((r: any) => r.trigger_type),
        resourceDetails: resources.map((r: any) => ({
          id: r.id,
          externalEndpointId: r.external_id || 'none',
          storedSecretPrefix: r?.config?.webhookSecret
            ? r.config.webhookSecret.substring(0, 8) + '...' : 'missing',
        })),
        signaturePrefix: signature ? signature.substring(0, 30) + '...' : 'missing',
        bodyLength: body.length,
        requestUrl: request.url,
      })
      return errorResponse('Invalid Stripe signature', 400)
    }

    // Resolve effective workflowId — from query param or matched resource
    const workflowId = workflowIdParam || matchedResource.workflow_id

    if (!workflowId) {
      logger.error('[Stripe Integration Webhook] Could not resolve workflowId', {
        matchedResourceId: matchedResource.id
      })
      return errorResponse('Could not determine workflow', 500)
    }

    if (!workflowIdParam) {
      logger.warn('[Stripe Integration Webhook] Resolved workflowId via secret-matching fallback', {
        workflowId,
        matchedResourceId: matchedResource.id,
        note: 'Webhook arrived without workflowId query parameter'
      })
    }

    logger.info('[Stripe Integration Webhook] Processing event', {
      workflowId,
      eventType: event.type,
      eventId: event.id,
      connectedAccount: event.account || null
    })

    // In fallback mode, narrow resources to the resolved workflow
    const workflowResources = workflowIdParam
      ? resources
      : resources.filter((r: any) => r.workflow_id === workflowId)

    logger.debug('[Stripe Integration Webhook] Resolved workflow resources', {
      workflowId,
      workflowResourcesCount: workflowResources.length,
      workflowTriggerTypes: workflowResources.map((r: any) => r.trigger_type),
      matchedResourceId: matchedResource.id
    })

    const matchingResources = workflowResources.filter((resource: any) => {
      const allowedEvents = getEventsForTrigger(resource.trigger_type)
      if (!allowedEvents.includes(event!.type)) {
        return false
      }

      // For Connect webhooks, match by connected account ID
      const selectedIntegrationId = resource?.config?.stripe_account
      if (!selectedIntegrationId) {
        return true
      }

      const eventAccountId = typeof event?.account === 'string' ? event.account : null
      const connectedAccountId = resource?.config?.account_id

      if (connectedAccountId && eventAccountId) {
        return connectedAccountId === eventAccountId
      }

      return true
    })

    if (matchingResources.length === 0) {
      logger.info('[Stripe Integration Webhook] Event does not match active Stripe trigger types for this workflow', {
        workflowId,
        eventType: event.type,
        configuredTriggers: workflowResources.map((r: any) => r.trigger_type)
      })
      return jsonResponse({ received: true, skipped: true, reason: 'event_not_configured' })
    }

    logger.debug('[Stripe Integration Webhook] Matching trigger resources', {
      workflowId,
      eventType: event.type,
      matchingResourceIds: matchingResources.map((r: any) => r.id),
      matchingTriggerTypes: matchingResources.map((r: any) => r.trigger_type),
      connectedAccount: event.account || null
    })

    const { error: eventLogError } = await supabase
      .from('webhook_events')
      .insert({
        provider: 'stripe',
        event_type: event.type,
        event_id: event.id,
        payload: event,
        received_at: new Date().toISOString()
      })

    if (eventLogError) {
      logger.warn('[Stripe Integration Webhook] Failed to store webhook event log', { error: eventLogError.message })
    }

    const { data: workflow, error: workflowError } = await supabase
      .from('workflows')
      .select('id, user_id, status')
      .eq('id', workflowId)
      .single()

    if (workflowError || !workflow) {
      logger.error('[Stripe Integration Webhook] Workflow not found for webhook execution', { workflowId, workflowError })
      return errorResponse('Workflow not found', 404)
    }

    if (workflow.status !== 'active') {
      logger.warn('[Stripe Integration Webhook] Workflow not active; skipping execution', { workflowId, status: workflow.status })
      return jsonResponse({ received: true, skipped: true, reason: 'workflow_not_active' })
    }

    const executionEngine = new AdvancedExecutionEngine()
    const executionSession = await executionEngine.createExecutionSession(
      workflowId,
      workflow.user_id,
      'webhook',
      {
        inputData: {
          stripeEvent: event,
          triggerResourceIds: matchingResources.map((resource: any) => resource.id)
        }
      }
    )

    logger.info('[Stripe Integration Webhook] Execution started', {
      workflowId,
      executionSessionId: executionSession.id,
      eventType: event.type,
      eventId: event.id,
    })

    executionEngine.executeWorkflowAdvanced(executionSession.id, {
      stripeEvent: event,
      triggerResourceIds: matchingResources.map((resource: any) => resource.id)
    })

    return jsonResponse({
      received: true,
      workflowId,
      eventId: event.id,
      eventType: event.type,
      executionSessionId: executionSession.id
    })
  } catch (error: any) {
    logger.error('[Stripe Integration Webhook] Handler error:', error)
    return errorResponse('Internal server error', 500, {
      details: error?.message || 'Unknown error'
    })
  }
}
