import { DiscordIntegration } from '../types'

/**
 * Fetch invites for a Discord guild
 */
export async function getDiscordInvites(
  integration: DiscordIntegration,
  params: { guildId: string }
): Promise<any[]> {
  const { guildId } = params

  if (!guildId) {
    throw new Error('Guild ID is required')
  }

  // Use bot token for fetching invites
  const botToken = process.env.DISCORD_BOT_TOKEN
  if (!botToken) {
    throw new Error('Discord bot token not configured')
  }

  try {
    // Fetch invites from Discord API
    const response = await fetch(
      `https://discord.com/api/v10/guilds/${guildId}/invites`,
      {
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json'
        }
      }
    )

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))

      if (response.status === 403) {
        throw new Error('Bot does not have permission to view invites in this server')
      }

      if (response.status === 404) {
        throw new Error('Server not found or bot is not a member')
      }

      throw new Error(`Discord API error: ${errorData.message || response.statusText}`)
    }

    const invites = await response.json()

    // Format invites for dropdown
    const formattedInvites = invites.map((invite: any) => ({
      value: invite.code,
      label: `discord.gg/${invite.code}${invite.channel ? ` (#${invite.channel.name})` : ''}`,
      code: invite.code,
      url: `https://discord.gg/${invite.code}`,
      channel: invite.channel ? {
        id: invite.channel.id,
        name: invite.channel.name,
        type: invite.channel.type
      } : null,
      inviter: invite.inviter ? {
        id: invite.inviter.id,
        username: invite.inviter.username,
        discriminator: invite.inviter.discriminator,
        tag: `${invite.inviter.username}#${invite.inviter.discriminator}`
      } : null,
      uses: invite.uses || 0,
      maxUses: invite.max_uses || null,
      maxAge: invite.max_age || null,
      temporary: invite.temporary || false,
      createdAt: invite.created_at,
      expiresAt: invite.expires_at || null
    }))

    return formattedInvites
  } catch (error: any) {
    console.error('Error fetching Discord invites:', error)
    throw error
  }
}