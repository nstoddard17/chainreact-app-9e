/**
 * Base domain event interface
 */
export interface DomainEvent {
  readonly eventId: string
  readonly eventType: string
  readonly aggregateId: string
  readonly aggregateType: string
  readonly eventVersion: number
  readonly occurredAt: Date
  readonly causationId?: string
  readonly correlationId?: string
  readonly metadata?: Record<string, any>
}

/**
 * Abstract base class for domain events
 */
export abstract class BaseDomainEvent implements DomainEvent {
  readonly eventId: string
  readonly eventVersion: number = 1
  readonly occurredAt: Date
  readonly causationId?: string
  readonly correlationId?: string
  readonly metadata?: Record<string, any>

  constructor(
    public readonly aggregateId: string,
    options?: {
      causationId?: string
      correlationId?: string
      metadata?: Record<string, any>
    }
  ) {
    this.eventId = this.generateEventId()
    this.occurredAt = new Date()
    this.causationId = options?.causationId
    this.correlationId = options?.correlationId
    this.metadata = options?.metadata
  }

  abstract get eventType(): string
  abstract get aggregateType(): string

  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
  }
}

/**
 * Event handler interface
 */
export interface EventHandler<T extends DomainEvent = DomainEvent> {
  handle(event: T): Promise<void>
  canHandle(eventType: string): boolean
}

/**
 * Event bus interface
 */
export interface EventBus {
  publish(event: DomainEvent): Promise<void>
  publishAll(events: DomainEvent[]): Promise<void>
  subscribe<T extends DomainEvent>(eventType: string, handler: EventHandler<T>): void
  unsubscribe(eventType: string, handler: EventHandler): void
}

/**
 * Event store interface for persistence
 */
export interface EventStore {
  append(events: DomainEvent[]): Promise<void>
  getEvents(aggregateId: string, fromVersion?: number): Promise<DomainEvent[]>
  getEventsByType(eventType: string, limit?: number): Promise<DomainEvent[]>
}