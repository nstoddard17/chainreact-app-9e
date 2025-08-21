/**
 * Discord Channels Handler
 */

import { DiscordIntegration, DiscordChannel, DiscordDataHandler } from '../types'
import { fetchDiscordWithRateLimit, validateDiscordToken } from '../utils'

export const getDiscordChannels: DiscordDataHandler<DiscordChannel> = async (integration: DiscordIntegration, options: any = {}) => {
  try {
    const { 
      guildId, 
      channelTypes, 
      nameFilter, 
      sortBy = "position", 
      includeArchived = false,
      parentCategory 
    } = options
    
    if (!guildId) {
      console.warn("No guildId provided for discord_channels, returning default channels")
      return [
        { id: "default1", name: "general", value: "default1", type: 0, position: 0, parent_id: null },
        { id: "default2", name: "announcements", value: "default2", type: 0, position: 1, parent_id: null }
      ]
    }

    // Use bot token for channel listing (bot must be in the guild)
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) {
      console.warn("Discord bot token not configured - returning empty channels list")
      return []
    }

    try {
      // Add a delay before fetching channels to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      const data = await fetchDiscordWithRateLimit<any[]>(() => 
        fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
          headers: {
            Authorization: `Bot ${botToken}`,
            "Content-Type": "application/json",
          },
        })
      )

      let filteredData = (data || [])
        .filter((channel: any) => {
          // For parentId selection, include categories (type 4) and text channels (type 0)
          // For regular channel selection, only include text channels (type 0)
          const isParentIdRequest = options?.context === 'parentId'
          if (isParentIdRequest) {
            return channel.type === 0 || channel.type === 4 // Text channels and categories
          }
          return channel.type === 0 // Only text channels
        })

      // Apply additional filters
      if (channelTypes && Array.isArray(channelTypes) && channelTypes.length > 0) {
        filteredData = filteredData.filter((channel: any) => 
          channelTypes.includes(channel.type.toString())
        )
      }
      
      if (nameFilter && nameFilter.trim()) {
        const filterLower = nameFilter.toLowerCase()
        filteredData = filteredData.filter((channel: any) => 
          channel.name && channel.name.toLowerCase().includes(filterLower)
        )
      }
      
      if (parentCategory) {
        filteredData = filteredData.filter((channel: any) => channel.parent_id === parentCategory)
      }
      
      if (!includeArchived) {
        filteredData = filteredData.filter((channel: any) => !channel.archived)
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

      return filteredData.map((channel: any) => ({
        id: channel.id,
        name: channel.type === 4 ? channel.name : channel.name,
        value: channel.id,
        type: channel.type,
        guild_id: guildId,
        position: channel.position,
        parent_id: channel.parent_id,
        topic: channel.topic,
        nsfw: channel.nsfw,
        permission_overwrites: channel.permission_overwrites,
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
        console.log(`Bot is not a member of server ${guildId} - returning empty channels list`)
        return []
      }
      throw error
    }
  } catch (error: any) {
    console.error("Error fetching Discord channels:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Discord authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Discord API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(`Failed to fetch Discord channels: ${error.message}`)
  }
}