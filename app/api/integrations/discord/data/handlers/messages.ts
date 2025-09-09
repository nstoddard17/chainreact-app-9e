/**
 * Discord Messages Handler
 */

import { DiscordIntegration, DiscordMessage, DiscordDataHandler } from '../types'
import { fetchDiscordWithRateLimit, validateDiscordToken } from '../utils'

export const getDiscordMessages: DiscordDataHandler<DiscordMessage> = async (integration: DiscordIntegration, options: any = {}) => {
  try {
    const { channelId } = options
    
    if (!channelId) {
      // Instead of throwing an error, return empty array for messageId fields that don't have channelId yet
      return []
    }

    console.log("🔍 Fetching messages for channel:", channelId)

    // Use bot token for server operations
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) {
      console.warn("Discord bot token not available - returning empty messages list")
      return []
    }

    console.log("🔍 Bot token available, making Discord API call...")

    try {
      // Validate channel ID format
      if (!channelId || typeof channelId !== 'string' || !/^\d+$/.test(channelId)) {
        console.error(`❌ Invalid channel ID format: ${channelId}`)
        throw new Error(`Invalid channel ID format: ${channelId}. Please select a valid Discord channel.`)
      }

      const data = await fetchDiscordWithRateLimit<any[]>(() => 
        fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=50`, {
          headers: {
            Authorization: `Bot ${botToken}`,
            "Content-Type": "application/json",
          },
        })
      )


      const processedMessages = (data || [])
        .filter((message: any) => message.type === 0 || message.type === undefined)
        .map((message: any) => {
          // Format the timestamp
          const messageDate = message.timestamp ? new Date(message.timestamp) : null
          const now = new Date()
          const isCurrentYear = messageDate && messageDate.getFullYear() === now.getFullYear()
          
          const formattedTime = messageDate ? 
            messageDate.toLocaleString('en-US', { 
              month: 'short', 
              day: 'numeric',
              year: isCurrentYear ? undefined : 'numeric',
              hour: 'numeric', 
              minute: '2-digit',
              hour12: true 
            }) : ''
          
          // Get the author name
          const author = message.author?.username || "Unknown"
          
          // Build the message preview
          let messagePreview = ""
          if (message.content && message.content.trim()) {
            messagePreview = message.content.substring(0, 50) + (message.content.length > 50 ? "..." : "")
          } else if (message.embeds && message.embeds.length > 0) {
            const embed = message.embeds[0]
            if (embed.title) {
              messagePreview = `[Embed] ${embed.title}`
            } else if (embed.description) {
              messagePreview = `[Embed] ${embed.description.substring(0, 40)}...`
            } else {
              messagePreview = `[Embed] (no title)`
            }
          } else if (message.attachments && message.attachments.length > 0) {
            const attachment = message.attachments[0]
            messagePreview = `[File] ${attachment.filename}`
          } else {
            messagePreview = "(empty message)"
          }
          
          // Combine everything into the display name
          const messageName = `${author} • ${formattedTime} • ${messagePreview}`
          
          return {
            id: message.id,
            name: messageName,
            value: message.id,
            content: message.content,
            author: {
              id: message.author.id,
              username: message.author.username,
              discriminator: message.author.discriminator,
              avatar: message.author.avatar,
            },
            timestamp: message.timestamp,
            edited_timestamp: message.edited_timestamp,
            tts: message.tts,
            mention_everyone: message.mention_everyone,
            mentions: message.mentions,
            mention_roles: message.mention_roles,
            attachments: message.attachments,
            embeds: message.embeds,
            reactions: message.reactions || [],
            pinned: message.pinned,
            type: message.type,
          }
        })

      // Debug: Log message reaction data
      const messagesWithReactions = processedMessages.filter(msg => msg.reactions && msg.reactions.length > 0);
      console.log(`🔍 [Discord Messages] Processed ${processedMessages.length} messages, ${messagesWithReactions.length} have reactions`);
      
      if (messagesWithReactions.length > 0) {
        console.log('🔍 [Discord Messages] Sample message with reactions:', {
          id: messagesWithReactions[0].id,
          content: messagesWithReactions[0].content?.substring(0, 30) + '...',
          reactions: messagesWithReactions[0].reactions.map((r: any) => ({
            emoji: r.emoji.name,
            count: r.count
          }))
        });
      } else {
        console.log('🔍 [Discord Messages] No messages found with reactions in this response');
        if (processedMessages.length > 0) {
          console.log('🔍 [Discord Messages] Sample message structure:', {
            id: processedMessages[0].id,
            hasReactions: processedMessages[0].hasOwnProperty('reactions'),
            reactions: processedMessages[0].reactions
          });
        }
      }

      return processedMessages
    } catch (error: any) {
      console.error("🔍 Discord API error:", error.message, "Status:", error.status)
      // Handle specific Discord API errors by status code
      if (error.status === 401 || error.message.includes("401")) {
        throw new Error("Discord authentication failed. Please reconnect your Discord account.")
      }
      if (error.status === 403 || error.message.includes("403")) {
        throw new Error("You do not have permission to view messages in this channel. Please ensure you have the 'Read Message History' permission and try again.")
      }
      if (error.status === 404 || error.message.includes("404")) {
        // Channel not found - return empty array instead of throwing error
        console.log(`Channel ${channelId} not found - returning empty messages list`)
        return []
      }
      if (error.status === 400 || error.message.includes("400")) {
        // Invalid request - likely invalid channel ID or bot permissions
        console.error(`Invalid Discord API request for channel ${channelId}:`, error.message)
        throw new Error(`Invalid Discord channel or insufficient bot permissions. Please ensure the bot has access to this channel and try again.`)
      }
      if (error.status === 429 || error.message.includes("rate limit")) {
        throw new Error("Discord API rate limit exceeded. Please try again later.")
      }
      
      // For unexpected errors, provide better context
      console.error(`Unexpected error fetching messages for channel ${channelId}:`, error)
      throw new Error(`Failed to fetch Discord messages: ${error.message}`)
    }
  } catch (error: any) {
    console.error("Error fetching Discord messages:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Discord authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Discord API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(`Failed to fetch Discord messages: ${error.message}`)
  }
}