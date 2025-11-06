/**
 * Discord Channels Handler
 */

import { DiscordIntegration, DiscordChannel, DiscordDataHandler } from '../types'
import { makeDiscordApiRequest, validateDiscordToken } from '../utils'

import { logger } from '@/lib/utils/logger'

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
function botCanAccessChannel(channel: any, botMember: any, guildRoles: any[]): boolean {
  // If we don't have bot member info, allow all channels (fallback)
  if (!botMember) {
    logger.debug(`[Channel Permission] No bot member info for channel ${channel.name}, allowing by default`)
    return true
  }

  const botRoles = botMember.roles || []
  const botUserId = botMember.user?.id

  logger.debug(`[Channel Permission] Checking permissions for channel: ${channel.name} (${channel.id})`, {
    channelType: channel.type,
    botRoles: botRoles.length,
    guildRolesAvailable: guildRoles?.length || 0
  })

  // Calculate base permissions from bot's roles
  let basePermissions = 0n

  // Find @everyone role (id matches guild_id)
  const everyoneRole = guildRoles?.find(r => r.id === channel.guild_id)
  if (everyoneRole) {
    basePermissions = BigInt(everyoneRole.permissions || 0)
    logger.debug(`[Channel Permission] @everyone base permissions: ${basePermissions.toString(2).padStart(64, '0')}`)
  } else {
    logger.warn(`[Channel Permission] Could not find @everyone role for guild ${channel.guild_id}`)
  }

  // Apply bot's role permissions on top of @everyone
  for (const roleId of botRoles) {
    const role = guildRoles?.find(r => r.id === roleId)
    if (role) {
      const rolePerms = BigInt(role.permissions || 0)
      basePermissions |= rolePerms // Add role permissions

      // Check if this role has ADMINISTRATOR (grants all permissions)
      if (rolePerms & Permissions.ADMINISTRATOR) {
        logger.debug(`[Channel Permission] Bot has ADMINISTRATOR permission via role ${role.name}, allowing access`)
        return true
      }
    }
  }

  // Check if base permissions grant VIEW_CHANNEL
  let canView = !!(basePermissions & Permissions.VIEW_CHANNEL)
  logger.debug(`[Channel Permission] Base VIEW_CHANNEL permission: ${canView}`)

  // Now apply channel-specific permission overwrites
  const overwrites = channel.permission_overwrites || []
  logger.debug(`[Channel Permission] Found ${overwrites.length} permission overwrites`)

  // Apply @everyone overwrites first
  const everyoneOverwrite = overwrites.find((o: any) =>
    o.type === 0 && o.id === channel.guild_id
  )

  if (everyoneOverwrite) {
    const deny = BigInt(everyoneOverwrite.deny || 0)
    const allow = BigInt(everyoneOverwrite.allow || 0)

    logger.debug(`[Channel Permission] @everyone overwrite - Allow: ${allow.toString(2)}, Deny: ${deny.toString(2)}`)

    // Deny is applied first
    if (deny & Permissions.VIEW_CHANNEL) {
      canView = false
      logger.debug(`[Channel Permission] @everyone overwrite DENIES VIEW_CHANNEL`)
    }
    // Then allow is applied
    if (allow & Permissions.VIEW_CHANNEL) {
      canView = true
      logger.debug(`[Channel Permission] @everyone overwrite ALLOWS VIEW_CHANNEL`)
    }
  }

  // Apply role overwrites (these override @everyone)
  const roleOverwrites = overwrites.filter((o: any) =>
    o.type === 0 && botRoles.includes(o.id)
  )

  for (const roleOverwrite of roleOverwrites) {
    const deny = BigInt(roleOverwrite.deny || 0)
    const allow = BigInt(roleOverwrite.allow || 0)

    logger.debug(`[Channel Permission] Role overwrite ${roleOverwrite.id} - Allow: ${allow.toString(2)}, Deny: ${deny.toString(2)}`)

    // Deny first
    if (deny & Permissions.VIEW_CHANNEL) {
      canView = false
      logger.debug(`[Channel Permission] Role overwrite DENIES VIEW_CHANNEL`)
    }
    // Then allow
    if (allow & Permissions.VIEW_CHANNEL) {
      canView = true
      logger.debug(`[Channel Permission] Role overwrite ALLOWS VIEW_CHANNEL`)
    }
  }

  // Apply bot user overwrites (these override everything)
  const botUserOverwrite = overwrites.find((o: any) => o.type === 1 && o.id === botUserId)

  if (botUserOverwrite) {
    const deny = BigInt(botUserOverwrite.deny || 0)
    const allow = BigInt(botUserOverwrite.allow || 0)

    logger.debug(`[Channel Permission] Bot user overwrite - Allow: ${allow.toString(2)}, Deny: ${deny.toString(2)}`)

    // Deny first
    if (deny & Permissions.VIEW_CHANNEL) {
      logger.debug(`[Channel Permission] Bot user overwrite DENIES VIEW_CHANNEL - FINAL: false`)
      return false
    }
    // Then allow
    if (allow & Permissions.VIEW_CHANNEL) {
      logger.debug(`[Channel Permission] Bot user overwrite ALLOWS VIEW_CHANNEL - FINAL: true`)
      return true
    }
  }

  logger.debug(`[Channel Permission] Final permission for ${channel.name}: ${canView}`)
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
      logger.warn("No guildId provided for discord_channels, returning empty channels list")
      return []
    }

    // Use bot token for channel listing (bot must be in the guild)
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) {
      logger.warn("Discord bot token not configured - returning empty channels list")
      return []
    }

    let data: any[] = []
    let botMember: any = null
    let guildRoles: any[] = []

    try {
      // First, get the bot's member object and guild roles to check permissions
      try {
        logger.debug(`[Discord Channels] Fetching bot user and member info for guild ${guildId}`)

        // Get bot's user ID from the token (with caching)
        const botUser = await makeDiscordApiRequest<any>(
          `https://discord.com/api/v10/users/@me`,
          `Bot ${botToken}`,
          {},
          true // Enable caching
        )

        logger.debug(`[Discord Channels] Bot user fetched: ${botUser?.username} (${botUser?.id})`)

        if (botUser && botUser.id) {
          // Get bot's member object in the guild (with caching)
          botMember = await makeDiscordApiRequest<any>(
            `https://discord.com/api/v10/guilds/${guildId}/members/${botUser.id}`,
            `Bot ${botToken}`,
            {},
            true // Enable caching
          )

          logger.debug(`[Discord Channels] Bot member fetched with ${botMember?.roles?.length || 0} roles`)
        }

        // Fetch guild roles to calculate base permissions
        try {
          guildRoles = await makeDiscordApiRequest<any[]>(
            `https://discord.com/api/v10/guilds/${guildId}/roles`,
            `Bot ${botToken}`,
            {},
            true // Enable caching
          )

          logger.debug(`[Discord Channels] Fetched ${guildRoles?.length || 0} guild roles`)
        } catch (rolesError) {
          logger.warn(`[Discord Channels] Could not fetch guild roles:`, rolesError)
        }
      } catch (memberError) {
        logger.debug("[Discord Channels] Could not fetch bot member info, will show all channels:", memberError)
      }

      // Use makeDiscordApiRequest with caching for faster subsequent loads
      data = await makeDiscordApiRequest<any[]>(
        `https://discord.com/api/v10/guilds/${guildId}/channels`,
        `Bot ${botToken}`,
        {},
        true // Enable caching
      )
    } catch (fetchError: any) {
      // Handle fetchDiscordWithRateLimit errors specifically
      logger.debug(`Discord API fetch error for guild ${guildId}:`, fetchError.message)
      
      if (fetchError.status === 401) {
        throw new Error("Discord bot authentication failed. Please check bot configuration.")
      }
      if (fetchError.status === 403) {
        // Bot doesn't have permission or isn't in the server - return empty array
        logger.debug(`Bot missing permissions or not in server ${guildId} - returning empty channels list`)
        return []
      }
      if (fetchError.status === 404) {
        // Bot is not in the server - return empty array
        logger.debug(`Bot is not a member of server ${guildId} - returning empty channels list`)
        return []
      }
      
      // For other API errors, return empty array so UI can show bot connection prompt
      logger.error(`Discord API error for guild ${guildId}:`, fetchError.message)
      return []
    }
    
    try {
      const totalChannels = data?.length || 0
      let accessibleChannels = 0
      let permissionDeniedChannels = 0
      let typeFilteredChannels = 0

      logger.debug(`[Discord Channels] Starting to filter ${totalChannels} channels`)

      let filteredData = (data || [])
        .filter((channel: any) => {
          logger.debug(`[Discord Channels] Processing channel: ${channel.name} (Type: ${channel.type})`)

          // First, check if bot can access the channel
          const canAccess = botCanAccessChannel(channel, botMember, guildRoles)
          if (!canAccess) {
            permissionDeniedChannels++
            logger.debug(`[Discord Channels] ❌ Bot CANNOT access channel: ${channel.name} (${channel.id}) - Permission denied`)
            return false
          }

          logger.debug(`[Discord Channels] ✅ Bot CAN access channel: ${channel.name} (${channel.id})`)
          accessibleChannels++

          // For parentId selection, include categories (type 4) and text channels (type 0)
          // For regular channel selection, include text channels (type 0) and voice channels (type 2) that could have text
          const isParentIdRequest = options?.context === 'parentId'
          if (isParentIdRequest) {
            const include = channel.type === 0 || channel.type === 4
            logger.debug(`[Discord Channels] Parent ID context - ${include ? 'Including' : 'Excluding'} ${channel.name}`)
            if (!include) typeFilteredChannels++
            return include // Text channels and categories
          }

          // Include text channels (0), voice channels with text (2), and forum channels (15)
          // Exclude categories (4), voice channels without text capability
          const textCapableTypes = [0, 2, 5, 10, 11, 12, 15]; // All channel types that can have text messages
          if (textCapableTypes.includes(channel.type)) {
            logger.debug(`[Discord Channels] ✅ Including text-capable channel: ${channel.name} (${channel.id}) - Type: ${channel.type}`)
            return true
          }

          logger.debug(`[Discord Channels] ❌ Excluding non-text channel: ${channel.name} (Type: ${channel.type})`)
          typeFilteredChannels++
          return false
        })

      logger.info(`[Discord Channels] 📊 Channel filtering summary for guild ${guildId}:`, {
        total: totalChannels,
        accessible: accessibleChannels,
        permissionDenied: permissionDeniedChannels,
        typeFiltered: typeFilteredChannels,
        final: filteredData.length
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
    } catch (processingError: any) {
      // Handle errors in data processing (filtering, sorting, etc.)
      logger.error('Error processing channel data:', processingError)
      return []
    }
  } catch (error: any) {
    logger.error("Error fetching Discord channels:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Discord authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Discord API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(`Failed to fetch Discord channels: ${error.message}`)
  }
}