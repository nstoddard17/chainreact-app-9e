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

import { logger } from '@/lib/utils/logger'

export class ZoomAdapter implements ChatProvider {
  readonly providerId = 'zoom'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    rateLimits: [
      { type: 'requests', limit: 10, window: 1000 }, // 10 requests per second
      { type: 'requests', limit: 1000, window: 60000 } // 1000 requests per minute
    ],
    supportedFeatures: [
      'create_meeting',
      'update_meeting',
      'delete_meeting',
      'get_meetings',
      'start_meeting',
      'end_meeting',
      'get_participants',
      'send_chat_message',
      'get_recordings',
      'webinars',
      'breakout_rooms',
      'polling',
      'cloud_storage',
      'analytics',
      'phone_integration'
    ]
  }

  async validateConnection(userId: string): Promise<boolean> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'zoom')
      
      // Test Zoom API access with user info
      const response = await fetch('https://api.zoom.us/v2/users/me', {
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
      const accessToken = await getDecryptedAccessToken(userId, 'zoom')
      
      // In Zoom, channelId is the meeting ID for in-meeting chat
      const messageData = {
        message: params.content,
        to_contact: params.mentions?.[0] || '', // Send to specific participant if mentioned
        to_channel: params.channelId === 'everyone' ? 'everyone' : params.channelId
      }
      
      const response = await fetch(`https://api.zoom.us/v2/meetings/${params.channelId}/events`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          method: 'chat.message_sent',
          params: messageData
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Zoom API error: ${response.status} - ${errorData.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          messageId: `${Date.now()}`, // Zoom doesn't return message ID for in-meeting chat
          meetingId: params.channelId,
          timestamp: new Date(),
          zoomResponse: result
        },
        message: 'Message sent successfully in Zoom meeting'
      }
    } catch (error: any) {
      logger.error('Zoom send message error:', error)
      return {
        success: false,
        error: error.message || 'Failed to send message in Zoom meeting',
        output: { error: error.message, timestamp: new Date().toISOString() }
      }
    }
  }

  async editMessage(messageId: string, content: string, userId: string): Promise<ChatResult> {
    // Zoom doesn't support editing in-meeting chat messages
    throw new Error('Message editing is not supported in Zoom meetings')
  }

  async deleteMessage(messageId: string, userId: string): Promise<void> {
    // Zoom doesn't support deleting in-meeting chat messages
    throw new Error('Message deletion is not supported in Zoom meetings')
  }

  async createChannel(params: ChannelConfig, userId: string): Promise<ChannelResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'zoom')
      
      // Create a Zoom meeting (equivalent to a channel)
      const meetingData = {
        topic: params.name,
        type: 2, // Scheduled meeting
        start_time: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
        duration: 60, // 60 minutes default
        agenda: params.description || '',
        settings: {
          host_video: true,
          participant_video: true,
          cn_meeting: false,
          in_meeting: false,
          join_before_host: false,
          mute_upon_entry: false,
          watermark: false,
          use_pmi: false,
          approval_type: 2,
          audio: 'both',
          auto_recording: 'none',
          enforce_login: false,
          enforce_login_domains: '',
          alternative_hosts: '',
          close_registration: false,
          show_share_button: false,
          allow_multiple_devices: false,
          registrants_confirmation_email: true,
          waiting_room: params.private || false,
          registrants_email_notification: true
        }
      }
      
      const response = await fetch('https://api.zoom.us/v2/users/me/meetings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(meetingData)
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to create meeting: ${response.status} - ${errorData.message || response.statusText}`)
      }
      
      const result = await response.json()
      
      return {
        success: true,
        output: {
          channelId: result.id.toString(),
          name: result.topic,
          meetingId: result.id,
          joinUrl: result.join_url,
          startUrl: result.start_url,
          password: result.password,
          zoomResponse: result
        },
        message: 'Zoom meeting created successfully'
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to create Zoom meeting',
        output: { error: error.message }
      }
    }
  }

  async manageMembers(operation: MemberOperation, userId: string): Promise<MemberResult> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'zoom')
      
      if (operation.type === 'add') {
        // Add participants to meeting (send invitations)
        const results = []
        
        for (const email of operation.memberIds) {
          const registrantData = {
            email: email,
            first_name: 'Participant',
            last_name: ''
          }
          
          const response = await fetch(`https://api.zoom.us/v2/meetings/${operation.channelId}/registrants`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(registrantData)
          })
          
          if (response.ok) {
            const result = await response.json()
            results.push({
              id: result.id,
              name: email,
              email: email,
              role: 'participant',
              metadata: {
                registrantId: result.id,
                joinUrl: result.join_url
              }
            })
          }
        }
        
        return {
          success: true,
          output: {
            members: results,
            addedCount: results.length
          },
          message: `Added ${results.length} participants to Zoom meeting`
        }
      } else if (operation.type === 'remove') {
        // Remove participants (delete registrants)
        const results = []
        
        for (const registrantId of operation.memberIds) {
          const response = await fetch(`https://api.zoom.us/v2/meetings/${operation.channelId}/registrants/${registrantId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          })
          
          if (response.ok) {
            results.push({
              id: registrantId,
              name: 'Removed Participant',
              email: undefined,
              role: 'participant'
            })
          }
        }
        
        return {
          success: true,
          output: {
            members: results,
            removedCount: results.length
          },
          message: `Removed ${results.length} participants from Zoom meeting`
        }
      } 
        throw new Error('Unsupported member operation for Zoom')
      
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to manage members in Zoom meeting',
        output: { error: error.message }
      }
    }
  }

  async getChannels(filters?: ChannelFilters, userId?: string): Promise<Channel[]> {
    if (!userId) {
      throw new Error('User ID is required for getChannels')
    }

    try {
      const accessToken = await getDecryptedAccessToken(userId, 'zoom')
      
      const params = new URLSearchParams()
      params.append('type', 'scheduled') // Get scheduled meetings
      params.append('page_size', (filters?.limit || 30).toString())
      
      const response = await fetch(`https://api.zoom.us/v2/users/me/meetings?${params.toString()}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        throw new Error('Failed to get meetings from Zoom')
      }
      
      const data = await response.json()
      
      return (data.meetings || [])
        .filter((meeting: any) => !filters?.name || meeting.topic.toLowerCase().includes(filters.name.toLowerCase()))
        .map((meeting: any) => ({
          id: meeting.id.toString(),
          name: meeting.topic,
          description: meeting.agenda,
          memberCount: 0, // Zoom doesn't provide participant count in meeting list
          private: meeting.settings?.waiting_room || false,
          metadata: {
            meetingId: meeting.id,
            joinUrl: meeting.join_url,
            startUrl: meeting.start_url,
            password: meeting.password,
            startTime: meeting.start_time,
            duration: meeting.duration,
            status: meeting.status,
            type: meeting.type === 2 ? 'scheduled' : meeting.type === 1 ? 'instant' : 'recurring'
          }
        }))
    } catch (error: any) {
      logger.error('Zoom get channels error:', error)
      return []
    }
  }

  async getMembers(channelId: string, userId: string): Promise<Member[]> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'zoom')
      
      // Get meeting participants (registrants + live participants)
      const [registrantsResponse, participantsResponse] = await Promise.allSettled([
        fetch(`https://api.zoom.us/v2/meetings/${channelId}/registrants`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }),
        fetch(`https://api.zoom.us/v2/meetings/${channelId}/participants`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        })
      ])
      
      const members: Member[] = []
      
      // Add registrants
      if (registrantsResponse.status === 'fulfilled' && registrantsResponse.value.ok) {
        const registrantsData = await registrantsResponse.value.json()
        
        members.push(...(registrantsData.registrants || []).map((registrant: any) => ({
          id: registrant.id,
          name: `${registrant.first_name} ${registrant.last_name}`.trim(),
          email: registrant.email,
          role: 'registrant',
          joinedAt: registrant.create_time ? new Date(registrant.create_time) : undefined,
          metadata: {
            registrantId: registrant.id,
            status: registrant.status,
            joinUrl: registrant.join_url
          }
        })))
      }
      
      // Add live participants (if meeting is active)
      if (participantsResponse.status === 'fulfilled' && participantsResponse.value.ok) {
        const participantsData = await participantsResponse.value.json()
        
        members.push(...(participantsData.participants || []).map((participant: any) => ({
          id: participant.id || participant.user_id,
          name: participant.name || participant.user_name,
          email: participant.email,
          role: participant.role === 1 ? 'host' : 'participant',
          joinedAt: participant.join_time ? new Date(participant.join_time) : undefined,
          metadata: {
            participantId: participant.id,
            userId: participant.user_id,
            status: participant.status,
            duration: participant.duration
          }
        })))
      }
      
      return members
    } catch (error: any) {
      logger.error('Zoom get members error:', error)
      return []
    }
  }

  // Additional Zoom-specific methods

  async startMeeting(meetingId: string, userId: string): Promise<any> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'zoom')
      
      const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'start'
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to start meeting: ${response.status} - ${errorData.message || response.statusText}`)
      }
      
      return {
        success: true,
        message: 'Meeting started successfully'
      }
    } catch (error: any) {
      throw error
    }
  }

  async endMeeting(meetingId: string, userId: string): Promise<any> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'zoom')
      
      const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}/status`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'end'
        })
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to end meeting: ${response.status} - ${errorData.message || response.statusText}`)
      }
      
      return {
        success: true,
        message: 'Meeting ended successfully'
      }
    } catch (error: any) {
      throw error
    }
  }

  async getRecordings(meetingId: string, userId: string): Promise<any> {
    try {
      const accessToken = await getDecryptedAccessToken(userId, 'zoom')
      
      const response = await fetch(`https://api.zoom.us/v2/meetings/${meetingId}/recordings`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(`Failed to get recordings: ${response.status} - ${errorData.message || response.statusText}`)
      }
      
      return response.json()
    } catch (error: any) {
      throw error
    }
  }

  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('invalid access token') || message.includes('unauthorized')) {
      return 'authentication'
    }
    if (message.includes('forbidden') || message.includes('insufficient privileges')) {
      return 'authorization'
    }
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout')) {
      return 'network'
    }
    if (message.includes('not found') || message.includes('meeting not found')) {
      return 'notFound'
    }
    if (message.includes('invalid') || message.includes('bad request')) {
      return 'validation'
    }
    if (message.includes('meeting has ended') || message.includes('meeting not started')) {
      return 'validation'
    }
    if (message.includes('license') || message.includes('plan')) {
      return 'authorization'
    }
    
    return 'unknown'
  }
}