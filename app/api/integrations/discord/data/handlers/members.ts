/**
 * Discord Members Handler
 */

import { DiscordIntegration, DiscordMember, DiscordDataHandler } from '../types'
import { fetchDiscordWithRateLimit, validateDiscordToken } from '../utils'

export const getDiscordMembers: DiscordDataHandler<DiscordMember> = async (integration: DiscordIntegration, options: any = {}) => {
  try {
    const { guildId } = options
    
    if (!guildId) {
      throw new Error("Guild ID is required to fetch Discord members")
    }

    // Use bot token for member listing (bot must be in the guild)
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) {
      console.warn("Discord bot token not configured - returning empty members list")
      return []
    }

    try {
      const data = await fetchDiscordWithRateLimit<any[]>(() => 
        fetch(`https://discord.com/api/v10/guilds/${guildId}/members?limit=1000`, {
          headers: {
            Authorization: `Bot ${botToken}`,
            "Content-Type": "application/json",
          },
        })
      )

      return (data || [])
        // .filter((member: any) => !member.user?.bot) // Show all users, including bots
        .map((member: any) => ({
          id: member.user.id,
          name: member.nick || member.user.username,
          value: member.user.id,
          user: {
            id: member.user.id,
            username: member.user.username,
            discriminator: member.user.discriminator,
            avatar: member.user.avatar,
            bot: member.user?.bot || false,
          },
          nick: member.nick,
          roles: member.roles,
          joined_at: member.joined_at,
          premium_since: member.premium_since,
          deaf: member.deaf,
          mute: member.mute,
        }))
    } catch (error: any) {
      // Handle specific Discord API errors
      if (error.message.includes("401")) {
        throw new Error("Discord bot authentication failed. Please check bot configuration.")
      }
      if (error.message.includes("403")) {
        throw new Error("Bot does not have permission to view members in this server. Please ensure the bot has the 'View Members' permission and try again.")
      }
      if (error.message.includes("404")) {
        // Bot is not in the server - return empty array instead of throwing error
        console.log(`Bot is not a member of server ${guildId} - returning empty members list`)
        return []
      }
      throw error
    }
  } catch (error: any) {
    console.error("Error fetching Discord members:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Discord authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Discord API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(`Failed to fetch Discord members: ${error.message}`)
  }
}