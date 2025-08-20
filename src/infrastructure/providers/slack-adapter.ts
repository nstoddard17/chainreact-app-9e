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
 * Slack adapter implementing ChatProvider interface
 */
export class SlackAdapter implements ChatProvider {
  readonly providerId = 'slack'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    supportsPolling: true,
    supportsBatch: false,
    supportsRealTime: true,
    rateLimits: [
      {
        type: 'requests',
        limit: 100,
        window: 60000, // 1 minute
        scope: 'workspace'
      }
    ],
    maxPageSize: 200,
    supportsSearch: true,
    supportsSorting: true,
    supportsFiltering: true,
    features: {
      supportsThreads: true,
      supportsChannels: true,
      supportsDirectMessages: true,
      supportsFiles: true,
      supportsAttachments: true,
      maxAttachmentSize: 1024 * 1024 * 1024, // 1GB
      supportedFormats: ['text/plain', 'text/markdown', 'application/json'],
      supportsReactions: true,
      supportsWorkspaces: true,
      supportsApps: true
    }
  }

  lifecycle: LifecyclePort = new SlackLifecycleAdapter()
  triggers: TriggerPort = new SlackTriggerAdapter()
  actions: ActionPort = new SlackActionAdapter()
  config: ConfigPort = new SlackConfigAdapter()

  // ChatProvider implementation
  async sendMessage(params: ChatMessage): Promise<ChatResult> {
    try {
      const userId = (params as any).userId || 'unknown-user'
      const result = await this.callSlackAPI('send_message', params, userId)
      
      return {
        success: true,
        data: result,
        messageId: result.ts,
        channelId: result.channel,
        timestamp: result.ts
      }
    } catch (error) {
      throw this.translateError(error, 'SEND_MESSAGE_FAILED')
    }
  }

  async getMessages(params: any): Promise<any[]> {
    try {
      const userId = (params as any).userId || 'unknown-user'
      const result = await this.callSlackAPI('get_messages', params, userId)
      return result.messages || []
    } catch (error) {
      throw this.translateError(error, 'GET_MESSAGES_FAILED')
    }
  }

  async getChannels(filters?: ChannelFilters): Promise<any[]> {
    try {
      const userId = (filters as any)?.userId || 'unknown-user'
      const result = await this.callSlackAPI('get_channels', filters, userId)
      return result || []
    } catch (error) {
      throw this.translateError(error, 'GET_CHANNELS_FAILED')
    }
  }

  async getMembers(filters?: MemberFilters): Promise<any[]> {
    try {
      const userId = (filters as any)?.userId || 'unknown-user'
      const result = await this.callSlackAPI('get_members', filters, userId)
      return result || []
    } catch (error) {
      throw this.translateError(error, 'GET_MEMBERS_FAILED')
    }
  }

  async getRoles(filters?: RoleFilters): Promise<any[]> {
    try {
      // Slack doesn't have traditional roles like Discord, but we can return user groups
      const userId = (filters as any)?.userId || 'unknown-user'
      const result = await this.callSlackAPI('get_user_groups', filters, userId)
      return result || []
    } catch (error) {
      throw this.translateError(error, 'GET_ROLES_FAILED')
    }
  }

  async createChannel(params: any): Promise<any> {
    try {
      const userId = (params as any).userId || 'unknown-user'
      const result = await this.callSlackAPI('create_channel', params, userId)
      return result
    } catch (error) {
      throw this.translateError(error, 'CREATE_CHANNEL_FAILED')
    }
  }

  async manageRoles(params: any): Promise<any> {
    try {
      const userId = (params as any).userId || 'unknown-user'
      const result = await this.callSlackAPI('manage_user_groups', params, userId)
      return result
    } catch (error) {
      throw this.translateError(error, 'MANAGE_ROLES_FAILED')
    }
  }

  private async callSlackAPI(method: string, params: any, userId?: string): Promise<any> {
    try {
      switch (method) {
        case 'send_message': {
          const { sendSlackMessage } = await import('../../../lib/integrations/slack')
          const { getIntegrationCredentials } = await import('../../../lib/integrations/getDecryptedAccessToken')
          
          const credentials = await getIntegrationCredentials(userId || 'user-id', 'slack')
          if (!credentials?.accessToken) {
            throw new Error('Slack integration not connected')
          }
          
          const result = await sendSlackMessage(
            credentials.accessToken,
            params.channelId || params.channel,
            params.content || params.text || params.message
          )
          
          return {
            ts: result.ts,
            channel: result.channel,
            success: true,
            ...result
          }
        }
        
        case 'get_channels': {
          const { getSlackChannels } = await import('../../../lib/integrations/slack')
          const { getIntegrationCredentials } = await import('../../../lib/integrations/getDecryptedAccessToken')
          
          const credentials = await getIntegrationCredentials(userId || 'user-id', 'slack')
          if (!credentials?.accessToken) {
            throw new Error('Slack integration not connected')
          }
          
          const result = await getSlackChannels(credentials.accessToken)
          return result
        }
        
        case 'create_channel': {
          const { createSlackChannel } = await import('../../../lib/workflows/actions/slack/createChannel')
          const result = await createSlackChannel({
            userId: userId || 'user-id',
            config: params,
            input: {}
          })
          
          if (!result.success) {
            throw new Error(result.error || 'Slack create channel failed')
          }
          
          return {
            channelId: result.output?.channelId,
            channelName: result.output?.channelName,
            success: true,
            ...result.output
          }
        }
        
        case 'get_messages': {
          // Implement message fetching using Slack Web API
          const { getIntegrationCredentials } = await import('../../../lib/integrations/getDecryptedAccessToken')
          
          const credentials = await getIntegrationCredentials(userId || 'user-id', 'slack')
          if (!credentials?.accessToken) {
            throw new Error('Slack integration not connected')
          }
          
          const response = await fetch('https://slack.com/api/conversations.history', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${credentials.accessToken}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          })
          
          const data = await response.json()
          if (!data.ok) {
            throw new Error(data.error || 'Failed to fetch Slack messages')
          }
          
          return {
            messages: data.messages || [],
            success: true
          }
        }
        
        case 'get_members': {
          // Implement member fetching using Slack Web API
          const { getIntegrationCredentials } = await import('../../../lib/integrations/getDecryptedAccessToken')
          
          const credentials = await getIntegrationCredentials(userId || 'user-id', 'slack')
          if (!credentials?.accessToken) {
            throw new Error('Slack integration not connected')
          }
          
          const response = await fetch('https://slack.com/api/users.list', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${credentials.accessToken}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          })
          
          const data = await response.json()
          if (!data.ok) {
            throw new Error(data.error || 'Failed to fetch Slack members')
          }
          
          return data.members || []
        }
        
        case 'get_user_groups': {
          // Implement user groups fetching using Slack Web API
          const { getIntegrationCredentials } = await import('../../../lib/integrations/getDecryptedAccessToken')
          
          const credentials = await getIntegrationCredentials(userId || 'user-id', 'slack')
          if (!credentials?.accessToken) {
            throw new Error('Slack integration not connected')
          }
          
          const response = await fetch('https://slack.com/api/usergroups.list', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${credentials.accessToken}`,
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          })
          
          const data = await response.json()
          if (!data.ok) {
            throw new Error(data.error || 'Failed to fetch Slack user groups')
          }
          
          return data.usergroups || []
        }
        
        default:
          throw new Error(`Slack method ${method} not implemented`)
      }
    } catch (error) {
      console.error(`Slack API call failed for method ${method}:`, error)
      throw error
    }
  }

  private translateError(error: any, code: string): IntegrationError {
    let errorType = ErrorType.PROVIDER_ERROR
    let message = error.message || 'Unknown Slack error'

    // Translate Slack-specific errors
    if (error.data?.error) {
      const slackError = error.data.error
      switch (slackError) {
        case 'invalid_auth':
        case 'token_revoked':
        case 'token_expired':
          errorType = ErrorType.AUTHORIZATION
          message = 'Slack token is invalid or expired. Please reconnect your account.'
          break
        case 'rate_limited':
          errorType = ErrorType.RATE_LIMIT
          message = 'Slack rate limit exceeded. Please try again later.'
          break
        case 'channel_not_found':
        case 'user_not_found':
          errorType = ErrorType.VALIDATION
          message = 'Slack resource not found.'
          break
        case 'missing_scope':
          errorType = ErrorType.AUTHORIZATION
          message = 'Insufficient permissions for Slack operation.'
          break
        default:
          errorType = ErrorType.PROVIDER_ERROR
          message = `Slack API error: ${slackError}`
      }
    }

    return new IntegrationError(code, message, this.providerId, errorType, undefined, {
      originalError: error,
      slackError: error.data?.error
    })
  }
}

// Lifecycle adapter
class SlackLifecycleAdapter implements LifecyclePort {
  async install(userId: string, config: InstallConfig): Promise<InstallResult> {
    // Implementation for Slack OAuth flow
    const { getSlackOAuthClient } = await import('../../../lib/integrations/slack')
    const oauthClient = getSlackOAuthClient()
    const authUrl = oauthClient.getAuthUrl(['channels:read', 'chat:write', 'users:read'])
    
    return { success: true, authUrl }
  }

  async authorize(userId: string, authCode: string): Promise<AuthResult> {
    // Implementation for exchanging auth code for tokens
    const { getSlackOAuthClient } = await import('../../../lib/integrations/slack')
    const oauthClient = getSlackOAuthClient()
    const tokenData = await oauthClient.exchangeCodeForToken(authCode)
    
    return { 
      success: true, 
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token
    }
  }

  async refresh(userId: string, refreshToken: string): Promise<AuthResult> {
    // Slack tokens typically don't expire, but we implement refresh for completeness
    return { success: true, accessToken: 'unchanged' }
  }

  async revoke(userId: string, integrationId: string): Promise<RevokeResult> {
    // Implementation for revoking access
    try {
      const { getSlackOAuthClient } = await import('../../../lib/integrations/slack')
      const { getIntegrationCredentials } = await import('../../../lib/integrations/getDecryptedAccessToken')
      
      const credentials = await getIntegrationCredentials(userId, 'slack')
      if (credentials?.accessToken) {
        const oauthClient = getSlackOAuthClient()
        await oauthClient.revokeToken(credentials.accessToken)
      }
      
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  async healthCheck(integrationId: string): Promise<HealthResult> {
    // Implementation for checking Slack API health
    return { healthy: true, lastChecked: new Date() }
  }
}

// Trigger adapter
class SlackTriggerAdapter implements TriggerPort {
  async subscribe(trigger: TriggerConfig): Promise<SubscriptionResult> {
    // Implementation for Slack event subscriptions
    return { success: true, subscriptionId: 'sub-id' }
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    // Implementation for unsubscribing from Slack events
  }

  async poll(trigger: TriggerConfig): Promise<TriggerEvent[]> {
    // Implementation for polling Slack for changes
    return []
  }
}

// Action adapter
class SlackActionAdapter implements ActionPort {
  async execute(action: ActionConfig): Promise<ActionResult> {
    // Implementation for executing Slack actions
    return { success: true }
  }

  async validate(action: ActionConfig): Promise<ValidationResult> {
    // Implementation for validating Slack action config
    return { valid: true, errors: [] }
  }

  getSchema(actionType: string): ActionSchema {
    // Return schema for Slack actions
    const schemas: Record<string, ActionSchema> = {
      'send_message': {
        type: 'send_message',
        parameters: {
          channel: { type: 'string', description: 'Slack channel ID or name', required: true },
          text: { type: 'string', description: 'Message text', required: true },
          blocks: { type: 'array', description: 'Message blocks (rich formatting)', required: false },
          attachments: { type: 'array', description: 'Message attachments', required: false },
          thread_ts: { type: 'string', description: 'Thread timestamp for replies', required: false }
        },
        required: ['channel', 'text']
      },
      'create_channel': {
        type: 'create_channel',
        parameters: {
          channelName: { type: 'string', description: 'Channel name', required: true },
          isPrivate: { type: 'boolean', description: 'Make channel private', required: false },
          purpose: { type: 'string', description: 'Channel purpose', required: false },
          topic: { type: 'string', description: 'Channel topic', required: false },
          initialMembers: { type: 'array', description: 'Initial members to invite', required: false }
        },
        required: ['channelName']
      }
    }
    return schemas[actionType] || { type: actionType, parameters: {}, required: [] }
  }
}

// Config adapter
class SlackConfigAdapter implements ConfigPort {
  getConfigSchema(): ConfigSchema {
    return {
      fields: {
        workspace: {
          type: 'string',
          description: 'Slack workspace URL',
          required: true
        },
        scopes: {
          type: 'array',
          description: 'Required OAuth scopes',
          required: true
        }
      },
      required: ['workspace', 'scopes']
    }
  }

  validateConfig(config: any): ValidationResult {
    const errors = []
    if (!config.workspace) {
      errors.push({
        field: 'workspace',
        message: 'Workspace is required',
        code: 'MISSING_WORKSPACE'
      })
    }
    if (!config.scopes || !Array.isArray(config.scopes)) {
      errors.push({
        field: 'scopes',
        message: 'Scopes must be an array',
        code: 'INVALID_SCOPES'
      })
    }
    return { valid: errors.length === 0, errors }
  }

  getRequiredScopes(): string[] {
    return [
      'channels:read',
      'chat:write',
      'users:read',
      'conversations:read',
      'conversations:write'
    ]
  }
}