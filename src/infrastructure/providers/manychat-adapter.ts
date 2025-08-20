import { 
  ChatProvider, 
  ChatMessage, 
  ChatResult, 
  ChannelConfig, 
  ChannelResult, 
  MemberOperation, 
  MemberResult, 
  Channel, 
  Member, 
  ChannelFilters 
} from '../../domains/integrations/ports/capability-interfaces'
import { CapabilityDescriptor, ErrorClassification } from '../../domains/integrations/ports/connector-contract'
import { getDecryptedAccessToken } from '../../../lib/workflows/actions/core/getDecryptedAccessToken'

export class ManyChatAdapter implements ChatProvider {
  readonly providerId = 'manychat'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    rateLimits: [
      { type: 'requests', limit: 1, window: 1000 },     // 1 request per second (conservative)
      { type: 'requests', limit: 100, window: 60000 }   // 100 requests per minute
    ],
    supportedFeatures: [
      'send_message',
      'send_content',
      'get_subscriber',
      'create_subscriber',
      'add_tag',
      'remove_tag',
      'set_custom_field',
      'get_custom_fields',
      'send_flow',
      'subscriber_info',
      'broadcasting',
      'sequences',
      'growth_tools'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const credentials = await this.getManyChatCredentials(userId)
      
      // Test ManyChat API access with page info
      const response = await fetch(`https://api.manychat.com/fb/page/getInfo`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          page_id: credentials.pageId
        })
      })
      
      return response.ok
    } catch {
      return false
    }
  }

  async sendMessage(params: ChatMessage, userId: string): Promise<ChatResult> {
    try {
      const credentials = await this.getManyChatCredentials(userId)
      
      // In ManyChat, channelId is the subscriber_id
      const messageData = {
        subscriber_id: params.channelId,
        data: {
          version: 'v2',
          content: {
            messages: [
              {
                type: 'text',
                text: params.content
              }
            ]
          }
        }
      }
      
      // Add attachments if provided
      if (params.attachments && params.attachments.length > 0) {
        const attachmentMessages = params.attachments.map(attachment => {
          if (attachment.contentType.startsWith('image/')) {
            return {
              type: 'image',
              url: attachment.content.toString() // Assume content is URL for ManyChat
            }
          } else if (attachment.contentType.startsWith('video/')) {
            return {
              type: 'video',
              url: attachment.content.toString()
            }
          } else {
            return {
              type: 'file',
              url: attachment.content.toString()
            }
          }
        })
        
        messageData.data.content.messages.push(...attachmentMessages)
      }
      
      const response = await fetch('https://api.manychat.com/fb/sending/sendContent', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(messageData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`ManyChat API error: ${response.status} - ${errorData.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          messageId: `${Date.now()}`, // ManyChat doesn't return message ID
          subscriberId: params.channelId,
          timestamp: new Date(),
          manyChatResponse: result
        },
        message: 'Message sent successfully via ManyChat'
      }
    } catch (error: any) {
      console.error('ManyChat send message error:', error)
      return {
        success: false,
        error: error.message || 'Failed to send message via ManyChat',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async editMessage(messageId: string, content: string, userId: string): Promise<ChatResult> {
    // ManyChat doesn't support editing messages
    throw new Error('Message editing is not supported in ManyChat')
  }

  async deleteMessage(messageId: string, userId: string): Promise<void> {
    // ManyChat doesn't support deleting messages
    throw new Error('Message deletion is not supported in ManyChat')
  }

  async createChannel(params: ChannelConfig, userId: string): Promise<ChannelResult> {
    try {
      const credentials = await this.getManyChatCredentials(userId)
      
      // In ManyChat, we create a tag instead of a channel for organization
      const tagData = {
        tag_name: params.name,
        description: params.description
      }
      
      const response = await fetch('https://api.manychat.com/fb/page/createTag', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(tagData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to create tag: ${response.status} - ${errorData.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          channelId: result.tag_id?.toString() || `tag_${Date.now()}`,
          name: params.name,
          tagId: result.tag_id,
          manyChatResponse: result
        },
        message: 'Tag created successfully in ManyChat'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create tag in ManyChat',
        output: { error: error.message }
      }
    }
  }

  async manageMembers(operation: MemberOperation, userId: string): Promise<MemberResult> {
    try {
      const credentials = await this.getManyChatCredentials(userId)
      
      if (operation.type === 'add') {
        // Add tag to subscribers
        const results = []
        
        for (const memberId of operation.memberIds) {
          const tagData = {
            subscriber_id: memberId,
            tag_id: parseInt(operation.channelId)
          }
          
          const response = await fetch('https://api.manychat.com/fb/subscriber/addTag', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${credentials.accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(tagData)
          })
          
          if (response.ok) {
            results.push({
              id: memberId,
              name: 'Unknown', // ManyChat doesn't return name in tag operations
              email: undefined,
              role: 'subscriber'
            })
          }
        }
        
        return {
          success: true,
          output: {
            members: results,
            addedCount: results.length
          },
          message: `Tagged ${results.length} subscribers in ManyChat`
        }
      } else if (operation.type === 'remove') {
        // Remove tag from subscribers
        const results = []
        
        for (const memberId of operation.memberIds) {
          const tagData = {
            subscriber_id: memberId,
            tag_id: parseInt(operation.channelId)
          }
          
          const response = await fetch('https://api.manychat.com/fb/subscriber/removeTag', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${credentials.accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(tagData)
          })
          
          if (response.ok) {
            results.push({
              id: memberId,
              name: 'Unknown',
              email: undefined,
              role: 'subscriber'
            })
          }
        }
        
        return {
          success: true,
          output: {
            members: results,
            removedCount: results.length
          },
          message: `Removed tag from ${results.length} subscribers in ManyChat`
        }
      } else {
        throw new Error('Unsupported member operation for ManyChat')
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to manage members in ManyChat',
        output: { error: error.message }
      }
    }
  }

  async getChannels(filters?: ChannelFilters, userId?: string): Promise<Channel[]> {
    if (!userId) {
      throw new Error('User ID is required for getChannels')
    }

    try {
      const credentials = await this.getManyChatCredentials(userId)
      
      // Get tags (ManyChat equivalent of channels)
      const response = await fetch('https://api.manychat.com/fb/page/getTags', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to get tags from ManyChat')
      }
      
      const data = await response.json()
      
      return (data.data || [])
        .filter((tag: any) => !filters?.name || tag.name.toLowerCase().includes(filters.name.toLowerCase()))
        .slice(0, filters?.limit || 100)
        .map((tag: any) => ({
          id: tag.id?.toString() || tag.tag_id?.toString(),
          name: tag.name || tag.tag_name,
          description: tag.description,
          memberCount: 0, // ManyChat doesn't provide subscriber count in tag list
          private: false,
          metadata: {
            tagId: tag.id || tag.tag_id,
            type: 'tag'
          }
        }))
    } catch (error: any) {
      console.error('ManyChat get channels error:', error)
      return []
    }
  }

  async getMembers(channelId: string, userId: string): Promise<Member[]> {
    try {
      const credentials = await this.getManyChatCredentials(userId)
      
      // Get subscribers with specific tag
      const response = await fetch('https://api.manychat.com/fb/subscriber/findByTag', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${credentials.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tag_id: parseInt(channelId)
        })
      })
      
      if (!response.ok) {
        throw new Error('Failed to get subscribers from ManyChat')
      }
      
      const data = await response.json()
      
      return (data.data || []).map((subscriber: any) => ({
        id: subscriber.id?.toString(),
        name: `${subscriber.first_name || ''} ${subscriber.last_name || ''}`.trim() || 'Unknown',
        email: subscriber.email,
        role: 'subscriber',
        joinedAt: subscriber.subscribed_at ? new Date(subscriber.subscribed_at) : undefined,
        metadata: {
          subscriberId: subscriber.id,
          profilePic: subscriber.profile_pic,
          timezone: subscriber.timezone,
          lastInteraction: subscriber.last_interaction_at
        }
      }))
    } catch (error: any) {
      console.error('ManyChat get members error:', error)
      return []
    }
  }

  private async getManyChatCredentials(userId: string): Promise<{ accessToken: string; pageId: string }> {
    // Get access token which should contain both access token and page ID
    const accessToken = await getDecryptedAccessToken(userId, 'manychat')
    
    // Handle different credential formats
    try {
      const credentials = JSON.parse(accessToken)
      return {
        accessToken: credentials.accessToken || credentials.access_token,
        pageId: credentials.pageId || credentials.page_id
      }
    } catch {
      // Fallback: assume the token contains accessToken|pageId format
      const parts = accessToken.split('|')
      if (parts.length === 2) {
        return {
          accessToken: parts[0],
          pageId: parts[1]
        }
      }
      
      throw new Error('Invalid ManyChat credentials format. Expected JSON or accessToken|pageId format.')
    }
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('invalid access token') || message.includes('unauthorized')) {
      return 'authentication'
    }
    if (message.includes('forbidden') || message.includes('insufficient permissions')) {
      return 'authorization'
    }
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('not found') || message.includes('subscriber not found')) {
      return 'notFound'
    }
    if (message.includes('invalid') || message.includes('bad request')) {
      return 'validation'
    }
    if (message.includes('subscriber limit') || message.includes('quota exceeded')) {
      return 'authorization'
    }
    
    return 'unknown'
  }
}