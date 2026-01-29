/**
 * Stripe Trigger Lifecycle
 *
 * Manages Stripe webhook endpoints
 * Implements proper lifecycle: create on activate, delete on deactivate/delete
 */

import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import { safeDecrypt } from '@/lib/security/encryption'
import {
  TriggerLifecycle,
  TriggerActivationContext,
  TriggerDeactivationContext,
  TriggerHealthStatus
} from '../types'

import { logger } from '@/lib/utils/logger'

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export class StripeTriggerLifecycle implements TriggerLifecycle {

  /**
   * Activate Stripe trigger
   * Creates a webhook endpoint for specific events
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config } = context

    logger.debug(`🔔 Activating Stripe trigger for workflow ${workflowId}`, {
      triggerType,
      config
    })

    // Get integration ID from config (multi-account support)
    const integrationId = config?.stripe_account

    let integration: { id: string; access_token: string } | null = null

    if (integrationId) {
      // Look up by specific integration ID (multi-account support)
      const { data, error } = await getSupabase()
        .from('integrations')
        .select('id, access_token')
        .eq('id', integrationId)
        .eq('provider', 'stripe')
        .single()

      if (error || !data) {
        throw new Error('Selected Stripe account not found. Please reconnect the integration.')
      }
      integration = data
    } else {
      // Legacy fallback: look up by user_id (for existing workflows without stripe_account)
      const { data, error } = await getSupabase()
        .from('integrations')
        .select('id, access_token')
        .eq('user_id', userId)
        .eq('provider', 'stripe')
        .eq('status', 'connected')
        .limit(1)

      if (error || !data || data.length === 0) {
        throw new Error('No Stripe integration found for user. Please configure the trigger with a Stripe account.')
      }
      integration = data[0]
      logger.warn(`⚠️ [Stripe] Using legacy user_id lookup - workflow should be updated to use stripe_account field`)
    }

    if (!integration) {
      throw new Error('Stripe integration not found')
    }

    // Decrypt access token
    const accessToken = typeof integration.access_token === 'string'
      ? safeDecrypt(integration.access_token)
      : null

    if (!accessToken) {
      throw new Error('Failed to decrypt Stripe access token')
    }

    // Initialize Stripe client
    const stripe = new Stripe(accessToken, {
      apiVersion: '2024-11-20.acacia'
    })

    // Get webhook callback URL
    const webhookUrl = this.getWebhookUrl()

    // Get events to listen for based on trigger type
    const enabledEvents = this.getEventsForTrigger(triggerType)

    logger.debug(`📤 Creating Stripe webhook endpoint`, {
      webhookUrl,
      enabledEvents
    })

    // Create webhook endpoint
    const endpoint = await stripe.webhookEndpoints.create({
      url: `${webhookUrl}?workflowId=${workflowId}`,
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
        integrationId: integration.id, // Store integration ID for deactivation
        webhookUrl: endpoint.url,
        webhookSecret: endpoint.secret,
        enabledEvents
      },
      status: 'active'
    })

    if (insertError) {
      // Check if this is a FK constraint violation (code 23503) - happens for unsaved workflows in test mode
      // The webhook endpoint was already created successfully with Stripe, so we can continue
      if (insertError.code === '23503') {
        logger.warn(`⚠️ Could not store trigger resource (workflow may be unsaved): ${insertError.message}`)
        logger.debug(`✅ Stripe webhook endpoint created (without local record): ${endpoint.id}`)
        return
      }
      logger.error(`❌ Failed to store trigger resource:`, insertError)
      throw new Error(`Failed to store trigger resource: ${insertError.message}`)
    }

    logger.debug(`✅ Stripe webhook endpoint created: ${endpoint.id}`)
  }

  /**
   * Deactivate Stripe trigger
   * Deletes the webhook endpoint
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId, userId } = context

    logger.debug(`🛑 Deactivating Stripe triggers for workflow ${workflowId}`)

    // Get all Stripe webhook endpoints for this workflow
    const { data: resources } = await getSupabase()
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'stripe')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      logger.debug(`ℹ️ No active Stripe webhooks for workflow ${workflowId}`)
      return
    }

    // Get integration ID from first resource's config (stored during activation)
    const storedIntegrationId = resources[0]?.config?.integrationId

    let integration: { access_token: string } | null = null

    if (storedIntegrationId) {
      // Look up by stored integration ID
      const { data } = await getSupabase()
        .from('integrations')
        .select('access_token')
        .eq('id', storedIntegrationId)
        .eq('provider', 'stripe')
        .single()
      integration = data
    } else {
      // Legacy fallback: look up by user_id
      const { data } = await getSupabase()
        .from('integrations')
        .select('access_token')
        .eq('user_id', userId)
        .eq('provider', 'stripe')
        .eq('status', 'connected')
        .limit(1)
      integration = data?.[0] || null
    }

    if (!integration) {
      logger.warn(`⚠️ Stripe integration not found, marking webhooks as deleted`)
      await getSupabase()
        .from('trigger_resources')
        .delete()
        .eq('workflow_id', workflowId)
        .eq('provider_id', 'stripe')
      return
    }

    // Decrypt access token
    const accessToken = typeof integration.access_token === 'string'
      ? safeDecrypt(integration.access_token)
      : null

    if (!accessToken) {
      logger.warn(`⚠️ Failed to decrypt Stripe access token, marking webhooks as deleted`)
      await getSupabase()
        .from('trigger_resources')
        .delete()
        .eq('workflow_id', workflowId)
        .eq('provider_id', 'stripe')
      return
    }

    // Initialize Stripe client
    const stripe = new Stripe(accessToken, {
      apiVersion: '2024-11-20.acacia'
    })

    // Delete each webhook endpoint
    for (const resource of resources) {
      if (!resource.external_id) continue

      try {
        await stripe.webhookEndpoints.del(resource.external_id)

        // Mark as deleted in trigger_resources
        await getSupabase()
          .from('trigger_resources')
          .delete()
          .eq('id', resource.id)

        logger.debug(`✅ Deleted Stripe webhook endpoint: ${resource.external_id}`)
      } catch (error: any) {
        logger.error(`❌ Failed to delete webhook ${resource.external_id}:`, error)
        // If webhook doesn't exist (404), still mark as deleted
        if (error.statusCode === 404) {
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
  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
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

    // Get integration ID from first resource's config (stored during activation)
    const storedIntegrationId = resources[0]?.config?.integrationId

    let integration: { access_token: string } | null = null

    if (storedIntegrationId) {
      // Look up by stored integration ID
      const { data } = await getSupabase()
        .from('integrations')
        .select('access_token')
        .eq('id', storedIntegrationId)
        .eq('provider', 'stripe')
        .single()
      integration = data
    } else {
      // Legacy fallback: look up by user_id
      const { data } = await getSupabase()
        .from('integrations')
        .select('access_token')
        .eq('user_id', userId)
        .eq('provider', 'stripe')
        .eq('status', 'connected')
        .limit(1)
      integration = data?.[0] || null
    }

    if (!integration) {
      return {
        healthy: false,
        details: 'Stripe integration disconnected',
        lastChecked: new Date().toISOString()
      }
    }

    // Stripe webhooks don't expire, so healthy if they exist
    return {
      healthy: true,
      details: `All Stripe webhooks healthy (${resources.length} active)`,
      lastChecked: new Date().toISOString()
    }
  }

  /**
   * Map trigger type to Stripe events
   */
  private getEventsForTrigger(triggerType: string): string[] {
    const eventMap: Record<string, string[]> = {
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
   */
  private getWebhookUrl(): string {
    const baseUrl = process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL ||
                    process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL ||
                    process.env.PUBLIC_WEBHOOK_BASE_URL

    if (!baseUrl) {
      throw new Error('Webhook base URL not configured')
    }

    return `${baseUrl.replace(/\/$/, '')}/api/webhooks/stripe`
  }
}
