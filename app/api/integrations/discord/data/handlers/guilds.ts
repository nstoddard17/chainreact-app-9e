/**
 * Discord Guilds Handler
 */

import { DiscordIntegration, DiscordGuild, DiscordDataHandler } from '../types'
import { fetchDiscordWithRateLimit, validateDiscordToken } from '../utils'

export const getDiscordGuilds: DiscordDataHandler<DiscordGuild> = async (integration: DiscordIntegration) => {
  try {
    // Validate and get token
    const tokenValidation = await validateDiscordToken(integration)
    
    if (!tokenValidation.success) {
      throw new Error(tokenValidation.error || "Token validation failed")
    }
    
    const data = await fetchDiscordWithRateLimit<any[]>(() => 
      fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers: {
          Authorization: `Bearer ${tokenValidation.token}`,
          "Content-Type": "application/json",
        },
      })
    )

    return (data || []).map((guild: any) => ({
      id: guild.id,
      name: guild.name,
      value: guild.id,
      icon: guild.icon,
      owner: guild.owner,
      permissions: guild.permissions,
      features: guild.features,
      approximate_member_count: guild.approximate_member_count,
      approximate_presence_count: guild.approximate_presence_count,
    }))
  } catch (error: any) {
    console.error("Error fetching Discord guilds:", error)
    
    if (error.message?.includes('authentication') || error.message?.includes('expired')) {
      throw new Error('Discord authentication expired. Please reconnect your account.')
    }
    
    if (error.message?.includes('rate limit')) {
      throw new Error('Discord API rate limit exceeded. Please try again later.')
    }
    
    throw new Error(`Failed to fetch Discord guilds: ${error.message}`)
  }
}