import { IntegrationError } from '../entities/integration-error'

/**
 * Core connector contract that all integrations must implement
 */
export interface ConnectorContract {
  readonly providerId: string
  readonly capabilities: CapabilityDescriptor
  
  // Lifecycle management
  lifecycle: LifecyclePort
  
  // Trigger management
  triggers: TriggerPort
  
  // Action execution
  actions: ActionPort
  
  // Configuration
  config: ConfigPort
}

export interface LifecyclePort {
  install(userId: string, config: InstallConfig): Promise<InstallResult>
  authorize(userId: string, authCode: string): Promise<AuthResult>
  refresh(userId: string, refreshToken: string): Promise<AuthResult>
  revoke(userId: string, integrationId: string): Promise<RevokeResult>
  healthCheck(integrationId: string): Promise<HealthResult>
}

export interface TriggerPort {
  subscribe(trigger: TriggerConfig): Promise<SubscriptionResult>
  unsubscribe(subscriptionId: string): Promise<void>
  poll(trigger: TriggerConfig): Promise<TriggerEvent[]>
}

export interface ActionPort {
  execute(action: ActionConfig): Promise<ActionResult>
  validate(action: ActionConfig): Promise<ValidationResult>
  getSchema(actionType: string): ActionSchema
}

export interface ConfigPort {
  getConfigSchema(): ConfigSchema
  validateConfig(config: any): ValidationResult
  getRequiredScopes(): string[]
}

export interface CapabilityDescriptor {
  // Provider capabilities
  supportsWebhooks: boolean
  supportsPolling: boolean
  supportsBatch: boolean
  supportsRealTime: boolean
  
  // Rate limiting
  rateLimits: RateLimit[]
  
  // Data capabilities
  maxPageSize: number
  supportsSearch: boolean
  supportsSorting: boolean
  supportsFiltering: boolean
  
  // Feature-specific capabilities (extensible)
  features: Record<string, any>
}

export interface RateLimit {
  type: 'requests' | 'points' | 'tokens'
  limit: number
  window: number // milliseconds
  scope: 'global' | 'user' | 'integration'
}

// Common interfaces
export interface InstallConfig {
  scopes: string[]
  redirectUri: string
  metadata?: Record<string, any>
}

export interface InstallResult {
  success: boolean
  authUrl?: string
  error?: IntegrationError
}

export interface AuthResult {
  success: boolean
  accessToken?: string
  refreshToken?: string
  expiresAt?: Date
  scopes?: string[]
  error?: IntegrationError
}

export interface RevokeResult {
  success: boolean
  error?: IntegrationError
}

export interface HealthResult {
  healthy: boolean
  lastChecked: Date
  error?: IntegrationError
  metadata?: Record<string, any>
}

export interface TriggerConfig {
  type: string
  filters: Record<string, any>
  webhook?: WebhookConfig
  poll?: PollConfig
}

export interface WebhookConfig {
  url: string
  secret: string
  events: string[]
}

export interface PollConfig {
  interval: number
  lastPolled?: Date
}

export interface SubscriptionResult {
  success: boolean
  subscriptionId?: string
  error?: IntegrationError
}

export interface TriggerEvent {
  id: string
  type: string
  timestamp: Date
  data: Record<string, any>
}

export interface ActionConfig {
  type: string
  parameters: Record<string, any>
  integrationId: string
}

export interface ActionResult {
  success: boolean
  data?: any
  error?: IntegrationError
  metadata?: Record<string, any>
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

export interface ValidationError {
  field: string
  message: string
  code: string
}

export interface ActionSchema {
  type: string
  parameters: Record<string, ParameterSchema>
  required: string[]
}

export interface ParameterSchema {
  type: string
  description: string
  required: boolean
  validation?: any
}

export interface ConfigSchema {
  fields: Record<string, ParameterSchema>
  required: string[]
}