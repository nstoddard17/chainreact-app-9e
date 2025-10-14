/**
 * Discord Reactions Handler
 */

import { DiscordIntegration, DiscordReaction, DiscordDataHandler } from '../types'
import { fetchDiscordWithRateLimit, validateDiscordToken } from '../utils'

import { logger } from '@/lib/utils/logger'

export const getDiscordReactions: DiscordDataHandler<DiscordReaction> = async (integration: DiscordIntegration, options: any = {}) => {
  try {
    logger.debug("🔍 Discord reactions fetcher called with options:", options)
    const { channelId, messageId } = options
    
    if (!channelId || !messageId) {
      logger.error("❌ Channel ID and Message ID are required for fetching reactions")
      throw new Error("Channel ID and Message ID are required to fetch Discord reactions")
    }

    logger.debug("🔍 Fetching reactions for message:", messageId, "in channel:", channelId)

    // Use bot token for server operations
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) {
      logger.warn("Discord bot token not available - returning empty reactions list")
      return []
    }

    logger.debug("🔍 Bot token available, making Discord API call...")

    try {
      // First, get the specific message to see its reactions
      logger.debug(`🔍 Making Discord API call to fetch message ${messageId} in channel ${channelId}`)
      const messageResponse = await fetchDiscordWithRateLimit<any>(() => 
        fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
          headers: {
            Authorization: `Bot ${botToken}`,
            "Content-Type": "application/json",
          },
        })
      )

      logger.debug("🔍 Discord API response received:", {
        hasMessage: !!messageResponse,
        hasReactions: !!(messageResponse && messageResponse.reactions),
        reactionsCount: messageResponse?.reactions?.length || 0,
        messageContent: `${messageResponse?.content?.substring(0, 100) }...` || "No content"
      })

      if (!messageResponse || !messageResponse.reactions) {
        logger.debug("🔍 No reactions found on this message")
        return []
      }

      // Process reactions from the message
      const reactions = messageResponse.reactions.map((reaction: any) => {
        let emojiDisplay = reaction.emoji.name
        let emojiValue = reaction.emoji.name
        
        // Handle custom emojis (they have an ID)
        if (reaction.emoji.id) {
          emojiDisplay = reaction.emoji.name
          emojiValue = `${reaction.emoji.name}:${reaction.emoji.id}`
        }
        
        return {
          id: emojiValue,
          name: `${emojiDisplay} (${reaction.count} reactions)`,
          value: emojiValue,
          emoji: reaction.emoji.name,
          emojiId: reaction.emoji.id,
          count: reaction.count,
          me: reaction.me || false,
          animated: reaction.emoji.animated || false
        }
      })

      logger.debug("🔍 Processed reactions:", reactions.length)
      if (reactions.length === 0) {
        logger.debug("🔍 No reactions found - this is normal if the message has no reactions")
      } else {
        logger.debug("🔍 Found reactions:", reactions.map((r: any) => `${r.emoji} (${r.count})`))
      }
      return reactions
    } catch (error: any) {
      logger.error("🔍 Discord API error:", error.message)
      // Handle specific Discord API errors
      if (error.message.includes("401")) {
        throw new Error("Discord authentication failed. Please reconnect your Discord account.")
      }
      if (error.message.includes("403")) {
        throw new Error("You do not have permission to view reactions in this channel. Please ensure you have the 'Read Message History' permission and try again.")
      }
      if (error.message.includes("404")) {
        // Message not found - return empty array instead of throwing error
        logger.debug(`Message ${messageId} not found - returning empty reactions list`)
        return []
      }
      throw error
    }
  } catch (error: any) {
    logger.error("Error fetching Discord reactions:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Discord authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Discord API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(`Failed to fetch Discord reactions: ${error.message}`)
  }
}