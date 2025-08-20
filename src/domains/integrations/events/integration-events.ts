import { BaseDomainEvent } from '../../../shared/events/domain-event'

/**
 * Integration domain events
 */

export class IntegrationConnected extends BaseDomainEvent {
  get eventType(): string { return 'IntegrationConnected' }
  get aggregateType(): string { return 'Integration' }

  constructor(
    integrationId: string,
    public readonly userId: string,
    public readonly providerId: string,
    public readonly scopes: string[],
    options?: { causationId?: string; correlationId?: string; metadata?: Record<string, any> }
  ) {
    super(integrationId, options)
  }
}

export class IntegrationDisconnected extends BaseDomainEvent {
  get eventType(): string { return 'IntegrationDisconnected' }
  get aggregateType(): string { return 'Integration' }

  constructor(
    integrationId: string,
    public readonly userId: string,
    public readonly providerId: string,
    public readonly reason: string,
    options?: { causationId?: string; correlationId?: string; metadata?: Record<string, any> }
  ) {
    super(integrationId, options)
  }
}

export class IntegrationTokenRefreshed extends BaseDomainEvent {
  get eventType(): string { return 'IntegrationTokenRefreshed' }
  get aggregateType(): string { return 'Integration' }

  constructor(
    integrationId: string,
    public readonly userId: string,
    public readonly providerId: string,
    public readonly expiresAt: Date,
    options?: { causationId?: string; correlationId?: string; metadata?: Record<string, any> }
  ) {
    super(integrationId, options)
  }
}

export class IntegrationAuthorizationFailed extends BaseDomainEvent {
  get eventType(): string { return 'IntegrationAuthorizationFailed' }
  get aggregateType(): string { return 'Integration' }

  constructor(
    integrationId: string,
    public readonly userId: string,
    public readonly providerId: string,
    public readonly error: string,
    options?: { causationId?: string; correlationId?: string; metadata?: Record<string, any> }
  ) {
    super(integrationId, options)
  }
}

export class IntegrationRateLimitExceeded extends BaseDomainEvent {
  get eventType(): string { return 'IntegrationRateLimitExceeded' }
  get aggregateType(): string { return 'Integration' }

  constructor(
    integrationId: string,
    public readonly userId: string,
    public readonly providerId: string,
    public readonly resetAt: Date,
    options?: { causationId?: string; correlationId?: string; metadata?: Record<string, any> }
  ) {
    super(integrationId, options)
  }
}

export class IntegrationHealthCheckFailed extends BaseDomainEvent {
  get eventType(): string { return 'IntegrationHealthCheckFailed' }
  get aggregateType(): string { return 'Integration' }

  constructor(
    integrationId: string,
    public readonly providerId: string,
    public readonly error: string,
    public readonly consecutiveFailures: number,
    options?: { causationId?: string; correlationId?: string; metadata?: Record<string, any> }
  ) {
    super(integrationId, options)
  }
}