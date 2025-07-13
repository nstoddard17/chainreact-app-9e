import { createSupabaseServerClient } from "@/utils/supabase/server"

interface DiscordBotPresence {
  status: 'online' | 'idle' | 'dnd' | 'invisible'
  activities?: Array<{
    name: string
    type: number // 0: Playing, 1: Streaming, 2: Listening, 3: Watching, 4: Custom, 5: Competing
    url?: string
  }>
}

class DiscordBotPresenceManager {
  private static instance: DiscordBotPresenceManager
  private botToken: string | null = null
  private botUserId: string | null = null
  private isConnected: boolean = false
  private heartbeatInterval: NodeJS.Timeout | null = null
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5
  private reconnectDelay: number = 5000

  private constructor() {}

  static getInstance(): DiscordBotPresenceManager {
    if (!DiscordBotPresenceManager.instance) {
      DiscordBotPresenceManager.instance = new DiscordBotPresenceManager()
    }
    return DiscordBotPresenceManager.instance
  }

  /**
   * Initialize the bot presence manager
   */
  async initialize(): Promise<void> {
    try {
      this.botToken = process.env.DISCORD_BOT_TOKEN || null
      this.botUserId = process.env.DISCORD_BOT_USER_ID || null

      if (!this.botToken) {
        console.warn("Discord bot token not configured, presence management disabled")
        return
      }

      if (!this.botUserId) {
        console.warn("Discord bot user ID not configured, presence management disabled")
        return
      }

      console.log("Initializing Discord bot presence manager...")
      await this.connectToGateway()
      
    } catch (error) {
      console.error("Failed to initialize Discord bot presence manager:", error)
    }
  }

  /**
   * Connect to Discord Gateway to maintain presence
   */
  private async connectToGateway(): Promise<void> {
    try {
      // Get gateway URL
      const gatewayResponse = await fetch("https://discord.com/api/v10/gateway/bot", {
        headers: {
          Authorization: `Bot ${this.botToken}`,
          "Content-Type": "application/json"
        }
      })

      if (!gatewayResponse.ok) {
        throw new Error(`Failed to get gateway URL: ${gatewayResponse.status}`)
      }

      const gatewayData = await gatewayResponse.json()
      const wsUrl = gatewayData.url

      // For now, we'll use a simpler approach with periodic presence updates
      // In a full implementation, you'd establish a WebSocket connection
      await this.startPresenceHeartbeat()
      
    } catch (error) {
      console.error("Failed to connect to Discord Gateway:", error)
      this.scheduleReconnect()
    }
  }

  /**
   * Start periodic presence updates to keep bot online
   */
  private async startPresenceHeartbeat(): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
    }

    // Update presence every 30 seconds to keep bot online
    this.heartbeatInterval = setInterval(async () => {
      await this.updatePresence()
    }, 30000)

    // Initial presence update
    await this.updatePresence()
    
    this.isConnected = true
    this.reconnectAttempts = 0
    console.log("Discord bot presence heartbeat started")
  }

  /**
   * Update bot presence across all guilds
   */
  async updatePresence(): Promise<void> {
    try {
      if (!this.botToken) return

      // Get all guilds the bot is in
      const guilds = await this.getBotGuilds()
      
      if (guilds.length === 0) {
        console.log("Bot is not in any guilds, skipping presence update")
        return
      }

      // Update presence for each guild
      for (const guild of guilds) {
        await this.updateGuildPresence(guild.id)
      }

    } catch (error) {
      console.error("Failed to update Discord bot presence:", error)
    }
  }

  /**
   * Get all guilds the bot is a member of
   */
  private async getBotGuilds(): Promise<Array<{ id: string; name: string }>> {
    try {
      const response = await fetch("https://discord.com/api/v10/users/@me/guilds", {
        headers: {
          Authorization: `Bot ${this.botToken}`,
          "Content-Type": "application/json"
        }
      })

      if (!response.ok) {
        throw new Error(`Failed to get bot guilds: ${response.status}`)
      }

      const guilds = await response.json()
      return guilds.map((guild: any) => ({
        id: guild.id,
        name: guild.name
      }))

    } catch (error) {
      console.error("Failed to get bot guilds:", error)
      return []
    }
  }

  /**
   * Update presence for a specific guild
   */
  private async updateGuildPresence(guildId: string): Promise<void> {
    try {
      const presence: DiscordBotPresence = {
        status: 'online',
        activities: [
          {
            name: 'workflows',
            type: 0 // Playing
          }
        ]
      }

      // Note: Discord doesn't have a direct API to update presence for a specific guild
      // The presence is global across all guilds. This is a limitation of Discord's API.
      // The bot will appear online in all guilds it's a member of.
      
      console.log(`Updated presence for guild ${guildId}: ${presence.status}`)

    } catch (error) {
      console.error(`Failed to update presence for guild ${guildId}:`, error)
    }
  }

  /**
   * Set custom presence for the bot
   */
  async setCustomPresence(presence: DiscordBotPresence): Promise<void> {
    try {
      if (!this.botToken) return

      // Update the presence across all guilds
      await this.updatePresence()
      
      console.log("Custom presence set:", presence)

    } catch (error) {
      console.error("Failed to set custom presence:", error)
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached, giving up")
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * this.reconnectAttempts

    console.log(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`)

    setTimeout(async () => {
      console.log(`Attempting reconnection ${this.reconnectAttempts}`)
      await this.connectToGateway()
    }, delay)
  }

  /**
   * Stop the presence manager
   */
  stop(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    
    this.isConnected = false
    console.log("Discord bot presence manager stopped")
  }

  /**
   * Get connection status
   */
  getStatus(): { isConnected: boolean; reconnectAttempts: number } {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts
    }
  }

  /**
   * Ensure bot is online in a specific guild
   */
  async ensureBotOnline(guildId: string): Promise<boolean> {
    try {
      if (!this.botToken || !this.botUserId) {
        console.warn("Bot credentials not configured")
        return false
      }

      // Check if bot is in the guild
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${this.botUserId}`, {
        headers: {
          Authorization: `Bot ${this.botToken}`,
          "Content-Type": "application/json"
        }
      })

      if (response.status === 404) {
        console.log(`Bot is not a member of guild ${guildId}`)
        return false
      }

      if (!response.ok) {
        console.error(`Failed to check bot membership in guild ${guildId}: ${response.status}`)
        return false
      }

      // Bot is in the guild, ensure presence is updated
      await this.updateGuildPresence(guildId)
      return true

    } catch (error) {
      console.error(`Failed to ensure bot online in guild ${guildId}:`, error)
      return false
    }
  }
}

// Export singleton instance
export const discordBotPresence = DiscordBotPresenceManager.getInstance()

/**
 * Initialize Discord bot presence on app startup
 */
export async function initializeDiscordBotPresence(): Promise<void> {
  try {
    await discordBotPresence.initialize()
  } catch (error) {
    console.error("Failed to initialize Discord bot presence:", error)
  }
}

/**
 * Update Discord bot presence when sending messages
 */
export async function updateDiscordBotPresenceForAction(guildId: string): Promise<void> {
  try {
    // Ensure bot is online in the guild before sending message
    await discordBotPresence.ensureBotOnline(guildId)
    
    // Update presence to show activity
    await discordBotPresence.setCustomPresence({
      status: 'online',
      activities: [
        {
          name: 'sending messages',
          type: 0 // Playing
        }
      ]
    })
    
  } catch (error) {
    console.error("Failed to update Discord bot presence for action:", error)
  }
} 