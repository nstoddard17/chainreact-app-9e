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

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export class SlackTriggerLifecycle implements TriggerLifecycle {

  /**
   * Activate Slack trigger
   * Registers trigger for event routing
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config } = context

    console.log(`🔔 Activating Slack trigger for workflow ${workflowId}`, {
      triggerType,
      config
    })

    // Verify Slack integration exists
    const { data: integration } = await supabase
      .from('integrations')
      .select('id')
      .eq('user_id', userId)
      .eq('provider', 'slack')
      .single()

    if (!integration) {
      throw new Error('Slack integration not found for user')
    }

    // Store trigger metadata for event routing
    // Slack events are configured at app level, we just need to route them to the right workflow
    await supabase.from('trigger_resources').insert({
      workflow_id: workflowId,
      user_id: userId,
      provider_id: 'slack',
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'other', // Not a webhook or subscription, just routing metadata
      config: {
        ...config,
        eventType: this.getEventTypeForTrigger(triggerType)
      },
      status: 'active'
    })

    console.log(`✅ Slack trigger activated: ${triggerType}`)
  }

  /**
   * Deactivate Slack trigger
   * Removes routing metadata
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId } = context

    console.log(`🛑 Deactivating Slack triggers for workflow ${workflowId}`)

    // Mark triggers as deleted (no external cleanup needed)
    await supabase
      .from('trigger_resources')
      .update({ status: 'deleted', updated_at: new Date().toISOString() })
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'slack')
      .eq('status', 'active')

    console.log(`✅ Slack triggers deactivated`)
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
    const { data: resources } = await supabase
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
    const { data: integration } = await supabase
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
