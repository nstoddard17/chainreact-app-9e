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
 * Send initial HITL message to Discord and create a thread for the conversation
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
    // HITL uses the bot to send messages and create threads, not user's OAuth token
    const botToken = process.env.DISCORD_BOT_TOKEN

    if (!botToken) {
      throw new Error('Discord bot token not configured in environment variables')
    }

    // Send the initial message
    const messageResponse = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: message,
          embeds: [{
            title: '💬 Workflow Waiting for Input',
            description: 'This workflow needs your input to continue. Respond in this thread to have a conversation with the AI assistant.',
            color: 0x5865F2, // Discord blurple
            footer: {
              text: `Conversation ID: ${conversationId.substring(0, 8)}`
            }
          }]
        })
      }
    )

    if (!messageResponse.ok) {
      const error = await messageResponse.text()
      throw new Error(`Discord API error: ${messageResponse.status} - ${error}`)
    }

    const messageData = await messageResponse.json()

    // Create a thread for the conversation
    const threadResponse = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages/${messageData.id}/threads`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bot ${botToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: `Workflow Discussion - ${new Date().toLocaleString()}`,
          auto_archive_duration: 60 // Archive after 1 hour of inactivity
        })
      }
    )

    if (!threadResponse.ok) {
      const error = await threadResponse.text()
      logger.warn('Failed to create Discord thread', { error })
      // Thread creation failed, but message was sent - continue anyway
      return {
        success: true,
        messageId: messageData.id,
        channelId: channelId
      }
    }

    const threadData = await threadResponse.json()

    logger.info('HITL Discord message sent with thread', {
      messageId: messageData.id,
      threadId: threadData.id,
      conversationId
    })

    return {
      success: true,
      messageId: messageData.id,
      threadId: threadData.id,
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
 * Send a follow-up message in the Discord thread
 */
export async function sendDiscordThreadMessage(
  userId: string,
  threadId: string,
  message: string
): Promise<boolean> {
  try {
    // Get Discord bot token from environment variables
    const botToken = process.env.DISCORD_BOT_TOKEN

    if (!botToken) {
      throw new Error('Discord bot token not configured in environment variables')
    }

    const response = await fetch(
      `https://discord.com/api/v10/channels/${threadId}/messages`,
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
    logger.error('Error sending Discord thread message', { error: error.message })
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
