import { 
  EmailProvider, 
  EmailMessage, 
  EmailResult, 
  EmailFilters, 
  GetMessagesParams,
  LabelOperation,
  LabelResult,
  Contact,
  ContactFilters
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

import { logger } from '@/lib/utils/logger'

/**
 * Gmail adapter implementing EmailProvider interface
 */
export class GmailAdapter implements EmailProvider {
  readonly providerId = 'gmail'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    supportsPolling: true,
    supportsBatch: false,
    supportsRealTime: true,
    rateLimits: [
      {
        type: 'requests',
        limit: 1000,
        window: 60000, // 1 minute
        scope: 'user'
      }
    ],
    maxPageSize: 500,
    supportsSearch: true,
    supportsSorting: true,
    supportsFiltering: true,
    features: {
      supportsLabels: true,
      supportsThreading: true,
      supportsAttachments: true,
      maxAttachmentSize: 25 * 1024 * 1024, // 25MB
      supportedFormats: ['text/plain', 'text/html'],
      supportsScheduling: false,
      supportsTemplates: false
    }
  }

  lifecycle: LifecyclePort = new GmailLifecycleAdapter()
  triggers: TriggerPort = new GmailTriggerAdapter()
  actions: ActionPort = new GmailActionAdapter()
  config: ConfigPort = new GmailConfigAdapter()

  // EmailProvider implementation
  async sendMessage(params: EmailMessage): Promise<EmailResult> {
    try {
      // Extract userId from params context
      const userId = (params as any).userId || 'unknown-user'
      const result = await this.callGmailAPI('send', params, userId)
      
      return {
        success: true,
        data: result,
        messageId: result.id,
        threadId: result.threadId
      }
    } catch (error) {
      throw this.translateError(error, 'SEND_MESSAGE_FAILED')
    }
  }

  async searchMessages(filters: EmailFilters): Promise<any[]> {
    try {
      const userId = (filters as any).userId || 'unknown-user'
      const result = await this.callGmailAPI('search', filters, userId)
      return result.messages || []
    } catch (error) {
      throw this.translateError(error, 'SEARCH_MESSAGES_FAILED')
    }
  }

  async getMessages(params: GetMessagesParams): Promise<any[]> {
    try {
      const userId = (params as any).userId || 'unknown-user'
      const result = await this.callGmailAPI('list', params, userId)
      return result.messages || []
    } catch (error) {
      throw this.translateError(error, 'GET_MESSAGES_FAILED')
    }
  }

  async manageLabels(operation: LabelOperation): Promise<LabelResult> {
    try {
      const userId = (operation as any).userId || 'unknown-user'
      const result = await this.callGmailAPI('labels', operation, userId)
      return {
        success: true,
        data: result,
        labels: result.labels
      }
    } catch (error) {
      throw this.translateError(error, 'MANAGE_LABELS_FAILED')
    }
  }

  async getContacts(filters?: ContactFilters): Promise<Contact[]> {
    try {
      const userId = (filters as any)?.userId || 'unknown-user'
      const result = await this.callGmailAPI('contacts', filters, userId)
      return result.contacts || []
    } catch (error) {
      throw this.translateError(error, 'GET_CONTACTS_FAILED')
    }
  }

  private async callGmailAPI(method: string, params: any, userId?: string): Promise<any> {
    // Integrate with existing Gmail implementations
    try {
      switch (method) {
        case 'send': {
          const { sendGmail } = await import('../../../lib/workflows/actions/gmail/sendGmail')
          const result = await sendGmail(params, userId || 'user-id', {})
          
          if (!result.success) {
            throw new Error(result.message || 'Gmail send failed')
          }
          
          return {
            id: result.output?.messageId,
            threadId: result.output?.threadId,
            success: true,
            ...result.output
          }
        }
        
        case 'labels': {
          const { addGmailLabels } = await import('../../../lib/workflows/actions/gmail/addLabels')
          const result = await addGmailLabels(params, userId || 'user-id', {})
          
          if (!result.success) {
            throw new Error(result.message || 'Gmail labels operation failed')
          }
          
          return {
            success: true,
            labels: result.output?.labelIds || [],
            ...result.output
          }
        }
        
        case 'search':
        case 'list': {
          const { searchGmailEmails } = await import('../../../lib/workflows/actions/gmail/searchEmails')
          const result = await searchGmailEmails(params, userId || 'user-id', {})
          
          if (!result.success) {
            throw new Error(result.message || 'Gmail search failed')
          }
          
          return {
            messages: result.output?.emails || [],
            success: true,
            ...result.output
          }
        }
        
        default:
          throw new Error(`Gmail method ${method} not implemented`)
      }
    } catch (error) {
      logger.error(`Gmail API call failed for method ${method}:`, error)
      throw error
    }
  }

  private translateError(error: any, code: string): IntegrationError {
    let errorType = ErrorType.PROVIDER_ERROR
    let message = error.message || 'Unknown Gmail error'

    // Translate Gmail-specific errors
    if (error.status) {
      switch (error.status) {
        case 401:
          errorType = ErrorType.AUTHORIZATION
          message = 'Gmail authorization expired. Please reconnect your account.'
          break
        case 403:
          errorType = ErrorType.AUTHORIZATION
          message = 'Insufficient permissions for Gmail operation.'
          break
        case 429:
          errorType = ErrorType.RATE_LIMIT
          message = 'Gmail rate limit exceeded. Please try again later.'
          break
        case 400:
          errorType = ErrorType.VALIDATION
          message = 'Invalid Gmail request parameters.'
          break
        default:
          if (error.status >= 500) {
            errorType = ErrorType.PROVIDER_ERROR
            message = 'Gmail service is temporarily unavailable.'
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
class GmailLifecycleAdapter implements LifecyclePort {
  async install(userId: string, config: InstallConfig): Promise<InstallResult> {
    // Implementation for Gmail OAuth flow
    return { success: true, authUrl: 'https://accounts.google.com/oauth2/auth...' }
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
    // Implementation for checking Gmail API health
    return { healthy: true, lastChecked: new Date() }
  }
}

// Trigger adapter
class GmailTriggerAdapter implements TriggerPort {
  async subscribe(trigger: TriggerConfig): Promise<SubscriptionResult> {
    // Implementation for Gmail push notifications
    return { success: true, subscriptionId: 'sub-id' }
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    // Implementation for unsubscribing from Gmail notifications
  }

  async poll(trigger: TriggerConfig): Promise<TriggerEvent[]> {
    // Implementation for polling Gmail for changes
    return []
  }
}

// Action adapter
class GmailActionAdapter implements ActionPort {
  async execute(action: ActionConfig): Promise<ActionResult> {
    // Implementation for executing Gmail actions
    return { success: true }
  }

  async validate(action: ActionConfig): Promise<ValidationResult> {
    // Implementation for validating Gmail action config
    return { valid: true, errors: [] }
  }

  getSchema(actionType: string): ActionSchema {
    // Return schema for Gmail actions
    const schemas: Record<string, ActionSchema> = {
      'send_email': {
        type: 'send_email',
        parameters: {
          to: { type: 'string', description: 'Recipient email', required: true },
          subject: { type: 'string', description: 'Email subject', required: true },
          body: { type: 'string', description: 'Email body', required: true },
          cc: { type: 'string', description: 'CC recipients', required: false },
          bcc: { type: 'string', description: 'BCC recipients', required: false }
        },
        required: ['to', 'subject', 'body']
      }
    }
    return schemas[actionType] || { type: actionType, parameters: {}, required: [] }
  }
}

// Config adapter
class GmailConfigAdapter implements ConfigPort {
  getConfigSchema(): ConfigSchema {
    return {
      fields: {
        scopes: {
          type: 'array',
          description: 'Gmail API scopes',
          required: true
        }
      },
      required: ['scopes']
    }
  }

  validateConfig(config: any): ValidationResult {
    const errors = []
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
      'https://www.googleapis.com/auth/gmail.send',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify'
    ]
  }
}