/**
 * Discord Channel Members Handler
 * Fetches members who have access to a specific channel
 */

import { DiscordIntegration, DiscordDataHandler } from '../types'
import { fetchDiscordWithRateLimit } from '../utils'

import { logger } from '@/lib/utils/logger'

// Simple in-memory cache for channel members
const channelMembersCache = new Map<string, { data: any[], timestamp: number }>()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export const getDiscordChannelMembers: DiscordDataHandler = async (integration: DiscordIntegration, options: any = {}) => {
  logger.debug("📍 [Discord Channel Members] Handler called with options:", options)
  const { channelId } = options
  
  if (!channelId) {
    logger.warn("No channelId provided for channel members")
    return []
  }
  
  // Check cache first
  const cacheKey = `channel_members_${channelId}`
  const cached = channelMembersCache.get(cacheKey)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug(`📦 [Discord Channel Members] Using cached data for channel ${channelId} (age: ${Math.round((Date.now() - cached.timestamp) / 1000)}s)`)
    return cached.data
  }
  
  logger.debug("✅ [Discord Channel Members] Loading members for channel:", channelId)

  try {
    // Use bot token for fetching channel members (bot must be in the guild)
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) {
      logger.warn("Bot token not configured - returning empty members")
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
      logger.warn("Could not get channel info or guild_id")
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

    // Always provide at least the "Anyone" option even if no members found
    const anyoneOption = {
      id: "anyone",
      value: "anyone",
      name: "Anyone",
      label: "Anyone",
      username: "anyone",
      discriminator: "0000",
      avatar: null,
      isBot: false
    };

    if (!membersResponse || membersResponse.length === 0) {
      logger.debug(`⚠️ [Discord Channel Members] No members found for channel ${channelId}, returning "Anyone" option only`)
      // Return just the "Anyone" option so the field isn't completely empty
      return [anyoneOption]
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
    members.unshift(anyoneOption)

    // Cache the result
    channelMembersCache.set(cacheKey, { data: members, timestamp: Date.now() })
    logger.debug(`✅ [Discord Channel Members] Cached and returning ${members.length} members for channel ${channelId}`)
    
    // Clean up old cache entries if cache is getting large
    if (channelMembersCache.size > 20) {
      const now = Date.now()
      for (const [key, value] of channelMembersCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          channelMembersCache.delete(key)
        }
      }
    }
    
    return members
  } catch (error: any) {
    logger.error("Error fetching Discord channel members:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Discord authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Discord API rate limit exceeded. Please try again later.')
    }
    
    return []
  }
}