import { 
  ChatProvider, 
  ChatMessage, 
  ChatResult, 
  ChannelFilters,
  MemberFilters,
  RoleFilters
} from '../../domains/integrations/ports/capability-interfaces'
import {
  ConnectorContract,
  LifecyclePort,
  TriggerPort,
  ActionPort,
  ConfigPort,
  CapabilityDescriptor,
  InstallConfig,
  InstallResult,
  AuthResult,
  RevokeResult,
  HealthResult,
  TriggerConfig,
  SubscriptionResult,
  TriggerEvent,
  ActionConfig,
  ActionResult,
  ValidationResult,
  ActionSchema,
  ConfigSchema
} from '../../domains/integrations/ports/connector-contract'
import { IntegrationError, ErrorType } from '../../domains/integrations/entities/integration-error'

/**
 * Discord adapter implementing ChatProvider interface
 */
export class DiscordAdapter implements ChatProvider {
  readonly providerId = 'discord'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    supportsPolling: true,
    supportsBatch: false,
    supportsRealTime: true,
    rateLimits: [
      {
        type: 'requests',
        limit: 50,
        window: 1000, // 1 second
        scope: 'bot'
      }
    ],
    maxPageSize: 100,
    supportsSearch: true,
    supportsSorting: true,
    supportsFiltering: true,
    features: {
      supportsThreads: true,
      supportsChannels: true,
      supportsDirectMessages: true,
      supportsEmbeds: true,
      supportsAttachments: true,
      maxAttachmentSize: 25 * 1024 * 1024, // 25MB
      supportedFormats: ['text/plain', 'text/markdown'],
      supportsReactions: true,
      supportsRoles: true,
      supportsPermissions: true
    }
  }

  lifecycle: LifecyclePort = new DiscordLifecycleAdapter()
  triggers: TriggerPort = new DiscordTriggerAdapter()
  actions: ActionPort = new DiscordActionAdapter()
  config: ConfigPort = new DiscordConfigAdapter()

  // ChatProvider implementation
  async sendMessage(params: ChatMessage): Promise<ChatResult> {
    try {
      const userId = (params as any).userId || 'unknown-user'
      const result = await this.callDiscordAPI('send_message', params, userId)
      
      return {
        success: true,
        data: result,
        messageId: result.messageId,
        channelId: result.channelId,
        timestamp: result.timestamp
      }
    } catch (error) {
      throw this.translateError(error, 'SEND_MESSAGE_FAILED')
    }
  }

  async getMessages(params: any): Promise<any[]> {
    try {
      const userId = (params as any).userId || 'unknown-user'
      const result = await this.callDiscordAPI('fetch_messages', params, userId)
      return result.messages || []
    } catch (error) {
      throw this.translateError(error, 'GET_MESSAGES_FAILED')
    }
  }

  async getChannels(filters?: ChannelFilters): Promise<any[]> {
    try {
      const userId = (filters as any)?.userId || 'unknown-user'
      const result = await this.callDiscordAPI('list_channels', filters, userId)
      return result || []
    } catch (error) {
      throw this.translateError(error, 'GET_CHANNELS_FAILED')
    }
  }

  async getMembers(filters?: MemberFilters): Promise<any[]> {
    try {
      const userId = (filters as any)?.userId || 'unknown-user'
      const result = await this.callDiscordAPI('fetch_members', filters, userId)
      return result || []
    } catch (error) {
      throw this.translateError(error, 'GET_MEMBERS_FAILED')
    }
  }

  async getRoles(filters?: RoleFilters): Promise<any[]> {
    try {
      const userId = (filters as any)?.userId || 'unknown-user'
      const result = await this.callDiscordAPI('list_roles', filters, userId)
      return result || []
    } catch (error) {
      throw this.translateError(error, 'GET_ROLES_FAILED')
    }
  }

  async createChannel(params: any): Promise<any> {
    try {
      const userId = (params as any).userId || 'unknown-user'
      const result = await this.callDiscordAPI('create_channel', params, userId)
      return result
    } catch (error) {
      throw this.translateError(error, 'CREATE_CHANNEL_FAILED')
    }
  }

  async manageRoles(params: any): Promise<any> {
    try {
      const userId = (params as any).userId || 'unknown-user'
      const result = await this.callDiscordAPI('manage_roles', params, userId)
      return result
    } catch (error) {
      throw this.translateError(error, 'MANAGE_ROLES_FAILED')
    }
  }

  private async callDiscordAPI(method: string, params: any, userId?: string): Promise<any> {
    try {
      switch (method) {
        case 'send_message': {
          const { sendDiscordMessage } = await import('../../../lib/workflows/actions/discord')
          const result = await sendDiscordMessage(params, userId || 'user-id', {})
          
          if (!result.success) {
            throw new Error(result.message || 'Discord send message failed')
          }
          
          return {
            messageId: result.output?.messageId,
            channelId: result.output?.channelId,
            guildId: result.output?.guildId,
            timestamp: result.output?.timestamp,
            success: true,
            ...result.output
          }
        }
        
        case 'fetch_messages': {
          const { fetchDiscordMessages } = await import('../../../lib/workflows/actions/discord')
          const result = await fetchDiscordMessages(params, userId || 'user-id', {})
          
          if (!result.success) {
            throw new Error(result.message || 'Discord fetch messages failed')
          }
          
          return {
            messages: result.output?.messages || [],
            success: true,
            ...result.output
          }
        }
        
        case 'list_channels': {
          const { listDiscordChannels } = await import('../../../lib/workflows/actions/discord')
          const result = await listDiscordChannels(params, userId || 'user-id', {})
          
          if (!result.success) {
            throw new Error(result.message || 'Discord list channels failed')
          }
          
          return result.output || []
        }
        
        case 'fetch_members': {
          const { fetchDiscordGuildMembers } = await import('../../../lib/workflows/actions/discord')
          const result = await fetchDiscordGuildMembers(params, userId || 'user-id', {})
          
          if (!result.success) {
            throw new Error(result.message || 'Discord fetch members failed')
          }
          
          return result.output || []
        }
        
        case 'list_roles': {
          const { listDiscordRoles } = await import('../../../lib/workflows/actions/discord')
          const result = await listDiscordRoles(params, userId || 'user-id', {})
          
          if (!result.success) {
            throw new Error(result.message || 'Discord list roles failed')
          }
          
          return result.output || []
        }
        
        case 'create_channel': {
          const { createDiscordChannel } = await import('../../../lib/workflows/actions/discord')
          const result = await createDiscordChannel(params, userId || 'user-id', {})
          
          if (!result.success) {
            throw new Error(result.message || 'Discord create channel failed')
          }
          
          return {
            channelId: result.output?.channelId,
            success: true,
            ...result.output
          }
        }
        
        case 'manage_roles': {
          const { addDiscordRole } = await import('../../../lib/workflows/actions/discord')
          const result = await addDiscordRole(params, userId || 'user-id', {})
          
          if (!result.success) {
            throw new Error(result.message || 'Discord role management failed')
          }
          
          return {
            success: true,
            ...result.output
          }
        }
        
        default:
          throw new Error(`Discord method ${method} not implemented`)
      }
    } catch (error) {
      console.error(`Discord API call failed for method ${method}:`, error)
      throw error
    }
  }

  private translateError(error: any, code: string): IntegrationError {
    let errorType = ErrorType.PROVIDER_ERROR
    let message = error.message || 'Unknown Discord error'

    // Translate Discord-specific errors
    if (error.status) {
      switch (error.status) {
        case 401:
          errorType = ErrorType.AUTHORIZATION
          message = 'Discord bot token is invalid or expired.'
          break
        case 403:
          errorType = ErrorType.AUTHORIZATION
          message = 'Insufficient permissions for Discord operation.'
          break
        case 429:
          errorType = ErrorType.RATE_LIMIT
          message = 'Discord rate limit exceeded. Please try again later.'
          break
        case 400:
          errorType = ErrorType.VALIDATION
          message = 'Invalid Discord request parameters.'
          break
        default:
          if (error.status >= 500) {
            errorType = ErrorType.PROVIDER_ERROR
            message = 'Discord service is temporarily unavailable.'
          }
      }
    }

    return new IntegrationError(code, message, this.providerId, errorType, undefined, {
      originalError: error,
      status: error.status
    })
  }
}

// Lifecycle adapter
class DiscordLifecycleAdapter implements LifecyclePort {
  async install(userId: string, config: InstallConfig): Promise<InstallResult> {
    // Implementation for Discord OAuth flow
    return { success: true, authUrl: 'https://discord.com/api/oauth2/authorize...' }
  }

  async authorize(userId: string, authCode: string): Promise<AuthResult> {
    // Implementation for exchanging auth code for tokens
    return { success: true, accessToken: 'token', refreshToken: 'refresh' }
  }

  async refresh(userId: string, refreshToken: string): Promise<AuthResult> {
    // Implementation for refreshing access tokens
    return { success: true, accessToken: 'new-token' }
  }

  async revoke(userId: string, integrationId: string): Promise<RevokeResult> {
    // Implementation for revoking access
    return { success: true }
  }

  async healthCheck(integrationId: string): Promise<HealthResult> {
    // Implementation for checking Discord API health
    return { healthy: true, lastChecked: new Date() }
  }
}

// Trigger adapter
class DiscordTriggerAdapter implements TriggerPort {
  async subscribe(trigger: TriggerConfig): Promise<SubscriptionResult> {
    // Implementation for Discord webhooks
    return { success: true, subscriptionId: 'sub-id' }
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    // Implementation for unsubscribing from Discord notifications
  }

  async poll(trigger: TriggerConfig): Promise<TriggerEvent[]> {
    // Implementation for polling Discord for changes
    return []
  }
}

// Action adapter
class DiscordActionAdapter implements ActionPort {
  async execute(action: ActionConfig): Promise<ActionResult> {
    // Implementation for executing Discord actions
    return { success: true }
  }

  async validate(action: ActionConfig): Promise<ValidationResult> {
    // Implementation for validating Discord action config
    return { valid: true, errors: [] }
  }

  getSchema(actionType: string): ActionSchema {
    // Return schema for Discord actions
    const schemas: Record<string, ActionSchema> = {
      'send_message': {
        type: 'send_message',
        parameters: {
          guildId: { type: 'string', description: 'Discord server ID', required: true },
          channelId: { type: 'string', description: 'Discord channel ID', required: true },
          message: { type: 'string', description: 'Message content', required: true },
          embed: { type: 'boolean', description: 'Send as embed', required: false },
          embedTitle: { type: 'string', description: 'Embed title', required: false },
          embedDescription: { type: 'string', description: 'Embed description', required: false }
        },
        required: ['guildId', 'channelId', 'message']
      },
      'create_channel': {
        type: 'create_channel',
        parameters: {
          guildId: { type: 'string', description: 'Discord server ID', required: true },
          name: { type: 'string', description: 'Channel name', required: true },
          type: { type: 'number', description: 'Channel type (0=text, 2=voice)', required: false },
          topic: { type: 'string', description: 'Channel topic', required: false },
          parentId: { type: 'string', description: 'Parent category ID', required: false }
        },
        required: ['guildId', 'name']
      }
    }
    return schemas[actionType] || { type: actionType, parameters: {}, required: [] }
  }
}

// Config adapter
class DiscordConfigAdapter implements ConfigPort {
  getConfigSchema(): ConfigSchema {
    return {
      fields: {
        botToken: {
          type: 'string',
          description: 'Discord bot token',
          required: true,
          sensitive: true
        },
        permissions: {
          type: 'array',
          description: 'Discord bot permissions',
          required: true
        }
      },
      required: ['botToken', 'permissions']
    }
  }

  validateConfig(config: any): ValidationResult {
    const errors = []
    if (!config.botToken) {
      errors.push({
        field: 'botToken',
        message: 'Bot token is required',
        code: 'MISSING_BOT_TOKEN'
      })
    }
    if (!config.permissions || !Array.isArray(config.permissions)) {
      errors.push({
        field: 'permissions',
        message: 'Permissions must be an array',
        code: 'INVALID_PERMISSIONS'
      })
    }
    return { valid: errors.length === 0, errors }
  }

  getRequiredScopes(): string[] {
    return [
      'bot',
      'messages.read',
      'messages.write'
    ]
  }
}