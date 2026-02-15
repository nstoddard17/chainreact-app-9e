/**
 * Stripe Trigger Lifecycle
 *
 * Manages Stripe webhook endpoints
 * Implements proper lifecycle: create on activate, delete on deactivate/delete
 */

import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import {
  TriggerLifecycle,
  TriggerActivationContext,
  TriggerDeactivationContext,
  TriggerHealthStatus
} from '../types'

import { logger } from '@/lib/utils/logger'
import { getWebhookBaseUrl } from '@/lib/utils/getBaseUrl'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export class StripeTriggerLifecycle implements TriggerLifecycle {
  private getPlatformStripeClient(): Stripe {
    const platformSecretKey = process.env.STRIPE_CLIENT_SECRET

    if (!platformSecretKey) {
      throw new Error('Missing STRIPE_CLIENT_SECRET for Stripe Connect webhook management')
    }

    return new Stripe(platformSecretKey, {
      apiVersion: '2025-05-28.basil'
    })
  }

  /**
   * Activate Stripe trigger
   * Creates a webhook endpoint for specific events
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config } = context

    logger.debug(`Activating Stripe trigger for workflow ${workflowId}`, {
      triggerType,
      config
    })

    // Get integration ID from config (multi-account support)
    const integrationId = config?.stripe_account

    let integration: { id: string } | null = null

    if (integrationId) {
      // Look up by specific integration ID (multi-account support)
      const { data, error } = await getSupabase()
        .from('integrations')
        .select('id')
        .eq('id', integrationId)
        .eq('provider', 'stripe')
        .eq('user_id', userId)
        .eq('status', 'connected')
        .single()

      if (error || !data) {
        throw new Error('Selected Stripe account not found. Please reconnect the integration.')
      }
      integration = data
    } else {
      // Legacy fallback: look up by user_id (for existing workflows without stripe_account)
      const { data, error } = await getSupabase()
        .from('integrations')
        .select('id')
        .eq('user_id', userId)
        .eq('provider', 'stripe')
        .eq('status', 'connected')
        .limit(1)

      if (error || !data || data.length === 0) {
        throw new Error('No Stripe integration found for user. Please configure the trigger with a Stripe account.')
      }
      integration = data[0]
      logger.warn('[Stripe] Using legacy user_id lookup - workflow should be updated to use stripe_account field')
    }

    if (!integration) {
      throw new Error('Stripe integration not found')
    }

    // Stripe Connect webhooks must be created on the platform account.
    const stripe = this.getPlatformStripeClient()

    // Get webhook callback URL
    const webhookUrl = this.getWebhookUrl()

    // Get events to listen for based on trigger type
    const enabledEvents = this.getEventsForTrigger(triggerType)

    const fullWebhookUrl = `${webhookUrl}?workflowId=${workflowId}`
    logger.info('[Stripe] Creating Connect webhook endpoint', {
      webhookUrl: fullWebhookUrl,
      enabledEvents,
      connect: true,
      workflowId
    })

    // Create Connect webhook endpoint on the platform account
    // connect: true is required to receive events from connected accounts (users' Stripe accounts)
    const endpoint = await stripe.webhookEndpoints.create({
      url: fullWebhookUrl,
      connect: true,
      enabled_events: enabledEvents,
      description: `ChainReact workflow ${workflowId}`
    })

    // Store in trigger_resources table
    const { error: insertError } = await getSupabase().from('trigger_resources').insert({
      workflow_id: workflowId,
      user_id: userId,
      provider: 'stripe',
      provider_id: 'stripe',
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'webhook',
      resource_id: endpoint.id,
      external_id: endpoint.id,
      config: {
        ...config,
        integrationId: integration.id,
        webhookUrl: endpoint.url,
        webhookSecret: endpoint.secret,
        enabledEvents,
        connectWebhook: true
      },
      status: 'active'
    })

    if (insertError) {
      // FK violation (code 23503) can happen for unsaved workflows in test mode.
      if (insertError.code === '23503') {
        logger.warn(`Could not store trigger resource (workflow may be unsaved): ${insertError.message}`)
        logger.debug(`Stripe webhook endpoint created (without local record): ${endpoint.id}`)
        return
      }
      logger.error('Failed to store trigger resource:', insertError)
      throw new Error(`Failed to store trigger resource: ${insertError.message}`)
    }

    logger.debug(`Stripe webhook endpoint created: ${endpoint.id}`)
  }

  /**
   * Deactivate Stripe trigger
   * Deletes the webhook endpoint
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId } = context

    logger.debug(`Deactivating Stripe triggers for workflow ${workflowId}`)

    // Get all Stripe webhook endpoints for this workflow
    const { data: resources } = await getSupabase()
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'stripe')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      logger.debug(`No active Stripe webhooks for workflow ${workflowId}`)
      return
    }

    const stripe = this.getPlatformStripeClient()

    // Delete each webhook endpoint
    for (const resource of resources) {
      if (!resource.external_id) continue

      try {
        await stripe.webhookEndpoints.del(resource.external_id)

        await getSupabase()
          .from('trigger_resources')
          .delete()
          .eq('id', resource.id)

        logger.debug(`Deleted Stripe webhook endpoint: ${resource.external_id}`)
      } catch (error: any) {
        logger.error(`Failed to delete webhook ${resource.external_id}:`, error)

        if (error?.statusCode === 404) {
          await getSupabase()
            .from('trigger_resources')
            .delete()
            .eq('id', resource.id)
        } else {
          await getSupabase()
            .from('trigger_resources')
            .update({ status: 'error', updated_at: new Date().toISOString() })
            .eq('id', resource.id)
        }
      }
    }
  }

  /**
   * Delete Stripe trigger (same as deactivate)
   */
  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    return this.onDeactivate(context)
  }

  /**
   * Check health of Stripe webhook endpoints
   */
  async checkHealth(workflowId: string, _userId: string): Promise<TriggerHealthStatus> {
    const { data: resources } = await getSupabase()
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'stripe')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      return {
        healthy: false,
        details: 'No active webhook endpoints found',
        lastChecked: new Date().toISOString()
      }
    }

    // Ensure platform credentials exist for managing Connect webhooks.
    this.getPlatformStripeClient()

    // Stripe webhooks do not expire, so healthy if they exist
    return {
      healthy: true,
      details: `All Stripe webhooks healthy (${resources.length} active)`,
      lastChecked: new Date().toISOString()
    }
  }

  /**
   * Map trigger type to Stripe events
   */
  private getEventsForTrigger(triggerType: string): Stripe.WebhookEndpointCreateParams.EnabledEvent[] {
    const eventMap: Record<string, Stripe.WebhookEndpointCreateParams.EnabledEvent[]> = {
      // Payment triggers
      'stripe_trigger_new_payment': ['payment_intent.succeeded', 'charge.succeeded'],
      'stripe_trigger_payment_failed': ['payment_intent.payment_failed'],
      'stripe_trigger_charge_succeeded': ['charge.succeeded'],
      'stripe_trigger_charge_failed': ['charge.failed'],
      'stripe_trigger_refunded_charge': ['charge.refunded'],
      // Subscription triggers
      'stripe_trigger_subscription_created': ['customer.subscription.created'],
      'stripe_trigger_subscription_updated': ['customer.subscription.updated'],
      'stripe_trigger_subscription_deleted': ['customer.subscription.deleted'],
      // Invoice triggers
      'stripe_trigger_invoice_created': ['invoice.created'],
      'stripe_trigger_invoice_paid': ['invoice.paid'],
      'stripe_trigger_invoice_payment_failed': ['invoice.payment_failed'],
      // Customer triggers
      'stripe_trigger_customer_created': ['customer.created'],
      'stripe_trigger_customer_updated': ['customer.updated'],
      // Dispute triggers
      'stripe_trigger_new_dispute': ['charge.dispute.created'],
      // Checkout triggers
      'stripe_trigger_checkout_session_completed': ['checkout.session.completed']
    }

    const events = eventMap[triggerType]
    if (!events) {
      throw new Error(`Unknown Stripe trigger type: ${triggerType}`)
    }

    return events
  }

  /**
   * Get webhook callback URL
   * Uses getWebhookBaseUrl() which returns chainreact.app in production, ngrok in dev
   */
  private getWebhookUrl(): string {
    const baseUrl = getWebhookBaseUrl()
    return `${baseUrl}/api/webhooks/stripe-integration`
  }
}
