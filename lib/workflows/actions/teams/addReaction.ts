import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/security/encryption'
import { ActionResult } from '../index'
import { logger } from '@/lib/utils/logger'

/**
 * Add an emoji reaction to a Microsoft Teams message
 *
 * API Reference: https://learn.microsoft.com/en-us/graph/api/chatmessage-setreaction
 */
export async function addTeamsReaction(
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
    // Support both messageId (for channel) and chatMessageId (for chat)
    const messageId = input.messageId || config.messageId || input.chatMessageId || config.chatMessageId
    const reactionType = input.reactionType || config.reactionType

    if (!messageType || !reactionType) {
      return {
        success: false,
        error: 'Missing required fields: messageType and reactionType are required'
      }
    }

    if (!messageId) {
      return {
        success: false,
        error: 'Missing required field: messageId (for channel) or chatMessageId (for chat) is required'
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
      endpoint = `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages/${messageId}/setReaction`
    } else {
      endpoint = `https://graph.microsoft.com/v1.0/chats/${chatId}/messages/${messageId}/setReaction`
    }

    // Add the reaction
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reactionType: reactionType
      })
    })

    if (!response.ok) {
      const errorData = await response.json()
      logger.error('[Teams] Failed to add reaction:', errorData)
      return {
        success: false,
        error: `Failed to add reaction: ${errorData.error?.message || response.statusText}`
      }
    }

    return {
      success: true,
      output: {
        success: true,
        messageId,
        reactionType
      }
    }
  } catch (error: any) {
    logger.error('[Teams] Error adding reaction:', error)
    return {
      success: false,
      error: error.message || 'Failed to add Teams reaction'
    }
  }
}
