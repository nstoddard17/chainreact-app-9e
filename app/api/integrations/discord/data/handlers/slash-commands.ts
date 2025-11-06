/**
 * Discord Slash Commands Handler
 */

import { DiscordDataHandler, DiscordIntegration } from '../types'
import { fetchDiscordWithRateLimit } from '../utils'

import { logger } from '@/lib/utils/logger'

interface DiscordApplicationCommand {
  id: string
  type?: number
  application_id?: string
  guild_id?: string
  name: string
  description?: string
}

export const getDiscordCommands: DiscordDataHandler<DiscordApplicationCommand> = async (
  integration: DiscordIntegration,
  options: any = {}
) => {
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!botToken) {
    logger.warn('Discord bot token not configured - returning empty commands list')
    return []
  }

  const clientId = process.env.DISCORD_CLIENT_ID
  if (!clientId) {
    logger.warn('Discord client ID not configured - returning empty commands list')
    return []
  }

  const guildId: string | undefined = options?.guildId

  logger.debug('🔍 [Discord Commands] Fetching slash commands:', {
    guildId: guildId || 'none (global only)',
    clientId: clientId.substring(0, 8) + '...'
  })

  try {
    // When guildId is provided, fetch BOTH guild-specific AND global commands
    // Global commands can be used in any server!
    const commandSets: DiscordApplicationCommand[][] = []

    if (guildId) {
      // Fetch guild-specific commands
      logger.debug('📡 [Discord Commands] Fetching guild-specific commands...')
      const guildUrl = `https://discord.com/api/v10/applications/${clientId}/guilds/${guildId}/commands`

      try {
        const guildData = await fetchDiscordWithRateLimit<any[]>(() =>
          fetch(guildUrl, {
            headers: {
              Authorization: `Bot ${botToken}`,
              'Content-Type': 'application/json',
            },
          })
        )

        if (Array.isArray(guildData)) {
          logger.debug(`✅ [Discord Commands] Found ${guildData.length} guild-specific commands`)
          commandSets.push(guildData.map((cmd: any) => ({
            id: cmd.id,
            name: cmd.name,
            description: cmd.description,
            application_id: cmd.application_id,
            guild_id: cmd.guild_id,
            type: cmd.type,
          })))
        }
      } catch (guildError: any) {
        logger.warn('⚠️ [Discord Commands] Failed to fetch guild commands:', guildError.message)
      }

      // Also fetch global commands (they can be used in any server)
      logger.debug('📡 [Discord Commands] Fetching global commands...')
      const globalUrl = `https://discord.com/api/v10/applications/${clientId}/commands`

      try {
        const globalData = await fetchDiscordWithRateLimit<any[]>(() =>
          fetch(globalUrl, {
            headers: {
              Authorization: `Bot ${botToken}`,
              'Content-Type': 'application/json',
            },
          })
        )

        if (Array.isArray(globalData)) {
          logger.debug(`✅ [Discord Commands] Found ${globalData.length} global commands`)
          commandSets.push(globalData.map((cmd: any) => ({
            id: cmd.id,
            name: cmd.name,
            description: cmd.description,
            application_id: cmd.application_id,
            guild_id: cmd.guild_id,
            type: cmd.type,
          })))
        }
      } catch (globalError: any) {
        logger.warn('⚠️ [Discord Commands] Failed to fetch global commands:', globalError.message)
      }
    } else {
      // No guildId - fetch only global commands
      logger.debug('📡 [Discord Commands] Fetching global commands only...')
      const globalUrl = `https://discord.com/api/v10/applications/${clientId}/commands`

      const globalData = await fetchDiscordWithRateLimit<any[]>(() =>
        fetch(globalUrl, {
          headers: {
            Authorization: `Bot ${botToken}`,
            'Content-Type': 'application/json',
          },
        })
      )

      if (Array.isArray(globalData)) {
        logger.debug(`✅ [Discord Commands] Found ${globalData.length} global commands`)
        commandSets.push(globalData.map((cmd: any) => ({
          id: cmd.id,
          name: cmd.name,
          description: cmd.description,
          application_id: cmd.application_id,
          guild_id: cmd.guild_id,
          type: cmd.type,
        })))
      }
    }

    // Combine all commands
    const allCommands = commandSets.flat()

    logger.debug(`📋 [Discord Commands] Total commands available: ${allCommands.length}`, {
      commands: allCommands.map(c => c.name)
    })

    return allCommands
  } catch (error: any) {
    logger.error('❌ [Discord Commands] Error fetching commands:', {
      error: error.message || error,
      guildId,
      stack: error.stack
    })
    return []
  }
}


