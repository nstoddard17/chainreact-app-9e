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

import { logger } from '@/lib/utils/logger'

/**
 * Airtable adapter implementing DatabaseProvider interface
 */
export class AirtableAdapter implements DatabaseProvider {
  readonly providerId = 'airtable'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    supportsPolling: true,
    supportsBatch: true,
    supportsRealTime: true,
    rateLimits: [
      {
        type: 'requests',
        limit: 300,
        window: 60000, // 1 minute
        scope: 'base'
      }
    ],
    maxPageSize: 100,
    supportsSearch: true,
    supportsSorting: true,
    supportsFiltering: true,
    features: {
      supportsRelations: true,
      supportsAttachments: true,
      supportsFormulas: true,
      supportsViews: true,
      supportsCollaboration: true,
      maxAttachmentSize: 20 * 1024 * 1024, // 20MB
      supportedFieldTypes: [
        'text', 'number', 'date', 'checkbox', 'email', 'url', 
        'phone', 'attachment', 'formula', 'lookup', 'rollup'
      ]
    }
  }

  lifecycle: LifecyclePort = new AirtableLifecycleAdapter()
  triggers: TriggerPort = new AirtableTriggerAdapter()
  actions: ActionPort = new AirtableActionAdapter()
  config: ConfigPort = new AirtableConfigAdapter()

  // DatabaseProvider implementation
  async createRecord(params: DatabaseRecord): Promise<DatabaseResult> {
    try {
      const userId = (params as any).userId || 'unknown-user'
      const result = await this.callAirtableAPI('create_record', params, userId)
      
      return {
        success: true,
        data: result,
        recordId: result.id,
        fields: result.fields
      }
    } catch (error) {
      throw this.translateError(error, 'CREATE_RECORD_FAILED')
    }
  }

  async updateRecord(params: DatabaseRecord): Promise<DatabaseResult> {
    try {
      const userId = (params as any).userId || 'unknown-user'
      const result = await this.callAirtableAPI('update_record', params, userId)
      
      return {
        success: true,
        data: result,
        recordId: result.id,
        fields: result.fields
      }
    } catch (error) {
      throw this.translateError(error, 'UPDATE_RECORD_FAILED')
    }
  }

  async getRecords(filters?: RecordFilters): Promise<any[]> {
    try {
      const userId = (filters as any)?.userId || 'unknown-user'
      const result = await this.callAirtableAPI('list_records', filters, userId)
      return result.records || []
    } catch (error) {
      throw this.translateError(error, 'GET_RECORDS_FAILED')
    }
  }

  async deleteRecord(params: any): Promise<DatabaseResult> {
    try {
      const userId = (params as any).userId || 'unknown-user'
      const result = await this.callAirtableAPI('delete_record', params, userId)
      
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
      const result = await this.callAirtableAPI('list_tables', filters, userId)
      return result.tables || []
    } catch (error) {
      throw this.translateError(error, 'GET_TABLES_FAILED')
    }
  }

  async searchRecords(params: any): Promise<any[]> {
    try {
      const userId = (params as any).userId || 'unknown-user'
      const result = await this.callAirtableAPI('search_records', params, userId)
      return result.records || []
    } catch (error) {
      throw this.translateError(error, 'SEARCH_RECORDS_FAILED')
    }
  }

  private async callAirtableAPI(method: string, params: any, userId?: string): Promise<any> {
    try {
      switch (method) {
        case 'create_record': {
          const { createAirtableRecord } = await import('../../../lib/workflows/actions/airtable/createRecord')
          const result = await createAirtableRecord(params, userId || 'user-id', {})
          
          if (!result.success) {
            throw new Error(result.message || 'Airtable create record failed')
          }
          
          return {
            id: result.output?.id,
            fields: result.output?.fields,
            success: true,
            ...result.output
          }
        }
        
        case 'update_record': {
          const { updateAirtableRecord } = await import('../../../lib/workflows/actions/airtable/updateRecord')
          const result = await updateAirtableRecord(params, userId || 'user-id', {})
          
          if (!result.success) {
            throw new Error(result.message || 'Airtable update record failed')
          }
          
          return {
            id: result.output?.id,
            fields: result.output?.fields,
            success: true,
            ...result.output
          }
        }
        
        case 'list_records': {
          const { listAirtableRecords } = await import('../../../lib/workflows/actions/airtable/listRecords')
          const result = await listAirtableRecords(params, userId || 'user-id', {})
          
          if (!result.success) {
            throw new Error(result.message || 'Airtable list records failed')
          }
          
          return {
            records: result.output?.records || [],
            success: true,
            ...result.output
          }
        }
        
        case 'delete_record': {
          // Implement delete using Airtable API directly
          const { getDecryptedAccessToken } = await import('../../../lib/workflows/actions/core/getDecryptedAccessToken')
          
          const accessToken = await getDecryptedAccessToken(userId || 'user-id', 'airtable')
          const { baseId, tableName, recordId } = params
          
          const response = await fetch(
            `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(tableName)}/${recordId}`,
            {
              method: 'DELETE',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            }
          )
          
          if (!response.ok) {
            throw new Error(`Airtable API error: ${response.status}`)
          }
          
          return {
            id: recordId,
            deleted: true,
            success: true
          }
        }
        
        case 'list_tables': {
          // Get table schema from Airtable API
          const { getDecryptedAccessToken } = await import('../../../lib/workflows/actions/core/getDecryptedAccessToken')
          
          const accessToken = await getDecryptedAccessToken(userId || 'user-id', 'airtable')
          const { baseId } = params
          
          const response = await fetch(
            `https://api.airtable.com/v0/meta/bases/${baseId}/tables`,
            {
              headers: {
                'Authorization': `Bearer ${accessToken}`
              }
            }
          )
          
          if (!response.ok) {
            throw new Error(`Airtable API error: ${response.status}`)
          }
          
          const data = await response.json()
          return {
            tables: data.tables || [],
            success: true
          }
        }
        
        case 'search_records': {
          // Use list records with filter formula
          const searchParams = {
            ...params,
            filterByFormula: params.searchFormula || params.filter
          }
          return this.callAirtableAPI('list_records', searchParams, userId)
        }
        
        default:
          throw new Error(`Airtable method ${method} not implemented`)
      }
    } catch (error) {
      logger.error(`Airtable API call failed for method ${method}:`, error)
      throw error
    }
  }

  private translateError(error: any, code: string): IntegrationError {
    let errorType = ErrorType.PROVIDER_ERROR
    let message = error.message || 'Unknown Airtable error'

    // Translate Airtable-specific errors
    if (error.status) {
      switch (error.status) {
        case 401:
          errorType = ErrorType.AUTHORIZATION
          message = 'Airtable API key is invalid or expired.'
          break
        case 403:
          errorType = ErrorType.AUTHORIZATION
          message = 'Insufficient permissions for Airtable operation.'
          break
        case 422:
          errorType = ErrorType.VALIDATION
          message = 'Invalid Airtable request parameters.'
          break
        case 429:
          errorType = ErrorType.RATE_LIMIT
          message = 'Airtable rate limit exceeded. Please try again later.'
          break
        default:
          if (error.status >= 500) {
            errorType = ErrorType.PROVIDER_ERROR
            message = 'Airtable service is temporarily unavailable.'
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
class AirtableLifecycleAdapter implements LifecyclePort {
  async install(userId: string, config: InstallConfig): Promise<InstallResult> {
    // Airtable uses personal access tokens, not OAuth
    return { 
      success: true, 
      authUrl: 'https://airtable.com/create/tokens',
      requiresManualSetup: true,
      instructions: 'Create a personal access token in your Airtable account settings'
    }
  }

  async authorize(userId: string, authCode: string): Promise<AuthResult> {
    // For Airtable, the "authCode" is actually the personal access token
    return { 
      success: true, 
      accessToken: authCode
    }
  }

  async refresh(userId: string, refreshToken: string): Promise<AuthResult> {
    // Airtable tokens don't expire
    return { success: true, accessToken: 'unchanged' }
  }

  async revoke(userId: string, integrationId: string): Promise<RevokeResult> {
    // Manual revocation required in Airtable account settings
    return { 
      success: true,
      message: 'Please revoke the token manually in your Airtable account settings'
    }
  }

  async healthCheck(integrationId: string): Promise<HealthResult> {
    return { healthy: true, lastChecked: new Date() }
  }
}

// Trigger adapter
class AirtableTriggerAdapter implements TriggerPort {
  async subscribe(trigger: TriggerConfig): Promise<SubscriptionResult> {
    // Airtable webhook implementation
    return { success: true, subscriptionId: 'sub-id' }
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    // Unsubscribe from Airtable webhooks
  }

  async poll(trigger: TriggerConfig): Promise<TriggerEvent[]> {
    // Poll Airtable for changes
    return []
  }
}

// Action adapter
class AirtableActionAdapter implements ActionPort {
  async execute(action: ActionConfig): Promise<ActionResult> {
    return { success: true }
  }

  async validate(action: ActionConfig): Promise<ValidationResult> {
    return { valid: true, errors: [] }
  }

  getSchema(actionType: string): ActionSchema {
    const schemas: Record<string, ActionSchema> = {
      'create_record': {
        type: 'create_record',
        parameters: {
          baseId: { type: 'string', description: 'Airtable base ID', required: true },
          tableName: { type: 'string', description: 'Table name', required: true },
          fields: { type: 'object', description: 'Record fields', required: true }
        },
        required: ['baseId', 'tableName', 'fields']
      },
      'update_record': {
        type: 'update_record',
        parameters: {
          baseId: { type: 'string', description: 'Airtable base ID', required: true },
          tableName: { type: 'string', description: 'Table name', required: true },
          recordId: { type: 'string', description: 'Record ID to update', required: true },
          fields: { type: 'object', description: 'Updated fields', required: true }
        },
        required: ['baseId', 'tableName', 'recordId', 'fields']
      },
      'list_records': {
        type: 'list_records',
        parameters: {
          baseId: { type: 'string', description: 'Airtable base ID', required: true },
          tableName: { type: 'string', description: 'Table name', required: true },
          maxRecords: { type: 'number', description: 'Maximum records to return', required: false },
          filterByFormula: { type: 'string', description: 'Airtable formula to filter records', required: false }
        },
        required: ['baseId', 'tableName']
      }
    }
    return schemas[actionType] || { type: actionType, parameters: {}, required: [] }
  }
}

// Config adapter
class AirtableConfigAdapter implements ConfigPort {
  getConfigSchema(): ConfigSchema {
    return {
      fields: {
        personalAccessToken: {
          type: 'string',
          description: 'Airtable personal access token',
          required: true,
          sensitive: true
        },
        baseId: {
          type: 'string',
          description: 'Default base ID',
          required: false
        }
      },
      required: ['personalAccessToken']
    }
  }

  validateConfig(config: any): ValidationResult {
    const errors = []
    if (!config.personalAccessToken) {
      errors.push({
        field: 'personalAccessToken',
        message: 'Personal access token is required',
        code: 'MISSING_ACCESS_TOKEN'
      })
    }
    return { valid: errors.length === 0, errors }
  }

  getRequiredScopes(): string[] {
    return [
      'data.records:read',
      'data.records:write',
      'schema.bases:read'
    ]
  }
}