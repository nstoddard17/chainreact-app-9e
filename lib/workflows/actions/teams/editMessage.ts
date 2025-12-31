import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/security/encryption'
import { ActionResult } from '../index'
import { logger } from '@/lib/utils/logger'

/**
 * Edit an existing message in a Microsoft Teams channel or chat
 *
 * API Reference: https://learn.microsoft.com/en-us/graph/api/chatmessage-update
 */
export async function editTeamsMessage(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Support both config and input for field values
    const messageType = input.messageType || config.messageType
    const teamId = input.teamId || config.teamId
    const channelId = input.channelId || config.channelId
    const chatId = input.chatId || config.chatId
    const messageId = input.messageId || config.messageId
    const newContent = input.newContent || config.newContent

    if (!messageType || !messageId || !newContent) {
      return {
        success: false,
        error: 'Missing required fields: messageType, messageId, and newContent are required'
      }
    }

    if (messageType === 'channel' && (!teamId || !channelId)) {
      return {
        success: false,
        error: 'teamId and channelId are required for channel messages'
      }
    }

    if (messageType === 'chat' && !chatId) {
      return {
        success: false,
        error: 'chatId is required for chat messages'
      }
    }

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
      return {
        success: false,
        error: 'Teams integration not found or not connected'
      }
    }

    const accessToken = await decrypt(integration.access_token)

    // Construct API endpoint based on message type
    let endpoint: string
    if (messageType === 'channel') {
      endpoint = `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages/${messageId}`
    } else {
      endpoint = `https://graph.microsoft.com/v1.0/chats/${chatId}/messages/${messageId}`
    }

    // Update the message
    const response = await fetch(endpoint, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        body: {
          content: newContent
        }
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      logger.error('[Teams] Failed to edit message:', errorData)
      return {
        success: false,
        error: `Failed to edit message: ${errorData.error?.message || response.statusText}`
      }
    }

    const updatedMessage = await response.json()

    return {
      success: true,
      output: {
        messageId: updatedMessage.id,
        updatedDateTime: updatedMessage.lastModifiedDateTime,
        success: true
      }
    }
  } catch (error: any) {
    logger.error('[Teams] Error editing message:', error)
    return {
      success: false,
      error: error.message || 'Failed to edit Teams message'
    }
  }
}
