/**
 * Microsoft Graph Trigger Lifecycle
 *
 * Manages subscriptions for Microsoft Graph triggers (Outlook, Teams, OneDrive, OneNote)
 * Implements proper lifecycle: create on activate, delete on deactivate/delete
 */

import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'
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

export class MicrosoftGraphTriggerLifecycle implements TriggerLifecycle {
  private subscriptionManager = new MicrosoftGraphSubscriptionManager()

  /**
   * Activate Microsoft Graph trigger
   * Creates a subscription for the specific resource
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config } = context

    console.log(`🔔 Activating Microsoft Graph trigger for workflow ${workflowId}`, {
      triggerType,
      config
    })

    // Get user's Microsoft integration
    // Check for any Microsoft-related provider (microsoft-outlook, microsoft-onenote, onedrive, etc.)
    const { data: integrations } = await supabase
      .from('integrations')
      .select('access_token, provider')
      .eq('user_id', userId)
      .or('provider.like.microsoft%,provider.eq.onedrive')

    // Find first connected Microsoft integration
    const integration = integrations?.find(i => i.access_token)

    if (!integration) {
      throw new Error('Microsoft integration not found for user')
    }

    // Determine resource based on trigger type
    const resource = this.getResourceForTrigger(triggerType)
    const changeType = this.getChangeTypeForTrigger(triggerType)

    if (!resource) {
      throw new Error(`Unknown Microsoft Graph trigger type: ${triggerType}`)
    }

    console.log(`📤 Creating Microsoft Graph subscription`, {
      resource,
      changeType,
      workflowId
    })

    // Create subscription
    const subscription = await this.subscriptionManager.createSubscription({
      resource,
      changeType,
      userId,
      accessToken: integration.access_token
    })

    // Store in trigger_resources table
    await supabase.from('trigger_resources').insert({
      workflow_id: workflowId,
      user_id: userId,
      provider_id: 'microsoft',
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'subscription',
      external_id: subscription.id,
      config: {
        resource,
        changeType,
        ...config
      },
      status: 'active',
      expires_at: subscription.expirationDateTime
    })

    // Also update microsoft_graph_subscriptions table with workflow_id
    await supabase
      .from('microsoft_graph_subscriptions')
      .update({ workflow_id: workflowId })
      .eq('id', subscription.id)

    console.log(`✅ Microsoft Graph subscription created: ${subscription.id}`)
  }

  /**
   * Deactivate Microsoft Graph trigger
   * Deletes the subscription
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId, userId } = context

    console.log(`🛑 Deactivating Microsoft Graph triggers for workflow ${workflowId}`)

    // Get all Microsoft Graph subscriptions for this workflow
    const { data: resources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'microsoft')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      console.log(`ℹ️ No active Microsoft Graph subscriptions for workflow ${workflowId}`)
      return
    }

    // Get user's access token
    // Check for any Microsoft-related provider (microsoft-outlook, microsoft-onenote, onedrive, etc.)
    const { data: integrations } = await supabase
      .from('integrations')
      .select('access_token, provider')
      .eq('user_id', userId)
      .or('provider.like.microsoft%,provider.eq.onedrive')

    // Find first connected Microsoft integration
    const integration = integrations?.find(i => i.access_token)

    if (!integration) {
      console.warn(`⚠️ Microsoft integration not found, marking subscriptions as deleted`)
      // Mark as deleted even if we can't clean up in Microsoft Graph
      await supabase
        .from('trigger_resources')
        .update({ status: 'deleted', updated_at: new Date().toISOString() })
        .eq('workflow_id', workflowId)
        .eq('provider_id', 'microsoft')
      return
    }

    // Delete each subscription
    for (const resource of resources) {
      if (!resource.external_id) continue

      try {
        await this.subscriptionManager.deleteSubscription(
          resource.external_id,
          integration.access_token
        )

        // Mark as deleted in trigger_resources
        await supabase
          .from('trigger_resources')
          .update({ status: 'deleted', updated_at: new Date().toISOString() })
          .eq('id', resource.id)

        console.log(`✅ Deleted Microsoft Graph subscription: ${resource.external_id}`)
      } catch (error) {
        console.error(`❌ Failed to delete subscription ${resource.external_id}:`, error)
        // Mark as error but continue with others
        await supabase
          .from('trigger_resources')
          .update({ status: 'error', updated_at: new Date().toISOString() })
          .eq('id', resource.id)
      }
    }
  }

  /**
   * Delete Microsoft Graph trigger (same as deactivate)
   */
  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    return this.onDeactivate(context)
  }

  /**
   * Check health of Microsoft Graph subscriptions
   */
  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
    const { data: resources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'microsoft')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      return {
        healthy: false,
        details: 'No active subscriptions found',
        lastChecked: new Date().toISOString()
      }
    }

    // Check if any subscriptions are expiring soon (within 12 hours)
    const now = new Date()
    const expiringThreshold = new Date(now.getTime() + 12 * 60 * 60 * 1000)

    const expiringSoon = resources.some(r => {
      if (!r.expires_at) return false
      return new Date(r.expires_at) < expiringThreshold
    })

    const nearestExpiration = resources
      .filter(r => r.expires_at)
      .map(r => new Date(r.expires_at!))
      .sort((a, b) => a.getTime() - b.getTime())[0]

    return {
      healthy: !expiringSoon,
      details: expiringSoon
        ? `Subscription expiring soon: ${nearestExpiration?.toISOString()}`
        : `All subscriptions healthy (${resources.length} active)`,
      expiresAt: nearestExpiration?.toISOString(),
      lastChecked: new Date().toISOString()
    }
  }

  /**
   * Map trigger type to Microsoft Graph resource
   */
  private getResourceForTrigger(triggerType: string): string | null {
    const resourceMap: Record<string, string> = {
      // Outlook
      'outlook_trigger_new_email': '/me/messages',
      'outlook_trigger_email_received': '/me/messages',
      'outlook_trigger_calendar_event': '/me/events',

      // Teams
      'teams_trigger_message_sent': '/me/chats/getAllMessages',
      'teams_trigger_channel_message': '/teams/{teamId}/channels/{channelId}/messages',

      // OneDrive
      'onedrive_trigger_file_created': '/me/drive/root',
      'onedrive_trigger_file_modified': '/me/drive/root',

      // OneNote
      'onenote_trigger_note_created': '/me/onenote/notebooks'
    }

    return resourceMap[triggerType] || null
  }

  /**
   * Map trigger type to change type
   */
  private getChangeTypeForTrigger(triggerType: string): string {
    // Most triggers watch for created and updated
    if (triggerType.includes('new') || triggerType.includes('created')) {
      return 'created,updated'
    }

    if (triggerType.includes('modified') || triggerType.includes('updated')) {
      return 'updated'
    }

    // Default to watching all changes
    return 'created,updated,deleted'
  }
}
