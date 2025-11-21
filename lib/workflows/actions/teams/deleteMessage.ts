import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/security/encryption'
import { ActionResult } from '../index'
import { logger } from '@/lib/utils/logger'

/**
 * Delete a message from a Microsoft Teams channel or chat
 *
 * API Reference: https://learn.microsoft.com/en-us/graph/api/chatmessage-softdelete
 */
export async function deleteTeamsMessage(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const { messageType, teamId, channelId, chatId, messageId } = input

    if (!messageType || !messageId) {
      return {
        success: false,
        error: 'Missing required fields: messageType and messageId are required'
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
      endpoint = `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages/${messageId}/softDelete`
    } else {
      endpoint = `https://graph.microsoft.com/v1.0/chats/${chatId}/messages/${messageId}/softDelete`
    }

    // Delete the message (soft delete)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      const errorData = await response.json()
      logger.error('[Teams] Failed to delete message:', errorData)
      return {
        success: false,
        error: `Failed to delete message: ${errorData.error?.message || response.statusText}`
      }
    }

    return {
      success: true,
      data: {
        success: true,
        deletedMessageId: messageId
      }
    }
  } catch (error: any) {
    logger.error('[Teams] Error deleting message:', error)
    return {
      success: false,
      error: error.message || 'Failed to delete Teams message'
    }
  }
}
