/**
 * Discord Members Handler
 */

import { DiscordIntegration, DiscordMember, DiscordDataHandler } from '../types'
import { fetchDiscordWithRateLimit, validateDiscordToken } from '../utils'

export const getDiscordMembers: DiscordDataHandler<DiscordMember> = async (integration: DiscordIntegration, options: any = {}) => {
  // Ultimate safety wrapper to prevent any 500 errors from this handler
  try {
    const { guildId } = options
    
    if (!guildId) {
      // Return empty array instead of throwing to prevent 500 errors
      return []
    }
    
    // Validate guild ID format (Discord IDs are snowflakes - numeric strings)
    if (typeof guildId !== 'string' || !/^\d{17,20}$/.test(guildId)) {
      // Return empty array instead of throwing to prevent 500 errors
      return []
    }

    // Use bot token for member listing (bot must be in the guild)
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) {
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

      // Ensure we have valid data before processing
      if (!data || !Array.isArray(data)) {
        return []
      }

      const processedMembers = data
        // .filter((member: any) => !member.user?.bot) // Show all users, including bots
        .filter((member: any) => member && member.user) // Filter out invalid members
        .map((member: any) => {
          try {
            return {
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
            }
          } catch (mapError: any) {
            return null
          }
        })
        .filter(Boolean) // Remove any null entries from failed mappings
      
      console.log(`✅ [Discord Members] Successfully loaded ${processedMembers.length} members for guild ${guildId}`)
      return processedMembers
    } catch (innerError: any) {
      // Handle specific Discord API errors from the fetch call
      console.error("❌ [Discord Members] Discord API error:", innerError)
      
      if (innerError.message?.includes("401")) {
        console.warn("🔍 [Discord Members] Bot authentication failed - returning empty list")
        return []
      }
      if (innerError.message?.includes("403")) {
        console.warn("🔍 [Discord Members] Bot permission denied - returning empty list")
        return []
      }
      if (innerError.message?.includes("404")) {
        console.warn(`🔍 [Discord Members] Bot not in server ${guildId} - returning empty list`)
        return []
      }
      
      // For any other Discord API error, return empty array
      console.warn(`🔍 [Discord Members] Discord API error for guild ${guildId}: ${innerError.message}`)
      return []
    }
  } catch (error: any) {
    // Final catch-all error handler
    console.error("💥 [Discord Members] Fatal error in handler:", {
      error: error.message,
      stack: error.stack,
      integration: integration?.id,
      options,
      guildId: options?.guildId
    })
    
    // Always return empty array to prevent 500 errors
    return []
  }
}