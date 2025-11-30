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

// Helper to create supabase client inside handlers
const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

export class MicrosoftGraphTriggerLifecycle implements TriggerLifecycle {
  private subscriptionManager = new MicrosoftGraphSubscriptionManager()
  private graphAuth = new MicrosoftGraphAuth()

  /**
   * Activate Microsoft Graph trigger
   * Creates a subscription for the specific resource
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, nodeId, triggerType, config, testMode } = context

    const modeLabel = testMode ? '🧪 TEST' : '🔔 PRODUCTION'
    logger.debug(`${modeLabel} Activating Microsoft Graph trigger for workflow ${workflowId}`, {
      triggerType,
      configKeys: Object.keys(config || {}),
      testSessionId: testMode?.testSessionId
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
      }
      // OneNote removed - doesn't support webhooks (API deprecated May 2023)
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

    // Create subscription - use test URL if in test mode
    const subscription = await this.subscriptionManager.createSubscription({
      resource,
      changeType,
      userId,
      accessToken: accessToken,
      testSessionId: testMode?.testSessionId // Pass test session for URL isolation
    })

    // Store in trigger_resources table with test mode fields
    const { error: insertError } = await getSupabase().from('trigger_resources').insert({
      workflow_id: workflowId,
      user_id: userId,
      provider: 'microsoft',
      provider_id: 'microsoft',
      trigger_type: triggerType,
      node_id: nodeId,
      resource_type: 'subscription',
      resource_id: subscription.id,
      external_id: subscription.id,
      config: {
        resource,
        changeType,
        clientState: subscription.clientState, // Store for webhook verification
        notificationUrl: subscription.notificationUrl,
        ...config
      },
      status: 'active',
      expires_at: subscription.expirationDateTime,
      // Test mode isolation fields
      is_test: testMode?.isTest ?? false,
      test_session_id: testMode?.testSessionId ?? null
    })

    if (insertError) {
      // Check if this is a FK constraint violation (code 23503) - happens for unsaved workflows in test mode
      // The subscription was already created successfully with Microsoft Graph, so we can continue
      if (insertError.code === '23503') {
        logger.warn(`⚠️ Could not store trigger resource (workflow may be unsaved): ${insertError.message}`)
        logger.debug(`✅ Microsoft Graph subscription created (without local record): ${subscription.id}`)
        return
      }
      logger.error(`❌ Failed to store trigger resource:`, insertError)
      throw new Error(`Failed to store trigger resource: ${insertError.message}`)
    }

    logger.debug(`✅ Microsoft Graph subscription created and saved to trigger_resources: ${subscription.id}`)
  }

  /**
   * Deactivate Microsoft Graph trigger
   * Deletes the subscription
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId, userId, testSessionId } = context

    const modeLabel = testSessionId ? '🧪 TEST' : '🛑 PRODUCTION'
    logger.debug(`${modeLabel} Deactivating Microsoft Graph triggers for workflow ${workflowId}`)

    // Build query based on whether we're deactivating test or production triggers
    let query = getSupabase()
      .from('trigger_resources')
      .select('*')
      .eq('workflow_id', workflowId)
      .eq('provider_id', 'microsoft')
      .eq('status', 'active')

    if (testSessionId) {
      // Only deactivate test subscriptions for this specific session
      query = query.eq('test_session_id', testSessionId)
    } else {
      // Deactivate production subscriptions only
      query = query.or('is_test.is.null,is_test.eq.false')
    }

    const { data: resources } = await query

    if (!resources || resources.length === 0) {
      logger.debug(`ℹ️ No active Microsoft Graph subscriptions for workflow ${workflowId}${testSessionId ? ` (session ${testSessionId})` : ''}`)
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
      await getSupabase()
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
        await getSupabase()
          .from('trigger_resources')
          .delete()
          .eq('id', resource.id)

        logger.debug(`✅ Deleted trigger resource from database: ${resource.id}`)
      } catch (dbError) {
        logger.error(`❌ Failed to delete from database: ${resource.id}`, dbError)
        // If we can't delete from DB, mark as error as last resort
        await getSupabase()
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
    const { data: resources } = await getSupabase()
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
   * e.g., "microsoft_excel_trigger_new_row" -> "microsoft-excel"
   */
  private getProviderFromTriggerType(triggerType: string): string {
    // Extract provider prefix from trigger type
    if (triggerType.startsWith('microsoft-outlook_')) return 'microsoft-outlook'
    if (triggerType.startsWith('microsoft_excel_')) return 'microsoft-excel'
    if (triggerType.startsWith('teams_')) return 'teams'
    if (triggerType.startsWith('onedrive_')) return 'onedrive'
    // OneNote removed - doesn't support webhooks

    // Default to microsoft-outlook for generic microsoft triggers
    return 'microsoft-outlook'
  }

  /**
   * Map trigger type to Microsoft Graph resource
   * Handles both formats: "microsoft-outlook_trigger_new_email" and "trigger_new_email"
   */
  private getResourceForTrigger(triggerType: string, config?: Record<string, any>): string | null {
    // Strip provider prefix if present (e.g., "microsoft-outlook_trigger_new_email" -> "trigger_new_email")
    const simplifiedType = triggerType.replace(/^(microsoft-outlook|microsoft_excel|teams|onedrive)_/, '')

    const resourceMap: Record<string, string | ((config?: Record<string, any>) => string)> = {
      // Email triggers
      'trigger_new_email': '/me/messages',
      'trigger_email_received': '/me/messages',
      'trigger_email_sent': '/me/mailFolders/SentItems/messages',

      // Calendar triggers
      'trigger_calendar_event': '/me/events',
      'trigger_event_created': '/me/events',
      'trigger_event_updated': '/me/events',

      // Teams triggers
      'trigger_new_message': (config?: Record<string, any>) => {
        if (config?.teamId && config?.channelId) {
          return `/teams/${config.teamId}/channels/${config.channelId}/messages`
        }
        return '/me/chats/getAllMessages'
      },
      'trigger_message_sent': '/me/chats/getAllMessages',
      'trigger_channel_message': '/teams/{teamId}/channels/{channelId}/messages',
      'trigger_user_joins_team': (config?: Record<string, any>) => {
        if (config?.teamId) {
          return `/teams/${config.teamId}/members`
        }
        throw new Error('teamId is required for user joins team trigger')
      },

      // OneDrive triggers
      'trigger_file_created': '/me/drive/root',
      'trigger_file_modified': '/me/drive/root',
      'trigger_file_shared': '/me/drive/root',

      // Microsoft Excel triggers (use OneDrive file change notifications)
      // Excel workbook files are stored in OneDrive, so we watch the drive root for changes
      'trigger_new_row': (config?: Record<string, any>) => {
        // Watch the specific workbook file for changes if workbookId is provided
        if (config?.workbookId) {
          return `/me/drive/items/${config.workbookId}`
        }
        return '/me/drive/root'
      },
      'trigger_new_worksheet': (config?: Record<string, any>) => {
        if (config?.workbookId) {
          return `/me/drive/items/${config.workbookId}`
        }
        return '/me/drive/root'
      },
      'trigger_updated_row': (config?: Record<string, any>) => {
        if (config?.workbookId) {
          return `/me/drive/items/${config.workbookId}`
        }
        return '/me/drive/root'
      },
      'trigger_new_table_row': (config?: Record<string, any>) => {
        if (config?.workbookId) {
          return `/me/drive/items/${config.workbookId}`
        }
        return '/me/drive/root'
      }

      // OneNote triggers removed - doesn't support webhooks (API deprecated May 2023)
    }

    const resource = resourceMap[simplifiedType]

    // If resource is a function, call it with config
    if (typeof resource === 'function') {
      return resource(config)
    }

    return resource || null
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
