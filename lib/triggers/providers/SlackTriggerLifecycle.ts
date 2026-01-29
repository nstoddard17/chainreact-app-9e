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

    // Verify Slack integration exists
    // First, check what integrations exist for this user and provider
    const { data: allSlackIntegrations, error: listError } = await getSupabase()
      .from('integrations')
      .select('id, user_id, provider, status, workspace_type, connected_by')
      .eq('provider', 'slack')

    logger.debug(`🔍 All Slack integrations in database:`, {
      count: allSlackIntegrations?.length || 0,
      integrations: allSlackIntegrations?.map(i => ({
        id: i.id,
        user_id: i.user_id,
        status: i.status,
        workspace_type: i.workspace_type,
        connected_by: i.connected_by
      })),
      listError: listError?.message
    })

    // Now try to find the specific integration for this user
    const { data: integration, error: fetchError } = await getSupabase()
      .from('integrations')
      .select('id, status')
      .eq('user_id', userId)
      .eq('provider', 'slack')
      .single()

    logger.debug(`🔍 Slack integration lookup for user ${userId}:`, {
      found: !!integration,
      integration,
      error: fetchError?.message,
      errorCode: fetchError?.code
    })

    if (!integration) {
      // Provide more context in the error
      const hasAnySlack = allSlackIntegrations && allSlackIntegrations.length > 0
      const hasTeamSlack = allSlackIntegrations?.some(i => i.workspace_type !== 'personal' && i.connected_by === userId)

      if (hasTeamSlack) {
        throw new Error('Slack integration found but connected as team/org integration. Personal integration required.')
      } else if (hasAnySlack) {
        throw new Error(`Slack integration exists but not for user ${userId}. Found ${allSlackIntegrations.length} integration(s) for other users.`)
      } else {
        throw new Error('Slack integration not found for user. Please connect Slack in the Integrations page.')
      }
    }

    // Also check if the integration is connected
    if (integration.status !== 'connected') {
      throw new Error(`Slack integration is not connected (status: ${integration.status}). Please reconnect Slack.`)
    }

    // Store trigger metadata for event routing
    // Slack events are configured at app level, we just need to route them to the right workflow
    const { error: insertError } = await getSupabase().from('trigger_resources').insert({
      workflow_id: workflowId,
      user_id: userId,
      provider: 'slack',
      provider_id: 'slack',
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'other', // Not a webhook or subscription, just routing metadata
      resource_id: `${workflowId}-${nodeId}`, // Generated ID for routing
      config: {
        ...config,
        eventType: this.getEventTypeForTrigger(triggerType)
      },
      status: 'active'
    })

    if (insertError) {
      // Check if this is a FK constraint violation (code 23503) - happens for unsaved workflows in test mode
      if (insertError.code === '23503') {
        logger.warn(`⚠️ Could not store trigger resource (workflow may be unsaved): ${insertError.message}`)
        logger.debug(`✅ Slack trigger activated (without local record): ${triggerType}`)
        return
      }
      logger.error(`❌ Failed to store trigger resource:`, insertError)
      throw new Error(`Failed to store trigger resource: ${insertError.message}`)
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

    // Verify Slack integration still exists
    const { data: integration } = await getSupabase()
      .from('integrations')
      .select('id, status')
      .eq('user_id', userId)
      .eq('provider', 'slack')
      .single()

    if (!integration || integration.status !== 'connected') {
      return {
        healthy: false,
        details: 'Slack integration disconnected',
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
      'slack_trigger_message_posted': 'message',
      'slack_trigger_reaction_added': 'reaction_added',
      'slack_trigger_channel_created': 'channel_created',
      'slack_trigger_member_joined': 'member_joined_channel',
      'slack_trigger_file_shared': 'file_shared'
    }

    return eventMap[triggerType] || 'message'
  }
}
