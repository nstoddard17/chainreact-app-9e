import { DomainEvent } from '../../domains/workflows/entities/workflow-event'

import { logger } from '@/lib/utils/logger'

/**
 * Event handler interface
 */
export interface EventHandler<T extends DomainEvent = DomainEvent> {
  handle(event: T): Promise<void>
}

/**
 * Event subscription interface
 */
export interface EventSubscription {
  eventType: string
  handler: EventHandler
  id: string
}

/**
 * In-memory event bus implementation
 * For production, this would be replaced with a robust message queue
 */
export class EventBus {
  private subscriptions: Map<string, EventSubscription[]> = new Map()
  private eventHistory: DomainEvent[] = []
  private maxHistorySize = 1000

  /**
   * Subscribe to events of a specific type
   */
  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: EventHandler<T>
  ): string {
    const subscription: EventSubscription = {
      eventType,
      handler: handler as EventHandler,
      id: `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }

    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, [])
    }

    this.subscriptions.get(eventType)!.push(subscription)
    return subscription.id
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscriptionId: string): boolean {
    for (const [eventType, subscriptions] of this.subscriptions.entries()) {
      const index = subscriptions.findIndex(sub => sub.id === subscriptionId)
      if (index !== -1) {
        subscriptions.splice(index, 1)
        if (subscriptions.length === 0) {
          this.subscriptions.delete(eventType)
        }
        return true
      }
    }
    return false
  }

  /**
   * Publish an event to all subscribers
   */
  async publish(event: DomainEvent): Promise<void> {
    // Add to history
    this.eventHistory.push(event)
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift()
    }

    // Get subscribers for this event type
    const subscriptions = this.subscriptions.get(event.type) || []
    
    // Handle events concurrently
    const promises = subscriptions.map(async (subscription) => {
      try {
        await subscription.handler.handle(event)
      } catch (error) {
        logger.error(`Event handler failed for ${event.type}:`, error)
        // In production, you might want to implement retry logic or dead letter queues
      }
    })

    await Promise.allSettled(promises)
  }

  /**
   * Get event history for debugging/monitoring
   */
  getEventHistory(eventType?: string, limit: number = 100): DomainEvent[] {
    let events = this.eventHistory
    
    if (eventType) {
      events = events.filter(event => event.type === eventType)
    }

    return events.slice(-limit).reverse() // Most recent first
  }

  /**
   * Get current subscription count
   */
  getSubscriptionCount(): number {
    return Array.from(this.subscriptions.values())
      .reduce((total, subs) => total + subs.length, 0)
  }

  /**
   * Get subscription details for monitoring
   */
  getSubscriptions(): Array<{ eventType: string, handlerCount: number }> {
    return Array.from(this.subscriptions.entries()).map(([eventType, subs]) => ({
      eventType,
      handlerCount: subs.length
    }))
  }

  /**
   * Clear all subscriptions and history (useful for testing)
   */
  clear(): void {
    this.subscriptions.clear()
    this.eventHistory = []
  }
}

// Singleton instance
export const eventBus = new EventBus()