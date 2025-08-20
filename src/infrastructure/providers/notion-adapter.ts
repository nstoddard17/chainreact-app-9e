import { 
  DatabaseProvider,
  DatabaseRecord,
  DatabaseResult,
  TableFilters,
  RecordFilters
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
 * Notion adapter implementing DatabaseProvider interface
 */
export class NotionAdapter implements DatabaseProvider {
  readonly providerId = 'notion'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: false,
    supportsPolling: true,
    supportsBatch: false,
    supportsRealTime: false,
    rateLimits: [
      {
        type: 'requests',
        limit: 1000,
        window: 60000, // 1 minute
        scope: 'integration'
      }
    ],
    maxPageSize: 100,
    supportsSearch: true,
    supportsSorting: true,
    supportsFiltering: true,
    features: {
      supportsBlocks: true,
      supportsPages: true,
      supportsDatabases: true,
      supportsProperties: true,
      supportsTemplates: true,
      supportsFiles: true,
      maxFileSize: 5 * 1024 * 1024 // 5MB
    }
  }

  lifecycle: LifecyclePort = new NotionLifecycleAdapter()
  triggers: TriggerPort = new NotionTriggerAdapter()
  actions: ActionPort = new NotionActionAdapter()
  config: ConfigPort = new NotionConfigAdapter()

  // DatabaseProvider implementation
  async createRecord(params: DatabaseRecord): Promise<DatabaseResult> {
    try {
      const userId = (params as any).userId || 'unknown-user'
      const result = await this.callNotionAPI('create_page', params, userId)
      
      return {
        success: true,
        data: result,
        recordId: result.id,
        fields: result.properties
      }
    } catch (error) {
      throw this.translateError(error, 'CREATE_RECORD_FAILED')
    }
  }

  async updateRecord(params: DatabaseRecord): Promise<DatabaseResult> {
    try {
      const userId = (params as any).userId || 'unknown-user'
      const result = await this.callNotionAPI('update_page', params, userId)
      
      return {
        success: true,
        data: result,
        recordId: result.id,
        fields: result.properties
      }
    } catch (error) {
      throw this.translateError(error, 'UPDATE_RECORD_FAILED')
    }
  }

  async getRecords(filters?: RecordFilters): Promise<any[]> {
    try {
      const userId = (filters as any)?.userId || 'unknown-user'
      const result = await this.callNotionAPI('query_database', filters, userId)
      return result.results || []
    } catch (error) {
      throw this.translateError(error, 'GET_RECORDS_FAILED')
    }
  }

  async deleteRecord(params: any): Promise<DatabaseResult> {
    try {
      const userId = (params as any).userId || 'unknown-user'
      const result = await this.callNotionAPI('archive_page', params, userId)
      
      return {
        success: true,
        data: result,
        recordId: params.recordId
      }
    } catch (error) {
      throw this.translateError(error, 'DELETE_RECORD_FAILED')
    }
  }

  async getTables(filters?: TableFilters): Promise<any[]> {
    try {
      const userId = (filters as any)?.userId || 'unknown-user'
      const result = await this.callNotionAPI('list_databases', filters, userId)
      return result.results || []
    } catch (error) {
      throw this.translateError(error, 'GET_TABLES_FAILED')
    }
  }

  async searchRecords(params: any): Promise<any[]> {
    try {
      const userId = (params as any).userId || 'unknown-user'
      const result = await this.callNotionAPI('search', params, userId)
      return result.results || []
    } catch (error) {
      throw this.translateError(error, 'SEARCH_RECORDS_FAILED')
    }
  }

  private async callNotionAPI(method: string, params: any, userId?: string): Promise<any> {
    try {
      switch (method) {
        case 'create_database': {
          const { createNotionDatabase } = await import('../../../lib/workflows/actions/notion')
          const result = await createNotionDatabase(params, userId || 'user-id', {})
          
          if (!result.success) {
            throw new Error(result.message || 'Notion create database failed')
          }
          
          return {
            id: result.output?.id,
            title: result.output?.title,
            properties: result.output?.properties,
            success: true,
            ...result.output
          }
        }
        
        case 'create_page': {
          // Notion create page implementation
          const { getDecryptedAccessToken } = await import('../../../lib/workflows/actions/core/getDecryptedAccessToken')
          
          const accessToken = await getDecryptedAccessToken(userId || 'user-id', 'notion')
          
          const response = await fetch('https://api.notion.com/v1/pages', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify({
              parent: { 
                database_id: params.baseId || params.databaseId 
              },
              properties: params.fields
            })
          })
          
          if (!response.ok) {
            throw new Error(`Notion API error: ${response.status}`)
          }
          
          const result = await response.json()
          return {
            id: result.id,
            properties: result.properties,
            success: true
          }
        }
        
        case 'query_database': {
          // Notion query database implementation
          const { getDecryptedAccessToken } = await import('../../../lib/workflows/actions/core/getDecryptedAccessToken')
          
          const accessToken = await getDecryptedAccessToken(userId || 'user-id', 'notion')
          const databaseId = params.baseId || params.databaseId
          
          const response = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify({
              page_size: params.maxRecords || 100,
              filter: params.filter
            })
          })
          
          if (!response.ok) {
            throw new Error(`Notion API error: ${response.status}`)
          }
          
          const result = await response.json()
          return {
            results: result.results || [],
            success: true
          }
        }
        
        case 'list_databases': {
          // Notion list databases implementation
          const { getDecryptedAccessToken } = await import('../../../lib/workflows/actions/core/getDecryptedAccessToken')
          
          const accessToken = await getDecryptedAccessToken(userId || 'user-id', 'notion')
          
          const response = await fetch('https://api.notion.com/v1/search', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'Notion-Version': '2022-06-28'
            },
            body: JSON.stringify({
              filter: {
                value: 'database',
                property: 'object'
              }
            })
          })
          
          if (!response.ok) {
            throw new Error(`Notion API error: ${response.status}`)
          }
          
          const result = await response.json()
          return {
            results: result.results || [],
            success: true
          }
        }
        
        default:
          throw new Error(`Notion method ${method} not implemented`)
      }
    } catch (error) {
      console.error(`Notion API call failed for method ${method}:`, error)
      throw error
    }
  }

  private translateError(error: any, code: string): IntegrationError {
    let errorType = ErrorType.PROVIDER_ERROR
    let message = error.message || 'Unknown Notion error'

    // Translate Notion-specific errors
    if (error.status) {
      switch (error.status) {
        case 401:
          errorType = ErrorType.AUTHORIZATION
          message = 'Notion integration token is invalid or expired.'
          break
        case 403:
          errorType = ErrorType.AUTHORIZATION
          message = 'Insufficient permissions for Notion operation.'
          break
        case 429:
          errorType = ErrorType.RATE_LIMIT
          message = 'Notion rate limit exceeded. Please try again later.'
          break
        case 400:
          errorType = ErrorType.VALIDATION
          message = 'Invalid Notion request parameters.'
          break
        default:
          if (error.status >= 500) {
            errorType = ErrorType.PROVIDER_ERROR
            message = 'Notion service is temporarily unavailable.'
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
class NotionLifecycleAdapter implements LifecyclePort {
  async install(userId: string, config: InstallConfig): Promise<InstallResult> {
    return { 
      success: true, 
      authUrl: 'https://api.notion.com/v1/oauth/authorize'
    }
  }

  async authorize(userId: string, authCode: string): Promise<AuthResult> {
    return { 
      success: true, 
      accessToken: 'token',
      refreshToken: 'refresh'
    }
  }

  async refresh(userId: string, refreshToken: string): Promise<AuthResult> {
    return { success: true, accessToken: 'new-token' }
  }

  async revoke(userId: string, integrationId: string): Promise<RevokeResult> {
    return { success: true }
  }

  async healthCheck(integrationId: string): Promise<HealthResult> {
    return { healthy: true, lastChecked: new Date() }
  }
}

// Trigger adapter
class NotionTriggerAdapter implements TriggerPort {
  async subscribe(trigger: TriggerConfig): Promise<SubscriptionResult> {
    return { success: true, subscriptionId: 'sub-id' }
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    // Notion doesn't support webhooks currently
  }

  async poll(trigger: TriggerConfig): Promise<TriggerEvent[]> {
    return []
  }
}

// Action adapter
class NotionActionAdapter implements ActionPort {
  async execute(action: ActionConfig): Promise<ActionResult> {
    return { success: true }
  }

  async validate(action: ActionConfig): Promise<ValidationResult> {
    return { valid: true, errors: [] }
  }

  getSchema(actionType: string): ActionSchema {
    const schemas: Record<string, ActionSchema> = {
      'create_database': {
        type: 'create_database',
        parameters: {
          title: { type: 'string', description: 'Database title', required: true },
          parentPageId: { type: 'string', description: 'Parent page ID', required: false },
          properties: { type: 'object', description: 'Database properties', required: false }
        },
        required: ['title']
      },
      'create_page': {
        type: 'create_page',
        parameters: {
          databaseId: { type: 'string', description: 'Database ID', required: true },
          properties: { type: 'object', description: 'Page properties', required: true }
        },
        required: ['databaseId', 'properties']
      }
    }
    return schemas[actionType] || { type: actionType, parameters: {}, required: [] }
  }
}

// Config adapter
class NotionConfigAdapter implements ConfigPort {
  getConfigSchema(): ConfigSchema {
    return {
      fields: {
        integrationToken: {
          type: 'string',
          description: 'Notion integration token',
          required: true,
          sensitive: true
        },
        workspace: {
          type: 'string',
          description: 'Notion workspace',
          required: false
        }
      },
      required: ['integrationToken']
    }
  }

  validateConfig(config: any): ValidationResult {
    const errors = []
    if (!config.integrationToken) {
      errors.push({
        field: 'integrationToken',
        message: 'Integration token is required',
        code: 'MISSING_INTEGRATION_TOKEN'
      })
    }
    return { valid: errors.length === 0, errors }
  }

  getRequiredScopes(): string[] {
    return [
      'read_content',
      'update_content',
      'insert_content'
    ]
  }
}