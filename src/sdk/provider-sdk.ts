import { ConnectorContract, CapabilityDescriptor, ErrorClassification } from '../domains/integrations/ports/connector-contract'
import { providerRegistry } from '../domains/integrations/use-cases/provider-registry'
import { actionRegistry } from '../domains/workflows/use-cases/action-registry'

import { logger } from '@/lib/utils/logger'

/**
 * Configuration for creating a new provider
 */
export interface ProviderConfig {
  providerId: string
  name: string
  version?: string
  description?: string
  capabilities: string[]
  features: string[]
  rateLimits?: Array<{
    type: 'requests' | 'operations'
    limit: number
    window: number
  }>
  supportsWebhooks?: boolean
  authType?: 'oauth2' | 'api_key' | 'bearer_token' | 'basic_auth' | 'custom'
  baseUrl?: string
  apiVersion?: string
}

/**
 * Action configuration for workflow actions
 */
export interface ActionConfig {
  actionType: string
  name: string
  description: string
  category: string
  handler: (params: any, userId: string) => Promise<any>
  parameters?: Record<string, {
    type: string
    required?: boolean
    description?: string
    default?: any
  }>
  examples?: Array<{
    name: string
    description: string
    parameters: Record<string, any>
  }>
}

/**
 * Base class for creating new integration providers with sensible defaults
 */
export abstract class BaseProvider implements ConnectorContract {
  readonly providerId: string
  readonly capabilities: CapabilityDescriptor
  protected config: ProviderConfig
  protected authHeaders: Record<string, string> = {}

  constructor(config: ProviderConfig) {
    this.providerId = config.providerId
    this.config = config
    
    this.capabilities = {
      supportsWebhooks: config.supportsWebhooks ?? false,
      rateLimits: config.rateLimits ?? [
        { type: 'requests', limit: 10, window: 1000 },
        { type: 'requests', limit: 1000, window: 60000 }
      ],
      supportedFeatures: config.features
    }
  }

  /**
   * Abstract method that must be implemented by each provider
   */
  abstract validateConnection(userId: string): Promise<boolean>

  /**
   * Get authentication headers for API requests
   */
  protected async getAuthHeaders(userId: string): Promise<Record<string, string>> {
    const accessToken = await this.getAccessToken(userId)
    
    switch (this.config.authType) {
      case 'oauth2':
      case 'bearer_token':
        return {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      case 'api_key':
        return {
          'X-API-Key': accessToken,
          'Content-Type': 'application/json'
        }
      case 'basic_auth':
        return {
          'Authorization': `Basic ${Buffer.from(accessToken).toString('base64')}`,
          'Content-Type': 'application/json'
        }
      default:
        return {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
    }
  }

  /**
   * Make an authenticated API request
   */
  protected async apiRequest(
    endpoint: string,
    options: RequestInit = {},
    userId: string
  ): Promise<Response> {
    const url = this.buildUrl(endpoint)
    const headers = await this.getAuthHeaders(userId)
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers,
        ...options.headers
      }
    })
    
    if (!response.ok) {
      const error = await this.handleApiError(response)
      throw error
    }
    
    return response
  }

  /**
   * Make a GET request
   */
  protected async get(endpoint: string, userId: string, params?: Record<string, string>): Promise<any> {
    const url = params ? `${endpoint}?${new URLSearchParams(params).toString()}` : endpoint
    const response = await this.apiRequest(url, { method: 'GET' }, userId)
    return response.json()
  }

  /**
   * Make a POST request
   */
  protected async post(endpoint: string, data: any, userId: string): Promise<any> {
    const response = await this.apiRequest(endpoint, {
      method: 'POST',
      body: JSON.stringify(data)
    }, userId)
    return response.json()
  }

  /**
   * Make a PUT request
   */
  protected async put(endpoint: string, data: any, userId: string): Promise<any> {
    const response = await this.apiRequest(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data)
    }, userId)
    return response.json()
  }

  /**
   * Make a DELETE request
   */
  protected async delete(endpoint: string, userId: string): Promise<void> {
    await this.apiRequest(endpoint, { method: 'DELETE' }, userId)
  }

  /**
   * Build full URL from endpoint
   */
  protected buildUrl(endpoint: string): string {
    const baseUrl = this.config.baseUrl || ''
    const version = this.config.apiVersion ? `/${this.config.apiVersion}` : ''
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
    
    return `${baseUrl}${version}${cleanEndpoint}`
  }

  /**
   * Handle API errors and convert to standardized format
   */
  protected async handleApiError(response: Response): Promise<Error> {
    let errorMessage = `API Error: ${response.status} ${response.statusText}`
    
    try {
      const errorData = await response.json()
      if (errorData.message) {
        errorMessage = errorData.message
      } else if (errorData.error) {
        errorMessage = typeof errorData.error === 'string' ? errorData.error : errorData.error.message
      }
    } catch {
      // If we can't parse error response, use the status text
    }
    
    return new Error(errorMessage)
  }

  /**
   * Get access token for the user (to be implemented by specific token management)
   */
  protected abstract getAccessToken(userId: string): Promise<string>

  /**
   * Classify errors for better error handling
   */
  classifyError(error: Error): ErrorClassification {
    const message = error.message.toLowerCase()
    
    if (message.includes('unauthorized') || message.includes('invalid token') || message.includes('authentication')) {
      return 'authentication'
    }
    if (message.includes('forbidden') || message.includes('insufficient') || message.includes('permission')) {
      return 'authorization'
    }
    if (message.includes('rate limit') || message.includes('too many requests') || message.includes('throttled')) {
      return 'rateLimit'
    }
    if (message.includes('network') || message.includes('timeout') || message.includes('connection')) {
      return 'network'
    }
    if (message.includes('not found') || message.includes('does not exist')) {
      return 'notFound'
    }
    if (message.includes('invalid') || message.includes('bad request') || message.includes('validation')) {
      return 'validation'
    }
    
    return 'unknown'
  }

  /**
   * Create a standardized success result
   */
  protected createSuccessResult(output: any, message?: string): any {
    return {
      success: true,
      output,
      message: message || `${this.config.name} operation completed successfully`,
      timestamp: new Date().toISOString()
    }
  }

  /**
   * Create a standardized error result
   */
  protected createErrorResult(error: string | Error, output?: any): any {
    const errorMessage = typeof error === 'string' ? error : error.message
    
    return {
      success: false,
      error: errorMessage,
      output: output || { error: errorMessage, timestamp: new Date().toISOString() }
    }
  }
}

/**
 * Provider Builder - Fluent API for creating providers
 */
export class ProviderBuilder {
  private config: Partial<ProviderConfig> = {}
  private actions: ActionConfig[] = []

  static create(providerId: string): ProviderBuilder {
    return new ProviderBuilder().setId(providerId)
  }

  setId(providerId: string): this {
    this.config.providerId = providerId
    return this
  }

  setName(name: string): this {
    this.config.name = name
    return this
  }

  setVersion(version: string): this {
    this.config.version = version
    return this
  }

  setDescription(description: string): this {
    this.config.description = description
    return this
  }

  setCapabilities(capabilities: string[]): this {
    this.config.capabilities = capabilities
    return this
  }

  setFeatures(features: string[]): this {
    this.config.features = features
    return this
  }

  setAuth(authType: ProviderConfig['authType'], baseUrl?: string): this {
    this.config.authType = authType
    if (baseUrl) this.config.baseUrl = baseUrl
    return this
  }

  setRateLimit(type: 'requests' | 'operations', limit: number, windowMs: number): this {
    if (!this.config.rateLimits) this.config.rateLimits = []
    this.config.rateLimits.push({ type, limit, window: windowMs })
    return this
  }

  enableWebhooks(): this {
    this.config.supportsWebhooks = true
    return this
  }

  addAction(action: ActionConfig): this {
    this.actions.push(action)
    return this
  }

  /**
   * Register the provider and its actions
   */
  register(providerInstance: ConnectorContract): void {
    if (!this.config.providerId || !this.config.name || !this.config.capabilities) {
      throw new Error('Provider must have id, name, and capabilities')
    }

    // Register the provider
    providerRegistry.register(
      providerInstance,
      this.config.capabilities,
      {
        name: this.config.name,
        version: this.config.version || '1.0.0'
      }
    )

    // Register actions
    if (this.actions.length > 0) {
      const actionHandlers = this.actions.map(action => ({
        actionType: action.actionType,
        handler: action.handler,
        metadata: {
          name: action.name,
          description: action.description,
          category: action.category,
          version: '1.0.0'
        }
      }))

      actionRegistry.registerProvider(this.config.providerId, actionHandlers)
    }

    logger.debug(`✅ ${this.config.name} provider registered with ${this.actions.length} actions`)
  }
}

/**
 * Quick provider creation helpers
 */
export class ProviderSDK {
  /**
   * Create a simple API provider with standard OAuth2 authentication
   */
  static createApiProvider(config: {
    providerId: string
    name: string
    baseUrl: string
    authType?: 'oauth2' | 'api_key' | 'bearer_token'
    capabilities: string[]
    features: string[]
  }): ProviderBuilder {
    return ProviderBuilder.create(config.providerId)
      .setName(config.name)
      .setAuth(config.authType || 'oauth2', config.baseUrl)
      .setCapabilities(config.capabilities)
      .setFeatures(config.features)
      .setRateLimit('requests', 10, 1000)
      .setRateLimit('requests', 1000, 60000)
  }

  /**
   * Create a webhook-enabled provider
   */
  static createWebhookProvider(config: {
    providerId: string
    name: string
    baseUrl: string
    capabilities: string[]
    features: string[]
  }): ProviderBuilder {
    return this.createApiProvider(config)
      .enableWebhooks()
  }

  /**
   * Common action builders
   */
  static createAction(config: {
    actionType: string
    name: string
    description: string
    category: string
    handler: (params: any, userId: string) => Promise<any>
  }): ActionConfig {
    return {
      actionType: config.actionType,
      name: config.name,
      description: config.description,
      category: config.category,
      handler: config.handler
    }
  }

  /**
   * Create CRUD action set for a resource
   */
  static createCrudActions(resource: string, provider: any, category: string = 'api'): ActionConfig[] {
    const resourceLower = resource.toLowerCase()
    const resourceTitle = resource.charAt(0).toUpperCase() + resource.slice(1)

    return [
      {
        actionType: `create_${resourceLower}`,
        name: `Create ${resourceTitle}`,
        description: `Create a new ${resourceLower}`,
        category,
        handler: async (params: any, userId: string) => provider.create(params, userId)
      },
      {
        actionType: `get_${resourceLower}`,
        name: `Get ${resourceTitle}`,
        description: `Get a ${resourceLower} by ID`,
        category,
        handler: async (params: any, userId: string) => provider.get(params.id, userId)
      },
      {
        actionType: `update_${resourceLower}`,
        name: `Update ${resourceTitle}`,
        description: `Update a ${resourceLower}`,
        category,
        handler: async (params: any, userId: string) => provider.update(params.id, params, userId)
      },
      {
        actionType: `delete_${resourceLower}`,
        name: `Delete ${resourceTitle}`,
        description: `Delete a ${resourceLower}`,
        category,
        handler: async (params: any, userId: string) => provider.delete(params.id, userId)
      },
      {
        actionType: `list_${resourceLower}s`,
        name: `List ${resourceTitle}s`,
        description: `List all ${resourceLower}s`,
        category,
        handler: async (params: any, userId: string) => provider.list(params, userId)
      }
    ]
  }
}

/**
 * Testing utilities for provider development
 */
export class ProviderTestUtils {
  /**
   * Create a mock provider for testing
   */
  static createMockProvider(providerId: string): ConnectorContract {
    return {
      providerId,
      capabilities: {
        supportsWebhooks: false,
        rateLimits: [],
        supportedFeatures: []
      },
      validateConnection: async () => true,
      classifyError: () => 'unknown'
    }
  }

  /**
   * Test provider registration
   */
  static async testProviderRegistration(provider: ConnectorContract): Promise<boolean> {
    try {
      const isRegistered = providerRegistry.isRegistered(provider.providerId)
      const canValidate = await provider.validateConnection('test-user-id')
      
      return isRegistered && (canValidate !== undefined)
    } catch {
      return false
    }
  }

  /**
   * Validate provider configuration
   */
  static validateProviderConfig(config: ProviderConfig): string[] {
    const errors: string[] = []

    if (!config.providerId) errors.push('Provider ID is required')
    if (!config.name) errors.push('Provider name is required')
    if (!config.capabilities || config.capabilities.length === 0) {
      errors.push('At least one capability is required')
    }
    if (!config.features || config.features.length === 0) {
      errors.push('At least one feature is required')
    }

    return errors
  }
}