/**
 * HubSpot Trigger Lifecycle
 *
 * Manages webhooks for HubSpot CRM triggers
 * Implements proper lifecycle: create on activate, delete on deactivate/delete
 *
 * HubSpot Webhook API: https://developers.hubspot.com/docs/api/webhooks
 */

import { createClient } from '@supabase/supabase-js'
import { safeDecrypt } from '@/lib/security/encryption'
import { getWebhookUrl } from '@/lib/webhooks/utils'
import {
  TriggerLifecycle,
  TriggerActivationContext,
  TriggerDeactivationContext,
  TriggerHealthStatus
} from '../types'

import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

/**
 * Maps trigger types to HubSpot subscription types and properties
 * HubSpot uses subscription types like:
 * - contact.creation
 * - contact.propertyChange
 * - contact.deletion
 * - company.creation
 * - company.propertyChange
 * - company.deletion
 * - deal.creation
 * - deal.propertyChange
 * - deal.deletion
 */
const TRIGGER_TYPE_MAPPING: Record<string, { subscriptionType: string; propertyName?: string }> = {
  'hubspot_trigger_contact_created': { subscriptionType: 'contact.creation' },
  'hubspot_trigger_contact_updated': { subscriptionType: 'contact.propertyChange' },
  'hubspot_trigger_contact_deleted': { subscriptionType: 'contact.deletion' },
  'hubspot_trigger_company_created': { subscriptionType: 'company.creation' },
  'hubspot_trigger_company_updated': { subscriptionType: 'company.propertyChange' },
  'hubspot_trigger_company_deleted': { subscriptionType: 'company.deletion' },
  'hubspot_trigger_deal_created': { subscriptionType: 'deal.creation' },
  'hubspot_trigger_deal_updated': { subscriptionType: 'deal.propertyChange' },
  'hubspot_trigger_deal_deleted': { subscriptionType: 'deal.deletion' },
}

export class HubSpotTriggerLifecycle implements TriggerLifecycle {

  /**
   * Activate HubSpot trigger
   * Creates a webhook subscription for the specified trigger type
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config } = context

    logger.debug(`🔔 Activating HubSpot trigger for workflow ${workflowId}`, {
      triggerType,
      config
    })

    // Get trigger mapping
    const mapping = TRIGGER_TYPE_MAPPING[triggerType]
    if (!mapping) {
      throw new Error(`Unsupported HubSpot trigger type: ${triggerType}`)
    }

    // Get user's HubSpot integration
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'hubspot')
      .eq('status', 'connected')
      .single()

    if (!integration) {
      throw new Error('HubSpot integration not found or not connected')
    }

    // Decrypt access token
    const accessToken = typeof integration.access_token === 'string'
      ? safeDecrypt(integration.access_token)
      : null

    if (!accessToken) {
      throw new Error('Failed to decrypt HubSpot access token')
    }

    // Get webhook callback URL
    const webhookUrl = this.getWebhookUrl(workflowId)

    logger.debug(`📤 Creating HubSpot webhook subscription`, {
      subscriptionType: mapping.subscriptionType,
      webhookUrl
    })

    // Build subscription payload
    const subscriptionPayload: any = {
      enabled: true,
      subscriptionDetails: {
        subscriptionType: mapping.subscriptionType,
        propertyName: config.propertyName || mapping.propertyName // Allow filtering by specific property
      }
    }

    // Create webhook subscription in HubSpot
    const response = await fetch(`https://api.hubapi.com/webhooks/v3/${process.env.HUBSPOT_APP_ID}/subscriptions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        eventType: mapping.subscriptionType,
        propertyName: config.propertyName || undefined,
        active: true
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      logger.error('Failed to create HubSpot subscription:', {
        status: response.status,
        error: errorText
      })
      throw new Error(`Failed to create HubSpot webhook subscription: ${response.status} ${errorText}`)
    }

    const subscription = await response.json()

    // Store in trigger_resources table
    await supabase.from('trigger_resources').insert({
      workflow_id: workflowId,
      user_id: userId,
      provider_id: 'hubspot',
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'webhook',
      external_id: subscription.id,
      config: {
        subscriptionType: mapping.subscriptionType,
        propertyName: config.propertyName || mapping.propertyName,
        webhookUrl: webhookUrl
      },
      status: 'active',
      expires_at: null // HubSpot webhooks don't expire
    })

    logger.debug(`✅ HubSpot webhook subscription created: ${subscription.id}`)
  }

  /**
   * Deactivate HubSpot trigger
   * Deletes the webhook subscription
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId, userId } = context

    logger.debug(`🛑 Deactivating HubSpot triggers for workflow ${workflowId}`)

    // Get all HubSpot subscriptions for this workflow
    const { data: resources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'hubspot')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      logger.debug(`ℹ️ No active HubSpot subscriptions for workflow ${workflowId}`)
      return
    }

    // Get user's access token
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'hubspot')
      .eq('status', 'connected')
      .single()

    if (!integration) {
      logger.warn(`⚠️ HubSpot integration not found, marking subscriptions as deleted`)
      // Mark as deleted even if we can't clean up in HubSpot
      await supabase
        .from('trigger_resources')
        .delete()
        .eq('workflow_id', workflowId)
        .eq('provider_id', 'hubspot')
      return
    }

    // Decrypt access token
    const accessToken = typeof integration.access_token === 'string'
      ? safeDecrypt(integration.access_token)
      : null

    if (!accessToken) {
      logger.warn(`⚠️ Failed to decrypt HubSpot access token, marking subscriptions as deleted`)
      await supabase
        .from('trigger_resources')
        .delete()
        .eq('workflow_id', workflowId)
        .eq('provider_id', 'hubspot')
      return
    }

    // Delete each subscription
    for (const resource of resources) {
      if (!resource.external_id) continue

      try {
        const subscriptionId = resource.external_id

        const response = await fetch(
          `https://api.hubapi.com/webhooks/v3/${process.env.HUBSPOT_APP_ID}/subscriptions/${subscriptionId}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        )

        if (!response.ok && response.status !== 404) {
          const errorText = await response.text()
          throw new Error(`Failed to delete subscription: ${response.status} ${errorText}`)
        }

        // Delete from trigger_resources
        await supabase
          .from('trigger_resources')
          .delete()
          .eq('id', resource.id)

        logger.debug(`✅ Deleted HubSpot subscription: ${subscriptionId}`)
      } catch (error: any) {
        logger.error(`❌ Failed to delete subscription ${resource.external_id}:`, {
          message: error.message,
          stack: error.stack
        })
        // Mark as error but continue with others
        await supabase
          .from('trigger_resources')
          .update({ status: 'error', updated_at: new Date().toISOString() })
          .eq('id', resource.id)
      }
    }
  }

  /**
   * Delete HubSpot trigger (same as deactivate)
   */
  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    return this.onDeactivate(context)
  }

  /**
   * Check health of HubSpot webhooks
   * Verifies subscriptions are still active in HubSpot
   */
  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
    const { data: resources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'hubspot')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      return {
        healthy: false,
        details: 'No active webhook subscriptions found',
        lastChecked: new Date().toISOString()
      }
    }

    // Get user's access token to verify subscriptions
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'hubspot')
      .eq('status', 'connected')
      .single()

    if (!integration) {
      return {
        healthy: false,
        details: 'HubSpot integration not found',
        lastChecked: new Date().toISOString()
      }
    }

    const accessToken = typeof integration.access_token === 'string'
      ? safeDecrypt(integration.access_token)
      : null

    if (!accessToken) {
      return {
        healthy: false,
        details: 'Failed to decrypt HubSpot access token',
        lastChecked: new Date().toISOString()
      }
    }

    // Check each subscription status
    let allHealthy = true
    const errors: string[] = []

    for (const resource of resources) {
      if (!resource.external_id) continue

      try {
        const response = await fetch(
          `https://api.hubapi.com/webhooks/v3/${process.env.HUBSPOT_APP_ID}/subscriptions/${resource.external_id}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        )

        if (!response.ok) {
          allHealthy = false
          errors.push(`Subscription ${resource.external_id}: ${response.status}`)
        }
      } catch (error: any) {
        allHealthy = false
        errors.push(`Subscription ${resource.external_id}: ${error.message}`)
      }
    }

    return {
      healthy: allHealthy,
      details: allHealthy
        ? `All subscriptions healthy (${resources.length} active)`
        : `Some subscriptions unhealthy: ${errors.join(', ')}`,
      lastChecked: new Date().toISOString()
    }
  }

  /**
   * Get webhook callback URL for this workflow
   */
  private getWebhookUrl(workflowId: string): string {
    return getWebhookUrl(`/api/webhooks/hubspot?workflowId=${workflowId}`)
  }
}
