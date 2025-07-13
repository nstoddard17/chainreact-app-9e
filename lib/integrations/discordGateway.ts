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
  private maxReconnectAttempts: number = 5
  private reconnectDelay: number = 5000
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

      if (!gatewayResponse.ok) {
        throw new Error(`Failed to get gateway URL: ${gatewayResponse.status}`)
      }

      const gatewayData = await gatewayResponse.json()
      const wsUrl = `${gatewayData.url}?v=10&encoding=json`

      console.log("Connecting to Discord Gateway...")
      
      // Create WebSocket connection
      this.ws = new WebSocket(wsUrl)

      this.ws.onopen = () => {
        console.log("Connected to Discord Gateway")
        this.isConnected = true
        this.reconnectAttempts = 0
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data)
      }

      this.ws.onclose = (event) => {
        console.log("Discord Gateway connection closed:", event.code, event.reason)
        this.isConnected = false
        this.cleanup()
        
        // Handle specific error codes
        switch (event.code) {
          case 4001: // Unknown opcode
            console.error("Discord Gateway: Unknown opcode sent")
            break
          case 4002: // Decode error
            console.error("Discord Gateway: Invalid payload sent")
            break
          case 4003: // Not authenticated
            console.error("Discord Gateway: Not authenticated - check bot token")
            break
          case 4004: // Authentication failed
            console.error("Discord Gateway: Authentication failed - invalid bot token")
            break
          case 4005: // Already authenticated
            console.error("Discord Gateway: Already authenticated")
            break
          case 4007: // Invalid sequence
            console.error("Discord Gateway: Invalid sequence")
            break
          case 4008: // Rate limited
            console.error("Discord Gateway: Rate limited")
            break
          case 4009: // Session timed out
            console.error("Discord Gateway: Session timed out")
            break
          case 4010: // Invalid shard
            console.error("Discord Gateway: Invalid shard")
            break
          case 4011: // Sharding required
            console.error("Discord Gateway: Sharding required")
            break
          case 4012: // Invalid API version
            console.error("Discord Gateway: Invalid API version")
            break
          case 4013: // Invalid intent(s)
            console.error("Discord Gateway: Invalid intent(s) - check bot intents in Discord Developer Portal")
            console.error("Required intents: GUILDS, GUILD_MESSAGES, MESSAGE_CONTENT")
            break
          case 4014: // Disallowed intent(s)
            console.error("Discord Gateway: Disallowed intent(s) - bot doesn't have required intents")
            break
          default:
            if (event.code !== 1000) { // Not a normal closure
              this.scheduleReconnect()
            }
        }
      }

      this.ws.onerror = (error) => {
        console.error("Discord Gateway WebSocket error:", error)
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
      
      console.log("Received Discord Gateway payload:", payload.op, payload.t)

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
          console.log("Discord requested reconnect")
          this.reconnect()
          break
        case 9: // Invalid Session
          console.log("Invalid session, reconnecting...")
          this.reconnect()
          break
        default:
          console.log("Unhandled Discord Gateway opcode:", payload.op)
      }

    } catch (error) {
      console.error("Failed to parse Discord Gateway message:", error)
    }
  }

  /**
   * Handle Hello payload and start heartbeat
   */
  private handleHello(data: any): void {
    const heartbeatInterval = data.heartbeat_interval
    
    console.log(`Starting heartbeat with interval: ${heartbeatInterval}ms`)
    
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
    console.log(`Discord bot ready! Logged in as ${data.user.username}#${data.user.discriminator}`)
    console.log(`Connected to ${data.guilds.length} guilds`)
    
    this.emit('ready', data)
  }

  /**
   * Handle Resumed event
   */
  private handleResumed(data: any): void {
    console.log("Discord session resumed")
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
      console.warn("Previous heartbeat not acknowledged, closing connection")
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
    } else {
      console.warn("WebSocket not open, cannot send payload")
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
    console.log("Updated Discord bot presence:", presence)
  }

  /**
   * Schedule reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached, giving up")
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * this.reconnectAttempts

    console.log(`Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay}ms`)

    setTimeout(() => {
      console.log(`Attempting reconnection ${this.reconnectAttempts}`)
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
    console.log("Disconnecting from Discord Gateway...")
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
}

// Export singleton instance
export const discordGateway = new DiscordGateway()

/**
 * Initialize Discord Gateway connection
 */
export async function initializeDiscordGateway(): Promise<void> {
  try {
    await discordGateway.connect()
  } catch (error) {
    console.error("Failed to initialize Discord Gateway:", error)
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