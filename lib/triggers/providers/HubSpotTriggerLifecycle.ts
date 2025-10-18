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
   *
   * NOTE: HubSpot Private Apps cannot create webhook subscriptions programmatically via API.
   * Subscriptions must be configured manually in the Private App settings UI.
   *
   * This method verifies the user has HubSpot connected and registers the workflow
   * to receive webhook notifications for the specified trigger type.
   *
   * See: HUBSPOT_WEBHOOK_SETUP.md for manual webhook configuration instructions
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

    // Verify user has HubSpot integration
    const { data: integration } = await supabase
      .from('integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'hubspot')
      .eq('status', 'connected')
      .single()

    if (!integration) {
      throw new Error('User must connect HubSpot integration before activating triggers')
    }

    // Register this workflow to receive webhook notifications for this trigger type
    // The webhook is configured globally in HubSpot Private App settings and shared
    // across all workflows. Our webhook receiver will route events to the correct workflows.
    await supabase.from('trigger_resources').insert({
      workflow_id: workflowId,
      user_id: userId,
      provider_id: 'hubspot',
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'webhook_registration', // Changed from 'webhook' since we don't create individual subscriptions
      external_id: `manual-${triggerType}`, // Manual subscription configured in HubSpot UI
      config: {
        subscriptionType: mapping.subscriptionType,
        propertyName: config.propertyName || mapping.propertyName,
        note: 'Webhook subscription must be manually configured in HubSpot Private App settings'
      },
      status: 'active',
      expires_at: null // HubSpot webhooks don't expire
    })

    logger.debug(`✅ HubSpot trigger registered for workflow ${workflowId}. ` +
      `Ensure webhook for '${mapping.subscriptionType}' is configured in HubSpot Private App settings.`)
  }

  /**
   * Deactivate HubSpot trigger
   *
   * NOTE: Since webhooks are configured globally in HubSpot Private App settings,
   * we only remove this workflow's registration from our database.
   * The webhook itself remains active in HubSpot and will continue receiving events,
   * but this workflow will no longer be triggered.
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId } = context

    logger.debug(`🛑 Deactivating HubSpot triggers for workflow ${workflowId}`)

    // Remove workflow registration from trigger_resources
    // The global webhook in HubSpot remains active for other workflows
    const { error } = await supabase
      .from('trigger_resources')
      .delete()
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'hubspot')

    if (error) {
      logger.error(`❌ Failed to deactivate HubSpot triggers for workflow ${workflowId}:`, {
        message: error.message
      })
      throw new Error(`Failed to deactivate HubSpot triggers: ${error.message}`)
    }

    logger.debug(`✅ HubSpot trigger registrations removed for workflow ${workflowId}`)
  }

  /**
   * Delete HubSpot trigger (same as deactivate)
   */
  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    return this.onDeactivate(context)
  }

  /**
   * Check health of HubSpot webhooks
   *
   * NOTE: Since webhooks are configured globally, we can only verify that:
   * 1. The workflow has active trigger registrations
   * 2. The user still has HubSpot connected
   *
   * We cannot verify the webhook itself is configured in HubSpot (API limitation)
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
        details: 'No active HubSpot trigger registrations found',
        lastChecked: new Date().toISOString()
      }
    }

    // Verify user still has HubSpot connected
    const { data: integration } = await supabase
      .from('integrations')
      .select('status')
      .eq('user_id', userId)
      .eq('provider', 'hubspot')
      .single()

    if (!integration || integration.status !== 'connected') {
      return {
        healthy: false,
        details: 'HubSpot integration not connected',
        lastChecked: new Date().toISOString()
      }
    }

    return {
      healthy: true,
      details: `Workflow registered for ${resources.length} HubSpot trigger(s). ` +
        `Ensure webhook subscriptions are configured in HubSpot Private App settings.`,
      lastChecked: new Date().toISOString()
    }
  }

  /**
   * Get webhook callback URL (global endpoint, not per-workflow)
   */
  private getWebhookUrl(): string {
    return getWebhookUrl(`/api/webhooks/hubspot`)
  }
}
