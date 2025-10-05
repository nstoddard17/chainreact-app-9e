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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export class StripeTriggerLifecycle implements TriggerLifecycle {

  /**
   * Activate Stripe trigger
   * Creates a webhook endpoint for specific events
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config } = context

    console.log(`🔔 Activating Stripe trigger for workflow ${workflowId}`, {
      triggerType,
      config
    })

    // Get user's Stripe integration
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'stripe')
      .single()

    if (!integration) {
      throw new Error('Stripe integration not found for user')
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

    console.log(`📤 Creating Stripe webhook endpoint`, {
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
    await supabase.from('trigger_resources').insert({
      workflow_id: workflowId,
      user_id: userId,
      provider_id: 'stripe',
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'webhook',
      external_id: endpoint.id,
      config: {
        ...config,
        webhookUrl: endpoint.url,
        webhookSecret: endpoint.secret,
        enabledEvents
      },
      status: 'active'
    })

    console.log(`✅ Stripe webhook endpoint created: ${endpoint.id}`)
  }

  /**
   * Deactivate Stripe trigger
   * Deletes the webhook endpoint
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId, userId } = context

    console.log(`🛑 Deactivating Stripe triggers for workflow ${workflowId}`)

    // Get all Stripe webhook endpoints for this workflow
    const { data: resources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'stripe')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      console.log(`ℹ️ No active Stripe webhooks for workflow ${workflowId}`)
      return
    }

    // Get user's access token
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'stripe')
      .single()

    if (!integration) {
      console.warn(`⚠️ Stripe integration not found, marking webhooks as deleted`)
      await supabase
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
      console.warn(`⚠️ Failed to decrypt Stripe access token, marking webhooks as deleted`)
      await supabase
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
        await supabase
          .from('trigger_resources')
          .delete()
          .eq('id', resource.id)

        console.log(`✅ Deleted Stripe webhook endpoint: ${resource.external_id}`)
      } catch (error: any) {
        console.error(`❌ Failed to delete webhook ${resource.external_id}:`, error)
        // If webhook doesn't exist (404), still mark as deleted
        if (error.statusCode === 404) {
          await supabase
            .from('trigger_resources')
            .delete()
            .eq('id', resource.id)
        } else {
          await supabase
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
    const { data: resources } = await supabase
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

    // Get user's Stripe integration
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'stripe')
      .single()

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
      'stripe_trigger_payment_succeeded': ['payment_intent.succeeded'],
      'stripe_trigger_payment_failed': ['payment_intent.payment_failed'],
      'stripe_trigger_charge_succeeded': ['charge.succeeded'],
      'stripe_trigger_charge_failed': ['charge.failed'],
      'stripe_trigger_subscription_created': ['customer.subscription.created'],
      'stripe_trigger_subscription_updated': ['customer.subscription.updated'],
      'stripe_trigger_subscription_deleted': ['customer.subscription.deleted'],
      'stripe_trigger_invoice_created': ['invoice.created'],
      'stripe_trigger_invoice_paid': ['invoice.paid'],
      'stripe_trigger_invoice_payment_failed': ['invoice.payment_failed'],
      'stripe_trigger_customer_created': ['customer.created'],
      'stripe_trigger_customer_updated': ['customer.updated']
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
