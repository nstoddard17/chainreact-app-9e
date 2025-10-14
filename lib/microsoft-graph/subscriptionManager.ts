import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import { getWebhookBaseUrl } from '@/lib/utils/getBaseUrl'

import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export interface MicrosoftGraphSubscription {
  id: string
  resource: string
  changeType: string
  notificationUrl: string
  expirationDateTime: string
  clientState: string
  userId: string
  accessToken: string
  status: 'active' | 'expired' | 'deleted'
  createdAt: string
  updatedAt: string
}

export interface CreateSubscriptionRequest {
  resource: string
  changeType: string
  userId: string
  accessToken: string
  notificationUrl?: string
  expirationMinutes?: number
}

export class MicrosoftGraphSubscriptionManager {
  private baseUrl = 'https://graph.microsoft.com/v1.0'
  private maxExpirationMinutes = 4230 // Microsoft's limit for most resources

  /**
   * Create a new Microsoft Graph subscription
   */
  async createSubscription(request: CreateSubscriptionRequest): Promise<MicrosoftGraphSubscription> {
    try {
      const {
        resource,
        changeType,
        userId,
        accessToken,
        notificationUrl = this.getNotificationUrl(),
        expirationMinutes = 4320 // Default to 3 days
      } = request

      // NOTE: Duplicate checking is now handled by trigger lifecycle manager
      // which manages subscriptions in the trigger_resources table

      // Validate expiration time
      const actualExpirationMinutes = Math.min(expirationMinutes, this.maxExpirationMinutes)
      
      // Calculate expiration date
      const expirationDateTime = new Date()
      expirationDateTime.setMinutes(expirationDateTime.getMinutes() + actualExpirationMinutes)

      // Generate secure client state
      const clientState = this.generateClientState()

      // Prepare subscription payload
      const subscriptionPayload: any = {
        changeType: changeType,
        notificationUrl: notificationUrl,
        resource: resource,
        expirationDateTime: expirationDateTime.toISOString(),
        clientState: clientState
      }

      // Add lifecycle notification URL if expiration is > 1 hour (Microsoft requirement)
      if (actualExpirationMinutes > 60) {
        subscriptionPayload.lifecycleNotificationUrl = this.getLifecycleNotificationUrl()
      }

      logger.debug('📤 Creating Microsoft Graph subscription:', {
        resource,
        changeType,
        expirationDateTime: expirationDateTime.toISOString(),
        notificationUrl,
        userId
      })

      logger.debug('📦 Subscription payload:', JSON.stringify(subscriptionPayload, null, 2))

      // Create subscription via Microsoft Graph API
      const response = await fetch(`${this.baseUrl}/subscriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(subscriptionPayload)
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('❌ Failed to create subscription:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        })
        throw new Error(`Failed to create subscription: ${response.status} ${response.statusText}`)
      }

      const subscriptionData = await response.json()

      // Return subscription data (lifecycle manager will save to trigger_resources)
      const subscription: MicrosoftGraphSubscription = {
        id: subscriptionData.id,
        resource: resource,
        changeType: changeType,
        notificationUrl: notificationUrl,
        expirationDateTime: subscriptionData.expirationDateTime,
        clientState: clientState,
        userId: userId,
        accessToken: accessToken,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      logger.debug('✅ Subscription created in Microsoft Graph:', subscription.id)
      return subscription

    } catch (error) {
      logger.error('❌ Error creating subscription:', error)
      throw error
    }
  }

  /**
   * Renew a subscription before it expires
   */
  async renewSubscription(subscriptionId: string, accessToken: string): Promise<MicrosoftGraphSubscription> {
    try {
      // Get current subscription
      const subscription = await this.getSubscription(subscriptionId)
      if (!subscription) {
        throw new Error(`Subscription ${subscriptionId} not found`)
      }

      // Calculate new expiration (3 days from now)
      const newExpirationDateTime = new Date()
      newExpirationDateTime.setMinutes(newExpirationDateTime.getMinutes() + this.maxExpirationMinutes)

      logger.debug('🔄 Renewing subscription:', {
        subscriptionId,
        currentExpiration: subscription.expirationDateTime,
        newExpiration: newExpirationDateTime.toISOString()
      })

      // Update subscription via Microsoft Graph API
      const response = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          expirationDateTime: newExpirationDateTime.toISOString()
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        logger.error('❌ Failed to renew subscription:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        })
        throw new Error(`Failed to renew subscription: ${response.status} ${response.statusText}`)
      }

      const updatedData = await response.json()

      // Update subscription in database
      const updatedSubscription: MicrosoftGraphSubscription = {
        ...subscription,
        expirationDateTime: updatedData.expirationDateTime,
        accessToken: accessToken,
        updatedAt: new Date().toISOString()
      }

      await this.updateSubscription(updatedSubscription)

      logger.debug('✅ Subscription renewed successfully:', subscriptionId)
      return updatedSubscription

    } catch (error) {
      logger.error('❌ Error renewing subscription:', error)
      throw error
    }
  }

  /**
   * Delete a subscription
   */
  async deleteSubscription(subscriptionId: string, accessToken: string): Promise<void> {
    try {
      logger.debug('🗑️ Deleting subscription:', subscriptionId)

      // Delete from Microsoft Graph API
      const response = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })

      if (!response.ok) {
        // 404 means subscription doesn't exist (already deleted or expired) - treat as success
        if (response.status === 404) {
          logger.debug('ℹ️ Subscription not found in Microsoft Graph (already deleted/expired):', subscriptionId)
          await this.markSubscriptionAsDeleted(subscriptionId)
          return
        }

        // 403 Forbidden means we don't have permission to delete (token issue or subscription ownership)
        // This commonly happens when:
        // - Token expired/refreshed after subscription creation
        // - Subscription was created by different app/client
        // - Insufficient token permissions
        // Microsoft will clean up expired subscriptions automatically, so treat as success
        if (response.status === 403) {
          logger.warn('⚠️ Access denied when deleting subscription (treating as success - Microsoft will auto-cleanup on expiry):', {
            subscriptionId,
            reason: 'Token lacks permissions or subscription created by different client'
          })
          await this.markSubscriptionAsDeleted(subscriptionId)
          return
        }

        const errorText = await response.text()
        logger.error('❌ Failed to delete subscription:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        })
        throw new Error(`Failed to delete subscription: ${response.status} ${response.statusText}`)
      }

      // Update status in database
      await this.markSubscriptionAsDeleted(subscriptionId)

      logger.debug('✅ Subscription deleted successfully:', subscriptionId)

    } catch (error) {
      logger.error('❌ Error deleting subscription:', error)
      throw error
    }
  }

  /**
   * Get all subscriptions for a user from trigger_resources
   */
  async getUserSubscriptions(userId: string): Promise<MicrosoftGraphSubscription[]> {
    try {
      const { data, error } = await supabase
        .from('trigger_resources')
        .select('*')
        .eq('user_id', userId)
        .eq('resource_type', 'subscription')
        .like('provider_id', 'microsoft%')
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      if (error) {
        logger.error('Error fetching user subscriptions:', error)
        return []
      }

      return (data || []).map(resource => ({
        id: resource.external_id!,
        resource: resource.config?.resource || '',
        changeType: resource.config?.changeType || '',
        notificationUrl: resource.config?.notificationUrl || '',
        expirationDateTime: resource.expires_at || '',
        clientState: resource.config?.clientState || '',
        userId: resource.user_id,
        accessToken: '', // Not stored in trigger_resources for security
        status: 'active' as const,
        createdAt: resource.created_at || '',
        updatedAt: resource.updated_at || ''
      }))
    } catch (error) {
      logger.error('Error getting user subscriptions:', error)
      return []
    }
  }

  /**
   * Get subscriptions that need renewal (expiring within 24 hours) from trigger_resources
   */
  async getSubscriptionsNeedingRenewal(): Promise<MicrosoftGraphSubscription[]> {
    try {
      // Renew ~15 minutes before expiry
      const renewalThreshold = new Date()
      renewalThreshold.setMinutes(renewalThreshold.getMinutes() + 15)

      const { data, error } = await supabase
        .from('trigger_resources')
        .select('*')
        .eq('resource_type', 'subscription')
        .like('provider_id', 'microsoft%')
        .eq('status', 'active')
        .lt('expires_at', renewalThreshold.toISOString())

      if (error) {
        logger.error('Error fetching subscriptions needing renewal:', error)
        return []
      }

      return (data || []).map(resource => ({
        id: resource.external_id!,
        resource: resource.config?.resource || '',
        changeType: resource.config?.changeType || '',
        notificationUrl: resource.config?.notificationUrl || '',
        expirationDateTime: resource.expires_at || '',
        clientState: resource.config?.clientState || '',
        userId: resource.user_id,
        accessToken: '', // Not stored in trigger_resources for security
        status: 'active' as const,
        createdAt: resource.created_at || '',
        updatedAt: resource.updated_at || ''
      }))
    } catch (error) {
      logger.error('Error getting subscriptions needing renewal:', error)
      return []
    }
  }

  /**
   * Clean up expired subscriptions in trigger_resources
   */
  async cleanupExpiredSubscriptions(): Promise<void> {
    try {
      const now = new Date().toISOString()

      const { error } = await supabase
        .from('trigger_resources')
        .update({ status: 'expired', updated_at: now })
        .eq('resource_type', 'subscription')
        .like('provider_id', 'microsoft%')
        .eq('status', 'active')
        .lt('expires_at', now)

      if (error) {
        logger.error('Error cleaning up expired subscriptions:', error)
      } else {
        logger.debug('🧹 Cleaned up expired subscriptions')
      }
    } catch (error) {
      logger.error('Error cleaning up expired subscriptions:', error)
    }
  }

  /**
   * Verify client state for webhook security from trigger_resources
   */
  async verifyClientState(clientState: string, subscriptionId: string): Promise<boolean> {
    try {
      const { data } = await supabase
        .from('trigger_resources')
        .select('config')
        .eq('external_id', subscriptionId)
        .eq('resource_type', 'subscription')
        .like('provider_id', 'microsoft%')
        .single()

      return Boolean(data?.config?.clientState === clientState)
    } catch {
      return false
    }
  }

  /**
   * Check subscription health
   */
  async checkSubscriptionHealth(subscriptionId: string, accessToken: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })

      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Helpers to build resource strings for common areas
   */
  buildOneDriveRootResource(): string {
    return '/me/drive/root'
  }

  buildOneDriveItemResource(itemId: string): string {
    return `/me/drive/items/${itemId}`
  }

  buildOutlookMailResource(): string {
    return '/me/messages'
  }

  buildOutlookCalendarResource(): string {
    return '/me/events'
  }

  buildTeamsChannelMessagesResource(teamId: string, channelId: string): string {
    return `/teams/${teamId}/channels/${channelId}/messages`
  }

  buildChatMessagesResource(chatId: string): string {
    return `/chats/${chatId}/messages`
  }

  buildOneNoteResource(): string {
    return '/me/onenote/notebooks'
  }

  // Private helper methods
  private getNotificationUrl(): string {
    const explicit = process.env.MICROSOFT_GRAPH_WEBHOOK_URL || process.env.NEXT_PUBLIC_MICROSOFT_WEBHOOK_URL
    const httpsOverride = process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL || process.env.PUBLIC_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL

    let baseUrl = (explicit || httpsOverride || getWebhookBaseUrl()).trim()
    baseUrl = baseUrl.replace(/\/$/, "")

    if (!baseUrl.startsWith("https://")) {
      const guidanceEnv = httpsOverride || explicit || baseUrl
      throw new Error(`Microsoft Graph notification URL must use HTTPS. Received base: ${guidanceEnv}. Set NEXT_PUBLIC_WEBHOOK_HTTPS_URL (for example, an https ngrok tunnel) or MICROSOFT_GRAPH_WEBHOOK_URL.`)
    }

    const notificationUrl = `${baseUrl}/api/webhooks/microsoft`
    logger.debug("[Microsoft Graph] Using webhook notification URL", { notificationUrl })
    return notificationUrl
  }

  private getLifecycleNotificationUrl(): string {
    const explicit = process.env.MICROSOFT_GRAPH_WEBHOOK_URL || process.env.NEXT_PUBLIC_MICROSOFT_WEBHOOK_URL
    const httpsOverride = process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL || process.env.PUBLIC_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL

    let baseUrl = (explicit || httpsOverride || getWebhookBaseUrl()).trim()
    baseUrl = baseUrl.replace(/\/$/, "")

    if (!baseUrl.startsWith("https://")) {
      const guidanceEnv = httpsOverride || explicit || baseUrl
      throw new Error(`Microsoft Graph lifecycle notification URL must use HTTPS. Received base: ${guidanceEnv}. Set NEXT_PUBLIC_WEBHOOK_HTTPS_URL (for example, an https ngrok tunnel) or MICROSOFT_GRAPH_WEBHOOK_URL.`)
    }

    const lifecycleUrl = `${baseUrl}/api/webhooks/microsoft/lifecycle`
    logger.debug("[Microsoft Graph] Using lifecycle notification URL", { lifecycleUrl })
    return lifecycleUrl
  }
  private generateClientState(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  // DEPRECATED: Subscription saving is now handled by TriggerLifecycleManager
  // This method is no longer used but kept for backward compatibility
  private async saveSubscription(subscription: MicrosoftGraphSubscription): Promise<void> {
    logger.debug('⚠️ saveSubscription called but is deprecated - lifecycle manager handles persistence')
  }

  private async updateSubscription(subscription: MicrosoftGraphSubscription): Promise<void> {
    const { error } = await supabase
      .from('trigger_resources')
      .update({
        expires_at: subscription.expirationDateTime,
        updated_at: subscription.updatedAt
      })
      .eq('external_id', subscription.id)
      .eq('resource_type', 'subscription')
      .like('provider_id', 'microsoft%')

    if (error) {
      logger.error('Error updating subscription:', error)
      throw error
    }
  }

  private async markSubscriptionAsDeleted(subscriptionId: string): Promise<void> {
    const { error } = await supabase
      .from('trigger_resources')
      .update({
        status: 'deleted',
        updated_at: new Date().toISOString()
      })
      .eq('external_id', subscriptionId)
      .eq('resource_type', 'subscription')
      .like('provider_id', 'microsoft%')

    if (error) {
      logger.error('Error marking subscription as deleted:', error)
      throw error
    }
  }

  private async getSubscription(subscriptionId: string): Promise<MicrosoftGraphSubscription | null> {
    const { data, error } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('external_id', subscriptionId)
      .eq('resource_type', 'subscription')
      .like('provider_id', 'microsoft%')
      .single()

    if (error) {
      logger.error('Error fetching subscription:', error)
      return null
    }

    if (!data) return null

    return {
      id: data.external_id!,
      resource: data.config?.resource || '',
      changeType: data.config?.changeType || '',
      notificationUrl: data.config?.notificationUrl || '',
      expirationDateTime: data.expires_at || '',
      clientState: data.config?.clientState || '',
      userId: data.user_id,
      accessToken: '', // Not stored in trigger_resources for security
      status: data.status as 'active' | 'expired' | 'deleted',
      createdAt: data.created_at || '',
      updatedAt: data.updated_at || ''
    }
  }
}
