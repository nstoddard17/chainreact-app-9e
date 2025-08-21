/**
 * Discord Categories Handler
 */

import { DiscordIntegration, DiscordCategory, DiscordDataHandler } from '../types'
import { fetchDiscordWithRateLimit, validateDiscordToken } from '../utils'

export const getDiscordCategories: DiscordDataHandler<DiscordCategory> = async (integration: DiscordIntegration, options: any = {}) => {
  try {
    const { 
      guildId, 
      nameFilter, 
      sortBy = "position" 
    } = options
    
    if (!guildId) {
      throw new Error("Guild ID is required to fetch Discord categories")
    }

    // Use bot token for category listing (bot must be in the guild)
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) {
      console.warn("Discord bot token not configured - returning empty categories list")
      return []
    }

    try {
      const data = await fetchDiscordWithRateLimit<any[]>(() => 
        fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
          headers: {
            Authorization: `Bot ${botToken}`,
            "Content-Type": "application/json",
          },
        })
      )

      let filteredData = (data || [])
        .filter((channel: any) => channel.type === 4) // Only categories (type 4)

      // Apply name filter
      if (nameFilter && nameFilter.trim()) {
        const filterLower = nameFilter.toLowerCase()
        filteredData = filteredData.filter((category: any) => 
          category.name && category.name.toLowerCase().includes(filterLower)
        )
      }

      // Apply sorting
      switch (sortBy) {
        case "name":
          filteredData.sort((a: any, b: any) => a.name.localeCompare(b.name))
          break
        case "name_desc":
          filteredData.sort((a: any, b: any) => b.name.localeCompare(a.name))
          break
        case "created":
          filteredData.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          break
        case "created_old":
          filteredData.sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          break
        case "position":
        default:
          filteredData.sort((a: any, b: any) => a.position - b.position)
          break
      }

      return filteredData.map((category: any) => ({
        id: category.id,
        name: category.name,
        value: category.id,
        type: category.type,
        guild_id: guildId,
        position: category.position,
        channels: [], // Can be populated later if needed
      }))
    } catch (error: any) {
      // Handle specific Discord API errors
      if (error.message.includes("401")) {
        throw new Error("Discord bot authentication failed. Please check bot configuration.")
      }
      if (error.message.includes("403")) {
        throw new Error("Bot does not have permission to view channels in this server. Please ensure the bot has the 'View Channels' permission and try again.")
      }
      if (error.message.includes("404")) {
        // Bot is not in the server - return empty array instead of throwing error
        console.log(`Bot is not a member of server ${guildId} - returning empty categories list`)
        return []
      }
      if (error.message.includes("429")) {
        // Return empty array instead of throwing for rate limits
        console.warn("Discord rate limited, returning empty categories list")
        return []
      }
      throw error
    }
  } catch (error: any) {
    console.error("Error fetching Discord categories:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Discord authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Discord API rate limit exceeded. Please try again later.')
    }
    
    // Handle rate limiting gracefully
    if (error.message.includes("429")) {
      console.warn("Discord rate limited, returning empty categories list")
      return []
    }
    
    // For other errors, return empty array to prevent workflow failures
    console.warn("Discord categories fetch failed, returning empty list:", error.message)
    return []
  }
}