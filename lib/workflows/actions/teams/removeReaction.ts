import { createAdminClient } from '@/lib/supabase/admin'
import { decrypt } from '@/lib/security/encryption'
import { ActionResult } from '../index'
import { logger } from '@/lib/utils/logger'

/**
 * Remove an emoji reaction from a Microsoft Teams message
 *
 * API Reference: https://learn.microsoft.com/en-us/graph/api/chatmessage-unsetreaction
 */
export async function removeTeamsReaction(
  config: Record<string, any>,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const { messageType, teamId, channelId, chatId, messageId, reactionType } = input

    if (!messageType || !messageId || !reactionType) {
      return {
        success: false,
        error: 'Missing required fields: messageType, messageId, and reactionType are required'
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
      endpoint = `https://graph.microsoft.com/v1.0/teams/${teamId}/channels/${channelId}/messages/${messageId}/unsetReaction`
    } else {
      endpoint = `https://graph.microsoft.com/v1.0/chats/${chatId}/messages/${messageId}/unsetReaction`
    }

    // Remove the reaction
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
      logger.error('[Teams] Failed to remove reaction:', errorData)
      return {
        success: false,
        error: `Failed to remove reaction: ${errorData.error?.message || response.statusText}`
      }
    }

    return {
      success: true,
      data: {
        success: true,
        messageId
      }
    }
  } catch (error: any) {
    logger.error('[Teams] Error removing reaction:', error)
    return {
      success: false,
      error: error.message || 'Failed to remove Teams reaction'
    }
  }
}
