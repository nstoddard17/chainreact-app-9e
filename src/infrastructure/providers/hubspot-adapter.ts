import { 
  CRMProvider,
  CRMContact,
  ContactResult,
  Deal,
  DealResult,
  CRMFilters
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
 * HubSpot adapter implementing CRMProvider interface
 */
export class HubSpotAdapter implements CRMProvider {
  readonly providerId = 'hubspot'
  readonly capabilities: CapabilityDescriptor = {
    supportsWebhooks: true,
    supportsPolling: true,
    supportsBatch: true,
    supportsRealTime: true,
    rateLimits: [
      {
        type: 'requests',
        limit: 100,
        window: 10000, // 10 seconds
        scope: 'app'
      }
    ],
    maxPageSize: 100,
    supportsSearch: true,
    supportsSorting: true,
    supportsFiltering: true,
    features: {
      supportsCustomFields: true,
      supportsWorkflows: true,
      supportsReporting: true,
      supportsIntegrations: true,
      supportsPipelines: true,
      supportsAutomation: true,
      maxFileSize: 100 * 1024 * 1024 // 100MB
    }
  }

  lifecycle: LifecyclePort = new HubSpotLifecycleAdapter()
  triggers: TriggerPort = new HubSpotTriggerAdapter()
  actions: ActionPort = new HubSpotActionAdapter()
  config: ConfigPort = new HubSpotConfigAdapter()

  // CRMProvider implementation
  async createContact(contact: CRMContact): Promise<ContactResult> {
    try {
      const userId = (contact as any).userId || 'unknown-user'
      const result = await this.callHubSpotAPI('create_contact', contact, userId)
      
      return {
        success: true,
        data: result,
        contactId: result.id
      }
    } catch (error) {
      throw this.translateError(error, 'CREATE_CONTACT_FAILED')
    }
  }

  async updateContact(contactId: string, updates: Partial<CRMContact>): Promise<ContactResult> {
    try {
      const userId = (updates as any).userId || 'unknown-user'
      const result = await this.callHubSpotAPI('update_contact', { contactId, ...updates }, userId)
      
      return {
        success: true,
        data: result,
        contactId: result.id
      }
    } catch (error) {
      throw this.translateError(error, 'UPDATE_CONTACT_FAILED')
    }
  }

  async deleteContact(contactId: string): Promise<void> {
    try {
      await this.callHubSpotAPI('delete_contact', { contactId }, 'unknown-user')
    } catch (error) {
      throw this.translateError(error, 'DELETE_CONTACT_FAILED')
    }
  }

  async getContacts(filters?: CRMFilters): Promise<CRMContact[]> {
    try {
      const userId = (filters as any)?.userId || 'unknown-user'
      const result = await this.callHubSpotAPI('get_contacts', filters, userId)
      return result.contacts || []
    } catch (error) {
      throw this.translateError(error, 'GET_CONTACTS_FAILED')
    }
  }

  async createDeal(deal: Deal): Promise<DealResult> {
    try {
      const userId = (deal as any).userId || 'unknown-user'
      const result = await this.callHubSpotAPI('create_deal', deal, userId)
      
      return {
        success: true,
        data: result,
        dealId: result.id
      }
    } catch (error) {
      throw this.translateError(error, 'CREATE_DEAL_FAILED')
    }
  }

  async updateDeal(dealId: string, updates: Partial<Deal>): Promise<DealResult> {
    try {
      const userId = (updates as any).userId || 'unknown-user'
      const result = await this.callHubSpotAPI('update_deal', { dealId, ...updates }, userId)
      
      return {
        success: true,
        data: result,
        dealId: result.id
      }
    } catch (error) {
      throw this.translateError(error, 'UPDATE_DEAL_FAILED')
    }
  }

  private async callHubSpotAPI(method: string, params: any, userId?: string): Promise<any> {
    try {
      switch (method) {
        case 'create_contact': {
          const { createHubSpotContact } = await import('../../../lib/workflows/actions/hubspot')
          const result = await createHubSpotContact(params, userId || 'user-id', {})
          
          if (!result.success) {
            throw new Error(result.message || 'HubSpot create contact failed')
          }
          
          return {
            id: result.output?.id,
            properties: result.output?.properties,
            success: true,
            ...result.output
          }
        }
        
        case 'update_contact': {
          // HubSpot update contact implementation
          const { createSupabaseServerClient } = await import("@/utils/supabase/server")
          const supabase = await createSupabaseServerClient()
          
          const { data: integration } = await supabase
            .from("integrations")
            .select("*")
            .eq("user_id", userId)
            .eq("provider", "hubspot")
            .eq("status", "connected")
            .single()
          
          if (!integration) {
            throw new Error("HubSpot integration not connected")
          }
          
          // Mock implementation for now
          return {
            id: params.contactId,
            success: true,
            updated: true
          }
        }
        
        case 'get_contacts': {
          // HubSpot get contacts implementation
          const { createSupabaseServerClient } = await import("@/utils/supabase/server")
          const supabase = await createSupabaseServerClient()
          
          const { data: integration } = await supabase
            .from("integrations")
            .select("*")
            .eq("user_id", userId)
            .eq("provider", "hubspot")
            .eq("status", "connected")
            .single()
          
          if (!integration) {
            throw new Error("HubSpot integration not connected")
          }
          
          // Mock implementation for now
          return {
            contacts: [],
            success: true
          }
        }
        
        case 'create_deal': {
          // HubSpot create deal implementation
          const { createSupabaseServerClient } = await import("@/utils/supabase/server")
          const supabase = await createSupabaseServerClient()
          
          const { data: integration } = await supabase
            .from("integrations")
            .select("*")
            .eq("user_id", userId)
            .eq("provider", "hubspot")
            .eq("status", "connected")
            .single()
          
          if (!integration) {
            throw new Error("HubSpot integration not connected")
          }
          
          // Mock implementation for now
          return {
            id: `deal_${Date.now()}`,
            success: true
          }
        }
        
        default:
          throw new Error(`HubSpot method ${method} not implemented`)
      }
    } catch (error) {
      logger.error(`HubSpot API call failed for method ${method}:`, error)
      throw error
    }
  }

  private translateError(error: any, code: string): IntegrationError {
    let errorType = ErrorType.PROVIDER_ERROR
    let message = error.message || 'Unknown HubSpot error'

    // Translate HubSpot-specific errors
    if (error.status) {
      switch (error.status) {
        case 401:
          errorType = ErrorType.AUTHORIZATION
          message = 'HubSpot API key is invalid or expired.'
          break
        case 403:
          errorType = ErrorType.AUTHORIZATION
          message = 'Insufficient permissions for HubSpot operation.'
          break
        case 429:
          errorType = ErrorType.RATE_LIMIT
          message = 'HubSpot rate limit exceeded. Please try again later.'
          break
        case 400:
          errorType = ErrorType.VALIDATION
          message = 'Invalid HubSpot request parameters.'
          break
        default:
          if (error.status >= 500) {
            errorType = ErrorType.PROVIDER_ERROR
            message = 'HubSpot service is temporarily unavailable.'
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
class HubSpotLifecycleAdapter implements LifecyclePort {
  async install(userId: string, config: InstallConfig): Promise<InstallResult> {
    return { 
      success: true, 
      authUrl: 'https://app.hubspot.com/oauth/authorize'
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
class HubSpotTriggerAdapter implements TriggerPort {
  async subscribe(trigger: TriggerConfig): Promise<SubscriptionResult> {
    return { success: true, subscriptionId: 'sub-id' }
  }

  async unsubscribe(subscriptionId: string): Promise<void> {
    // Unsubscribe from HubSpot webhooks
  }

  async poll(trigger: TriggerConfig): Promise<TriggerEvent[]> {
    return []
  }
}

// Action adapter
class HubSpotActionAdapter implements ActionPort {
  async execute(action: ActionConfig): Promise<ActionResult> {
    return { success: true }
  }

  async validate(action: ActionConfig): Promise<ValidationResult> {
    return { valid: true, errors: [] }
  }

  getSchema(actionType: string): ActionSchema {
    const schemas: Record<string, ActionSchema> = {
      'create_contact': {
        type: 'create_contact',
        parameters: {
          email: { type: 'string', description: 'Contact email', required: true },
          name: { type: 'string', description: 'Contact name', required: false },
          phone: { type: 'string', description: 'Contact phone', required: false },
          company: { type: 'string', description: 'Company name', required: false }
        },
        required: ['email']
      },
      'create_deal': {
        type: 'create_deal',
        parameters: {
          title: { type: 'string', description: 'Deal title', required: true },
          amount: { type: 'number', description: 'Deal amount', required: false },
          stage: { type: 'string', description: 'Deal stage', required: false },
          contactId: { type: 'string', description: 'Associated contact ID', required: false }
        },
        required: ['title']
      }
    }
    return schemas[actionType] || { type: actionType, parameters: {}, required: [] }
  }
}

// Config adapter
class HubSpotConfigAdapter implements ConfigPort {
  getConfigSchema(): ConfigSchema {
    return {
      fields: {
        apiKey: {
          type: 'string',
          description: 'HubSpot API key',
          required: true,
          sensitive: true
        },
        portalId: {
          type: 'string',
          description: 'HubSpot portal ID',
          required: true
        }
      },
      required: ['apiKey', 'portalId']
    }
  }

  validateConfig(config: any): ValidationResult {
    const errors = []
    if (!config.apiKey) {
      errors.push({
        field: 'apiKey',
        message: 'API key is required',
        code: 'MISSING_API_KEY'
      })
    }
    if (!config.portalId) {
      errors.push({
        field: 'portalId',
        message: 'Portal ID is required',
        code: 'MISSING_PORTAL_ID'
      })
    }
    return { valid: errors.length === 0, errors }
  }

  getRequiredScopes(): string[] {
    return [
      'contacts',
      'crm.objects.contacts.read',
      'crm.objects.contacts.write',
      'crm.objects.deals.read',
      'crm.objects.deals.write'
    ]
  }
}