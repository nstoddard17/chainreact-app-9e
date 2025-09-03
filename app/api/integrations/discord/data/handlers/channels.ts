/**
 * Discord Channels Handler
 */

import { DiscordIntegration, DiscordChannel, DiscordDataHandler } from '../types'
import { fetchDiscordWithRateLimit, validateDiscordToken } from '../utils'

// Discord permission flags
const Permissions = {
  VIEW_CHANNEL: 1024n, // 0x400
  SEND_MESSAGES: 2048n, // 0x800
  READ_MESSAGE_HISTORY: 65536n, // 0x10000
  ADMINISTRATOR: 8n // 0x8
}

/**
 * Check if bot has permission to access a channel
 */
function botCanAccessChannel(channel: any, botMember: any): boolean {
  // If we don't have bot member info, allow all channels (fallback)
  if (!botMember) return true
  
  // Check if bot is admin (has all permissions)
  const botRoles = botMember.roles || []
  
  // Get @everyone role permissions (guild-wide base permissions)
  // This would need to be passed in or fetched separately
  // For now, we'll focus on permission overwrites
  
  // Check permission overwrites for the channel
  const overwrites = channel.permission_overwrites || []
  
  // Check for explicit bot user permissions
  const botUserOverwrite = overwrites.find((o: any) => o.type === 1 && o.id === botMember.user?.id)
  
  // Check for bot role permissions
  const roleOverwrites = overwrites.filter((o: any) => 
    o.type === 0 && botRoles.includes(o.id)
  )
  
  // Check @everyone permissions
  const everyoneOverwrite = overwrites.find((o: any) => 
    o.type === 0 && o.id === channel.guild_id
  )
  
  // Start with base permissions (we'll assume bot can view channels by default)
  let canView = true
  
  // Apply @everyone overwrites first
  if (everyoneOverwrite) {
    const deny = BigInt(everyoneOverwrite.deny || 0)
    const allow = BigInt(everyoneOverwrite.allow || 0)
    
    // If VIEW_CHANNEL is explicitly denied for @everyone
    if (deny & Permissions.VIEW_CHANNEL) {
      canView = false
    }
    // If VIEW_CHANNEL is explicitly allowed for @everyone
    if (allow & Permissions.VIEW_CHANNEL) {
      canView = true
    }
  }
  
  // Apply role overwrites (these override @everyone)
  for (const roleOverwrite of roleOverwrites) {
    const deny = BigInt(roleOverwrite.deny || 0)
    const allow = BigInt(roleOverwrite.allow || 0)
    
    if (allow & Permissions.VIEW_CHANNEL) {
      canView = true
    }
    if (deny & Permissions.VIEW_CHANNEL) {
      canView = false
    }
  }
  
  // Apply bot user overwrites (these override everything)
  if (botUserOverwrite) {
    const deny = BigInt(botUserOverwrite.deny || 0)
    const allow = BigInt(botUserOverwrite.allow || 0)
    
    if (allow & Permissions.VIEW_CHANNEL) {
      return true
    }
    if (deny & Permissions.VIEW_CHANNEL) {
      return false
    }
  }
  
  return canView
}

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
      console.warn("No guildId provided for discord_channels, returning empty channels list")
      return []
    }

    // Use bot token for channel listing (bot must be in the guild)
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) {
      console.warn("Discord bot token not configured - returning empty channels list")
      return []
    }

    let data: any[] = []
    let botMember: any = null
    
    try {
      // First, get the bot's member object to check permissions
      try {
        // Get bot's user ID from the token
        const botUser = await fetchDiscordWithRateLimit<any>(() =>
          fetch(`https://discord.com/api/v10/users/@me`, {
            headers: {
              Authorization: `Bot ${botToken}`,
              "Content-Type": "application/json",
            },
          })
        )
        
        if (botUser && botUser.id) {
          // Get bot's member object in the guild
          botMember = await fetchDiscordWithRateLimit<any>(() =>
            fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${botUser.id}`, {
              headers: {
                Authorization: `Bot ${botToken}`,
                "Content-Type": "application/json",
              },
            })
          )
        }
      } catch (memberError) {
        console.log("Could not fetch bot member info, will show all channels:", memberError)
      }
      
      // Use improved rate limiting (no manual delays needed)
      data = await fetchDiscordWithRateLimit<any[]>(() => 
        fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
          headers: {
            Authorization: `Bot ${botToken}`,
            "Content-Type": "application/json",
          },
        })
      )
    } catch (fetchError: any) {
      // Handle fetchDiscordWithRateLimit errors specifically
      console.log(`Discord API fetch error for guild ${guildId}:`, fetchError.message)
      
      if (fetchError.status === 401) {
        throw new Error("Discord bot authentication failed. Please check bot configuration.")
      }
      if (fetchError.status === 403) {
        // Bot doesn't have permission or isn't in the server - return empty array
        console.log(`Bot missing permissions or not in server ${guildId} - returning empty channels list`)
        return []
      }
      if (fetchError.status === 404) {
        // Bot is not in the server - return empty array
        console.log(`Bot is not a member of server ${guildId} - returning empty channels list`)
        return []
      }
      
      // For other API errors, return empty array so UI can show bot connection prompt
      console.error(`Discord API error for guild ${guildId}:`, fetchError.message)
      return []
    }
    
    try {
      const totalChannels = data?.length || 0
      let accessibleChannels = 0

      let filteredData = (data || [])
        .filter((channel: any) => {
          // First, check if bot can access the channel
          const canAccess = botCanAccessChannel(channel, botMember)
          if (!canAccess) {
            console.log(`Bot cannot access channel: ${channel.name} (${channel.id})`)
            return false
          }
          accessibleChannels++
          
          // For parentId selection, include categories (type 4) and text channels (type 0)
          // For regular channel selection, include text channels (type 0) and voice channels (type 2) that could have text
          const isParentIdRequest = options?.context === 'parentId'
          if (isParentIdRequest) {
            return channel.type === 0 || channel.type === 4 // Text channels and categories
          }
          
          // Include text channels (0), voice channels with text (2), and forum channels (15)
          // Exclude categories (4), voice channels without text capability
          const textCapableTypes = [0, 2, 5, 10, 11, 12, 15]; // All channel types that can have text messages
          if (textCapableTypes.includes(channel.type)) {
            console.log(`Including channel: ${channel.name} (${channel.id}) - Type: ${channel.type}`)
            return true
          }
          
          return false
        })
      
      console.log(`Discord channel access summary for guild ${guildId}: ${accessibleChannels}/${totalChannels} channels accessible to bot`)

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
    } catch (processingError: any) {
      // Handle errors in data processing (filtering, sorting, etc.)
      console.error('Error processing channel data:', processingError)
      return []
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