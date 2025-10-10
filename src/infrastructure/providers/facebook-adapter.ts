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
import { 
  createFacebookPost, 
  getFacebookPageInsights, 
  sendFacebookMessage,
  commentOnFacebookPost 
} from '../../../lib/workflows/actions/facebook'
import { getDecryptedAccessToken } from '../../../lib/workflows/actions/core/getDecryptedAccessToken'

export class FacebookAdapter implements SocialProvider {
  readonly providerId = 'facebook'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    rateLimits: [
      { type: 'requests', limit: 200, window: 3600000 }, // 200 requests per hour
      { type: 'posts', limit: 25, window: 86400000 } // 25 posts per day
    ],
    supportedFeatures: [
      'create_post',
      'delete_post',
      'comment_on_post',
      'get_insights',
      'send_direct_message',
      'media_upload'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'facebook')
      const response = await fetch('https://graph.facebook.com/v19.0/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      })
      return response.ok
    } catch {
      return false
    }
  }

  async createPost(params: SocialPost, userId: string): Promise<SocialResult> {
    try {
      // Use existing Facebook implementation
      const config = {
        pageId: params.metadata?.pageId,
        message: params.content,
        mediaFile: params.mediaFiles,
        scheduledPublishTime: params.scheduledTime?.toISOString()
      }

      const result = await createFacebookPost(config, userId, {})
      
      if (result.success) {
        return {
          success: true,
          output: {
            postId: result.output.postId,
            url: `https://facebook.com/${result.output.postId}`,
            facebookResponse: result.output.facebookResponse
          },
          message: result.message
        }
      } 
        return {
          success: false,
          error: result.error || 'Failed to create Facebook post',
          output: result.output
        }
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create Facebook post',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async deletePost(postId: string, userId: string): Promise<void> {
    const accessToken = await getDecryptedAccessToken(userId, 'facebook')
    
    const response = await fetch(`https://graph.facebook.com/v19.0/${postId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to delete Facebook post: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }
  }

  async likePost(postId: string, userId: string): Promise<SocialResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'facebook')
      
      const response = await fetch(`https://graph.facebook.com/v19.0/${postId}/likes`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to like Facebook post: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }

      const result = await response.json()
      
      return {
        success: true,
        output: { success: result.success },
        message: 'Facebook post liked successfully'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to like Facebook post',
        output: { error: error.message }
      }
    }
  }

  async commentOnPost(postId: string, comment: string, userId: string): Promise<SocialResult> {
    try {
      // Use existing Facebook implementation
      const config = {
        pageId: '', // Would need to be provided in params
        postId: postId,
        comment: comment
      }

      const result = await commentOnFacebookPost(config, userId, {})
      
      if (result.success) {
        return {
          success: true,
          output: {
            commentId: result.output.commentId,
            postId: result.output.postId
          },
          message: result.message
        }
      } 
        return {
          success: false,
          error: result.error || 'Failed to comment on Facebook post',
          output: result.output
        }
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to comment on Facebook post',
        output: { error: error.message }
      }
    }
  }

  async getMentions(filters?: MentionFilters, userId?: string): Promise<SocialMention[]> {
    if (!userId) {
      throw new Error('User ID is required for getMentions')
    }

    try {
      // Facebook mentions would require webhook subscriptions or page mention monitoring
      // This is a placeholder implementation
      console.warn('Facebook mentions require webhook setup or specific page access')
      
      return []
    } catch (error: any) {
      console.error('Failed to get Facebook mentions:', error)
      return []
    }
  }

  async getInsights(params: InsightsParams, userId: string): Promise<InsightsResult> {
    try {
      // Use existing Facebook insights implementation
      const config = {
        pageId: params.metadata?.pageId,
        metric: params.metric,
        period: params.period,
        periodCount: params.periodCount
      }

      const result = await getFacebookPageInsights(config, userId, {})
      
      if (result.success) {
        const metrics = result.output.insights?.map((insight: any) => ({
          metric: insight.name,
          value: insight.values?.[0]?.value || 0,
          period: insight.period,
          timestamp: new Date(insight.values?.[0]?.end_time || new Date())
        })) || []

        return {
          success: true,
          output: {
            metrics: metrics,
            pageId: result.output.pageId,
            facebookResponse: result.output.facebookResponse
          },
          message: result.message
        }
      } 
        return {
          success: false,
          error: result.error || 'Failed to get Facebook insights',
          output: result.output
        }
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get Facebook insights',
        output: { error: error.message }
      }
    }
  }

  async sendDirectMessage(params: DirectMessage, userId: string): Promise<SocialResult> {
    try {
      // Use existing Facebook messaging implementation
      const config = {
        pageId: params.metadata?.pageId,
        recipientId: params.recipientId,
        message: params.content
      }

      const result = await sendFacebookMessage(config, userId, {})
      
      if (result.success) {
        return {
          success: true,
          output: {
            messageId: result.output.messageId,
            conversationId: result.output.conversationId,
            recipientId: result.output.recipientId
          },
          message: result.message
        }
      } 
        return {
          success: false,
          error: result.error || 'Failed to send Facebook message',
          output: result.output
        }
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to send Facebook message',
        output: { error: error.message }
      }
    }
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('unauthorized') || message.includes('oauthexception')) {
      return 'authentication'
    }
    if (message.includes('insufficient permissions') || message.includes('permission')) {
      return 'authorization'
    }
    if (message.includes('rate limit') || message.includes('too many calls')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('not found') || message.includes('unsupported get request')) {
      return 'notFound'
    }
    if (message.includes('invalid parameter') || message.includes('malformed')) {
      return 'validation'
    }
    
    return 'unknown'
  }
}