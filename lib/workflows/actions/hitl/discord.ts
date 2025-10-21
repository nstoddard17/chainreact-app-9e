/**
 * Discord Integration for HITL
 * Handles sending messages and creating threads for conversations
 */

import { getDecryptedAccessToken } from '../core/getDecryptedAccessToken'
import { logger } from '@/lib/utils/logger'

export interface DiscordMessageResult {
  success: boolean
  messageId?: string
  threadId?: string
  channelId?: string
  error?: string
}

/**
 * Send initial HITL message to Discord as a direct channel message (no thread)
 */
export async function sendDiscordHITLMessage(
  userId: string,
  guildId: string,
  channelId: string,
  message: string,
  conversationId: string
): Promise<DiscordMessageResult> {
  try {
    // Get Discord bot token from environment variables
    // HITL uses the bot to send messages directly in the channel
    const botToken = process.env.DISCORD_BOT_TOKEN

    if (!botToken) {
      throw new Error('Discord bot token not configured in environment variables')
    }

    // Send the initial message directly to the channel (no thread)
    const messageResponse = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: message
        })
      }
    )

    if (!messageResponse.ok) {
      const error = await messageResponse.text()
      throw new Error(`Discord API error: ${messageResponse.status} - ${error}`)
    }

    const messageData = await messageResponse.json()

    logger.info('HITL Discord message sent to channel', {
      messageId: messageData.id,
      channelId: channelId,
      conversationId
    })

    return {
      success: true,
      messageId: messageData.id,
      channelId: channelId
    }

  } catch (error: any) {
    logger.error('Error sending HITL Discord message', { error: error.message })
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * Send a follow-up message in the Discord channel
 */
export async function sendDiscordThreadMessage(
  userId: string,
  channelId: string,
  message: string
): Promise<boolean> {
  try {
    // Get Discord bot token from environment variables
    const botToken = process.env.DISCORD_BOT_TOKEN

    if (!botToken) {
      throw new Error('Discord bot token not configured in environment variables')
    }

    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: message
        })
      }
    )

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Discord API error: ${response.status} - ${error}`)
    }

    return true

  } catch (error: any) {
    logger.error('Error sending Discord channel message', { error: error.message })
    return false
  }
}

/**
 * Parse Discord message content from webhook payload
 */
export function parseDiscordMessage(payload: any): {
  content: string
  authorId: string
  authorName: string
  channelId: string
  messageId: string
} {
  return {
    content: payload.content || '',
    authorId: payload.author?.id || '',
    authorName: payload.author?.username || 'Unknown',
    channelId: payload.channel_id || '',
    messageId: payload.id || ''
  }
}
