import { EventEmitter } from 'events'
import { checkDiscordBotConfig } from '@/lib/utils/discordConfig'

interface DiscordGatewayPayload {
  op: number
  d?: any
  s?: number
  t?: string
}

interface DiscordIdentifyPayload {
  token: string
  properties: {
    os: string
    browser: string
    device: string
  }
  presence: {
    status: 'online' | 'idle' | 'dnd' | 'invisible'
    since: number | null
    activities: Array<{
      name: string
      type: number
      url?: string
    }> | null
    afk: boolean
  }
  compress?: boolean
  large_threshold?: number
  shard?: [number, number]
  intents?: number
}

class DiscordGateway extends EventEmitter {
  private ws: WebSocket | null = null
  private botToken: string | null = null
  private heartbeatInterval: NodeJS.Timeout | null = null
  private heartbeatAck: boolean = true
  private sequence: number | null = null
  private sessionId: string | null = null
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 10
  private reconnectDelay: number = 5000
  private persistentReconnect: boolean = true
  private isConnected: boolean = false

  constructor() {
    super()
  }

  /**
   * Connect to Discord Gateway
   */
  async connect(): Promise<void> {
    try {
      const config = checkDiscordBotConfig()
      
      if (!config.isConfigured) {
        throw new Error(`Discord bot not configured. Missing: ${config.missingVars.join(', ')}`)
      }
      
      this.botToken = config.botToken

      // Get gateway URL
      const gatewayResponse = await fetch("https://discord.com/api/v10/gateway/bot", {
        headers: {
          Authorization: `Bot ${this.botToken}`,
          "Content-Type": "application/json"
        }
      })

      if (gatewayResponse.status === 429) {
        // Rate limited by Discord
        const retryAfter = gatewayResponse.headers.get('Retry-After')
        const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 30000 // default 30s
        console.warn(`Rate limited by Discord Gateway. Waiting ${waitTime / 1000}s before retrying.`)
        await new Promise(res => setTimeout(res, waitTime))
        this.scheduleReconnect(true) // pass true to indicate rate limit
        return
      }

      if (!gatewayResponse.ok) {
        throw new Error(`Failed to get gateway URL: ${gatewayResponse.status}`)
      }

      const gatewayData = await gatewayResponse.json()
      const wsUrl = `${gatewayData.url}?v=10&encoding=json`

      // Create WebSocket connection
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        this.isConnected = true
        this.reconnectAttempts = 0 // Reset attempts on success
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data)
      }

      this.ws.onclose = (event) => {
        this.isConnected = false
        this.cleanup()
        // Only reconnect for non-normal closures
        if (event.code !== 1000) {
          this.scheduleReconnect()
        }
      }

      this.ws.onerror = (error) => {
        // Silent error handling
      }

    } catch (error) {
      console.error("Failed to connect to Discord Gateway:", error)
      this.scheduleReconnect()
    }
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    try {
      const payload: DiscordGatewayPayload = JSON.parse(data)

      switch (payload.op) {
        case 10: // Hello
          this.handleHello(payload.d)
          break
        case 11: // Heartbeat ACK
          this.heartbeatAck = true
          break
        case 0: // Dispatch
          this.handleDispatch(payload)
          break
        case 7: // Reconnect
          this.reconnect()
          break
        case 9: // Invalid Session
          this.reconnect()
          break
        default:
          // Silent handling of unhandled opcodes
          break
      }

    } catch (error) {
      // Silent error handling
    }
  }

  /**
   * Handle Hello payload and start heartbeat
   */
  private handleHello(data: any): void {
    const heartbeatInterval = data.heartbeat_interval
    
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat()
    }, heartbeatInterval)

    // Send identify payload
    this.sendIdentify()
  }

  /**
   * Handle dispatch events
   */
  private handleDispatch(payload: DiscordGatewayPayload): void {
    this.sequence = payload.s || null
    
    switch (payload.t) {
      case 'READY':
        this.handleReady(payload.d)
        break
      case 'RESUMED':
        this.handleResumed(payload.d)
        break
      default:
        // Handle other events as needed
        break
    }
  }

  /**
   * Handle Ready event
   */
  private handleReady(data: any): void {
    this.sessionId = data.session_id
    this.emit('ready', data)
  }

  /**
   * Handle Resumed event
   */
  private handleResumed(data: any): void {
    this.emit('resumed', data)
  }

  /**
   * Send identify payload
   */
  private sendIdentify(): void {
    // Discord Gateway intents
    const INTENTS = {
      GUILDS: 1 << 0,
      GUILD_MEMBERS: 1 << 1,
      GUILD_BANS: 1 << 2,
      GUILD_EMOJIS_AND_STICKERS: 1 << 3,
      GUILD_INTEGRATIONS: 1 << 4,
      GUILD_WEBHOOKS: 1 << 5,
      GUILD_INVITES: 1 << 6,
      GUILD_VOICE_STATES: 1 << 7,
      GUILD_PRESENCES: 1 << 8,
      GUILD_MESSAGES: 1 << 9,
      GUILD_MESSAGE_REACTIONS: 1 << 10,
      GUILD_MESSAGE_TYPING: 1 << 11,
      DIRECT_MESSAGES: 1 << 12,
      DIRECT_MESSAGE_REACTIONS: 1 << 13,
      DIRECT_MESSAGE_TYPING: 1 << 14,
      MESSAGE_CONTENT: 1 << 15,
      GUILD_SCHEDULED_EVENTS: 1 << 16,
      AUTO_MODERATION_CONFIGURATION: 1 << 20,
      AUTO_MODERATION_EXECUTION: 1 << 21
    }

    // Calculate required intents for bot functionality
    const requiredIntents = 
      INTENTS.GUILDS | 
      INTENTS.GUILD_MESSAGES | 
      INTENTS.MESSAGE_CONTENT

    const identify: DiscordIdentifyPayload = {
      token: this.botToken!,
      properties: {
        os: "linux",
        browser: "ChainReact",
        device: "ChainReact"
      },
      presence: {
        status: "online",
        since: null,
        activities: [
          {
            name: "workflows",
            type: 0 // Playing
          }
        ],
        afk: false
      },
      compress: false,
      large_threshold: 250,
      intents: requiredIntents
    }

    this.send({
      op: 2,
      d: identify
    })
  }

  /**
   * Send heartbeat
   */
  private sendHeartbeat(): void {
    if (!this.heartbeatAck) {
      this.ws?.close(1000, "Heartbeat timeout")
      return
    }

    this.heartbeatAck = false
    
    this.send({
      op: 1,
      d: this.sequence
    })
  }

  /**
   * Send payload to Discord Gateway
   */
  private send(payload: DiscordGatewayPayload): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload))
    }
  }

  /**
   * Update bot presence
   */
  updatePresence(presence: {
    status?: 'online' | 'idle' | 'dnd' | 'invisible'
    activities?: Array<{
      name: string
      type: number
      url?: string
    }>
    since?: number | null
    afk?: boolean
  }): void {
    const payload = {
      op: 3,
      d: {
        status: presence.status || "online",
        since: presence.since || null,
        activities: presence.activities || null,
        afk: presence.afk || false
      }
    }

    this.send(payload)
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(rateLimited = false): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts && !this.persistentReconnect) {
      return
    }

    this.reconnectAttempts++
    // If rate limited, always wait at least 30s
    const delay = rateLimited ? 30000 : this.reconnectDelay * this.reconnectAttempts

    setTimeout(() => {
      this.reconnect()
    }, delay)
  }

  /**
   * Reconnect to Discord Gateway
   */
  async reconnect(): Promise<void> {
    this.cleanup()
    await this.connect()
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    
    this.isConnected = false
  }

  /**
   * Disconnect from Discord Gateway
   */
  disconnect(): void {
    this.cleanup()
  }

  /**
   * Get connection status
   */
  getStatus(): { isConnected: boolean; reconnectAttempts: number; sessionId: string | null } {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      sessionId: this.sessionId
    }
  }

  /**
   * Enable persistent reconnection (bot will always try to stay connected)
   */
  enablePersistentReconnect(): void {
    this.persistentReconnect = true
  }

  /**
   * Disable persistent reconnection
   */
  disablePersistentReconnect(): void {
    this.persistentReconnect = false
  }
}

// Export singleton instance
export const discordGateway = new DiscordGateway()

/**
 * Initialize Discord Gateway connection
 */
export async function initializeDiscordGateway(): Promise<void> {
  try {
    // Check if Discord bot is configured before attempting to connect
    const config = checkDiscordBotConfig()
    
    if (!config.isConfigured) {
      // Discord bot not configured, don't attempt to connect
      console.log('Discord bot not configured, skipping Gateway connection')
      return
    }
    
    // Enable persistent reconnection to keep bot always online
    discordGateway.enablePersistentReconnect()
    
    await discordGateway.connect()
  } catch (error) {
    // Silent error handling
    console.log('Discord Gateway connection failed:', error)
  }
}

/**
 * Update Discord bot presence for actions
 */
export function updateDiscordPresenceForAction(): void {
  discordGateway.updatePresence({
    status: "online",
    activities: [
      {
        name: "sending messages",
        type: 0 // Playing
      }
    ]
  })
} 