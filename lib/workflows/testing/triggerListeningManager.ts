/**
 * Trigger Listening Manager for Test Mode
 *
 * Manages real-time trigger listening during workflow testing,
 * allowing users to test workflows with actual trigger events
 * instead of just mock data.
 */

import { createClient } from '@supabase/supabase-js'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'

import { logger } from '@/lib/utils/logger'

export type ListeningMode = 'sandbox' | 'live'
export type ListenerStatus = 'idle' | 'listening' | 'triggered' | 'executing' | 'error' | 'stopped'

interface TriggerListener {
  workflowId: string
  userId: string
  triggerNodeId: string
  triggerType: string
  providerId: string
  config: Record<string, any>
  mode: ListeningMode
  status: ListenerStatus
  startTime: number
  webhookUrl?: string
  pollInterval?: NodeJS.Timeout
  eventListener?: any
}

interface TriggerEvent {
  triggerNodeId: string
  eventType: string
  data: any
  timestamp: number
  source: 'webhook' | 'polling' | 'realtime' | 'manual'
}

export class TriggerListeningManager {
  private listeners: Map<string, TriggerListener> = new Map()
  private eventQueue: TriggerEvent[] = []
  private supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  private onTriggerCallback?: (event: TriggerEvent) => void
  private onStatusChangeCallback?: (nodeId: string, status: ListenerStatus) => void

  /**
   * Start listening for a workflow trigger
   */
  async startListening(
    workflowId: string,
    userId: string,
    triggerNode: any,
    mode: ListeningMode
  ): Promise<boolean> {
    const listenerId = `${workflowId}-${triggerNode.id}`

    // Stop existing listener if any
    if (this.listeners.has(listenerId)) {
      await this.stopListening(listenerId)
    }

    const listener: TriggerListener = {
      workflowId,
      userId,
      triggerNodeId: triggerNode.id,
      triggerType: triggerNode.data.type,
      providerId: triggerNode.data.providerId || 'core',
      config: triggerNode.data.config || {},
      mode,
      status: 'listening',
      startTime: Date.now()
    }

    // Set up listener based on trigger type
    const success = await this.setupTriggerListener(listener)

    if (success) {
      this.listeners.set(listenerId, listener)
      this.notifyStatusChange(triggerNode.id, 'listening')
      logger.debug(`🎧 Started listening for trigger: ${listener.triggerType}`)
      return true
    }

    return false
  }

  /**
   * Stop listening for a specific trigger
   */
  async stopListening(listenerId: string): Promise<void> {
    const listener = this.listeners.get(listenerId)
    if (!listener) return

    // Clean up based on trigger type
    await this.cleanupTriggerListener(listener)

    listener.status = 'stopped'
    this.notifyStatusChange(listener.triggerNodeId, 'stopped')
    this.listeners.delete(listenerId)

    logger.debug(`🛑 Stopped listening for trigger: ${listener.triggerType}`)
  }

  /**
   * Stop all active listeners
   */
  async stopAllListeners(): Promise<void> {
    const listenerIds = Array.from(this.listeners.keys())
    await Promise.all(listenerIds.map(id => this.stopListening(id)))
    this.eventQueue = []
  }

  /**
   * Set up the appropriate listener based on trigger type
   */
  private async setupTriggerListener(listener: TriggerListener): Promise<boolean> {
    const { triggerType, providerId, config } = listener

    try {
      // Handle different trigger types
      switch (providerId) {
        case 'gmail':
          return await this.setupGmailListener(listener)

        case 'discord':
          return await this.setupDiscordListener(listener)

        case 'slack':
          return await this.setupSlackListener(listener)

        case 'webhook':
          return await this.setupWebhookListener(listener)

        case 'schedule':
          return await this.setupScheduleListener(listener)

        case 'manual':
          // Manual triggers are ready immediately
          return true

        case 'airtable':
          return await this.setupAirtableListener(listener)

        case 'google_calendar':
          return await this.setupGoogleCalendarListener(listener)

        case 'trello':
          return await this.setupTrelloListener(listener)

        default:
          // For unsupported triggers, use polling as fallback
          return await this.setupPollingListener(listener)
      }
    } catch (error) {
      logger.error(`Failed to setup listener for ${triggerType}:`, error)
      listener.status = 'error'
      return false
    }
  }

  /**
   * Gmail trigger listener (polling-based for test mode)
   */
  private async setupGmailListener(listener: TriggerListener): Promise<boolean> {
    // In test mode, poll for new emails every 10 seconds
    const pollInterval = setInterval(async () => {
      try {
        // Check for new emails via Gmail API
        const response = await fetch('/api/integrations/gmail/check-new', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: listener.userId,
            config: listener.config,
            lastCheck: listener.startTime
          })
        })

        if (response.ok) {
          const data = await response.json()
          if (data.hasNewEmails && data.emails?.length > 0) {
            // Trigger the workflow with the new email data
            this.triggerEvent({
              triggerNodeId: listener.triggerNodeId,
              eventType: 'new_email',
              data: data.emails[0], // Use first email for testing
              timestamp: Date.now(),
              source: 'polling'
            })

            // Stop polling after trigger in test mode
            clearInterval(pollInterval)
            listener.status = 'triggered'
          }
        }
      } catch (error) {
        logger.error('Gmail polling error:', error)
      }
    }, 10000) // Poll every 10 seconds

    listener.pollInterval = pollInterval
    return true
  }

  /**
   * Discord trigger listener (WebSocket-based)
   */
  private async setupDiscordListener(listener: TriggerListener): Promise<boolean> {
    // Set up Discord Gateway connection for real-time events
    try {
      const response = await fetch('/api/integrations/discord/listen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: listener.userId,
          config: listener.config,
          eventTypes: [listener.triggerType]
        })
      })

      if (response.ok) {
        const { listenerId } = await response.json()
        listener.eventListener = listenerId

        // Set up SSE or WebSocket connection for real-time events
        this.setupDiscordEventStream(listener)
        return true
      }
    } catch (error) {
      logger.error('Discord listener setup error:', error)
    }
    return false
  }

  /**
   * Webhook trigger listener
   */
  private async setupWebhookListener(listener: TriggerListener): Promise<boolean> {
    // Generate unique webhook URL for this test session
    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/test/${listener.workflowId}/${listener.triggerNodeId}`
    listener.webhookUrl = webhookUrl

    // Register the webhook endpoint
    await this.registerTestWebhook(listener)

    logger.debug(`🔗 Test webhook URL: ${webhookUrl}`)
    return true
  }

  /**
   * Schedule trigger listener (for testing scheduled workflows)
   */
  private async setupScheduleListener(listener: TriggerListener): Promise<boolean> {
    const { schedule } = listener.config

    if (!schedule) return false

    // For testing, trigger once after a short delay
    setTimeout(() => {
      this.triggerEvent({
        triggerNodeId: listener.triggerNodeId,
        eventType: 'scheduled',
        data: {
          scheduledTime: new Date().toISOString(),
          schedule
        },
        timestamp: Date.now(),
        source: 'manual'
      })
    }, 5000) // Trigger after 5 seconds for testing

    return true
  }

  /**
   * Slack trigger listener
   */
  private async setupSlackListener(listener: TriggerListener): Promise<boolean> {
    // Similar to Discord, set up event listener
    try {
      const response = await fetch('/api/integrations/slack/listen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: listener.userId,
          config: listener.config,
          channel: listener.config.channelId
        })
      })

      if (response.ok) {
        // Poll for Slack events
        listener.pollInterval = setInterval(async () => {
          await this.checkSlackEvents(listener)
        }, 5000)
        return true
      }
    } catch (error) {
      logger.error('Slack listener setup error:', error)
    }
    return false
  }

  /**
   * Airtable trigger listener
   */
  private async setupAirtableListener(listener: TriggerListener): Promise<boolean> {
    // Use existing Airtable webhook registration
    try {
      const response = await fetch('/api/integrations/airtable/webhooks/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: listener.userId,
          baseId: listener.config.baseId,
          tableId: listener.config.tableId,
          workflowId: listener.workflowId,
          testMode: true
        })
      })

      if (response.ok) {
        const { webhookUrl } = await response.json()
        listener.webhookUrl = webhookUrl
        return true
      }
    } catch (error) {
      logger.error('Airtable listener setup error:', error)
    }
    return false
  }

  /**
   * Google Calendar trigger listener
   */
  private async setupGoogleCalendarListener(listener: TriggerListener): Promise<boolean> {
    // Poll for calendar events
    listener.pollInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/integrations/google-calendar/check-events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: listener.userId,
            calendarId: listener.config.calendarId,
            lastCheck: listener.startTime
          })
        })

        if (response.ok) {
          const data = await response.json()
          if (data.newEvents?.length > 0) {
            this.triggerEvent({
              triggerNodeId: listener.triggerNodeId,
              eventType: 'calendar_event',
              data: data.newEvents[0],
              timestamp: Date.now(),
              source: 'polling'
            })
            clearInterval(listener.pollInterval)
            listener.status = 'triggered'
          }
        }
      } catch (error) {
        logger.error('Calendar polling error:', error)
      }
    }, 10000)

    return true
  }

  /**
   * Trello trigger listener
   */
  private async setupTrelloListener(listener: TriggerListener): Promise<boolean> {
    // Similar to other webhook-based triggers
    try {
      const response = await fetch('/api/integrations/trello/webhooks/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: listener.userId,
          boardId: listener.config.boardId,
          workflowId: listener.workflowId,
          testMode: true
        })
      })

      if (response.ok) {
        const { webhookUrl } = await response.json()
        listener.webhookUrl = webhookUrl
        return true
      }
    } catch (error) {
      logger.error('Trello listener setup error:', error)
    }
    return false
  }

  /**
   * Generic polling listener for unsupported triggers
   */
  private async setupPollingListener(listener: TriggerListener): Promise<boolean> {
    logger.debug(`⚠️ Using polling fallback for ${listener.triggerType}`)

    // Poll every 15 seconds
    listener.pollInterval = setInterval(async () => {
      // Check if trigger conditions are met
      const triggered = await this.checkTriggerConditions(listener)
      if (triggered) {
        clearInterval(listener.pollInterval)
        listener.status = 'triggered'
      }
    }, 15000)

    return true
  }

  /**
   * Set up Discord event stream
   */
  private setupDiscordEventStream(listener: TriggerListener): void {
    // Use EventSource for server-sent events
    const eventSource = new EventSource(
      `/api/integrations/discord/events?listenerId=${listener.eventListener}`
    )

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === listener.triggerType) {
        this.triggerEvent({
          triggerNodeId: listener.triggerNodeId,
          eventType: data.type,
          data: data.payload,
          timestamp: Date.now(),
          source: 'realtime'
        })
        eventSource.close()
        listener.status = 'triggered'
      }
    }

    eventSource.onerror = () => {
      logger.error('Discord event stream error')
      eventSource.close()
    }
  }

  /**
   * Check Slack events
   */
  private async checkSlackEvents(listener: TriggerListener): Promise<void> {
    try {
      const response = await fetch('/api/integrations/slack/check-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: listener.userId,
          channel: listener.config.channelId,
          lastCheck: listener.startTime
        })
      })

      if (response.ok) {
        const data = await response.json()
        if (data.newEvents?.length > 0) {
          this.triggerEvent({
            triggerNodeId: listener.triggerNodeId,
            eventType: 'slack_message',
            data: data.newEvents[0],
            timestamp: Date.now(),
            source: 'polling'
          })

          if (listener.pollInterval) {
            clearInterval(listener.pollInterval)
          }
          listener.status = 'triggered'
        }
      }
    } catch (error) {
      logger.error('Slack event check error:', error)
    }
  }

  /**
   * Register test webhook
   */
  private async registerTestWebhook(listener: TriggerListener): Promise<void> {
    // Store webhook registration in database for test mode
    await this.supabase
      .from('test_webhooks')
      .insert({
        workflow_id: listener.workflowId,
        trigger_node_id: listener.triggerNodeId,
        webhook_url: listener.webhookUrl,
        user_id: listener.userId,
        expires_at: new Date(Date.now() + 3600000).toISOString() // 1 hour expiry
      })
  }

  /**
   * Check generic trigger conditions
   */
  private async checkTriggerConditions(listener: TriggerListener): Promise<boolean> {
    // Generic condition checking - can be extended per trigger type
    return false
  }

  /**
   * Clean up trigger listener
   */
  private async cleanupTriggerListener(listener: TriggerListener): Promise<void> {
    // Clear polling intervals
    if (listener.pollInterval) {
      clearInterval(listener.pollInterval)
    }

    // Close event streams
    if (listener.eventListener) {
      // Close SSE/WebSocket connections
      await fetch('/api/integrations/close-listener', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listenerId: listener.eventListener })
      })
    }

    // Clean up test webhooks
    if (listener.webhookUrl) {
      await this.supabase
        .from('test_webhooks')
        .delete()
        .eq('webhook_url', listener.webhookUrl)
    }
  }

  /**
   * Trigger a workflow event
   */
  private triggerEvent(event: TriggerEvent): void {
    this.eventQueue.push(event)

    if (this.onTriggerCallback) {
      this.onTriggerCallback(event)
    }

    logger.debug(`⚡ Trigger fired: ${event.eventType}`, event.data)
  }

  /**
   * Notify status change
   */
  private notifyStatusChange(nodeId: string, status: ListenerStatus): void {
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(nodeId, status)
    }
  }

  /**
   * Set callbacks for trigger events
   */
  setCallbacks(
    onTrigger: (event: TriggerEvent) => void,
    onStatusChange: (nodeId: string, status: ListenerStatus) => void
  ): void {
    this.onTriggerCallback = onTrigger
    this.onStatusChangeCallback = onStatusChange
  }

  /**
   * Get listener status
   */
  getListenerStatus(workflowId: string, nodeId: string): ListenerStatus {
    const listenerId = `${workflowId}-${nodeId}`
    const listener = this.listeners.get(listenerId)
    return listener?.status || 'idle'
  }

  /**
   * Get all active listeners
   */
  getActiveListeners(): TriggerListener[] {
    return Array.from(this.listeners.values())
  }

  /**
   * Manually trigger an event (for manual trigger nodes)
   */
  manualTrigger(triggerNodeId: string, data: any = {}): void {
    this.triggerEvent({
      triggerNodeId,
      eventType: 'manual',
      data,
      timestamp: Date.now(),
      source: 'manual'
    })
  }
}

// Export singleton instance
export const triggerListeningManager = new TriggerListeningManager()