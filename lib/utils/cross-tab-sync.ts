/**
 * Cross-Tab Synchronization Utility
 *
 * Provides multi-tab synchronization for stores and authentication state.
 * Uses Broadcast Channel API for modern browsers with localStorage fallback.
 *
 * Key Features:
 * - Real-time sync across tabs
 * - Auth state synchronization
 * - Store state synchronization
 * - Race condition handling (last-write-wins)
 * - Automatic cleanup on tab close
 *
 * Usage:
 * ```ts
 * const sync = new CrossTabSync('myChannel')
 * sync.subscribe('auth-change', (data) => {
 *   // Handle auth change from other tab
 * })
 * sync.broadcast('auth-change', { user: newUser })
 * ```
 */

import { logger } from './logger'

export type SyncEventType =
  | 'auth-login'
  | 'auth-logout'
  | 'auth-update'
  | 'integration-connected'
  | 'integration-disconnected'
  | 'integration-refresh'
  | 'workflow-updated'
  | 'workflow-deleted'
  | 'workspace-changed'

export interface SyncMessage {
  type: SyncEventType
  data: any
  timestamp: number
  tabId: string
}

type SyncCallback = (data: any, message: SyncMessage) => void

export class CrossTabSync {
  private channel: BroadcastChannel | null = null
  private channelName: string
  private listeners: Map<SyncEventType, Set<SyncCallback>> = new Map()
  private tabId: string
  private useLocalStorage: boolean = false
  private storageListener: ((e: StorageEvent) => void) | null = null

  constructor(channelName: string = 'chainreact-sync') {
    this.channelName = channelName
    this.tabId = this.generateTabId()
    this.initialize()
  }

  /**
   * Initialize the synchronization channel
   */
  private initialize() {
    // Try to use Broadcast Channel API (modern browsers)
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel(this.channelName)
        this.channel.onmessage = this.handleMessage.bind(this)
        logger.debug('[CrossTabSync] Initialized with Broadcast Channel API', {
          tabId: this.tabId,
          channel: this.channelName
        })
      } catch (error) {
        logger.warn('[CrossTabSync] Broadcast Channel failed, falling back to localStorage', error)
        this.initializeLocalStorageFallback()
      }
    } else {
      // Fallback to localStorage for older browsers
      this.initializeLocalStorageFallback()
    }

    // Announce this tab's presence
    this.broadcast('auth-update', { action: 'tab-opened', tabId: this.tabId })

    // Cleanup on tab close
    window.addEventListener('beforeunload', () => {
      this.broadcast('auth-update', { action: 'tab-closed', tabId: this.tabId })
      this.cleanup()
    })
  }

  /**
   * Initialize localStorage fallback for cross-tab sync
   */
  private initializeLocalStorageFallback() {
    this.useLocalStorage = true
    this.storageListener = (e: StorageEvent) => {
      if (e.key === this.channelName && e.newValue) {
        try {
          const message: SyncMessage = JSON.parse(e.newValue)
          // Don't process our own messages
          if (message.tabId !== this.tabId) {
            this.handleMessage({ data: message } as MessageEvent)
          }
        } catch (error) {
          logger.error('[CrossTabSync] Failed to parse localStorage message', error)
        }
      }
    }
    window.addEventListener('storage', this.storageListener)
    logger.debug('[CrossTabSync] Initialized with localStorage fallback', {
      tabId: this.tabId
    })
  }

  /**
   * Generate unique tab ID
   */
  private generateTabId(): string {
    return `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Handle incoming messages from other tabs
   */
  private handleMessage(event: MessageEvent) {
    const message = event.data as SyncMessage

    // Don't process our own messages
    if (message.tabId === this.tabId) {
      return
    }

    logger.debug('[CrossTabSync] Received message from another tab', {
      type: message.type,
      fromTab: message.tabId,
      currentTab: this.tabId,
      age: Date.now() - message.timestamp
    })

    // Call all listeners for this event type
    const callbacks = this.listeners.get(message.type)
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(message.data, message)
        } catch (error) {
          logger.error('[CrossTabSync] Error in callback', {
            type: message.type,
            error
          })
        }
      })
    }
  }

  /**
   * Broadcast a message to all other tabs
   */
  broadcast(type: SyncEventType, data: any) {
    const message: SyncMessage = {
      type,
      data,
      timestamp: Date.now(),
      tabId: this.tabId
    }

    try {
      if (this.channel && !this.useLocalStorage) {
        // Use Broadcast Channel
        this.channel.postMessage(message)
      } else if (this.useLocalStorage) {
        // Use localStorage fallback
        localStorage.setItem(this.channelName, JSON.stringify(message))
        // Clear it immediately so it can be reused
        setTimeout(() => {
          const current = localStorage.getItem(this.channelName)
          if (current === JSON.stringify(message)) {
            localStorage.removeItem(this.channelName)
          }
        }, 100)
      }

      logger.debug('[CrossTabSync] Broadcasted message', {
        type,
        tabId: this.tabId,
        method: this.useLocalStorage ? 'localStorage' : 'BroadcastChannel'
      })
    } catch (error) {
      logger.error('[CrossTabSync] Failed to broadcast message', {
        type,
        error
      })
    }
  }

  /**
   * Subscribe to a specific event type
   */
  subscribe(type: SyncEventType, callback: SyncCallback): () => void {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }

    this.listeners.get(type)!.add(callback)

    logger.debug('[CrossTabSync] Subscribed to event', {
      type,
      tabId: this.tabId,
      totalListeners: this.listeners.get(type)!.size
    })

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(type)
      if (callbacks) {
        callbacks.delete(callback)
        if (callbacks.size === 0) {
          this.listeners.delete(type)
        }
      }
    }
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.channel) {
      this.channel.close()
      this.channel = null
    }

    if (this.storageListener) {
      window.removeEventListener('storage', this.storageListener)
      this.storageListener = null
    }

    this.listeners.clear()

    logger.debug('[CrossTabSync] Cleaned up', { tabId: this.tabId })
  }

  /**
   * Get the current tab ID
   */
  getTabId(): string {
    return this.tabId
  }
}

// Singleton instance for the app
let syncInstance: CrossTabSync | null = null

/**
 * Get or create the global sync instance
 */
export function getCrossTabSync(): CrossTabSync {
  if (!syncInstance) {
    syncInstance = new CrossTabSync('chainreact-sync')
  }
  return syncInstance
}

/**
 * Cleanup the global sync instance
 */
export function cleanupCrossTabSync() {
  if (syncInstance) {
    syncInstance.cleanup()
    syncInstance = null
  }
}
