import { 
  SocialProvider, 
  SocialPost, 
  SocialResult, 
  SocialMention, 
  MentionFilters, 
  InsightsParams, 
  InsightsResult,
  DirectMessage 
} from '../../domains/integrations/ports/capability-interfaces'
import { CapabilityDescriptor, ErrorClassification } from '../../domains/integrations/ports/connector-contract'
import { getTwitterMentionsForDropdown } from '../../../lib/integrations/twitter'
import { getDecryptedAccessToken } from '../../../lib/workflows/actions/core/getDecryptedAccessToken'

export class TwitterAdapter implements SocialProvider {
  readonly providerId = 'twitter'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: false,
    rateLimits: [
      { type: 'requests', limit: 300, window: 900000 }, // 300 requests per 15 minutes
      { type: 'posts', limit: 50, window: 86400000 } // 50 posts per day
    ],
    supportedFeatures: [
      'create_post',
      'get_mentions', 
      'send_direct_message',
      'get_insights'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'twitter')
      const response = await fetch('https://api.twitter.com/2/users/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      return response.ok
    } catch {
      return false
    }
  }

  async createPost(params: SocialPost, userId: string): Promise<SocialResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'twitter')
      
      const payload: any = {
        text: params.content
      }

      // Add media if present
      if (params.mediaFiles && params.mediaFiles.length > 0) {
        // Twitter media upload would require separate media upload API calls
        console.warn('Twitter media upload not implemented in this adapter')
      }

      const response = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Twitter API error: ${response.status} - ${errorData.detail || response.statusText}`)
      }

      const result = await response.json()
      
      return {
        success: true,
        output: {
          postId: result.data.id,
          url: `https://twitter.com/i/web/status/${result.data.id}`,
          twitterResponse: result
        },
        message: 'Tweet created successfully'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create tweet',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async deletePost(postId: string, userId: string): Promise<void> {
    const accessToken = await getDecryptedAccessToken(userId, 'twitter')
    
    const response = await fetch(`https://api.twitter.com/2/tweets/${postId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.ok) {
      throw new Error(`Failed to delete tweet: ${response.statusText}`)
    }
  }

  async likePost(postId: string, userId: string): Promise<SocialResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'twitter')
      
      // Get user ID first
      const userResponse = await fetch('https://api.twitter.com/2/users/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      const userData = await userResponse.json()
      const twitterUserId = userData.data.id

      const response = await fetch(`https://api.twitter.com/2/users/${twitterUserId}/likes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ tweet_id: postId })
      })

      if (!response.ok) {
        throw new Error(`Failed to like tweet: ${response.statusText}`)
      }

      const result = await response.json()
      
      return {
        success: true,
        output: { liked: result.data.liked },
        message: 'Tweet liked successfully'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to like tweet',
        output: { error: error.message }
      }
    }
  }

  async commentOnPost(postId: string, comment: string, userId: string): Promise<SocialResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'twitter')
      
      const payload = {
        text: comment,
        reply: {
          in_reply_to_tweet_id: postId
        }
      }

      const response = await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error(`Failed to reply to tweet: ${response.statusText}`)
      }

      const result = await response.json()
      
      return {
        success: true,
        output: {
          postId: result.data.id,
          url: `https://twitter.com/i/web/status/${result.data.id}`
        },
        message: 'Reply created successfully'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to reply to tweet',
        output: { error: error.message }
      }
    }
  }

  async getMentions(filters?: MentionFilters, userId?: string): Promise<SocialMention[]> {
    if (!userId) {
      throw new Error('User ID is required for getMentions')
    }

    try {
      // Use existing integration for dropdown functionality
      const integration = { access_token: await getDecryptedAccessToken(userId, 'twitter') }
      const mentions = await getTwitterMentionsForDropdown(integration, {})
      
      return mentions.map((mention: any) => ({
        id: mention.value,
        content: mention.label.split(' (')[0], // Extract content before ID
        author: 'Unknown', // Twitter API doesn't provide author in mentions endpoint
        timestamp: new Date(), // Would need to fetch full tweet data for timestamp
        platform: 'twitter',
        url: `https://twitter.com/i/web/status/${mention.value}`
      }))
    } catch (error: any) {
      console.error('Failed to get Twitter mentions:', error)
      return []
    }
  }

  async getInsights(params: InsightsParams, userId: string): Promise<InsightsResult> {
    try {
      // Twitter API v2 doesn't provide insights without specific enterprise access
      // This would require Twitter API for Business or Academic Research access
      console.warn('Twitter insights require special API access')
      
      return {
        success: true,
        output: {
          metrics: [],
          message: 'Twitter insights require enterprise API access'
        },
        message: 'Insights data not available with current API access level'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get insights',
        output: { error: error.message }
      }
    }
  }

  async sendDirectMessage(params: DirectMessage, userId: string): Promise<SocialResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'twitter')
      
      const payload = {
        text: params.content,
        dm_conversation_id: params.recipientId
      }

      const response = await fetch('https://api.twitter.com/2/dm_conversations/with/{participant_id}/messages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      })

      if (!response.ok) {
        throw new Error(`Failed to send direct message: ${response.statusText}`)
      }

      const result = await response.json()
      
      return {
        success: true,
        output: {
          messageId: result.data.id,
          conversationId: result.data.dm_conversation_id
        },
        message: 'Direct message sent successfully'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to send direct message',
        output: { error: error.message }
      }
    }
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('unauthorized') || message.includes('authentication')) {
      return 'authentication'
    }
    if (message.includes('forbidden') || message.includes('permission')) {
      return 'authorization'
    }
    if (message.includes('rate limit') || message.includes('too many')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('not found')) {
      return 'notFound'
    }
    
    return 'unknown'
  }
}