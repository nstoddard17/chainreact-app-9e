/**
 * Shopify Trigger Lifecycle
 *
 * Manages Shopify webhooks
 * Implements proper lifecycle: create on activate, delete on deactivate/delete
 */

import { createClient } from '@supabase/supabase-js'
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

export class ShopifyTriggerLifecycle implements TriggerLifecycle {

  /**
   * Activate Shopify trigger
   * Creates a webhook subscription
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config } = context

    console.log(`🔔 Activating Shopify trigger for workflow ${workflowId}`, {
      triggerType,
      config
    })

    // Get user's Shopify integration
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token, metadata')
      .eq('user_id', userId)
      .eq('provider', 'shopify')
      .single()

    if (!integration) {
      throw new Error('Shopify integration not found for user')
    }

    // Decrypt access token
    const accessToken = typeof integration.access_token === 'string'
      ? safeDecrypt(integration.access_token)
      : null

    if (!accessToken) {
      throw new Error('Failed to decrypt Shopify access token')
    }

    const shopDomain = integration.metadata?.shop_domain
    if (!shopDomain) {
      throw new Error('Shopify shop domain not found in integration metadata')
    }

    // Get webhook callback URL
    const webhookUrl = this.getWebhookUrl()

    // Get topic for this trigger type
    const topic = this.getTopicForTrigger(triggerType)

    console.log(`📤 Creating Shopify webhook`, {
      shopDomain,
      topic,
      webhookUrl
    })

    // Create webhook via Shopify Admin API
    const response = await fetch(`https://${shopDomain}/admin/api/2024-10/webhooks.json`, {
      method: 'POST',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        webhook: {
          topic,
          address: `${webhookUrl}?workflowId=${workflowId}`,
          format: 'json'
        }
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Failed to create Shopify webhook: ${response.status} ${errorText}`)
    }

    const data = await response.json()
    const webhook = data.webhook

    // Store in trigger_resources table
    await supabase.from('trigger_resources').insert({
      workflow_id: workflowId,
      user_id: userId,
      provider_id: 'shopify',
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'webhook',
      external_id: webhook.id.toString(),
      config: {
        ...config,
        shopDomain,
        topic,
        webhookUrl: webhook.address
      },
      status: 'active'
    })

    console.log(`✅ Shopify webhook created: ${webhook.id}`)
  }

  /**
   * Deactivate Shopify trigger
   * Deletes the webhook subscription
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId, userId } = context

    console.log(`🛑 Deactivating Shopify triggers for workflow ${workflowId}`)

    // Get all Shopify webhooks for this workflow
    const { data: resources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'shopify')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      console.log(`ℹ️ No active Shopify webhooks for workflow ${workflowId}`)
      return
    }

    // Get user's access token
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token, metadata')
      .eq('user_id', userId)
      .eq('provider', 'shopify')
      .single()

    if (!integration) {
      console.warn(`⚠️ Shopify integration not found, marking webhooks as deleted`)
      await supabase
        .from('trigger_resources')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
        .eq('workflow_id', workflowId)
        .eq('provider_id', 'shopify')
      return
    }

    // Decrypt access token
    const accessToken = typeof integration.access_token === 'string'
      ? safeDecrypt(integration.access_token)
      : null

    if (!accessToken) {
      console.warn(`⚠️ Failed to decrypt Shopify access token, marking webhooks as deleted`)
      await supabase
        .from('trigger_resources')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
        .eq('workflow_id', workflowId)
        .eq('provider_id', 'shopify')
      return
    }

    const shopDomain = integration.metadata?.shop_domain
    if (!shopDomain) {
      console.warn(`⚠️ Shop domain not found, marking webhooks as deleted`)
      await supabase
        .from('trigger_resources')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
        .eq('workflow_id', workflowId)
        .eq('provider_id', 'shopify')
      return
    }

    // Delete each webhook
    for (const resource of resources) {
      if (!resource.external_id) continue

      try {
        const response = await fetch(
          `https://${shopDomain}/admin/api/2024-10/webhooks/${resource.external_id}.json`,
          {
            method: 'DELETE',
            headers: {
              'X-Shopify-Access-Token': accessToken
            }
          }
        )

        if (!response.ok && response.status !== 404) {
          throw new Error(`Failed to delete webhook: ${response.status}`)
        }

        // Mark as deleted in trigger_resources
        await supabase
          .from('trigger_resources')
          .update({ status: 'deleted', updated_at: new Date().toISOString() })
          .eq('id', resource.id)

        console.log(`✅ Deleted Shopify webhook: ${resource.external_id}`)
      } catch (error) {
        console.error(`❌ Failed to delete webhook ${resource.external_id}:`, error)
        await supabase
          .from('trigger_resources')
          .update({ status: 'error', updated_at: new Date().toISOString() })
          .eq('id', resource.id)
      }
    }
  }

  /**
   * Delete Shopify trigger (same as deactivate)
   */
  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    return this.onDeactivate(context)
  }

  /**
   * Check health of Shopify webhooks
   */
  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
    const { data: resources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'shopify')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      return {
        healthy: false,
        details: 'No active webhooks found',
        lastChecked: new Date().toISOString()
      }
    }

    // Shopify webhooks don't expire, so healthy if they exist
    return {
      healthy: true,
      details: `All Shopify webhooks healthy (${resources.length} active)`,
      lastChecked: new Date().toISOString()
    }
  }

  /**
   * Map trigger type to Shopify webhook topic
   */
  private getTopicForTrigger(triggerType: string): string {
    const topicMap: Record<string, string> = {
      'shopify_trigger_order_created': 'orders/create',
      'shopify_trigger_order_updated': 'orders/updated',
      'shopify_trigger_order_cancelled': 'orders/cancelled',
      'shopify_trigger_order_fulfilled': 'orders/fulfilled',
      'shopify_trigger_product_created': 'products/create',
      'shopify_trigger_product_updated': 'products/update',
      'shopify_trigger_product_deleted': 'products/delete',
      'shopify_trigger_customer_created': 'customers/create',
      'shopify_trigger_customer_updated': 'customers/update',
      'shopify_trigger_inventory_updated': 'inventory_levels/update',
      'shopify_trigger_cart_created': 'carts/create',
      'shopify_trigger_cart_updated': 'carts/update',
      'shopify_trigger_checkout_created': 'checkouts/create',
      'shopify_trigger_checkout_updated': 'checkouts/update'
    }

    const topic = topicMap[triggerType]
    if (!topic) {
      throw new Error(`Unknown Shopify trigger type: ${triggerType}`)
    }

    return topic
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

    return `${baseUrl.replace(/\/$/, '')}/api/webhooks/shopify`
  }
}
