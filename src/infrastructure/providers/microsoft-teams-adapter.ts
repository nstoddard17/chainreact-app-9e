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

export class MicrosoftTeamsAdapter implements ChatProvider {
  readonly providerId = 'microsoft-teams'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    rateLimits: [
      { type: 'requests', limit: 10000, window: 600000 }, // 10,000 requests per 10 minutes
      { type: 'messages', limit: 4000, window: 60000 }    // 4,000 messages per minute
    ],
    supportedFeatures: [
      'send_message',
      'edit_message',
      'delete_message',
      'create_channel',
      'manage_members',
      'get_channels',
      'get_members',
      'create_meeting',
      'file_attachments',
      'adaptive_cards',
      'mentions'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-teams')
      
      // Test Microsoft Graph API access with a simple user info call
      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
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

  async sendMessage(params: ChatMessage, userId: string): Promise<ChatResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-teams')
      
      if (!params.channelId) {
        throw new Error('Channel ID is required for Teams messages')
      }
      
      // Parse channel ID to get team and channel info
      const { teamId, channelId } = this.parseChannelId(params.channelId)
      
      const messagePayload: any = {
        body: {
          contentType: 'html',
          content: params.content
        }
      }
      
      // Add mentions if provided
      if (params.mentions && params.mentions.length > 0) {
        messagePayload.mentions = params.mentions.map((mention, index) => ({
          id: index,
          mentionText: mention,
          mentioned: {
            user: {
              displayName: mention.replace('@', ''),
              userIdentityType: 'aadUser'
            }
          }
        }))
      }
      
      // Add attachments if provided
      if (params.attachments && params.attachments.length > 0) {
        messagePayload.attachments = params.attachments.map(attachment => ({
          id: Math.random().toString(36).substr(2, 9),
          contentType: attachment.contentType,
          name: attachment.filename,
          content: attachment.content.toString('base64')
        }))
      }
      
      const url = `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages`
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(messagePayload)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Microsoft Graph API error: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          messageId: result.id,
          channelId: params.channelId,
          content: params.content,
          timestamp: new Date(result.createdDateTime),
          webUrl: result.webUrl,
          microsoftResponse: result
        },
        message: 'Message sent successfully to Microsoft Teams'
      }
    } catch (error: any) {
      console.error('Microsoft Teams send message error:', error)
      return {
        success: false,
        error: error.message || 'Failed to send message to Microsoft Teams',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async editMessage(messageId: string, content: string, userId: string): Promise<ChatResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-teams')
      
      // Parse message ID to get team, channel, and message info
      const { teamId, channelId, actualMessageId } = this.parseMessageId(messageId)
      
      const updatePayload = {
        body: {
          contentType: 'html',
          content: content
        }
      }
      
      const url = `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages/${actualMessageId}`
      
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updatePayload)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to edit message: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          messageId: result.id,
          content: content,
          timestamp: new Date(result.lastModifiedDateTime),
          microsoftResponse: result
        },
        message: 'Message edited successfully in Microsoft Teams'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to edit message in Microsoft Teams',
        output: { error: error.message }
      }
    }
  }

  async deleteMessage(messageId: string, userId: string): Promise<void> {
    const accessToken = await getDecryptedAccessToken(userId, 'microsoft-teams')
    
    // Parse message ID to get team, channel, and message info
    const { teamId, channelId, actualMessageId } = this.parseMessageId(messageId)
    
    const url = `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages/${actualMessageId}/softDelete`
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })
    
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Failed to delete message: ${response.status} - ${errorData.error?.message || response.statusText}`)
    }
  }

  async createChannel(params: ChannelConfig, userId: string): Promise<ChannelResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-teams')
      
      if (!params.metadata?.teamId) {
        throw new Error('Team ID is required to create a channel in Microsoft Teams')
      }
      
      const channelPayload = {
        displayName: params.name,
        description: params.description || '',
        membershipType: params.private ? 'private' : 'standard'
      }
      
      const url = `https://graph.microsoft.com/v1.0/teams/${params.metadata.teamId}/channels`
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(channelPayload)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to create channel: ${response.status} - ${errorData.error?.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          channelId: `${params.metadata.teamId}:${result.id}`,
          name: result.displayName,
          description: result.description,
          webUrl: result.webUrl,
          microsoftResponse: result
        },
        message: 'Channel created successfully in Microsoft Teams'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create channel in Microsoft Teams',
        output: { error: error.message }
      }
    }
  }

  async manageMembers(operation: MemberOperation, userId: string): Promise<MemberResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-teams')
      
      const { teamId, channelId } = this.parseChannelId(operation.channelId)
      
      const results: any[] = []
      
      for (const memberId of operation.memberIds) {
        let url: string
        let method: string
        let body: any = undefined
        
        switch (operation.type) {
          case 'add':
            url = `https://graph.microsoft.com/v1.0/teams/${teamId}/members`
            method = 'POST'
            body = {
              '@odata.type': '#microsoft.graph.aadUserConversationMember',
              'user@odata.bind': `https://graph.microsoft.com/v1.0/users/${memberId}`,
              roles: operation.permissions?.admin ? ['owner'] : ['member']
            }
            break
          case 'remove':
            url = `https://graph.microsoft.com/v1.0/teams/${teamId}/members/${memberId}`
            method = 'DELETE'
            break
          case 'update':
            url = `https://graph.microsoft.com/v1.0/teams/${teamId}/members/${memberId}`
            method = 'PATCH'
            body = {
              roles: operation.permissions?.admin ? ['owner'] : ['member']
            }
            break
          default:
            throw new Error(`Unsupported member operation: ${operation.type}`)
        }
        
        const response = await fetch(url, {
          method: method,
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: body ? JSON.stringify(body) : undefined
        })
        
        if (response.ok) {
          const result = method !== 'DELETE' ? await response.json() : { id: memberId }
          results.push(result)
        }
      }
      
      return {
        success: true,
        output: {
          operation: operation.type,
          channelId: operation.channelId,
          memberIds: operation.memberIds,
          results: results
        },
        message: `Successfully ${operation.type}ed ${results.length} member(s) in Microsoft Teams`
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to manage members in Microsoft Teams',
        output: { error: error.message }
      }
    }
  }

  async getChannels(filters?: ChannelFilters, userId?: string): Promise<Channel[]> {
    if (!userId) {
      throw new Error('User ID is required for getChannels')
    }

    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-teams')
      
      // First get user's teams
      const teamsResponse = await fetch('https://graph.microsoft.com/v1.0/me/joinedTeams', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!teamsResponse.ok) {
        throw new Error('Failed to get user teams')
      }
      
      const teamsData = await teamsResponse.json()
      const channels: Channel[] = []
      
      // Get channels for each team
      for (const team of teamsData.value || []) {
        try {
          const channelsResponse = await fetch(`https://graph.microsoft.com/v1.0/teams/${team.id}/channels`, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          })
          
          if (channelsResponse.ok) {
            const channelsData = await channelsResponse.json()
            
            for (const channel of channelsData.value || []) {
              // Apply filters
              if (filters?.name && !channel.displayName.toLowerCase().includes(filters.name.toLowerCase())) {
                continue
              }
              if (filters?.private !== undefined && (channel.membershipType === 'private') !== filters.private) {
                continue
              }
              
              channels.push({
                id: `${team.id}:${channel.id}`,
                name: channel.displayName,
                description: channel.description || '',
                private: channel.membershipType === 'private',
                metadata: {
                  teamId: team.id,
                  teamName: team.displayName,
                  channelId: channel.id,
                  webUrl: channel.webUrl
                }
              })
            }
          }
        } catch (error) {
          console.warn(`Failed to get channels for team ${team.id}:`, error)
        }
      }
      
      // Apply limit filter
      if (filters?.limit) {
        return channels.slice(0, filters.limit)
      }
      
      return channels
    } catch (error: any) {
      console.error('Microsoft Teams get channels error:', error)
      return []
    }
  }

  async getMembers(channelId: string, userId: string): Promise<Member[]> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'microsoft-teams')
      
      const { teamId } = this.parseChannelId(channelId)
      
      const response = await fetch(`https://graph.microsoft.com/v1.0/teams/${teamId}/members`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to get team members')
      }
      
      const data = await response.json()
      
      return (data.value || []).map((member: any) => ({
        id: member.id,
        name: member.displayName || 'Unknown User',
        email: member.email || '',
        role: member.roles?.includes('owner') ? 'owner' : 'member',
        joinedAt: member.joinedDateTime ? new Date(member.joinedDateTime) : undefined,
        metadata: {
          userId: member.userId,
          roles: member.roles
        }
      }))
    } catch (error: any) {
      console.error('Microsoft Teams get members error:', error)
      return []
    }
  }

  private parseChannelId(channelId: string): { teamId: string; channelId: string } {
    if (channelId.includes(':')) {
      const [teamId, actualChannelId] = channelId.split(':')
      return { teamId, channelId: actualChannelId }
    }
    
    // If no team ID provided, assume it's a direct channel ID and we need team context
    throw new Error('Channel ID must include team ID in format "teamId:channelId"')
  }

  private parseMessageId(messageId: string): { teamId: string; channelId: string; actualMessageId: string } {
    if (messageId.includes(':')) {
      const parts = messageId.split(':')
      if (parts.length >= 3) {
        return { teamId: parts[0], channelId: parts[1], actualMessageId: parts[2] }
      }
    }
    
    throw new Error('Message ID must include team and channel IDs in format "teamId:channelId:messageId"')
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('unauthorized') || message.includes('invalid_grant')) {
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
    if (message.includes('bad request') || message.includes('invalid')) {
      return 'validation'
    }
    
    return 'unknown'
  }
}