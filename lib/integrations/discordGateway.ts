// Use Node.js EventEmitter only on server-side
import { checkDiscordBotConfig, validateDiscordBotToken } from '@/lib/utils/discordConfig'
import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { AdvancedExecutionEngine } from '@/lib/execution/advancedExecutionEngine'

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

const normalizeInviteCode = (value?: string | null): string | null => {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const withoutProtocol = trimmed.replace(/^https?:\/\//i, '')
  const segments = withoutProtocol.split('/')
  const lastSegment = segments[segments.length - 1]
  if (!lastSegment) return null
  const code = lastSegment.split('?')[0].split('#')[0]
  return code || null
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
  private static instance: DiscordGateway | null = null
  private static connectionPromise: Promise<void> | null = null
  private static isInitializing: boolean = false

  private ws: WebSocket | null = null
  private botToken: string | null = null
  private heartbeatInterval: NodeJS.Timeout | null = null
  private heartbeatAck: boolean = true
  private sequence: number | null = null
  private sessionId: string | null = null
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5
  private reconnectDelay: number = 5000
  private persistentReconnect: boolean = false
  private isConnected: boolean = false
  private lastSuccessfulConnection: number = 0
  private connectionHealthCheck: NodeJS.Timeout | null = null
  private intentionalDisconnect: boolean = false
  private inviteCache: Map<string, Map<string, any>> = new Map() // guildId -> invite code -> invite data

  private constructor() {
    super()
  }

  public static getInstance(): DiscordGateway {
    if (!DiscordGateway.instance) {
      DiscordGateway.instance = new DiscordGateway()
    }
    return DiscordGateway.instance
  }

  /**
   * Fetch with retry logic for transient errors (503, 502, 500, network errors)
   */
  private async fetchWithRetry(url: string, options: RequestInit, maxRetries: number = 3): Promise<Response | null> {
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Create an AbortController for timeout
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout per request

        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        })

        clearTimeout(timeoutId)

        // If we get a transient error, retry
        if (response.status === 503 || response.status === 502 || response.status === 500) {
          const errorText = await response.text().catch(() => 'Service unavailable')
          lastError = new Error(`Discord API ${response.status}: ${errorText}`)

          if (attempt < maxRetries) {
            const delay = Math.min(1000 * attempt, 3000) // Linear backoff, max 3s
            console.warn(`Discord API ${response.status} error (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`)
            await new Promise(resolve => setTimeout(resolve, delay))
            continue
          }
        }

        // For other status codes (including 429, 401, 403), return immediately
        return response

      } catch (error: any) {
        // Handle abort error specifically
        if (error.name === 'AbortError') {
          lastError = new Error('Discord API request timeout (5s)')
        } else {
          lastError = error instanceof Error ? error : new Error('Network error')
        }

        if (attempt < maxRetries) {
          const delay = Math.min(1000 * attempt, 3000) // Linear backoff, max 3s
          console.warn(`Discord API network error (attempt ${attempt}/${maxRetries}). Retrying in ${delay}ms...`)
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
   * Connect to Discord Gateway with singleton protection
   */
  async connect(): Promise<void> {
    // Prevent multiple simultaneous connections
    if (this.isConnected) {
      console.log('✅ Discord Gateway already connected')
      return
    }

    // If already initializing, wait for that to complete
    if (DiscordGateway.isInitializing && DiscordGateway.connectionPromise) {
      console.log('⏳ Discord Gateway connection already in progress, waiting...')
      return DiscordGateway.connectionPromise
    }

    // Mark as initializing and create promise
    DiscordGateway.isInitializing = true
    DiscordGateway.connectionPromise = this._connectInternal()

    try {
      await DiscordGateway.connectionPromise
    } finally {
      DiscordGateway.isInitializing = false
      DiscordGateway.connectionPromise = null
    }
  }

  /**
   * Internal connection method
   */
  private async _connectInternal(): Promise<void> {
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

        // Start connection health monitoring (less aggressive)
        this.startHealthCheck()
      }

      this.ws.onmessage = (event) => {
        this.handleMessage(event.data)
      }

      this.ws.onclose = (event) => {
        this.isConnected = false
        const wasIntentional = this.intentionalDisconnect
        this.cleanup()

        // Discord close codes that should NOT trigger reconnection:
        // 1000: Normal closure
        // 4004: Authentication failed (invalid token)
        // 4010: Invalid shard
        // 4011: Sharding required
        // 4013: Invalid intents
        // 4014: Disallowed intents
        const noReconnectCodes = [1000, 4004, 4010, 4011, 4013, 4014]

        // Only reconnect if not intentionally disconnected and persistent reconnect is enabled
        if (!wasIntentional && this.persistentReconnect && !noReconnectCodes.includes(event.code)) {
          console.log(`Discord Gateway closed with code ${event.code}, will attempt reconnection`)
          this.scheduleReconnect()
        } else if (wasIntentional) {
          console.log('Discord Gateway closed intentionally, not reconnecting')
        } else if (noReconnectCodes.includes(event.code)) {
          console.error(`Discord Gateway closed with non-recoverable code ${event.code}, not reconnecting`)
          this.disablePersistentReconnect() // Disable to prevent reconnection spam
        } else {
          console.log('Discord Gateway closed, persistent reconnect disabled')
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
      case 'GUILD_MEMBER_ADD':
        this.handleMemberAdd(payload.d)
        break
      case 'INVITE_CREATE':
        this.handleInviteCreate(payload.d)
        break
      case 'INVITE_DELETE':
        this.handleInviteDelete(payload.d)
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
  private async handleReady(data: any): Promise<void> {
    this.sessionId = data.session_id
    console.log('🎉 Discord bot ready!', {
      sessionId: this.sessionId,
      username: data.user?.username,
      userId: data.user?.id,
      guildCount: data.guilds?.length || 0
    })

    // Initialize invite cache when bot is ready
    await this.initializeInviteCache()

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
      const isProd = process.env.NODE_ENV === 'production'
      const configured = process.env.NEXT_PUBLIC_APP_URL

      if (!isProd) {
        // In development: prefer explicit webhook URL, then NGROK/Tunnel, else localhost
        const webhookUrl = process.env.NEXT_PUBLIC_WEBHOOK_HTTPS_URL
        const ngrokUrl = process.env.NGROK_URL || process.env.NEXT_PUBLIC_NGROK_URL || process.env.TUNNEL_URL
        baseUrl = webhookUrl || ngrokUrl || 'http://localhost:3000'
        console.log(`📍 Using development URL: ${baseUrl}${webhookUrl ? ' (NEXT_PUBLIC_WEBHOOK_HTTPS_URL)' : ngrokUrl ? ' (ngrok/tunnel)' : ''}`)
      } else {
        // Production
        if (configured) {
          baseUrl = configured
          console.log(`📍 Using configured URL: ${baseUrl}`)
        } else {
          baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` :
                    process.env.RENDER_EXTERNAL_URL ||
                    'https://chainreact.app'
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
   * Handle INVITE_CREATE event - cache new invites
   */
  private handleInviteCreate(inviteData: any): void {
    console.log('📨 Discord INVITE_CREATE received:', {
      code: inviteData.code,
      guildId: inviteData.guild_id,
      channelId: inviteData.channel_id,
      inviter: inviteData.inviter?.username,
      uses: inviteData.uses,
      maxUses: inviteData.max_uses
    })

    if (!inviteData.guild_id) return

    // Get or create guild invite cache
    let guildInvites = this.inviteCache.get(inviteData.guild_id)
    if (!guildInvites) {
      guildInvites = new Map()
      this.inviteCache.set(inviteData.guild_id, guildInvites)
    }

    // Cache the invite
    guildInvites.set(inviteData.code, {
      code: inviteData.code,
      uses: inviteData.uses || 0,
      inviterId: inviteData.inviter?.id,
      maxUses: inviteData.max_uses || null,
      maxAge: inviteData.max_age || null,
      createdAt: inviteData.created_at
    })
  }

  /**
   * Handle INVITE_DELETE event - remove from cache
   */
  private handleInviteDelete(inviteData: any): void {
    console.log('🗑️ Discord INVITE_DELETE received:', {
      code: inviteData.code,
      guildId: inviteData.guild_id
    })

    if (!inviteData.guild_id) return

    const guildInvites = this.inviteCache.get(inviteData.guild_id)
    if (guildInvites) {
      guildInvites.delete(inviteData.code)
    }
  }

  /**
   * Handle GUILD_MEMBER_ADD event - detect invite used and assign roles
   */
  private async handleMemberAdd(memberData: any): Promise<void> {
    console.log('👋 Discord GUILD_MEMBER_ADD received:', {
      userId: memberData.user?.id,
      username: memberData.user?.username,
      guildId: memberData.guild_id,
      joinedAt: memberData.joined_at
    })

    const guildId = memberData.guild_id
    if (!guildId) return

    try {
      // Get cached invites for this guild
      const cachedInvites = this.inviteCache.get(guildId) || new Map()

      // Fetch current invites from Discord API to compare
      const currentInvites = await this.fetchGuildInvites(guildId)

      // Find which invite was used by comparing uses count
      let usedInvite: any = null

      if (currentInvites) {
        for (const invite of currentInvites) {
          const cachedInvite = cachedInvites.get(invite.code)
          if (cachedInvite && invite.uses > cachedInvite.uses) {
            const normalizedCode = normalizeInviteCode(invite.code) || invite.code
            usedInvite = { ...invite, code: normalizedCode }
            console.log(`✅ Member joined using invite: ${normalizedCode}`)
            break
          }
        }

        // Update cache with new invite data
        const newInviteCache = new Map()
        for (const invite of currentInvites) {
          newInviteCache.set(invite.code, {
            code: invite.code,
            uses: invite.uses || 0,
            inviterId: invite.inviter?.id,
            maxUses: invite.max_uses || null,
            maxAge: invite.max_age || null
          })
        }
        this.inviteCache.set(guildId, newInviteCache)
      }

      // Check for auto role assignment
      if (usedInvite) {
        await this.assignRoleBasedOnInvite(memberData, usedInvite.code, guildId)
      } else {
        console.log('⚠️ Could not determine which invite was used')
      }

      await this.triggerMemberJoinWorkflows(memberData, usedInvite)

    } catch (error) {
      console.error('Error handling member join:', error)
    }
  }

  /**
   * Fetch guild invites from Discord API
   */
  private async fetchGuildInvites(guildId: string): Promise<any[]> {
    try {
      const response = await fetch(`https://discord.com/api/v10/guilds/${guildId}/invites`, {
        headers: {
          'Authorization': `Bot ${this.botToken}`,
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        console.error(`Failed to fetch guild invites: ${response.status}`)
        return []
      }

      const invites = await response.json()
      return invites
    } catch (error) {
      console.error('Error fetching guild invites:', error)
      return []
    }
  }

  /**
   * Assign role based on invite code
   */
  private async assignRoleBasedOnInvite(memberData: any, inviteCode: string, guildId: string): Promise<void> {
    try {
      const normalizedInvite = normalizeInviteCode(inviteCode)
      if (!normalizedInvite) return

      // Check for hardcoded environment variable config
      if (
        normalizeInviteCode(process.env.DISCORD_AUTO_ROLE_INVITE) === normalizedInvite &&
        process.env.DISCORD_AUTO_ROLE_ID &&
        process.env.DISCORD_GUILD_ID === guildId
      ) {
        const roleId = process.env.DISCORD_AUTO_ROLE_ID
        const userId = memberData.user?.id

        if (!userId) {
          console.error('No user ID in member data')
          return
        }

        console.log(`🎯 Assigning role ${roleId} to user ${memberData.user?.username} via invite ${normalizedInvite}`)

        // Use Discord API to assign role
        const response = await fetch(
          `https://discord.com/api/v10/guilds/${guildId}/members/${userId}/roles/${roleId}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bot ${this.botToken}`,
              'Content-Type': 'application/json',
              'X-Audit-Log-Reason': `Auto-assigned via invite ${normalizedInvite}`
            }
          }
        )

        if (response.ok) {
          console.log(`✅ Successfully assigned role ${roleId} to ${memberData.user?.username}`)
        } else {
          const errorText = await response.text()
          console.error(`❌ Failed to assign role: ${response.status} - ${errorText}`)
        }
      }

      // TODO: Check database for invite-role mappings
      // const mapping = await checkDatabaseForInviteRole(inviteCode, guildId)

    } catch (error) {
      console.error('Error assigning role based on invite:', error)
    }
  }

  private async triggerMemberJoinWorkflows(memberData: any, invite: any | null): Promise<void> {
    try {
      const supabase = await createSupabaseServiceClient()
      const { data: workflows, error: workflowsError } = await supabase
        .from('workflows')
        .select('id,user_id,nodes,status')
        .eq('status', 'active')

      if (workflowsError) {
        console.error('[Discord] Failed to load member join workflows:', workflowsError)
        return
      }

      if (!workflows || workflows.length === 0) {
        console.log('[Discord] No active workflows to evaluate for member join')
        return
      }

      console.log('[Discord] Loaded member join workflows', workflows.map((workflow) => ({
        id: workflow.id,
        status: workflow.status,
        nodesType: typeof workflow.nodes,
        hasNodes: Boolean(workflow.nodes)
      })))

      const guildId = memberData.guild_id
      const guildName = this.client?.guilds?.cache?.get(guildId)?.name || null
      const normalizedInvite = normalizeInviteCode(invite?.code || undefined)
      const inviterUsername = invite?.inviter?.username || null
      const inviterDiscriminator = invite?.inviter?.discriminator || null
      const inviterTag = inviterUsername
        ? (inviterDiscriminator && inviterDiscriminator !== '0'
            ? `${inviterUsername}#${inviterDiscriminator}`
            : inviterUsername)
        : null

      const discriminator = memberData.user?.discriminator
      const username = memberData.user?.username || null
      const memberTag = discriminator && discriminator !== '0' && username
        ? `${username}#${discriminator}`
        : username

      const triggerData = {
        memberId: memberData.user?.id || null,
        memberTag,
        memberUsername: username,
        memberDiscriminator: discriminator || null,
        memberAvatar: memberData.user?.avatar || null,
        guildId,
        guildName,
        joinedAt: memberData.joined_at || null,
        inviteCode: normalizedInvite,
        inviteUrl: normalizedInvite ? `https://discord.gg/${normalizedInvite}` : null,
        inviterTag,
        inviterId: invite?.inviter?.id || null,
        inviteUses: invite?.uses ?? null,
        inviteMaxUses: invite?.max_uses ?? null,
        timestamp: new Date().toISOString()
      }

      const parseNodes = (raw: any): any[] => {
        if (!raw) return []
        if (Array.isArray(raw)) return raw
        if (typeof raw === 'object') {
          return Object.values(raw)
        }
        if (typeof raw === 'string') {
          try {
            const parsed = JSON.parse(raw)
            if (Array.isArray(parsed)) return parsed
            if (parsed && typeof parsed === 'object') return Object.values(parsed)
            return []
          } catch (error) {
            console.warn('[Discord] Failed to parse workflow nodes JSON', { error, rawSnippet: raw.slice?.(0, 200) })
            return []
          }
        }
        return []
      }

      const candidateWorkflows = workflows.filter((workflow) => {
        const nodes = parseNodes(workflow.nodes)
        console.log('[Discord] Workflow nodes overview', {
          workflowId: workflow.id,
          nodeCount: nodes.length,
          nodeTypes: nodes.map((n: any) => n?.data?.type || n?.type || n?.data?.nodeType)
        })
        return nodes.some((n: any) => {
          const nodeType = n?.data?.type || n?.type || n?.data?.nodeType
          return nodeType === 'discord_trigger_member_join'
        })
      })

      console.log('[Discord] Evaluating member join workflows', {
        workflowsCount: candidateWorkflows.length,
        guildId
      })

      for (const workflow of candidateWorkflows) {
        const nodes = parseNodes(workflow.nodes)
        const triggerNode = nodes.find((n: any) => {
          const nodeType = n?.data?.type || n?.type || n?.data?.nodeType
          return nodeType === 'discord_trigger_member_join'
        })
        if (!triggerNode) {
          console.log('[Discord] Skipping workflow due to missing trigger node after parse', {
            workflowId: workflow.id
          })
          continue
        }

        const triggerConfig = triggerNode.data?.config || triggerNode.data || {}

        if (triggerConfig.guildId && triggerConfig.guildId !== guildId) {
          console.log('[Discord] Skipping workflow due to guild mismatch', {
            workflowId: workflow.id,
            expected: triggerConfig.guildId,
            actual: guildId
          })
          continue
        }

        const filterCode = normalizeInviteCode(triggerConfig.inviteFilter)
        if (filterCode && filterCode !== normalizedInvite) {
          console.log('[Discord] Skipping workflow due to invite filter mismatch', {
            workflowId: workflow.id,
            expected: filterCode,
            actual: normalizedInvite
          })
          continue
        }

        try {
          const executionEngine = new AdvancedExecutionEngine()
          const executionSession = await executionEngine.createExecutionSession(
            workflow.id,
            workflow.user_id,
            'webhook',
            {
              inputData: triggerData,
              webhookEvent: {
                provider: 'discord',
                changeType: 'member_join',
                metadata: triggerData,
                event: triggerData
              }
            }
          )

          await executionEngine.executeWorkflowAdvanced(executionSession.id, triggerData)
          console.log('[Discord] Workflow triggered successfully for member join', {
            workflowId: workflow.id,
            memberId: memberData.user?.id || null,
            inviteCode: normalizedInvite
          })
        } catch (error) {
          console.error(`Failed to execute workflow ${workflow.id} for member join`, error)
        }
      }
    } catch (error) {
      console.error('Error triggering member join workflows:', error)
    }
  }

  /**
   * Initialize invite cache for all guilds on startup
   */
  private async initializeInviteCache(): Promise<void> {
    // This will be called when bot is ready
    // We'll fetch invites for all guilds the bot is in
    console.log('📋 Initializing invite cache...')

    // Note: We'll need to get the guild list from the READY event
    // For now, just initialize for the configured guild
    if (process.env.DISCORD_GUILD_ID) {
      const invites = await this.fetchGuildInvites(process.env.DISCORD_GUILD_ID)
      if (invites.length > 0) {
        const inviteMap = new Map()
        for (const invite of invites) {
          inviteMap.set(invite.code, {
            code: invite.code,
            uses: invite.uses || 0,
            inviterId: invite.inviter?.id,
            maxUses: invite.max_uses || null,
            maxAge: invite.max_age || null
          })
        }
        this.inviteCache.set(process.env.DISCORD_GUILD_ID, inviteMap)
        console.log(`✅ Cached ${invites.length} invites for guild ${process.env.DISCORD_GUILD_ID}`)
      }
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
    // Including: GUILDS, GUILD_MEMBERS, GUILD_INVITES, GUILD_MESSAGES, MESSAGE_CONTENT
    const requiredIntents =
      INTENTS.GUILDS |
      INTENTS.GUILD_MEMBERS |
      INTENTS.GUILD_INVITES |
      INTENTS.GUILD_MESSAGES |
      INTENTS.MESSAGE_CONTENT

    console.log('🔑 Sending identify with intents:', {
      GUILDS: true,
      GUILD_MEMBERS: true,
      GUILD_INVITES: true,
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
    // Check if we should reconnect
    if (this.intentionalDisconnect) {
      console.log('Discord Gateway: Skipping reconnect due to intentional disconnect')
      return
    }

    if (!this.persistentReconnect && this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn(`Discord Gateway: Max reconnection attempts (${this.maxReconnectAttempts}) reached. Stopping reconnection attempts.`)
      return
    }

    this.reconnectAttempts++

    let delay: number
    if (rateLimited) {
      // Rate limited - wait at least 60s to avoid token reset
      delay = 60000
    } else if (isTransientError) {
      // Transient errors (503, 502, 500) - longer exponential backoff
      delay = Math.min(10000 * Math.pow(2, this.reconnectAttempts - 1), 300000) // Start at 10s, max 5 minutes
    } else {
      // Regular reconnection - much longer exponential backoff to avoid spam
      delay = Math.min(30000 * Math.pow(2, this.reconnectAttempts - 1), 600000) // Start at 30s, max 10 minutes
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
    if (this.intentionalDisconnect) {
      console.log('Discord Gateway: Skipping reconnect due to intentional disconnect')
      return
    }

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

    // Check connection health every 5 minutes (much less aggressive)
    this.connectionHealthCheck = setInterval(() => {
      this.checkConnectionHealth()
    }, 300000) // 5 minutes instead of 30 seconds
  }

  /**
   * Check connection health and reconnect if needed
   */
  private checkConnectionHealth(): void {
    if (!this.isConnected || !this.ws) {
      return
    }

    // Only force reconnection if we haven't received ANY activity for 10 minutes
    // Discord heartbeats can have variable intervals, so we need to be patient
    const timeSinceLastSuccess = Date.now() - this.lastSuccessfulConnection
    if (timeSinceLastSuccess > 600000) { // 10 minutes instead of 2 minutes
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
    this.intentionalDisconnect = true
    this.persistentReconnect = false
    this.cleanup()
    console.log('Discord Gateway disconnected intentionally')
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

// Export singleton instance getter
export const discordGateway = DiscordGateway.getInstance()

// Track if we've already initialized
let isInitialized = false

/**
 * Initialize Discord Gateway connection (singleton pattern)
 */
export async function initializeDiscordGateway(): Promise<void> {
  // Prevent multiple initializations
  if (isInitialized) {
    console.log('Discord Gateway already initialized, skipping')
    return
  }

  try {
    // Check if Discord bot is configured before attempting to connect
    const config = checkDiscordBotConfig()

    if (!config.isConfigured) {
      // Discord bot not configured, don't attempt to connect
      console.log('Discord bot not configured, skipping Gateway connection')
      return
    }

    // Mark as initialized before attempting connection
    isInitialized = true

    console.log('Initializing Discord Gateway connection (singleton)...')

    // Get singleton instance
    const gateway = DiscordGateway.getInstance()

    // Check if already connected
    const status = gateway.getStatus()
    if (status.isConnected) {
      console.log('Discord Gateway already connected')
      return
    }

    // DO NOT enable persistent reconnection by default - let Discord handle it
    // Only reconnect on actual disconnections, not proactively
    // gateway.enablePersistentReconnect() // COMMENTED OUT to prevent aggressive reconnection

    // Connect with singleton protection
    await gateway.connect()

    console.log('Discord Gateway initialization complete')
  } catch (error) {
    console.error('Discord Gateway initialization failed:', error)
    // Don't retry automatically to avoid connection spam
    isInitialized = false
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
