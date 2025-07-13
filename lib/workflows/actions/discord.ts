import { ActionResult } from './core/executeWait'
import { getDecryptedAccessToken } from './core/getDecryptedAccessToken'
import { resolveValue } from './core/resolveValue'
import { updateDiscordPresenceForAction } from '@/lib/integrations/discordGateway'

/**
 * Send a message to a Discord channel
 */
export async function sendDiscordMessage(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    // Resolve templated values
    const resolvedConfig = resolveValue(config, { input })
    
    const {
      guildId,
      channelId,
      message,
      embed = false,
      embedTitle,
      embedDescription,
      embedColor,
      embedFields = [],
      embedImage,
      embedThumbnail,
      embedFooter,
      embedTimestamp = false
    } = resolvedConfig

    if (!guildId || !channelId || !message) {
      throw new Error("Guild ID, Channel ID, and message are required")
    }

    // Get Discord integration
    const { createSupabaseServerClient } = await import("@/utils/supabase/server")
    const supabase = await createSupabaseServerClient()
    
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "discord")
      .eq("status", "connected")
      .single()

    if (!integration) {
      throw new Error("Discord integration not connected")
    }

    // Get bot token for sending messages
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) {
      throw new Error("Discord bot token not configured")
    }

    // Check if bot is in the guild
    const botUserId = process.env.DISCORD_BOT_USER_ID
    if (!botUserId) {
      throw new Error("Discord bot user ID not configured")
    }

    // Verify bot is in the guild and ensure it's online
    const guildCheckResponse = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${botUserId}`, {
      headers: { 
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json"
      }
    })

    if (guildCheckResponse.status === 404) {
      throw new Error("Bot is not a member of this Discord server. Please add the bot to the server first.")
    }

    if (!guildCheckResponse.ok) {
      throw new Error(`Failed to verify bot membership: ${guildCheckResponse.status}`)
    }

    // Ensure bot is online in this guild
    updateDiscordPresenceForAction()

    // Prepare message payload
    const payload: any = {
      content: message
    }

    // Add embed if configured
    if (embed && (embedTitle || embedDescription)) {
      payload.embeds = [{
        title: embedTitle,
        description: embedDescription,
        color: embedColor ? parseInt(embedColor.replace('#', ''), 16) : undefined,
        fields: embedFields.map((field: any) => ({
          name: field.name,
          value: field.value,
          inline: field.inline || false
        })),
        image: embedImage ? { url: embedImage } : undefined,
        thumbnail: embedThumbnail ? { url: embedThumbnail } : undefined,
        footer: embedFooter ? { text: embedFooter } : undefined,
        timestamp: embedTimestamp ? new Date().toISOString() : undefined
      }]
    }

    // Send message
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Discord API error: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      success: true,
      output: {
        messageId: result.id,
        channelId: channelId,
        guildId: guildId,
        content: message,
        timestamp: result.timestamp,
        author: {
          id: result.author?.id,
          username: result.author?.username,
          bot: result.author?.bot
        },
        embed: embed,
        discordResponse: result
      },
      message: `Message sent successfully to Discord channel #${result.channel_id}`
    }

  } catch (error: any) {
    console.error("Discord send message error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to send Discord message"
    }
  }
}

/**
 * Create a Discord channel
 */
export async function createDiscordChannel(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    
    const {
      guildId,
      name,
      type = 0, // 0 = text channel, 2 = voice channel
      topic,
      nsfw = false,
      parentId,
      position,
      permissionOverwrites = []
    } = resolvedConfig

    if (!guildId || !name) {
      throw new Error("Guild ID and channel name are required")
    }

    // Get Discord integration
    const { createSupabaseServerClient } = await import("@/utils/supabase/server")
    const supabase = await createSupabaseServerClient()
    
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "discord")
      .eq("status", "connected")
      .single()

    if (!integration) {
      throw new Error("Discord integration not connected")
    }

    // Get bot token
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) {
      throw new Error("Discord bot token not configured")
    }

    // Create channel payload
    const payload: any = {
      name: name,
      type: type,
      topic: topic,
      nsfw: nsfw
    }

    if (parentId) payload.parent_id = parentId
    if (position !== undefined) payload.position = position
    if (permissionOverwrites.length > 0) payload.permission_overwrites = permissionOverwrites

    // Create channel
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Discord API error: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const result = await response.json()

    return {
      success: true,
      output: {
        channelId: result.id,
        guildId: guildId,
        name: result.name,
        type: result.type,
        topic: result.topic,
        nsfw: result.nsfw,
        parentId: result.parent_id,
        position: result.position,
        discordResponse: result
      },
      message: `Discord channel #${result.name} created successfully`
    }

  } catch (error: any) {
    console.error("Discord create channel error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to create Discord channel"
    }
  }
}

/**
 * Add a role to a Discord user
 */
export async function addDiscordRole(
  config: any,
  userId: string,
  input: Record<string, any>
): Promise<ActionResult> {
  try {
    const resolvedConfig = resolveValue(config, { input })
    
    const {
      guildId,
      userId: targetUserId,
      roleId
    } = resolvedConfig

    if (!guildId || !targetUserId || !roleId) {
      throw new Error("Guild ID, User ID, and Role ID are required")
    }

    // Get Discord integration
    const { createSupabaseServerClient } = await import("@/utils/supabase/server")
    const supabase = await createSupabaseServerClient()
    
    const { data: integration } = await supabase
      .from("integrations")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "discord")
      .eq("status", "connected")
      .single()

    if (!integration) {
      throw new Error("Discord integration not connected")
    }

    // Get bot token
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) {
      throw new Error("Discord bot token not configured")
    }

    // Add role to user
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${targetUserId}/roles/${roleId}`, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json"
      }
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Discord API error: ${response.status} - ${errorData.message || response.statusText}`)
    }

    return {
      success: true,
      output: {
        guildId: guildId,
        userId: targetUserId,
        roleId: roleId,
        added: true,
        timestamp: new Date().toISOString()
      },
      message: `Role added successfully to user ${targetUserId}`
    }

  } catch (error: any) {
    console.error("Discord add role error:", error)
    return {
      success: false,
      output: {},
      message: error.message || "Failed to add Discord role"
    }
  }
} 