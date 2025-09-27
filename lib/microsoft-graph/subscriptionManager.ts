import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

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

      // Validate expiration time
      const actualExpirationMinutes = Math.min(expirationMinutes, this.maxExpirationMinutes)
      
      // Calculate expiration date
      const expirationDateTime = new Date()
      expirationDateTime.setMinutes(expirationDateTime.getMinutes() + actualExpirationMinutes)

      // Generate secure client state
      const clientState = this.generateClientState()

      // Prepare subscription payload
      const subscriptionPayload = {
        changeType: changeType,
        notificationUrl: notificationUrl,
        resource: resource,
        expirationDateTime: expirationDateTime.toISOString(),
        clientState: clientState
      }

      console.log('📤 Creating Microsoft Graph subscription:', {
        resource,
        changeType,
        expirationDateTime: expirationDateTime.toISOString(),
        userId,
        userIdLength: userId?.length,
        userIdType: typeof userId
      })

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
        console.error('❌ Failed to create subscription:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        })
        throw new Error(`Failed to create subscription: ${response.status} ${response.statusText}`)
      }

      const subscriptionData = await response.json()

      // Store subscription in database
      const subscription: MicrosoftGraphSubscription = {
        id: subscriptionData.id,
        resource: resource,
        changeType: changeType,
        notificationUrl: notificationUrl,
        expirationDateTime: subscriptionData.expirationDateTime,
        clientState: clientState,
        userId: userId,
        accessToken: accessToken, // Note: In production, store refresh token instead
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }

      await this.saveSubscription(subscription)

      console.log('✅ Subscription created successfully:', subscription.id)
      return subscription

    } catch (error) {
      console.error('❌ Error creating subscription:', error)
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

      console.log('🔄 Renewing subscription:', {
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
        console.error('❌ Failed to renew subscription:', {
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

      console.log('✅ Subscription renewed successfully:', subscriptionId)
      return updatedSubscription

    } catch (error) {
      console.error('❌ Error renewing subscription:', error)
      throw error
    }
  }

  /**
   * Delete a subscription
   */
  async deleteSubscription(subscriptionId: string, accessToken: string): Promise<void> {
    try {
      console.log('🗑️ Deleting subscription:', subscriptionId)

      // Delete from Microsoft Graph API
      const response = await fetch(`${this.baseUrl}/subscriptions/${subscriptionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('❌ Failed to delete subscription:', {
          status: response.status,
          statusText: response.statusText,
          error: errorText
        })
        throw new Error(`Failed to delete subscription: ${response.status} ${response.statusText}`)
      }

      // Update status in database
      await this.markSubscriptionAsDeleted(subscriptionId)

      console.log('✅ Subscription deleted successfully:', subscriptionId)

    } catch (error) {
      console.error('❌ Error deleting subscription:', error)
      throw error
    }
  }

  /**
   * Get all subscriptions for a user
   */
  async getUserSubscriptions(userId: string): Promise<MicrosoftGraphSubscription[]> {
    try {
      const { data, error } = await supabase
        .from('microsoft_graph_subscriptions')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching user subscriptions:', error)
        return []
      }

      return data.map(this.mapDbSubscriptionToModel) || []
    } catch (error) {
      console.error('Error getting user subscriptions:', error)
      return []
    }
  }

  /**
   * Get subscriptions that need renewal (expiring within 24 hours)
   */
  async getSubscriptionsNeedingRenewal(): Promise<MicrosoftGraphSubscription[]> {
    try {
      // Renew ~15 minutes before expiry
      const renewalThreshold = new Date()
      renewalThreshold.setMinutes(renewalThreshold.getMinutes() + 15)

      const { data, error } = await supabase
        .from('microsoft_graph_subscriptions')
        .select('*')
        .eq('status', 'active')
        .lt('expiration_date_time', renewalThreshold.toISOString())

      if (error) {
        console.error('Error fetching subscriptions needing renewal:', error)
        return []
      }

      return data.map(this.mapDbSubscriptionToModel) || []
    } catch (error) {
      console.error('Error getting subscriptions needing renewal:', error)
      return []
    }
  }

  /**
   * Clean up expired subscriptions
   */
  async cleanupExpiredSubscriptions(): Promise<void> {
    try {
      const now = new Date().toISOString()

      const { error } = await supabase
        .from('microsoft_graph_subscriptions')
        .update({ status: 'expired', updated_at: now })
        .eq('status', 'active')
        .lt('expiration_date_time', now)

      if (error) {
        console.error('Error cleaning up expired subscriptions:', error)
      } else {
        console.log('🧹 Cleaned up expired subscriptions')
      }
    } catch (error) {
      console.error('Error cleaning up expired subscriptions:', error)
    }
  }

  /**
   * Verify client state for webhook security
   */
  async verifyClientState(clientState: string, subscriptionId: string): Promise<boolean> {
    try {
      const subscription = await this.getSubscription(subscriptionId)
      return Boolean(subscription && subscription.clientState === clientState)
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
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://chainreact.app'
    return `${baseUrl}/api/webhooks/microsoft`
  }

  private generateClientState(): string {
    return crypto.randomBytes(32).toString('hex')
  }

  private async saveSubscription(subscription: MicrosoftGraphSubscription): Promise<void> {
    console.log('💾 Saving subscription to database with userId:', {
      subscriptionId: subscription.id,
      userId: subscription.userId,
      userIdLength: subscription.userId?.length,
      userIdType: typeof subscription.userId
    })

    const { error } = await supabase
      .from('microsoft_graph_subscriptions')
      .insert({
        id: subscription.id,
        resource: subscription.resource,
        change_type: subscription.changeType,
        notification_url: subscription.notificationUrl,
        expiration_date_time: subscription.expirationDateTime,
        client_state: subscription.clientState,
        user_id: subscription.userId,
        access_token: subscription.accessToken,
        status: subscription.status,
        created_at: subscription.createdAt,
        updated_at: subscription.updatedAt
      })

    if (error) {
      console.error('Error saving subscription:', error)
      throw error
    }

    console.log('✅ Subscription saved successfully with user_id:', subscription.userId)
  }

  private async updateSubscription(subscription: MicrosoftGraphSubscription): Promise<void> {
    const { error } = await supabase
      .from('microsoft_graph_subscriptions')
      .update({
        expiration_date_time: subscription.expirationDateTime,
        access_token: subscription.accessToken,
        updated_at: subscription.updatedAt
      })
      .eq('id', subscription.id)

    if (error) {
      console.error('Error updating subscription:', error)
      throw error
    }
  }

  private async markSubscriptionAsDeleted(subscriptionId: string): Promise<void> {
    const { error } = await supabase
      .from('microsoft_graph_subscriptions')
      .update({ 
        status: 'deleted', 
        updated_at: new Date().toISOString() 
      })
      .eq('id', subscriptionId)

    if (error) {
      console.error('Error marking subscription as deleted:', error)
      throw error
    }
  }

  private async getSubscription(subscriptionId: string): Promise<MicrosoftGraphSubscription | null> {
    const { data, error } = await supabase
      .from('microsoft_graph_subscriptions')
      .select('*')
      .eq('id', subscriptionId)
      .single()

    if (error) {
      console.error('Error fetching subscription:', error)
      return null
    }

    if (!data) return null

    return this.mapDbSubscriptionToModel(data)
  }

  private mapDbSubscriptionToModel(data: any): MicrosoftGraphSubscription {
    return {
      id: data.id,
      resource: data.resource,
      changeType: data.change_type,
      notificationUrl: data.notification_url,
      expirationDateTime: data.expiration_date_time,
      clientState: data.client_state,
      userId: data.user_id,
      accessToken: data.access_token,
      status: data.status,
      createdAt: data.created_at,
      updatedAt: data.updated_at
    }
  }
}