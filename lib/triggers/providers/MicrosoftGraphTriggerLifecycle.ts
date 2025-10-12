/**
 * Microsoft Graph Trigger Lifecycle
 *
 * Manages subscriptions for Microsoft Graph triggers (Outlook, Teams, OneDrive, OneNote)
 * Implements proper lifecycle: create on activate, delete on deactivate/delete
 */

import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'
import { MicrosoftGraphAuth } from '@/lib/microsoft-graph/auth'
import { safeDecrypt } from '@/lib/security/encryption'
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

export class MicrosoftGraphTriggerLifecycle implements TriggerLifecycle {
  private subscriptionManager = new MicrosoftGraphSubscriptionManager()
  private graphAuth = new MicrosoftGraphAuth()

  /**
   * Activate Microsoft Graph trigger
   * Creates a subscription for the specific resource
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config } = context

    logger.debug(`🔔 Activating Microsoft Graph trigger for workflow ${workflowId}`, {
      triggerType,
      configKeys: Object.keys(config || {})
    })

    // Get valid access token (automatically refreshes if expired)
    // Determine the provider based on trigger type
    const provider = this.getProviderFromTriggerType(triggerType)

    let accessToken: string
    try {
      accessToken = await this.graphAuth.getValidAccessToken(userId, provider)
      logger.debug(`✅ Retrieved valid Microsoft Graph access token for provider: ${provider}`)
    } catch (error) {
      logger.error('❌ Failed to get valid Microsoft Graph token:', error)
      throw new Error(`Microsoft ${provider} integration not connected or token expired. Please reconnect your Microsoft ${provider} account.`)
    }

    // Determine resource based on trigger type
    const resource = this.getResourceForTrigger(triggerType, config)
    const changeType = this.getChangeTypeForTrigger(triggerType)

    if (!resource) {
      throw new Error(`Unknown Microsoft Graph trigger type: ${triggerType}`)
    }

    // Test the token by calling appropriate endpoint to verify permissions
    logger.debug('🧪 Testing token permissions...')
    try {
      const meResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })

      if (!meResponse.ok) {
        logger.error('❌ /me call failed:', meResponse.status, meResponse.statusText)
      } else {
        logger.debug('✅ /me call succeeded')
      }

      // Test provider-specific permissions
      if (provider === 'microsoft-outlook') {
        const messagesResponse = await fetch('https://graph.microsoft.com/v1.0/me/messages?$top=1', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })

        if (!messagesResponse.ok) {
          const errorText = await messagesResponse.text()
          logger.error('❌ /me/messages call failed:', messagesResponse.status, messagesResponse.statusText)
          logger.error('   Error details:', errorText)
          throw new Error(`Token lacks Mail.Read permission. Status: ${messagesResponse.status}. Please reconnect Microsoft Outlook integration.`)
        } else {
          logger.debug('✅ /me/messages call succeeded - token has mail read permission')
        }
      } else if (provider === 'microsoft-onenote') {
        const notebooksResponse = await fetch('https://graph.microsoft.com/v1.0/me/onenote/notebooks?$top=1', {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        })

        if (!notebooksResponse.ok) {
          const errorText = await notebooksResponse.text()
          logger.error('❌ /me/onenote/notebooks call failed:', notebooksResponse.status, notebooksResponse.statusText)
          logger.error('   Error details:', errorText)
          throw new Error(`Token lacks Notes.Read permission. Status: ${notebooksResponse.status}. Please reconnect Microsoft OneNote integration.`)
        } else {
          logger.debug('✅ /me/onenote/notebooks call succeeded - token has OneNote read permission')
        }
      }
      // Add other providers (Teams, OneDrive) here as needed
    } catch (testError) {
      logger.error('❌ Token permission test failed:', testError)
      throw testError
    }

    logger.debug(`📤 Creating Microsoft Graph subscription`, {
      resource,
      changeType,
      workflowId
    })

    // Create subscription
    const subscription = await this.subscriptionManager.createSubscription({
      resource,
      changeType,
      userId,
      accessToken: accessToken
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
        clientState: subscription.clientState, // Store for webhook verification
        notificationUrl: subscription.notificationUrl,
        ...config
      },
      status: 'active',
      expires_at: subscription.expirationDateTime
    })

    logger.debug(`✅ Microsoft Graph subscription created and saved to trigger_resources: ${subscription.id}`)
  }

  /**
   * Deactivate Microsoft Graph trigger
   * Deletes the subscription
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId, userId } = context

    logger.debug(`🛑 Deactivating Microsoft Graph triggers for workflow ${workflowId}`)

    // Get all Microsoft Graph subscriptions for this workflow
    const { data: resources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'microsoft')
      .eq('status', 'active')

    if (!resources || resources.length === 0) {
      logger.debug(`ℹ️ No active Microsoft Graph subscriptions for workflow ${workflowId}`)
      return
    }

    // Get valid access token (automatically refreshes if expired)
    let accessToken: string
    try {
      accessToken = await this.graphAuth.getValidAccessToken(userId)
      logger.debug('✅ Retrieved valid Microsoft Graph access token for deactivation')
    } catch (error) {
      logger.warn(`⚠️ Failed to get valid Microsoft Graph token, deleting subscription records without API cleanup`, error)
      // Delete even if we can't clean up in Microsoft Graph
      await supabase
        .from('trigger_resources')
        .delete()
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
          accessToken
        )
        logger.debug(`✅ Deleted Microsoft Graph subscription from API: ${resource.external_id}`)
      } catch (error) {
        logger.warn(`⚠️ Failed to delete subscription from Microsoft Graph API (will delete from DB anyway): ${resource.external_id}`, error)
        // Continue to delete from database even if API call fails
      }

      // ALWAYS delete from trigger_resources, even if Microsoft Graph API call failed
      // This ensures we don't have orphaned records
      try {
        await supabase
          .from('trigger_resources')
          .delete()
          .eq('id', resource.id)

        logger.debug(`✅ Deleted trigger resource from database: ${resource.id}`)
      } catch (dbError) {
        logger.error(`❌ Failed to delete from database: ${resource.id}`, dbError)
        // If we can't delete from DB, mark as error as last resort
        await supabase
          .from('trigger_resources')
          .update({ status: 'deleted', deleted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
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
   * Extract the provider from trigger type
   * e.g., "microsoft-outlook_trigger_new_email" -> "microsoft-outlook"
   */
  private getProviderFromTriggerType(triggerType: string): string {
    // Extract provider prefix from trigger type
    if (triggerType.startsWith('microsoft-outlook_')) return 'microsoft-outlook'
    if (triggerType.startsWith('microsoft-onenote_')) return 'microsoft-onenote'
    if (triggerType.startsWith('teams_')) return 'teams'
    if (triggerType.startsWith('onedrive_')) return 'onedrive'

    // Default to microsoft-outlook for generic microsoft triggers
    return 'microsoft-outlook'
  }

  /**
   * Map trigger type to Microsoft Graph resource
   * Handles both formats: "microsoft-outlook_trigger_new_email" and "trigger_new_email"
   */
  private getResourceForTrigger(triggerType: string, config?: Record<string, any>): string | null {
    // Strip provider prefix if present (e.g., "microsoft-outlook_trigger_new_email" -> "trigger_new_email")
    const simplifiedType = triggerType.replace(/^(microsoft-outlook|microsoft-onenote|teams|onedrive)_/, '')

    // Handle OneNote triggers with config-based resource paths
    if (simplifiedType === 'trigger_new_note' || simplifiedType === 'trigger_note_modified') {
      if (config?.notebookId && config?.sectionId) {
        // Monitor specific section
        return `/me/onenote/sections/${config.sectionId}/pages`
      } else if (config?.notebookId) {
        // Monitor entire notebook
        return `/me/onenote/notebooks/${config.notebookId}/pages`
      }
      // Fallback to all pages (though this might not be supported by Microsoft Graph)
      return '/me/onenote/pages'
    }

    const resourceMap: Record<string, string> = {
      // Email triggers
      'trigger_new_email': '/me/messages',
      'trigger_email_received': '/me/messages',
      'trigger_email_sent': '/me/mailFolders/SentItems/messages',

      // Calendar triggers
      'trigger_calendar_event': '/me/events',
      'trigger_event_created': '/me/events',
      'trigger_event_updated': '/me/events',

      // Teams triggers
      'trigger_message_sent': '/me/chats/getAllMessages',
      'trigger_channel_message': '/teams/{teamId}/channels/{channelId}/messages',

      // OneDrive triggers
      'trigger_file_created': '/me/drive/root',
      'trigger_file_modified': '/me/drive/root',
      'trigger_file_shared': '/me/drive/root',

      // OneNote triggers (legacy)
      'trigger_note_created': '/me/onenote/notebooks',
      'trigger_note_updated': '/me/onenote/notebooks'
    }

    return resourceMap[simplifiedType] || null
  }

  /**
   * Map trigger type to change type
   */
  private getChangeTypeForTrigger(triggerType: string): string {
    // For new/created/sent triggers, only watch 'created' to avoid duplicate notifications
    // Microsoft Graph sends both 'created' and 'updated' for new items, causing duplicates
    if (triggerType.includes('new') || triggerType.includes('created') || triggerType.includes('sent')) {
      return 'created'
    }

    if (triggerType.includes('modified') || triggerType.includes('updated')) {
      return 'updated'
    }

    // Default to watching all changes
    return 'created,updated,deleted'
  }
}
