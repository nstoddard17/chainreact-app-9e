/**
 * Discord Roles Handler
 */

import { DiscordIntegration, DiscordRole, DiscordDataHandler } from '../types'
import { fetchDiscordWithRateLimit, validateDiscordToken } from '../utils'

export const getDiscordRoles: DiscordDataHandler<DiscordRole> = async (integration: DiscordIntegration, options: any = {}) => {
  try {
    const { guildId } = options
    
    if (!guildId) {
      throw new Error("Guild ID is required to fetch Discord roles")
    }

    // Use bot token for role listing (bot must be in the guild)
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) {
      console.warn("Discord bot token not configured - returning empty roles list")
      return []
    }

    try {
      const data = await fetchDiscordWithRateLimit<any[]>(() => 
        fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
          headers: {
            Authorization: `Bot ${botToken}`,
            "Content-Type": "application/json",
          },
        })
      )

      return (data || [])
        .filter((role: any) => role.name !== "@everyone") // Filter out @everyone role
        .map((role: any) => ({
          id: role.id,
          name: role.name,
          value: role.id,
          color: role.color,
          hoist: role.hoist,
          position: role.position,
          permissions: role.permissions,
          managed: role.managed,
          mentionable: role.mentionable,
          icon: role.icon,
          unicode_emoji: role.unicode_emoji,
        }))
    } catch (error: any) {
      // Handle specific Discord API errors
      if (error.message.includes("401")) {
        throw new Error("Discord bot authentication failed. Please check bot configuration.")
      }
      if (error.message.includes("403")) {
        throw new Error("Bot does not have permission to view roles in this server. Please ensure the bot has the 'View Roles' permission and try again.")
      }
      if (error.message.includes("404")) {
        // Bot is not in the server - return empty array instead of throwing error
        console.log(`Bot is not a member of server ${guildId} - returning empty roles list`)
        return []
      }
      throw error
    }
  } catch (error: any) {
    console.error("Error fetching Discord roles:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Discord authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Discord API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(`Failed to fetch Discord roles: ${error.message}`)
  }
}