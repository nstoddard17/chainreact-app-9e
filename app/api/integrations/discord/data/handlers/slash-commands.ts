/**
 * Discord Slash Commands Handler
 */

import { DiscordDataHandler, DiscordIntegration } from '../types'
import { fetchDiscordWithRateLimit } from '../utils'

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
    console.warn('Discord bot token not configured - returning empty commands list')
    return []
  }

  const guildId: string | undefined = options?.guildId

  try {
    const url = guildId
      ? `https://discord.com/api/v10/applications/${process.env.DISCORD_CLIENT_ID}/guilds/${guildId}/commands`
      : `https://discord.com/api/v10/applications/${process.env.DISCORD_CLIENT_ID}/commands`

    const data = await fetchDiscordWithRateLimit<any[]>(() =>
      fetch(url, {
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
      })
    )

    if (!Array.isArray(data)) return []

    return data.map((cmd: any) => ({
      id: cmd.id,
      name: cmd.name,
      description: cmd.description,
      application_id: cmd.application_id,
      guild_id: cmd.guild_id,
      type: cmd.type,
    }))
  } catch (error: any) {
    console.error('Error fetching Discord commands:', error.message || error)
    return []
  }
}


