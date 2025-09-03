/**
 * Discord Channel Members Handler
 * Fetches members who have access to a specific channel
 */

import { DiscordIntegration, DiscordDataHandler } from '../types'
import { fetchDiscordWithRateLimit, validateDiscordToken } from '../utils'

export const getDiscordChannelMembers: DiscordDataHandler = async (integration: DiscordIntegration, options: any = {}) => {
  console.log("📍 [Discord Channel Members] Handler called with options:", options)
  const { channelId } = options
  
  if (!channelId) {
    console.warn("No channelId provided for channel members")
    return []
  }
  
  console.log("✅ [Discord Channel Members] Loading members for channel:", channelId)

  try {
    // Validate and get token
    const tokenValidation = await validateDiscordToken(integration)
    
    if (!tokenValidation.success) {
      console.warn("Token validation failed, returning empty members")
      return []
    }
    
    const botToken = tokenValidation.botToken
    if (!botToken) {
      console.warn("Bot token not available - returning empty members")
      return []
    }

    // First, get channel info to find the guild
    const channelResponse = await fetchDiscordWithRateLimit<any>(() =>
      fetch(`https://discord.com/api/v10/channels/${channelId}`, {
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
      })
    )

    if (!channelResponse || !channelResponse.guild_id) {
      console.warn("Could not get channel info or guild_id")
      return []
    }

    const guildId = channelResponse.guild_id

    // Fetch guild members who can see this channel
    const membersResponse = await fetchDiscordWithRateLimit<any[]>(() =>
      fetch(`https://discord.com/api/v10/guilds/${guildId}/members?limit=100`, {
        headers: {
          Authorization: `Bot ${botToken}`,
          "Content-Type": "application/json",
        },
      })
    )

    if (!membersResponse || membersResponse.length === 0) {
      return []
    }

    // Format members for dropdown
    const members = membersResponse.map((member: any) => ({
      id: member.user.id,
      value: member.user.id,
      name: member.nick || member.user.username,
      label: member.nick || member.user.username,
      username: member.user.username,
      discriminator: member.user.discriminator || "0000",
      avatar: member.user.avatar,
      isBot: member.user.bot || false,
    }))

    // Add "Anyone" option at the beginning
    members.unshift({
      id: "anyone",
      value: "anyone",
      name: "Anyone",
      label: "Anyone",
      username: "anyone",
      discriminator: "0000",
      avatar: null,
      isBot: false
    })

    console.log(`✅ [Discord Channel Members] Returning ${members.length} members for channel ${channelId}`)
    return members
  } catch (error: any) {
    console.error("Error fetching Discord channel members:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Discord authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Discord API rate limit exceeded. Please try again later.')
    }
    
    return []
  }
}