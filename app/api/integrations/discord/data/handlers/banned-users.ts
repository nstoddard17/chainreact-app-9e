/**
 * Discord Banned Users Handler
 */

import { DiscordIntegration, DiscordUser, DiscordDataHandler } from '../types'
import { fetchDiscordWithRateLimit, validateDiscordToken } from '../utils'

export const getDiscordBannedUsers: DiscordDataHandler<DiscordUser> = async (integration: DiscordIntegration, options: any = {}) => {
  try {
    const { guildId } = options
    
    if (!guildId) {
      throw new Error("Guild ID is required to fetch Discord banned users")
    }

    // Use bot token instead of user token for banned users
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) {
      console.warn("Discord bot token not configured - returning empty banned users list")
      return []
    }

    try {
      const data = await fetchDiscordWithRateLimit<any[]>(() => 
        fetch(`https://discord.com/api/v10/guilds/${guildId}/bans?limit=1000`, {
          headers: {
            Authorization: `Bot ${botToken}`,
            "Content-Type": "application/json",
          },
        })
      )

      return (data || [])
        .map((ban: any) => ({
          id: ban.user.id,
          name: ban.user.username || "Unknown User",
          value: ban.user.id,
          username: ban.user.username || "Unknown",
          discriminator: ban.user.discriminator || "0000",
          avatar: ban.user.avatar,
          bot: ban.user.bot,
          system: ban.user.system,
          mfa_enabled: ban.user.mfa_enabled,
          verified: ban.user.verified,
          email: ban.user.email,
          flags: ban.user.flags,
          premium_type: ban.user.premium_type,
          public_flags: ban.user.public_flags,
        }))
    } catch (error: any) {
      // Handle specific Discord API errors
      if (error.message.includes("401")) {
        throw new Error("Discord bot token is invalid or expired. Please check your environment variables.")
      }
      if (error.message.includes("403")) {
        throw new Error("Bot doesn't have permission to view bans in this server. Please ensure the bot has the 'Ban Members' permission.")
      }
      if (error.message.includes("404")) {
        // Bot is not in the server - return empty array instead of throwing error
        console.log(`Bot is not a member of server ${guildId} - returning empty banned users list`)
        return []
      }
      throw error
    }
  } catch (error: any) {
    console.error("Error fetching Discord banned users:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Discord authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Discord API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(`Failed to fetch Discord banned users: ${error.message}`)
  }
}