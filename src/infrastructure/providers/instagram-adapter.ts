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

export class InstagramAdapter implements SocialProvider {
  readonly providerId = 'instagram'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    rateLimits: [
      { type: 'requests', limit: 200, window: 3600000 }, // 200 requests per hour
      { type: 'posts', limit: 25, window: 86400000 }     // 25 posts per day
    ],
    supportedFeatures: [
      'create_post',
      'delete_post',
      'get_insights',
      'get_mentions',
      'send_direct_message',
      'media_upload',
      'story_creation',
      'hashtag_support',
      'caption_editing'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'instagram')
      
      // Test Instagram Graph API access with user account info
      const response = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`)
      
      if (!response.ok) {
        return false
      }
      
      const data = await response.json()
      
      // Check if user has Instagram business accounts
      return data.data && data.data.length > 0
    } catch {
      return false
    }
  }

  async createPost(params: SocialPost, userId: string): Promise<SocialResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'instagram')
      
      // Get Instagram Business Account ID
      const igAccountId = await this.getInstagramBusinessAccountId(accessToken)
      
      if (!igAccountId) {
        throw new Error('No Instagram Business Account found. Please connect an Instagram Business Account.')
      }
      
      let mediaObjectId: string | undefined
      
      // Handle media upload if media files are provided
      if (params.mediaFiles && params.mediaFiles.length > 0) {
        // For simplicity, handle single image upload (Instagram supports multiple images in carousel)
        const mediaFile = params.mediaFiles[0]
        
        // Create media object
        const mediaResponse = await fetch(`https://graph.facebook.com/v18.0/${igAccountId}/media`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            image_url: mediaFile, // Expecting a publicly accessible URL
            caption: this.buildCaption(params),
            access_token: accessToken
          })
        })
        
        if (!mediaResponse.ok) {
          const errorData = await mediaResponse.json().catch(() => ({}))
          throw new Error(`Failed to create media object: ${mediaResponse.status} - ${errorData.error?.message || mediaResponse.statusText}`)
        }
        
        const mediaResult = await mediaResponse.json()
        mediaObjectId = mediaResult.id
      } else {
        // Text-only post (story or no media)
        throw new Error('Instagram requires media (image or video) for feed posts. Text-only posts are not supported.')
      }
      
      // Publish the media object
      const publishResponse = await fetch(`https://graph.facebook.com/v18.0/${igAccountId}/media_publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          creation_id: mediaObjectId,
          access_token: accessToken
        })
      })
      
      if (!publishResponse.ok) {
        const errorData = await publishResponse.json().catch(() => ({}))
        throw new Error(`Failed to publish post: ${publishResponse.status} - ${errorData.error?.message || publishResponse.statusText}`)
      }
      
      const publishResult = await publishResponse.json()
      
      return {
        success: true,
        output: {
          postId: publishResult.id,
          mediaId: mediaObjectId,
          caption: this.buildCaption(params),
          timestamp: new Date().toISOString(),
          instagramResponse: publishResult
        },
        message: 'Instagram post created successfully'
      }
    } catch (error: any) {
      console.error('Instagram create post error:', error)
      return {
        success: false,
        error: error.message || 'Failed to create Instagram post',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async deletePost(postId: string, userId: string): Promise<void> {
    const accessToken = await getDecryptedAccessToken(userId, 'instagram')
    
    // Delete Instagram media
    const response = await fetch(`https://graph.facebook.com/v18.0/${postId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        access_token: accessToken
      })
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to delete Instagram post: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }
  }

  async likePost(postId: string, userId: string): Promise<SocialResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'instagram')
      
      // Instagram Graph API doesn't support liking posts programmatically
      // This is a limitation of the Instagram Business API
      throw new Error('Liking posts programmatically is not supported by Instagram Business API')
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to like Instagram post',
        output: { error: error.message }
      }
    }
  }

  async commentOnPost(postId: string, comment: string, userId: string): Promise<SocialResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'instagram')
      
      const response = await fetch(`https://graph.facebook.com/v18.0/${postId}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: comment,
          access_token: accessToken
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to comment on Instagram post: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          commentId: result.id,
          postId: postId,
          comment: comment,
          timestamp: new Date().toISOString(),
          instagramResponse: result
        },
        message: 'Comment added successfully to Instagram post'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to comment on Instagram post',
        output: { error: error.message }
      }
    }
  }

  async getMentions(filters?: MentionFilters, userId?: string): Promise<SocialMention[]> {
    if (!userId) {
      throw new Error('User ID is required for getMentions')
    }

    try {
      const accessToken = await getDecryptedAccessToken(userId, 'instagram')
      const igAccountId = await this.getInstagramBusinessAccountId(accessToken)
      
      if (!igAccountId) {
        return []
      }
      
      // Get mentions from comments and @mentions
      let url = `https://graph.facebook.com/v18.0/${igAccountId}/media`
      const params = new URLSearchParams({
        fields: 'id,caption,comments{id,text,username,timestamp},timestamp',
        access_token: accessToken
      })
      
      if (filters?.limit) {
        params.append('limit', filters.limit.toString())
      }
      
      url += `?${params.toString()}`
      
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error('Failed to get Instagram mentions')
      }
      
      const data = await response.json()
      const mentions: SocialMention[] = []
      
      // Process comments for mentions
      for (const post of data.data || []) {
        if (post.comments?.data) {
          for (const comment of post.comments.data) {
            // Simple mention detection (contains @)
            if (comment.text && comment.text.includes('@')) {
              mentions.push({
                id: comment.id,
                content: comment.text,
                author: comment.username || 'Unknown',
                timestamp: new Date(comment.timestamp),
                platform: 'instagram',
                url: `https://www.instagram.com/p/${post.id}/`
              })
            }
          }
        }
      }
      
      // Apply date filters if provided
      if (filters?.dateRange) {
        return mentions.filter(mention => 
          mention.timestamp >= filters.dateRange!.start && 
          mention.timestamp <= filters.dateRange!.end
        )
      }
      
      return mentions
    } catch (error: any) {
      console.error('Instagram get mentions error:', error)
      return []
    }
  }

  async getInsights(params: InsightsParams, userId: string): Promise<InsightsResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'instagram')
      const igAccountId = await this.getInstagramBusinessAccountId(accessToken)
      
      if (!igAccountId) {
        throw new Error('No Instagram Business Account found')
      }
      
      // Get account insights
      const metricsMap: Record<string, string> = {
        'followers': 'follower_count',
        'impressions': 'impressions',
        'reach': 'reach',
        'profile_views': 'profile_views',
        'website_clicks': 'website_clicks'
      }
      
      const metric = metricsMap[params.metric] || params.metric
      
      const response = await fetch(
        `https://graph.facebook.com/v18.0/${igAccountId}/insights?metric=${metric}&period=${params.period}&access_token=${accessToken}`
      )
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to get Instagram insights: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      const data = await response.json()
      
      const metrics = (data.data || []).map((insight: any) => ({
        metric: insight.name,
        value: insight.values?.[0]?.value || 0,
        period: insight.period,
        timestamp: new Date(insight.values?.[0]?.end_time || new Date())
      }))
      
      return {
        success: true,
        output: {
          metrics: metrics,
          period: params.period,
          instagramResponse: data
        },
        message: 'Instagram insights retrieved successfully'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get Instagram insights',
        output: { error: error.message }
      }
    }
  }

  async sendDirectMessage(params: DirectMessage, userId: string): Promise<SocialResult> {
    try {
      // Instagram Graph API has limited direct messaging capabilities
      // This feature requires Instagram Messaging API which has strict approval requirements
      throw new Error('Instagram direct messaging requires special API approval and is not available in this integration')
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to send Instagram direct message',
        output: { error: error.message }
      }
    }
  }

  private async getInstagramBusinessAccountId(accessToken: string): Promise<string | null> {
    try {
      // Get Facebook pages
      const pagesResponse = await fetch(`https://graph.facebook.com/v18.0/me/accounts?access_token=${accessToken}`)
      
      if (!pagesResponse.ok) {
        return null
      }
      
      const pagesData = await pagesResponse.json()
      
      // Find Instagram Business Account for each page
      for (const page of pagesData.data || []) {
        const igResponse = await fetch(
          `https://graph.facebook.com/v18.0/${page.id}?fields=instagram_business_account&access_token=${accessToken}`
        )
        
        if (igResponse.ok) {
          const igData = await igResponse.json()
          if (igData.instagram_business_account) {
            return igData.instagram_business_account.id
          }
        }
      }
      
      return null
    } catch {
      return null
    }
  }

  private buildCaption(params: SocialPost): string {
    let caption = params.content
    
    // Add hashtags
    if (params.hashtags && params.hashtags.length > 0) {
      const hashtagsText = params.hashtags.map(tag => tag.startsWith('#') ? tag : `#${tag}`).join(' ')
      caption = `${caption}\n\n${hashtagsText}`
    }
    
    // Add mentions
    if (params.mentions && params.mentions.length > 0) {
      const mentionsText = params.mentions.map(mention => mention.startsWith('@') ? mention : `@${mention}`).join(' ')
      caption = `${caption}\n${mentionsText}`
    }
    
    return caption
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('invalid_token') || message.includes('token has expired')) {
      return 'authentication'
    }
    if (message.includes('insufficient privileges') || message.includes('permission')) {
      return 'authorization'
    }
    if (message.includes('rate limit') || message.includes('api limit')) {
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
    if (message.includes('media') || message.includes('upload')) {
      return 'validation'
    }
    
    return 'unknown'
  }
}