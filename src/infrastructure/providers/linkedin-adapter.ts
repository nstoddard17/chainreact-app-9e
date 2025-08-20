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
import { getDecryptedAccessToken } from '../../../lib/workflows/actions/core/getDecryptedAccessToken'

export class LinkedInAdapter implements SocialProvider {
  readonly providerId = 'linkedin'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    rateLimits: [
      { type: 'requests', limit: 500, window: 3600000 }, // 500 requests per hour
      { type: 'posts', limit: 100, window: 86400000 }    // 100 posts per day
    ],
    supportedFeatures: [
      'create_post',
      'delete_post',
      'get_insights',
      'send_direct_message',
      'share_content',
      'company_pages',
      'profile_management',
      'connection_management'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'linkedin')
      
      // Test LinkedIn API access with profile info
      const response = await fetch('https://api.linkedin.com/v2/people/~', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      return response.ok
    } catch {
      return false
    }
  }

  async createPost(params: SocialPost, userId: string): Promise<SocialResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'linkedin')
      
      // Get person URN for the authenticated user
      const profileResponse = await fetch('https://api.linkedin.com/v2/people/~', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!profileResponse.ok) {
        throw new Error('Failed to get LinkedIn profile information')
      }
      
      const profile = await profileResponse.json()
      const authorUrn = profile.id
      
      // Build post content
      const postContent = this.buildPostContent(params)
      
      let sharePayload: any = {
        author: `urn:li:person:${authorUrn}`,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: {
              text: postContent
            },
            shareMediaCategory: 'NONE'
          }
        },
        visibility: {
          'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
      }
      
      // Handle media uploads if provided
      if (params.mediaFiles && params.mediaFiles.length > 0) {
        // LinkedIn supports images and articles
        const mediaFile = params.mediaFiles[0]
        
        // For simplicity, treat as article share (would need media upload for images)
        sharePayload.specificContent['com.linkedin.ugc.ShareContent'].shareMediaCategory = 'ARTICLE'
        sharePayload.specificContent['com.linkedin.ugc.ShareContent'].media = [{
          status: 'READY',
          description: {
            text: params.content
          },
          originalUrl: mediaFile, // Expecting a URL
          title: {
            text: this.extractTitle(params.content)
          }
        }]
      }
      
      const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        },
        body: JSON.stringify(sharePayload)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`LinkedIn API error: ${response.status} - ${errorData.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          postId: result.id,
          authorUrn: `urn:li:person:${authorUrn}`,
          content: postContent,
          timestamp: new Date().toISOString(),
          linkedinResponse: result
        },
        message: 'LinkedIn post created successfully'
      }
    } catch (error: any) {
      console.error('LinkedIn create post error:', error)
      return {
        success: false,
        error: error.message || 'Failed to create LinkedIn post',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async deletePost(postId: string, userId: string): Promise<void> {
    const accessToken = await getDecryptedAccessToken(userId, 'linkedin')
    
    // LinkedIn doesn't provide a direct delete API for UGC posts
    // This is a limitation of the LinkedIn API
    throw new Error('Deleting posts is not supported by LinkedIn API for UGC posts')
  }

  async likePost(postId: string, userId: string): Promise<SocialResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'linkedin')
      
      // Get person URN for the authenticated user
      const profileResponse = await fetch('https://api.linkedin.com/v2/people/~', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!profileResponse.ok) {
        throw new Error('Failed to get LinkedIn profile information')
      }
      
      const profile = await profileResponse.json()
      const actorUrn = profile.id
      
      const likePayload = {
        actor: `urn:li:person:${actorUrn}`,
        object: postId.startsWith('urn:') ? postId : `urn:li:ugcPost:${postId}`
      }
      
      const response = await fetch('https://api.linkedin.com/v2/reactions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        },
        body: JSON.stringify(likePayload)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to like LinkedIn post: ${response.status} - ${errorData.message || response.statusText}`)
      }
      
      return {
        success: true,
        output: {
          postId: postId,
          action: 'liked',
          timestamp: new Date().toISOString()
        },
        message: 'LinkedIn post liked successfully'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to like LinkedIn post',
        output: { error: error.message }
      }
    }
  }

  async commentOnPost(postId: string, comment: string, userId: string): Promise<SocialResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'linkedin')
      
      // Get person URN for the authenticated user
      const profileResponse = await fetch('https://api.linkedin.com/v2/people/~', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!profileResponse.ok) {
        throw new Error('Failed to get LinkedIn profile information')
      }
      
      const profile = await profileResponse.json()
      const actorUrn = profile.id
      
      const commentPayload = {
        actor: `urn:li:person:${actorUrn}`,
        object: postId.startsWith('urn:') ? postId : `urn:li:ugcPost:${postId}`,
        message: {
          text: comment
        }
      }
      
      const response = await fetch('https://api.linkedin.com/v2/socialActions/comments', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        },
        body: JSON.stringify(commentPayload)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to comment on LinkedIn post: ${response.status} - ${errorData.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          commentId: result.id,
          postId: postId,
          comment: comment,
          timestamp: new Date().toISOString(),
          linkedinResponse: result
        },
        message: 'Comment added successfully to LinkedIn post'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to comment on LinkedIn post',
        output: { error: error.message }
      }
    }
  }

  async getMentions(filters?: MentionFilters, userId?: string): Promise<SocialMention[]> {
    if (!userId) {
      throw new Error('User ID is required for getMentions')
    }

    try {
      // LinkedIn API doesn't provide a direct mentions endpoint
      // This would require webhook integration or periodic polling of notifications
      console.warn('LinkedIn mentions require webhook integration for real-time data')
      return []
    } catch (error: any) {
      console.error('LinkedIn get mentions error:', error)
      return []
    }
  }

  async getInsights(params: InsightsParams, userId: string): Promise<InsightsResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'linkedin')
      
      // LinkedIn insights are available for Company Pages, not personal profiles
      // For personal profiles, limited analytics are available
      
      const response = await fetch('https://api.linkedin.com/v2/people/~', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to get LinkedIn profile information')
      }
      
      const profile = await response.json()
      
      // Return basic profile metrics
      const metrics = [{
        metric: 'profile_views',
        value: 0, // LinkedIn doesn't provide view counts via API for personal profiles
        period: params.period,
        timestamp: new Date()
      }]
      
      return {
        success: true,
        output: {
          metrics: metrics,
          period: params.period,
          note: 'LinkedIn personal profile insights are limited. Company page insights require additional permissions.',
          linkedinResponse: profile
        },
        message: 'LinkedIn basic insights retrieved (limited data available)'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get LinkedIn insights',
        output: { error: error.message }
      }
    }
  }

  async sendDirectMessage(params: DirectMessage, userId: string): Promise<SocialResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'linkedin')
      
      // Get person URN for the authenticated user
      const profileResponse = await fetch('https://api.linkedin.com/v2/people/~', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!profileResponse.ok) {
        throw new Error('Failed to get LinkedIn profile information')
      }
      
      const profile = await profileResponse.json()
      const senderUrn = profile.id
      
      // Create conversation if needed and send message
      const messagePayload = {
        recipients: [params.recipientId.startsWith('urn:') ? params.recipientId : `urn:li:person:${params.recipientId}`],
        message: {
          text: params.content
        }
      }
      
      const response = await fetch('https://api.linkedin.com/v2/messaging/conversations', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0'
        },
        body: JSON.stringify(messagePayload)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to send LinkedIn message: ${response.status} - ${errorData.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          conversationId: result.id,
          recipientId: params.recipientId,
          content: params.content,
          timestamp: new Date().toISOString(),
          linkedinResponse: result
        },
        message: 'LinkedIn direct message sent successfully'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to send LinkedIn direct message',
        output: { error: error.message }
      }
    }
  }

  private buildPostContent(params: SocialPost): string {
    let content = params.content
    
    // Add hashtags
    if (params.hashtags && params.hashtags.length > 0) {
      const hashtagsText = params.hashtags.map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ')
      content = `${content}\n\n${hashtagsText}`
    }
    
    // Add mentions
    if (params.mentions && params.mentions.length > 0) {
      // LinkedIn mentions use @[Name](profile-url) format
      const mentionsText = params.mentions.map(mention => 
        mention.startsWith('@') ? mention : `@${mention}`
      ).join(' ')
      content = `${content}\n${mentionsText}`
    }
    
    return content
  }

  private extractTitle(content: string): string {
    // Extract title from content (first line or first 50 characters)
    const firstLine = content.split('\n')[0]
    return firstLine.length > 50 ? firstLine.substring(0, 47) + '...' : firstLine
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('unauthorized') || message.includes('invalid_token')) {
      return 'authentication'
    }
    if (message.includes('forbidden') || message.includes('insufficient privileges')) {
      return 'authorization'
    }
    if (message.includes('throttled') || message.includes('rate limit')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('not found') || message.includes('does not exist')) {
      return 'notFound'
    }
    if (message.includes('invalid') || message.includes('bad request')) {
      return 'validation'
    }
    if (message.includes('quota') || message.includes('limit')) {
      return 'quota'
    }
    
    return 'unknown'
  }
}