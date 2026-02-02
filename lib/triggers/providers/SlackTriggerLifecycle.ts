/**
 * Slack Trigger Lifecycle
 *
 * Manages Slack event subscriptions
 * Implements proper lifecycle: create on activate, delete on deactivate/delete
 *
 * NOTE: Slack uses a different model than other providers.
 * Event subscriptions are configured at the app level in Slack API dashboard,
 * not dynamically created per workflow. This lifecycle manages the activation
 * state and routing logic, but doesn't create/delete external resources.
 */

import { createClient } from '@supabase/supabase-js'
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

export class SlackTriggerLifecycle implements TriggerLifecycle {

  /**
   * Activate Slack trigger
   * Registers trigger for event routing
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config } = context

    logger.debug(`🔔 Activating Slack trigger for workflow ${workflowId}`, {
      triggerType,
      userId,
      config
    })

    // The workspace field contains the integration ID (set by slack_workspaces dynamic options)
    const integrationId = config?.workspace

    if (!integrationId) {
      throw new Error('No Slack workspace selected. Please configure the trigger with a workspace.')
    }

    // Look up the integration by ID (not by user_id, since multi-account is supported)
    const { data: integration, error: fetchError } = await getSupabase()
      .from('integrations')
      .select('id, status, user_id')
      .eq('id', integrationId)
      .eq('provider', 'slack')
      .single()

    logger.debug(`🔍 Slack integration lookup by ID ${integrationId}:`, {
      found: !!integration,
      integration,
      error: fetchError?.message,
      errorCode: fetchError?.code
    })

    if (!integration) {
      throw new Error(`Slack integration not found (ID: ${integrationId}). Please reconnect Slack.`)
    }

    // Verify the user has access to this integration
    // Either they own it (user_id matches) or they have permission via integration_permissions
    if (integration.user_id !== userId) {
      // Check if user has permission to use this integration
      const { data: permission } = await getSupabase()
        .from('integration_permissions')
        .select('id')
        .eq('integration_id', integrationId)
        .eq('user_id', userId)
        .single()

      if (!permission) {
        throw new Error('You do not have permission to use this Slack integration.')
      }
    }

    // Check if the integration is connected
    if (integration.status !== 'connected') {
      throw new Error(`Slack integration is not connected (status: ${integration.status}). Please reconnect Slack.`)
    }

    // Store trigger metadata for event routing
    // Slack events are configured at app level, we just need to route them to the right workflow
    // Use upsert to handle re-activation (when trigger resource already exists)
    const resourceId = `${workflowId}-${nodeId}`
    const { error: upsertError } = await getSupabase().from('trigger_resources').upsert({
      workflow_id: workflowId,
      user_id: userId,
      provider: 'slack',
      provider_id: 'slack',
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'other', // Not a webhook or subscription, just routing metadata
      resource_id: resourceId,
      config: {
        ...config,
        integrationId, // Store integration ID explicitly for event routing
        eventType: this.getEventTypeForTrigger(triggerType)
      },
      status: 'active'
    }, {
      onConflict: 'provider,resource_type,resource_id'
    })

    if (upsertError) {
      // Check if this is a FK constraint violation (code 23503) - happens for unsaved workflows in test mode
      if (upsertError.code === '23503') {
        logger.warn(`⚠️ Could not store trigger resource (workflow may be unsaved): ${upsertError.message}`)
        logger.debug(`✅ Slack trigger activated (without local record): ${triggerType}`)
        return
      }
      logger.error(`❌ Failed to store trigger resource:`, upsertError)
      throw new Error(`Failed to store trigger resource: ${upsertError.message}`)
    }

    logger.debug(`✅ Slack trigger activated: ${triggerType}`)
  }

  /**
   * Deactivate Slack trigger
   * Removes routing metadata
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId } = context

    logger.debug(`🛑 Deactivating Slack triggers for workflow ${workflowId}`)

    // Mark triggers as deleted (no external cleanup needed)
    await getSupabase()
      .from('trigger_resources')
      .delete()
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'slack')
      .eq('status', 'active')

    logger.debug(`✅ Slack triggers deactivated`)
  }

  /**
   * Delete Slack trigger (same as deactivate)
   */
  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    return this.onDeactivate(context)
  }

  /**
   * Check health of Slack triggers
   */
  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
    const { data: resources } = await getSupabase()
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'slack')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      return {
        healthy: false,
        details: 'No active triggers found',
        lastChecked: new Date().toISOString()
      }
    }

    // Check health for each trigger resource's integration
    const unhealthyIntegrations: string[] = []

    for (const resource of resources) {
      const integrationId = resource.config?.workspace
      if (!integrationId) {
        unhealthyIntegrations.push('Missing workspace configuration')
        continue
      }

      const { data: integration } = await getSupabase()
        .from('integrations')
        .select('id, status')
        .eq('id', integrationId)
        .eq('provider', 'slack')
        .single()

      if (!integration || integration.status !== 'connected') {
        unhealthyIntegrations.push(`Integration ${integrationId} disconnected`)
      }
    }

    if (unhealthyIntegrations.length > 0) {
      return {
        healthy: false,
        details: `Slack integration issues: ${unhealthyIntegrations.join(', ')}`,
        lastChecked: new Date().toISOString()
      }
    }

    return {
      healthy: true,
      details: `All Slack triggers healthy (${resources.length} active)`,
      lastChecked: new Date().toISOString()
    }
  }

  /**
   * Map trigger type to Slack event type
   */
  private getEventTypeForTrigger(triggerType: string): string {
    const eventMap: Record<string, string> = {
      'slack_trigger_message_channels': 'message',
      'slack_trigger_message_im': 'message',
      'slack_trigger_message_mpim': 'message',
      'slack_trigger_reaction_added': 'reaction_added',
      'slack_trigger_reaction_removed': 'reaction_removed',
      'slack_trigger_channel_created': 'channel_created',
      'slack_trigger_member_joined_channel': 'member_joined_channel',
      'slack_trigger_member_left_channel': 'member_left_channel',
      'slack_trigger_slash_command': 'slash_command',
      'slack_trigger_file_uploaded': 'file_shared',
      'slack_trigger_user_joined_workspace': 'team_join'
    }

    return eventMap[triggerType] || 'message'
  }
}
