/**
 * Discord Guilds Handler
 */

import { DiscordIntegration, DiscordGuild, DiscordDataHandler } from '../types'
import { makeDiscordApiRequest, validateDiscordToken, fetchDiscordWithRateLimit } from '../utils'

import { logger } from '@/lib/utils/logger'

/**
 * Verify that the Discord bot is actually a member of the specified guild
 */
async function verifyBotInGuild(guildId: string): Promise<{ isInGuild: boolean; hasPermissions: boolean; error?: string }> {
  try {
    const botToken = process.env.DISCORD_BOT_TOKEN;
    const botClientId = process.env.DISCORD_CLIENT_ID || process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    
    if (!botToken || !botClientId) {
      return {
        isInGuild: false,
        hasPermissions: false,
        error: "Discord bot not configured"
      };
    }

    logger.debug('🔍 Checking bot status for guild:', guildId, 'with bot client ID:', botClientId);
    
    const channelsStatus = null;
    
    // First, try to fetch channels (more reliable than member check)
    try {
      logger.debug('🔍 Trying to fetch guild channels...');
      
      const channels = await fetchDiscordWithRateLimit<any[]>(() =>
        fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
          headers: {
            'Authorization': `Bot ${botToken}`,
            'Content-Type': 'application/json',
          },
        })
      );
      
      logger.debug('🔍 Successfully fetched channels:', channels.length, 'channels found');
      
      // Bot can access channels, so it's in the guild with proper permissions
      return {
        isInGuild: true,
        hasPermissions: true
      };
    } catch (outerError) {
      logger.debug('🔍 Outer channels check failed, trying member check...');
    }
    
    // Fallback to member check
    logger.debug('🔍 Trying to check bot membership...');
    
    try {
      const memberData = await fetchDiscordWithRateLimit<any>(() =>
        fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${botClientId}`, {
          headers: {
            'Authorization': `Bot ${botToken}`,
            'Content-Type': 'application/json',
          },
        })
      );
      
      logger.debug('🔍 Bot is a member of the guild');
      // Bot is in the guild and we have member data
      return {
        isInGuild: true,
        hasPermissions: true
      };
    } catch (memberError: any) {
      logger.debug('🔍 Member check failed:', memberError.message);
      
      // Parse error to determine the issue
      if (memberError.status === 404) {
        logger.debug('🔍 Bot is not a member of the guild');
        return {
          isInGuild: false,
          hasPermissions: false,
          error: "Bot not added to this server"
        };
      } else if (memberError.status === 403) {
        logger.debug('🔍 Bot lacks permissions to check membership - probably not in guild');
        return {
          isInGuild: false,
          hasPermissions: false,
          error: "Bot not in server or missing permissions"
        };
      } else {
        logger.debug('🔍 Unknown error checking bot status');
        return {
          isInGuild: false,
          hasPermissions: false,
          error: `Discord API error: ${memberError.status || 'unknown'}`
        };
      }
      
    }
  } catch (error: any) {
    logger.error('Error verifying bot in guild:', error);
    return {
      isInGuild: false,
      hasPermissions: false,
      error: error.message || "Failed to verify bot status"
    };
  }
}

async function getBotGuildMembership(): Promise<{ ids: Set<string> | null; error?: string }> {
  const botToken = process.env.DISCORD_BOT_TOKEN

  if (!botToken) {
    return {
      ids: null,
      error: "Discord bot not configured"
    }
  }

  try {
    const botGuilds = await makeDiscordApiRequest<any[]>(
      "https://discord.com/api/v10/users/@me/guilds",
      `Bot ${botToken}`,
      {},
      true
    )

    return {
      ids: new Set(botGuilds.map((guild) => guild.id))
    }
  } catch (error: any) {
    logger.warn(`[Discord Guilds] Failed to load bot guild membership:`, error?.message || error)
    return {
      ids: null,
      error: "Unable to verify bot membership"
    }
  }
}

export const getDiscordGuilds: DiscordDataHandler<DiscordGuild> = async (integration: DiscordIntegration, options?: any) => {
  try {
    // Validate and get token
    const tokenValidation = await validateDiscordToken(integration)

    if (!tokenValidation.success) {
      throw new Error(tokenValidation.error || "Token validation failed")
    }

    // Use makeDiscordApiRequest which includes 10-minute caching
    const data = await makeDiscordApiRequest<any[]>(
      "https://discord.com/api/v10/users/@me/guilds",
      tokenValidation.token,
      {},
      true // Enable caching
    )

    // Process guilds and add bot status checking
    const guilds = (data || []).map((guild: any) => ({
      id: guild.id,
      name: guild.name,
      value: guild.id,
      label: guild.name,
      icon: guild.icon,
      owner: guild.owner,
      permissions: guild.permissions,
      features: guild.features,
      approximate_member_count: guild.approximate_member_count,
      approximate_presence_count: guild.approximate_presence_count,
    }))

    logger.debug(`🔍 [Discord Guilds] Found ${guilds.length} guilds`);

    const requireBotAccess = Boolean(options?.requireBotAccess)
    const checkBotStatus = Boolean(options?.checkBotStatus)
    const needsBotMembership = requireBotAccess || checkBotStatus

    let processedGuilds: DiscordGuild[] = guilds
    let botGuildIds: Set<string> | null = null
    let botMembershipError: string | undefined

    if (needsBotMembership) {
      const membership = await getBotGuildMembership()
      botGuildIds = membership.ids
      botMembershipError = membership.error

      processedGuilds = guilds.map((guild) => {
        if (!botGuildIds) {
          return {
            ...guild,
            botInGuild: undefined,
            hasPermissions: false,
            botError: botMembershipError
          }
        }

        const botInGuild = botGuildIds.has(guild.id)
        return {
          ...guild,
          botInGuild,
          hasPermissions: botInGuild,
          botError: botInGuild ? undefined : "Bot not added to this server"
        }
      })

      if (requireBotAccess) {
        if (!botGuildIds) {
          logger.warn(`🔍 [Discord Guilds] Cannot verify bot membership, returning no guilds`)
          return []
        }

        const beforeFilter = processedGuilds.length
        processedGuilds = processedGuilds.filter((guild) => guild.botInGuild)
        const removed = beforeFilter - processedGuilds.length
        if (removed > 0) {
          logger.debug(`🔍 [Discord Guilds] Filtered ${removed} guild(s) without bot access`)
        }
      }
    }

    if (!checkBotStatus) {
      logger.debug(
        `🔍 [Discord Guilds] ${requireBotAccess ? 'Applied bot access filter and ' : ''}skipping detailed bot status checks`
      )
      return processedGuilds
    }

    logger.debug(`🔍 [Discord Guilds] Bot status check requested, verifying guild permissions...`)

    // Check if bot tokens are configured
    const botToken = process.env.DISCORD_BOT_TOKEN
    const botClientId = process.env.DISCORD_CLIENT_ID || process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID

    if (!botToken || !botClientId) {
      logger.warn(`🔍 [Discord Guilds] Discord bot not configured, returning guilds without detailed bot status`)
      return processedGuilds.map((guild) => ({
        ...guild,
        botInGuild: guild.botInGuild,
        hasPermissions: guild.botInGuild ? guild.hasPermissions : false,
        botError: guild.botInGuild ? undefined : (guild.botError || "Discord bot not configured")
      }))
    }

    try {
      const guildsEligibleForCheck = processedGuilds.filter((guild) => guild.botInGuild !== false)
      const guildsToCheck = guildsEligibleForCheck.slice(0, 3)

      if (guildsToCheck.length === 0) {
        logger.debug(`🔍 [Discord Guilds] No guilds eligible for bot status verification after filtering`)
        return processedGuilds
      }

      logger.debug(`🔍 [Discord Guilds] Checking bot permissions for ${guildsToCheck.length} guild(s)`)

      const botStatusPromise = Promise.allSettled(
        guildsToCheck.map(async (guild, index) => {
          if (index > 0) {
            await new Promise((resolve) => setTimeout(resolve, 1000))
          }

          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Bot check timeout")), 5000)
          )

          const botCheckPromise = verifyBotInGuild(guild.id)

          try {
            const botStatus = await Promise.race([botCheckPromise, timeoutPromise])
            return {
              ...guild,
              botInGuild: botStatus.isInGuild,
              hasPermissions: botStatus.hasPermissions,
              botError: botStatus.error
            }
          } catch (error: any) {
            logger.warn(
              `🔍 [Discord Guilds] Bot check failed for guild ${guild.name}:`,
              error?.message || "Unknown error"
            )
            return {
              ...guild,
              botInGuild: guild.botInGuild,
              hasPermissions: false,
              botError: "Could not verify bot status"
            }
          }
        })
      )

      const overallTimeout = new Promise((resolve) =>
        setTimeout(() => {
          logger.warn(
            `🔍 [Discord Guilds] Bot status checking timed out, returning guilds without full bot status`
          )
          resolve(
            guildsToCheck.map((guild) => ({
              ...guild,
              botInGuild: guild.botInGuild,
              hasPermissions: guild.hasPermissions,
              botError: "Bot status check timed out"
            }))
          )
        }, 15000)
      )

      const checkedGuildsResult = await Promise.race([botStatusPromise, overallTimeout])

      let updatedGuilds: DiscordGuild[]
      if (Array.isArray(checkedGuildsResult) && checkedGuildsResult[0]?.status) {
        const checkedGuilds = checkedGuildsResult.map((result, index) => {
          if (result.status === "fulfilled") {
            return result.value
          }

          logger.warn(
            `🔍 [Discord Guilds] Failed to check bot status for guild ${guildsToCheck[index]?.name}:`,
            result.reason
          )
          return {
            ...guildsToCheck[index],
            botInGuild: guildsToCheck[index].botInGuild,
            hasPermissions: false,
            botError: "Failed to check bot status"
          }
        })

        const updatedMap = new Map(checkedGuilds.map((guild) => [guild.id, guild]))
        updatedGuilds = processedGuilds.map((guild) => updatedMap.get(guild.id) || guild)
      } else if (Array.isArray(checkedGuildsResult)) {
        const updatedMap = new Map(checkedGuildsResult.map((guild: any) => [guild.id, guild]))
        updatedGuilds = processedGuilds.map((guild) => updatedMap.get(guild.id) || guild)
      } else {
        updatedGuilds = processedGuilds
      }

      logger.debug(`🔍 [Discord Guilds] Bot status check complete:`, {
        totalGuilds: updatedGuilds.length,
        botsInGuild: updatedGuilds.filter((g) => g.botInGuild === true).length,
        withPermissions: updatedGuilds.filter((g) => g.botInGuild === true && g.hasPermissions).length,
        unknownBotStatus: updatedGuilds.filter((g) => g.botInGuild === undefined).length
      })

      return updatedGuilds
    } catch (error) {
      logger.error(`🔍 [Discord Guilds] Bot status checking failed completely:`, error)
      return processedGuilds.map((guild) => ({
        ...guild,
        botInGuild: guild.botInGuild,
        hasPermissions: guild.hasPermissions,
        botError: guild.botError || "Bot status unavailable"
      }))
    }
  } catch (error: any) {
    logger.error("Error fetching Discord guilds:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Discord authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Discord API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(`Failed to fetch Discord guilds: ${error.message}`)
  }
}
