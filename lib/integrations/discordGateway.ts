// Use Node.js EventEmitter only on server-side
import { checkDiscordBotConfig, validateDiscordBotToken } from '@/lib/utils/discordConfig'

// Create a simple EventEmitter implementation for compatibility
class SimpleEventEmitter {
  private events: Map<string, Function[]> = new Map()

  on(event: string, listener: Function): void {
    if (!this.events.has(event)) {
      this.events.set(event, [])
    }
    this.events.get(event)!.push(listener)
  }

  emit(event: string, ...args: any[]): void {
    const listeners = this.events.get(event)
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(...args)
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error)
        }
      })
    }
  }

  removeListener(event: string, listener: Function): void {
    const listeners = this.events.get(event)
    if (listeners) {
      const index = listeners.indexOf(listener)
      if (index !== -1) {
        listeners.splice(index, 1)
      }
    }
  }

  removeAllListeners(event?: string): void {
    if (event) {
      this.events.delete(event)
    } else {
      this.events.clear()
    }
  }
}

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

class DiscordGateway extends SimpleEventEmitter {
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
  private lastSuccessfulConnection: number = 0
  private connectionHealthCheck: NodeJS.Timeout | null = null

  constructor() {
    super()
  }

  /**
   * Fetch with retry logic for transient errors (503, 502, 500, network errors)
   */
  private async fetchWithRetry(url: string, options: RequestInit, maxRetries: number = 3): Promise<Response | null> {
    let lastError: Error | null = null
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(url, options)
        
        // If we get a transient error, retry
        if (response.status === 503 || response.status === 502 || response.status === 500) {
          const errorText = await response.text().catch(() => 'Service unavailable')
          lastError = new Error(`Discord API ${response.status}: ${errorText}`)
          
          if (attempt < maxRetries) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000) // Exponential backoff, max 10s
            console.warn(`Discord API ${response.status} error (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`)
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
        }
        
        // For other status codes (including 429, 401, 403), return immediately
        return response
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Network error')
        
        if (attempt < maxRetries) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000) // Exponential backoff, max 10s
          console.warn(`Discord API network error (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`, error)
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
      }
    }
    
    // All retries failed
    console.error(`Discord API failed after ${maxRetries} attempts:`, lastError)
    return null
  }

  /**
   * Connect to Discord Gateway
   */
  async connect(): Promise<void> {
    try {
      const config = checkDiscordBotConfig()

      if (!config.isConfigured) {
        console.error('❌ Discord bot not configured. Missing environment variables:', config.missingVars)
        throw new Error(`Discord bot not configured. Missing: ${config.missingVars.join(', ')}`)
      }

      this.botToken = config.botToken

      // Log token info for debugging (only first and last few chars for security)
      if (this.botToken) {
        // Remove quotes if they exist (common mistake in .env files)
        this.botToken = this.botToken.replace(/^["']|["']$/g, '')

        const tokenPreview = `${this.botToken.substring(0, 10)}...${this.botToken.substring(this.botToken.length - 5)}`
        console.log(`🔑 Using Discord bot token: ${tokenPreview}`)

        // Basic token format validation
        if (!validateDiscordBotToken(this.botToken)) {
          console.error('⚠️ Discord bot token appears to be malformed')
          console.error('Token should be in format: [base64].[base64].[base64]')
        }
      } else {
        console.error('❌ Discord bot token is null or undefined')
        throw new Error('Discord bot token is not available')
      }

      // Get gateway URL with retry logic for transient errors
      const gatewayResponse = await this.fetchWithRetry("https://discord.com/api/v10/gateway/bot", {
        headers: {
          Authorization: `Bot ${this.botToken}`,
          "Content-Type": "application/json"
        }
      })

      if (!gatewayResponse) {
        throw new Error("Failed to get gateway URL after multiple retries")
      }

      if (gatewayResponse.status === 429) {
        // Rate limited by Discord
        const retryAfter = gatewayResponse.headers.get('Retry-After')
        const waitTime = retryAfter ? parseInt(retryAfter, 10) * 1000 : 30000 // default 30s
        console.warn(`Discord Gateway rate limited. Waiting ${waitTime / 1000}s before retrying.`)
        await new Promise(res => setTimeout(res, waitTime))
        this.scheduleReconnect(true, false) // Rate limited
        return
      }

      if (!gatewayResponse.ok) {
        const errorText = await gatewayResponse.text().catch(() => 'Unknown error')
        const isTransientError = gatewayResponse.status === 503 || gatewayResponse.status === 502 || gatewayResponse.status === 500

        if (gatewayResponse.status === 401) {
          console.error('❌ Discord bot token is invalid or expired (401 Unauthorized)')
          console.error('Please check:')
          console.error('1. The DISCORD_BOT_TOKEN in your .env.local file is correct')
          console.error('2. The bot still exists in Discord Developer Portal')
          console.error('3. You may need to regenerate the token at: https://discord.com/developers/applications')

          // Disable persistent reconnect to avoid spamming with invalid token
          this.disablePersistentReconnect()
          console.log('⚠️ Disabled automatic reconnection due to invalid token')

          throw new Error(`Discord bot token is invalid or expired. Please update DISCORD_BOT_TOKEN in .env.local`)
        } else if (isTransientError) {
          console.warn(`Discord Gateway transient error ${gatewayResponse.status}: ${errorText}`)
          this.scheduleReconnect(false, true) // Transient error
          return
        } else {
          throw new Error(`Discord Gateway API error ${gatewayResponse.status}: ${errorText}`)
        }
      }

      const gatewayData = await gatewayResponse.json()
      const wsUrl = `${gatewayData.url}?v=10&encoding=json`

      // Create WebSocket connection
      // On server-side, use ws package; on client-side, use browser WebSocket
      if (typeof window === 'undefined') {
        // Server-side: dynamically import ws
        try {
          const WebSocketModule = await import('ws')
          const WebSocketImpl = WebSocketModule.default || WebSocketModule.WebSocket
          this.ws = new WebSocketImpl(wsUrl) as any
        } catch (error) {
          console.error('Failed to import ws package. Please install it: npm install ws', error)
          throw new Error('WebSocket implementation not available on server. Install ws package.')
        }
      } else {
        // Client-side: use browser WebSocket
        this.ws = new WebSocket(wsUrl)
      }

      this.ws.onopen = () => {
        this.isConnected = true
        this.reconnectAttempts = 0 // Reset attempts on success
        this.lastSuccessfulConnection = Date.now()
        console.log('Discord Gateway WebSocket connection established')
        
        // Start connection health monitoring
        this.startHealthCheck()
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
      
      // Determine if this is a transient error that should be retried quickly
      const errorMessage = error instanceof Error ? error.message : String(error)
      const isTransientError = errorMessage.includes('503') || 
                              errorMessage.includes('502') || 
                              errorMessage.includes('500') ||
                              errorMessage.includes('network') ||
                              errorMessage.includes('timeout')
      
      this.scheduleReconnect(false, isTransientError)
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
          this.lastSuccessfulConnection = Date.now() // Update health timestamp
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
    this.lastSuccessfulConnection = Date.now() // Update health timestamp
    
    switch (payload.t) {
      case 'READY':
        this.handleReady(payload.d)
        break
      case 'RESUMED':
        this.handleResumed(payload.d)
        break
      case 'MESSAGE_CREATE':
        this.handleMessageCreate(payload.d)
        break
      default:
        // Log other events for debugging
        if (payload.t) {
          console.log(`📡 Discord event received: ${payload.t}`)
        }
        break
    }
  }

  /**
   * Handle Ready event
   */
  private handleReady(data: any): void {
    this.sessionId = data.session_id
    console.log('🎉 Discord bot ready!', {
      sessionId: this.sessionId,
      username: data.user?.username,
      userId: data.user?.id,
      guildCount: data.guilds?.length || 0
    })
    this.emit('ready', data)
  }

  /**
   * Handle Resumed event
   */
  private handleResumed(data: any): void {
    this.emit('resumed', data)
  }

  /**
   * Handle MESSAGE_CREATE event and trigger workflows
   */
  private handleMessageCreate(messageData: any): void {
    console.log('🔵 Discord MESSAGE_CREATE received:', {
      messageId: messageData.id,
      channelId: messageData.channel_id,
      guildId: messageData.guild_id,
      content: messageData.content?.substring(0, 100),
      author: messageData.author?.username,
      isBot: messageData.author?.bot
    })

    // Ignore messages from bots (including our own bot)
    if (messageData.author?.bot) {
      console.log('🤖 Ignoring bot message')
      return
    }

    console.log('💬 Processing user message for workflows')

    // Emit message event for workflow processing
    this.emit('message', messageData)

    // Trigger workflow processing
    this.processDiscordMessageForWorkflows(messageData)
  }

  /**
   * Process Discord message and trigger matching workflows
   */
  private async processDiscordMessageForWorkflows(messageData: any): Promise<void> {
    try {
      // Get the base URL for internal API calls
      let baseUrl: string

      // Check for explicitly configured URL first
      if (process.env.NEXT_PUBLIC_APP_URL) {
        baseUrl = process.env.NEXT_PUBLIC_APP_URL
        console.log(`📍 Using configured URL: ${baseUrl}`)
      } else if (process.env.NODE_ENV === 'production') {
        // In production, use deployment URL
        baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
                  process.env.RENDER_EXTERNAL_URL ||
                  'https://chainreact.app' // Your production domain
      } else {
        // In development, check for NEXT_PUBLIC_APP_URL first
        baseUrl = process.env.NEXT_PUBLIC_APP_URL || ''

        if (!baseUrl) {
          // Try to detect the port dynamically in development
          const ports = ['3001', '3000', '3002', '3003']

          for (const port of ports) {
            const testUrl = `http://localhost:${port}`
            try {
              // Quick health check to see if server is running on this port
              const testResponse = await fetch(`${testUrl}/api/workflow/discord`, {
                method: 'HEAD',
                signal: AbortSignal.timeout(500) // 500ms timeout
              }).catch(() => null)

              if (testResponse) {
                baseUrl = testUrl
                console.log(`✅ Discord Gateway found Next.js server at port ${port}`)
                break
              }
            } catch {
              // Try next port
            }
          }

          // Default fallback for development
          if (!baseUrl) {
            baseUrl = 'http://localhost:3000'
            console.warn('⚠️ Discord Gateway using default port 3000 - may not be correct')
          }
        }
      }

      console.log(`📤 Sending Discord message to workflow endpoint: ${baseUrl}/api/workflow/discord`)
      console.log(`📨 Message details:`, {
        messageId: messageData.id,
        channelId: messageData.channel_id,
        guildId: messageData.guild_id,
        content: messageData.content?.substring(0, 50) + '...',
        author: messageData.author?.username
      })

      // Send to webhook processing endpoint
      const response = await fetch(`${baseUrl}/api/workflow/discord`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ChainReact-DiscordGateway/1.0'
        },
        body: JSON.stringify(messageData)
      })

      if (!response.ok) {
        console.error('Failed to process Discord message for workflows:', response.status)
      } else {
        console.log('✅ Discord message processed for workflows:', {
          messageId: messageData.id,
          channelId: messageData.channel_id,
          author: messageData.author?.username
        })
      }
    } catch (error) {
      console.error('Error processing Discord message for workflows:', error)
    }
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

    console.log('🔑 Sending identify with intents:', {
      GUILDS: true,
      GUILD_MESSAGES: true,
      MESSAGE_CONTENT: true,
      intentsValue: requiredIntents
    })

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
    // Check WebSocket OPEN state (1 = OPEN)
    if (this.ws && this.ws.readyState === 1) {
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
   * Schedule reconnection with improved backoff strategy
   */
  private scheduleReconnect(rateLimited = false, isTransientError = false): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts && !this.persistentReconnect) {
      console.warn(`Discord Gateway: Max reconnection attempts (${this.maxReconnectAttempts}) reached. Stopping reconnection attempts.`)
      return
    }

    this.reconnectAttempts++
    
    let delay: number
    if (rateLimited) {
      // Rate limited - wait at least 30s
      delay = 30000
    } else if (isTransientError) {
      // Transient errors (503, 502, 500) - shorter exponential backoff
      delay = Math.min(5000 * Math.pow(1.5, this.reconnectAttempts - 1), 60000) // Max 1 minute
    } else {
      // Regular reconnection - standard exponential backoff
      delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 300000) // Max 5 minutes
    }

    console.log(`Discord Gateway: Scheduling reconnection attempt ${this.reconnectAttempts} in ${delay / 1000}s`)

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
   * Start health check monitoring
   */
  private startHealthCheck(): void {
    // Clear any existing health check
    if (this.connectionHealthCheck) {
      clearInterval(this.connectionHealthCheck)
    }
    
    // Check connection health every 30 seconds
    this.connectionHealthCheck = setInterval(() => {
      this.checkConnectionHealth()
    }, 30000)
  }

  /**
   * Check connection health and reconnect if needed
   */
  private checkConnectionHealth(): void {
    if (!this.isConnected || !this.ws) {
      return
    }
    
    // If we haven't received a heartbeat ACK or successful message in the last 2 minutes
    const timeSinceLastSuccess = Date.now() - this.lastSuccessfulConnection
    if (timeSinceLastSuccess > 120000) { // 2 minutes
      console.warn('Discord Gateway connection appears unhealthy, forcing reconnection')
      this.ws.close(1000, 'Connection health check failed')
    }
  }

  /**
   * Clean up resources
   */
  private cleanup(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
    
    if (this.connectionHealthCheck) {
      clearInterval(this.connectionHealthCheck)
      this.connectionHealthCheck = null
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

  /**
   * Check Discord API status before attempting connection
   */
  private async checkDiscordApiStatus(): Promise<{ available: boolean; message: string }> {
    try {
      // Check Discord's status API
      const statusResponse = await fetch('https://discordstatus.com/api/v2/status.json', {
        headers: {
          'User-Agent': 'ChainReact-DiscordGateway/1.0'
        }
      })
      
      if (statusResponse.ok) {
        const statusData = await statusResponse.json()
        const isOperational = statusData.status?.indicator === 'none' || statusData.status?.indicator === 'minor'
        
        return {
          available: isOperational,
          message: isOperational ? 'Discord API is operational' : `Discord API status: ${statusData.status?.description || 'Unknown'}`
        }
      }
    } catch (error) {
      // If we can't check status, assume it's available
      console.warn('Unable to check Discord API status:', error)
    }
    
    return { available: true, message: 'Unable to verify Discord API status, proceeding anyway' }
  }

  /**
   * Get detailed connection diagnostics
   */
  getDiagnostics(): {
    isConnected: boolean
    reconnectAttempts: number
    sessionId: string | null
    lastSuccessfulConnection: number
    timeSinceLastSuccess: number
    heartbeatAck: boolean
  } {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      sessionId: this.sessionId,
      lastSuccessfulConnection: this.lastSuccessfulConnection,
      timeSinceLastSuccess: Date.now() - this.lastSuccessfulConnection,
      heartbeatAck: this.heartbeatAck
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
    // Check if Discord bot is configured before attempting to connect
    const config = checkDiscordBotConfig()
    
    if (!config.isConfigured) {
      // Discord bot not configured, don't attempt to connect
      console.log('Discord bot not configured, skipping Gateway connection')
      return
    }
    
    console.log('Initializing Discord Gateway connection...')
    
    // Enable persistent reconnection to keep bot always online
    discordGateway.enablePersistentReconnect()
    
    await discordGateway.connect()
  } catch (error) {
    console.error('Discord Gateway initialization failed:', error)
    
    // Still try to connect, but with a delay
    setTimeout(() => {
      console.log('Retrying Discord Gateway connection after initialization failure...')
      discordGateway.connect().catch(retryError => {
        console.warn('Discord Gateway retry also failed:', retryError)
      })
    }, 10000) // Wait 10 seconds before retry
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