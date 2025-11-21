import { TriggerLifecycle, TriggerActivationContext, TriggerDeactivationContext, TriggerHealthStatus } from '../types'
import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt, encrypt } from '@/lib/security/encryption'
import { logger } from '@/lib/utils/logger'
import { getBaseUrl } from '@/lib/utils/getBaseUrl'
import { generateEncryptionCertificate, rotateCertificateIfNeeded } from '@/lib/utils/encryptionCertificate'

/**
 * Microsoft Teams Trigger Lifecycle Handler
 *
 * Manages Graph API change notification subscriptions for Teams triggers
 *
 * API Reference: https://learn.microsoft.com/en-us/graph/api/subscription-post-subscriptions
 *
 * Supported Resources:
 * - /teams/{id}/channels/{id}/messages - Channel messages
 * - /chats/{id}/messages - Chat messages
 * - /chats - All chats
 * - /teams/{id}/channels - Channels in a team
 */
export class TeamsTriggerLifecycle implements TriggerLifecycle {
  /**
   * Create a Graph API subscription when workflow is activated
   */
  async onActivate(context: TriggerActivationContext): Promise<void> {
    const { workflowId, userId, triggerType, config } = context

    logger.debug('[Teams Trigger] Activating trigger:', { workflowId, triggerType })

    try {
      const supabase = createAdminClient()

      // Get Teams integration
      const { data: integration } = await supabase
        .from('integrations')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'teams')
        .eq('status', 'connected')
        .single()

      if (!integration || !integration.access_token) {
        throw new Error('Teams integration not found or not connected')
      }

      const accessToken = await decrypt(integration.access_token)

      // Build subscription resource based on trigger type
      const resource = this.buildSubscriptionResource(triggerType, config)
      const changeTypes = this.getChangeTypes(triggerType)

      // Subscription expires in 4230 minutes (3 days - max for most resources)
      const expirationDateTime = new Date()
      expirationDateTime.setMinutes(expirationDateTime.getMinutes() + 4230)

      // Generate encryption certificate for includeResourceData
      // This allows Microsoft to send the full resource data in the notification
      // without us needing to make an additional API call
      const certificate = generateEncryptionCertificate()

      // Create subscription
      const baseUrl = getBaseUrl()
      const webhookUrl = `${baseUrl}/api/webhooks/teams`
      const subscriptionPayload: any = {
        changeType: changeTypes.join(','),
        notificationUrl: webhookUrl,
        lifecycleNotificationUrl: webhookUrl, // Receive lifecycle events
        resource: resource,
        expirationDateTime: expirationDateTime.toISOString(),
        clientState: `workflow_${workflowId}`, // Used to validate notifications
        includeResourceData: true, // Request resource data in notifications
        encryptionCertificate: certificate.publicKeyBase64, // Public key for encryption
        encryptionCertificateId: certificate.certificateId // Our certificate identifier
      }

      logger.debug('[Teams Trigger] Creating subscription:', {
        resource,
        changeType: subscriptionPayload.changeType
      })

      const response = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(subscriptionPayload)
      })

      if (!response.ok) {
        const errorData = await response.json()
        logger.error('[Teams Trigger] Failed to create subscription:', errorData)
        throw new Error(`Failed to create Teams subscription: ${errorData.error?.message || response.statusText}`)
      }

      const subscription = await response.json()

      logger.debug('[Teams Trigger] Subscription created:', {
        id: subscription.id,
        expirationDateTime: subscription.expirationDateTime,
        includeResourceData: true
      })

      // Encrypt the private key before storing
      const encryptedPrivateKey = await encrypt(certificate.privateKey)

      // Store subscription details in webhook_configs
      await supabase
        .from('webhook_configs')
        .insert({
          workflow_id: workflowId,
          user_id: userId,
          provider: 'teams',
          trigger_type: triggerType,
          external_webhook_id: subscription.id,
          webhook_url: subscriptionPayload.notificationUrl,
          config: {
            resource: resource,
            changeType: subscriptionPayload.changeType,
            expirationDateTime: subscription.expirationDateTime,
            certificateId: certificate.certificateId,
            certificateExpiresAt: certificate.expiresAt.toISOString(),
            encryptedPrivateKey: encryptedPrivateKey, // Store encrypted private key
            ...config
          },
          status: 'active'
        })

      logger.debug('[Teams Trigger] Trigger activation complete')
    } catch (error: any) {
      logger.error('[Teams Trigger] Error activating trigger:', error)
      throw error
    }
  }

  /**
   * Delete the Graph API subscription when workflow is deactivated
   */
  async onDeactivate(context: TriggerDeactivationContext): Promise<void> {
    const { workflowId, userId } = context

    logger.debug('[Teams Trigger] Deactivating trigger:', { workflowId })

    try {
      const supabase = createAdminClient()

      // Get webhook config
      const { data: webhookConfig } = await supabase
        .from('webhook_configs')
        .select('*')
        .eq('workflow_id', workflowId)
        .eq('provider', 'teams')
        .single()

      if (!webhookConfig || !webhookConfig.external_webhook_id) {
        logger.warn('[Teams Trigger] No webhook config found for workflow:', workflowId)
        return
      }

      // Get Teams integration
      const { data: integration } = await supabase
        .from('integrations')
        .select('access_token')
        .eq('user_id', userId)
        .eq('provider', 'teams')
        .eq('status', 'connected')
        .single()

      if (integration && integration.access_token) {
        const accessToken = await decrypt(integration.access_token)

        // Delete the subscription
        const response = await fetch(
          `https://graph.microsoft.com/v1.0/subscriptions/${webhookConfig.external_webhook_id}`,
          {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          }
        )

        if (!response.ok && response.status !== 404) {
          logger.error('[Teams Trigger] Failed to delete subscription:', await response.text())
        } else {
          logger.debug('[Teams Trigger] Subscription deleted:', webhookConfig.external_webhook_id)
        }
      }

      // Delete webhook config from database
      await supabase
        .from('webhook_configs')
        .delete()
        .eq('workflow_id', workflowId)
        .eq('provider', 'teams')

      logger.debug('[Teams Trigger] Trigger deactivation complete')
    } catch (error: any) {
      logger.error('[Teams Trigger] Error deactivating trigger:', error)
      // Don't throw - we want to clean up even if Graph API call fails
    }
  }

  /**
   * Delete subscription when workflow is deleted (same as deactivate)
   */
  async onDelete(context: TriggerDeactivationContext): Promise<void> {
    await this.onDeactivate(context)
  }

  /**
   * Check if the subscription is still valid
   */
  async checkHealth(workflowId: string, userId: string): Promise<TriggerHealthStatus> {
    try {
      const supabase = createAdminClient()

      // Get webhook config
      const { data: webhookConfig } = await supabase
        .from('webhook_configs')
        .select('*')
        .eq('workflow_id', workflowId)
        .eq('provider', 'teams')
        .single()

      if (!webhookConfig || !webhookConfig.external_webhook_id) {
        return {
          healthy: false,
          message: 'No subscription found'
        }
      }

      // Check subscription expiration
      const expirationTime = new Date(webhookConfig.config.expirationDateTime).getTime()
      const now = Date.now()
      const hoursUntilExpiration = (expirationTime - now) / (1000 * 60 * 60)

      if (hoursUntilExpiration < 0) {
        return {
          healthy: false,
          message: 'Subscription expired'
        }
      }

      // Renew if less than 24 hours remaining
      if (hoursUntilExpiration < 24) {
        await this.renewSubscription(workflowId, userId, webhookConfig.external_webhook_id)
        return {
          healthy: true,
          message: 'Subscription renewed'
        }
      }

      return {
        healthy: true,
        message: `Subscription valid for ${Math.floor(hoursUntilExpiration)} hours`
      }
    } catch (error: any) {
      logger.error('[Teams Trigger] Error checking health:', error)
      return {
        healthy: false,
        message: error.message || 'Health check failed'
      }
    }
  }

  /**
   * Renew a subscription before it expires
   */
  private async renewSubscription(workflowId: string, userId: string, subscriptionId: string): Promise<void> {
    try {
      const supabase = createAdminClient()

      // Get Teams integration
      const { data: integration } = await supabase
        .from('integrations')
        .select('access_token')
        .eq('user_id', userId)
        .eq('provider', 'teams')
        .eq('status', 'connected')
        .single()

      if (!integration || !integration.access_token) {
        throw new Error('Teams integration not found')
      }

      const accessToken = await decrypt(integration.access_token)

      // Extend expiration by 3 days
      const newExpiration = new Date()
      newExpiration.setMinutes(newExpiration.getMinutes() + 4230)

      const response = await fetch(
        `https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`,
        {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            expirationDateTime: newExpiration.toISOString()
          })
        }
      )

      if (!response.ok) {
        throw new Error('Failed to renew subscription')
      }

      // Update webhook config
      await supabase
        .from('webhook_configs')
        .update({
          config: {
            expirationDateTime: newExpiration.toISOString()
          }
        })
        .eq('workflow_id', workflowId)
        .eq('provider', 'teams')

      logger.debug('[Teams Trigger] Subscription renewed:', subscriptionId)
    } catch (error: any) {
      logger.error('[Teams Trigger] Error renewing subscription:', error)
      throw error
    }
  }

  /**
   * Build the Graph API resource path for the subscription
   */
  private buildSubscriptionResource(triggerType: string, config: any): string {
    switch (triggerType) {
      case 'teams_trigger_new_message':
      case 'teams_trigger_new_reply':
      case 'teams_trigger_channel_mention':
        // Subscribe to messages in a specific channel
        return `/teams/${config.teamId}/channels/${config.channelId}/messages`

      case 'teams_trigger_new_chat_message':
        if (config.chatId) {
          // Subscribe to messages in a specific chat
          return `/chats/${config.chatId}/messages`
        } else {
          // Subscribe to all chats for the user
          return `/chats/getAllMessages`
        }

      case 'teams_trigger_new_chat':
        // Subscribe to all chats
        return `/chats`

      case 'teams_trigger_new_channel':
        // Subscribe to channels in a team
        return `/teams/${config.teamId}/channels`

      default:
        throw new Error(`Unsupported trigger type: ${triggerType}`)
    }
  }

  /**
   * Get the change types to subscribe to based on trigger type
   */
  private getChangeTypes(triggerType: string): string[] {
    switch (triggerType) {
      case 'teams_trigger_new_message':
      case 'teams_trigger_new_reply':
      case 'teams_trigger_channel_mention':
      case 'teams_trigger_new_chat_message':
        return ['created']

      case 'teams_trigger_new_chat':
      case 'teams_trigger_new_channel':
        return ['created']

      default:
        return ['created', 'updated']
    }
  }
}
