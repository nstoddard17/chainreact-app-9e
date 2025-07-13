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
    return {
      success: false,
      output: {},
      message: error.message || "Failed to add Discord role"
    }
  }
} 

/**
 * Send a direct message to a Discord user
 */
export async function sendDiscordDirectMessage(config: any, userId: string, input: Record<string, any>) {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { userId: targetUserId, message } = resolvedConfig
    if (!targetUserId || !message) throw new Error("User ID and message are required")
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) throw new Error("Discord bot token not configured")
    // Create DM channel
    const dmResponse = await fetch("https://discord.com/api/v10/users/@me/channels", {
      method: "POST",
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: targetUserId })
    })
    if (!dmResponse.ok) throw new Error(`Failed to create DM channel: ${dmResponse.status}`)
    const dmChannel = await dmResponse.json()
    // Send message
    const msgResponse = await fetch(`https://discord.com/api/v10/channels/${dmChannel.id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: message })
    })
    if (!msgResponse.ok) throw new Error(`Failed to send DM: ${msgResponse.status}`)
    const msgData = await msgResponse.json()
    return { success: true, output: msgData, message: "Direct message sent successfully" }
  } catch (error: any) {
    return { success: false, output: {}, message: error.message || "Failed to send DM" }
  }
}

/**
 * Edit a message in a Discord channel
 */
export async function editDiscordMessage(config: any, userId: string, input: Record<string, any>) {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { channelId, messageId, content } = resolvedConfig

    if (!channelId || !messageId || !content) {
      throw new Error("Channel ID, Message ID, and content are required")
    }

    // Get Discord integration to verify connection
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

    // Ensure bot is online
    updateDiscordPresenceForAction()

    // Edit the message
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
      method: "PATCH",
      headers: { 
        Authorization: `Bot ${botToken}`, 
        "Content-Type": "application/json" 
      },
      body: JSON.stringify({ content })
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(`Discord API error: ${response.status} - ${errorData.message || response.statusText}`)
    }

    const data = await response.json()

    return { 
      success: true, 
      output: {
        messageId: data.id,
        channelId: channelId,
        content: content,
        editedTimestamp: data.edited_timestamp,
        author: {
          id: data.author?.id,
          username: data.author?.username,
          bot: data.author?.bot
        },
        discordResponse: data
      }, 
      message: "Message edited successfully" 
    }
  } catch (error: any) {
    return { 
      success: false, 
      output: {}, 
      message: error.message || "Failed to edit message" 
    }
  }
}

/**
 * Delete a message in a Discord channel
 */
export async function deleteDiscordMessage(config: any, userId: string, input: Record<string, any>) {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { channelId, messageId } = resolvedConfig
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) throw new Error("Discord bot token not configured")
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${botToken}` }
    })
    if (!response.ok) throw new Error(`Failed to delete message: ${response.status}`)
    return { success: true, output: {}, message: "Message deleted successfully" }
  } catch (error: any) {
    return { success: false, output: {}, message: error.message || "Failed to delete message" }
  }
}

/**
 * Fetch recent messages from a channel
 */
export async function fetchDiscordMessages(config: any, userId: string, input: Record<string, any>) {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { channelId, limit = 20 } = resolvedConfig
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) throw new Error("Discord bot token not configured")
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages?limit=${limit}`, {
      headers: { Authorization: `Bot ${botToken}` }
    })
    if (!response.ok) throw new Error(`Failed to fetch messages: ${response.status}`)
    const data = await response.json()
    return { success: true, output: data, message: `Fetched ${data.length} messages` }
  } catch (error: any) {
    return { success: false, output: {}, message: error.message || "Failed to fetch messages" }
  }
}

/**
 * Add a reaction to a message
 */
export async function addDiscordReaction(config: any, userId: string, input: Record<string, any>) {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { channelId, messageId, emoji } = resolvedConfig
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) throw new Error("Discord bot token not configured")
    const emojiEncoded = encodeURIComponent(emoji)
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/reactions/${emojiEncoded}/@me`, {
      method: "PUT",
      headers: { Authorization: `Bot ${botToken}` }
    })
    if (!response.ok) throw new Error(`Failed to add reaction: ${response.status}`)
    return { success: true, output: {}, message: "Reaction added successfully" }
  } catch (error: any) {
    return { success: false, output: {}, message: error.message || "Failed to add reaction" }
  }
}

/**
 * Remove a reaction from a message
 */
export async function removeDiscordReaction(config: any, userId: string, input: Record<string, any>) {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { channelId, messageId, emoji, userId: targetUserId } = resolvedConfig
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) throw new Error("Discord bot token not configured")
    const emojiEncoded = encodeURIComponent(emoji)
    const userPart = targetUserId ? targetUserId : "@me"
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/reactions/${emojiEncoded}/${userPart}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${botToken}` }
    })
    if (!response.ok) throw new Error(`Failed to remove reaction: ${response.status}`)
    return { success: true, output: {}, message: "Reaction removed successfully" }
  } catch (error: any) {
    return { success: false, output: {}, message: error.message || "Failed to remove reaction" }
  }
}

/**
 * Fetch users who reacted to a message
 */
export async function fetchDiscordReactions(config: any, userId: string, input: Record<string, any>) {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { channelId, messageId, emoji } = resolvedConfig
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) throw new Error("Discord bot token not configured")
    const emojiEncoded = encodeURIComponent(emoji)
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages/${messageId}/reactions/${emojiEncoded}`, {
      headers: { Authorization: `Bot ${botToken}` }
    })
    if (!response.ok) throw new Error(`Failed to fetch reactions: ${response.status}`)
    const data = await response.json()
    return { success: true, output: data, message: `Fetched ${data.length} users who reacted` }
  } catch (error: any) {
    return { success: false, output: {}, message: error.message || "Failed to fetch reactions" }
  }
} 

/**
 * Edit a Discord channel
 */
export async function editDiscordChannel(config: any, userId: string, input: Record<string, any>) {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { guildId, channelId, ...updateFields } = resolvedConfig
    if (!guildId || !channelId) throw new Error("Guild ID and Channel ID are required")
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) throw new Error("Discord bot token not configured")
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}` , {
      method: "PATCH",
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(updateFields)
    })
    if (!response.ok) throw new Error(`Failed to edit channel: ${response.status}`)
    const data = await response.json()
    return { success: true, output: data, message: "Channel edited successfully" }
  } catch (error: any) {
    return { success: false, output: {}, message: error.message || "Failed to edit channel" }
  }
}

/**
 * Delete a Discord channel
 */
export async function deleteDiscordChannel(config: any, userId: string, input: Record<string, any>) {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { channelId } = resolvedConfig
    if (!channelId) throw new Error("Channel ID is required")
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) throw new Error("Discord bot token not configured")
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}` , {
      method: "DELETE",
      headers: { Authorization: `Bot ${botToken}` }
    })
    if (!response.ok) throw new Error(`Failed to delete channel: ${response.status}`)
    return { success: true, output: {}, message: "Channel deleted successfully" }
  } catch (error: any) {
    return { success: false, output: {}, message: error.message || "Failed to delete channel" }
  }
}

/**
 * List channels in a guild
 */
export async function listDiscordChannels(config: any, userId: string, input: Record<string, any>) {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { guildId } = resolvedConfig
    if (!guildId) throw new Error("Guild ID is required")
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) throw new Error("Discord bot token not configured")
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/channels`, {
      headers: { Authorization: `Bot ${botToken}` }
    })
    if (!response.ok) throw new Error(`Failed to list channels: ${response.status}`)
    const data = await response.json()
    return { success: true, output: data, message: `Fetched ${data.length} channels` }
  } catch (error: any) {
    return { success: false, output: {}, message: error.message || "Failed to list channels" }
  }
}

/**
 * Fetch guild members
 */
export async function fetchDiscordGuildMembers(config: any, userId: string, input: Record<string, any>) {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { guildId, limit = 50, after } = resolvedConfig
    if (!guildId) throw new Error("Guild ID is required")
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) throw new Error("Discord bot token not configured")
    let url = `https://discord.com/api/v10/guilds/${guildId}/members?limit=${limit}`
    if (after) url += `&after=${after}`
    const response = await fetch(url, { headers: { Authorization: `Bot ${botToken}` } })
    if (!response.ok) throw new Error(`Failed to fetch members: ${response.status}`)
    const data = await response.json()
    return { success: true, output: data, message: `Fetched ${data.length} members` }
  } catch (error: any) {
    return { success: false, output: {}, message: error.message || "Failed to fetch members" }
  }
}

/**
 * List roles in a guild
 */
export async function listDiscordRoles(config: any, userId: string, input: Record<string, any>) {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { guildId } = resolvedConfig
    if (!guildId) throw new Error("Guild ID is required")
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) throw new Error("Discord bot token not configured")
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      headers: { Authorization: `Bot ${botToken}` }
    })
    if (!response.ok) throw new Error(`Failed to list roles: ${response.status}`)
    const data = await response.json()
    return { success: true, output: data, message: `Fetched ${data.length} roles` }
  } catch (error: any) {
    return { success: false, output: {}, message: error.message || "Failed to list roles" }
  }
}

/**
 * Create a role in a guild
 */
export async function createDiscordRole(config: any, userId: string, input: Record<string, any>) {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { guildId, ...roleData } = resolvedConfig
    if (!guildId) throw new Error("Guild ID is required")
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) throw new Error("Discord bot token not configured")
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles`, {
      method: "POST",
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(roleData)
    })
    if (!response.ok) throw new Error(`Failed to create role: ${response.status}`)
    const data = await response.json()
    return { success: true, output: data, message: "Role created successfully" }
  } catch (error: any) {
    return { success: false, output: {}, message: error.message || "Failed to create role" }
  }
}

/**
 * Update a role in a guild
 */
export async function updateDiscordRole(config: any, userId: string, input: Record<string, any>) {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { guildId, roleId, ...roleData } = resolvedConfig
    if (!guildId || !roleId) throw new Error("Guild ID and Role ID are required")
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) throw new Error("Discord bot token not configured")
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles/${roleId}`, {
      method: "PATCH",
      headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(roleData)
    })
    if (!response.ok) throw new Error(`Failed to update role: ${response.status}`)
    const data = await response.json()
    return { success: true, output: data, message: "Role updated successfully" }
  } catch (error: any) {
    return { success: false, output: {}, message: error.message || "Failed to update role" }
  }
}

/**
 * Delete a role in a guild
 */
export async function deleteDiscordRole(config: any, userId: string, input: Record<string, any>) {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { guildId, roleId } = resolvedConfig
    if (!guildId || !roleId) throw new Error("Guild ID and Role ID are required")
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) throw new Error("Discord bot token not configured")
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/roles/${roleId}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${botToken}` }
    })
    if (!response.ok) throw new Error(`Failed to delete role: ${response.status}`)
    return { success: true, output: {}, message: "Role deleted successfully" }
  } catch (error: any) {
    return { success: false, output: {}, message: error.message || "Failed to delete role" }
  }
}

/**
 * Remove a role from a Discord user
 */
export async function removeDiscordRole(config: any, userId: string, input: Record<string, any>) {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { guildId, userId: targetUserId, roleId } = resolvedConfig
    if (!guildId || !targetUserId || !roleId) throw new Error("Guild ID, User ID, and Role ID are required")
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) throw new Error("Discord bot token not configured")
    const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${targetUserId}/roles/${roleId}`, {
      method: "DELETE",
      headers: { Authorization: `Bot ${botToken}` }
    })
    if (!response.ok) throw new Error(`Failed to remove role: ${response.status}`)
    return { success: true, output: {}, message: `Role removed from user ${targetUserId}` }
  } catch (error: any) {
    return { success: false, output: {}, message: error.message || "Failed to remove role" }
  }
}

/**
 * Kick a member from a guild
 */
export async function kickDiscordMember(config: any, userId: string, input: Record<string, any>) {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { guildId, userId: targetUserId, reason } = resolvedConfig
    if (!guildId || !targetUserId) throw new Error("Guild ID and User ID are required")
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) throw new Error("Discord bot token not configured")
    const url = `https://discord.com/api/v10/guilds/${guildId}/members/${targetUserId}`
    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bot ${botToken}` , ...(reason ? { "X-Audit-Log-Reason": encodeURIComponent(reason) } : {}) }
    })
    if (!response.ok) throw new Error(`Failed to kick member: ${response.status}`)
    return { success: true, output: {}, message: `Member ${targetUserId} kicked from guild` }
  } catch (error: any) {
    return { success: false, output: {}, message: error.message || "Failed to kick member" }
  }
}

/**
 * Ban a member from a guild
 */
export async function banDiscordMember(config: any, userId: string, input: Record<string, any>) {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { guildId, userId: targetUserId, deleteMessageSeconds = 0, reason } = resolvedConfig
    if (!guildId || !targetUserId) throw new Error("Guild ID and User ID are required")
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) throw new Error("Discord bot token not configured")
    let url = `https://discord.com/api/v10/guilds/${guildId}/bans/${targetUserId}?delete_message_seconds=${deleteMessageSeconds}`
    const response = await fetch(url, {
      method: "PUT",
      headers: { Authorization: `Bot ${botToken}` , ...(reason ? { "X-Audit-Log-Reason": encodeURIComponent(reason) } : {}) }
    })
    if (!response.ok) throw new Error(`Failed to ban member: ${response.status}`)
    return { success: true, output: {}, message: `Member ${targetUserId} banned from guild` }
  } catch (error: any) {
    return { success: false, output: {}, message: error.message || "Failed to ban member" }
  }
}

/**
 * Unban a member from a guild
 */
export async function unbanDiscordMember(config: any, userId: string, input: Record<string, any>) {
  try {
    const resolvedConfig = resolveValue(config, { input })
    const { guildId, userId: targetUserId, reason } = resolvedConfig
    if (!guildId || !targetUserId) throw new Error("Guild ID and User ID are required")
    const botToken = process.env.DISCORD_BOT_TOKEN
    if (!botToken) throw new Error("Discord bot token not configured")
    let url = `https://discord.com/api/v10/guilds/${guildId}/bans/${targetUserId}`
    const response = await fetch(url, {
      method: "DELETE",
      headers: { Authorization: `Bot ${botToken}` , ...(reason ? { "X-Audit-Log-Reason": encodeURIComponent(reason) } : {}) }
    })
    if (!response.ok) throw new Error(`Failed to unban member: ${response.status}`)
    return { success: true, output: {}, message: `Member ${targetUserId} unbanned from guild` }
  } catch (error: any) {
    return { success: false, output: {}, message: error.message || "Failed to unban member" }
  }
} 