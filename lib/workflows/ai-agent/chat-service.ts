/**
 * Chat Service - Client for agent chat persistence
 */

import { logger } from '@/lib/utils/logger'

export interface ChatMessage {
  id?: string
  flowId: string
  userId?: string
  role: 'user' | 'assistant' | 'status'
  text: string
  subtext?: string
  createdAt?: string
  meta?: Record<string, any>
}

export class ChatService {
  /**
   * Fetch chat history for a flow
   */
  static async getHistory(
    flowId: string,
    options: { limit?: number; offset?: number } = {}
  ): Promise<ChatMessage[]> {
    try {
      if (!flowId) {
        return []
      }

      const { limit = 50, offset = 0 } = options
      const response = await fetch(
        `/api/workflows/${flowId}/chat?limit=${limit}&offset=${offset}`,
        {
          credentials: 'include'
        }
      )

      if (!response.ok) {
        throw new Error(`Failed to fetch chat history: ${response.status}`)
      }

      const { messages } = await response.json()
      return messages
    } catch (error) {
      logger.error('ChatService.getHistory failed', { error, flowId })
      return []
    }
  }

  /**
   * Add a message to chat history
   */
  static async addMessage(
    flowId: string,
    message: Omit<ChatMessage, 'id' | 'flowId' | 'userId' | 'createdAt'>
  ): Promise<ChatMessage | null> {
    try {
      if (!flowId) {
        throw new Error('Missing flowId')
      }

      const response = await fetch(`/api/workflows/${flowId}/chat`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
      })

      if (!response.ok) {
        throw new Error(`Failed to add message: ${response.status}`)
      }

      const { message: savedMessage } = await response.json()
      return savedMessage
    } catch (error) {
      logger.error('ChatService.addMessage failed', { error, flowId })
      return null
    }
  }

  /**
   * Update a status message in-place (avoids duplication)
   */
  static async updateMessage(
    flowId: string,
    messageId: string,
    updates: Partial<Pick<ChatMessage, 'text' | 'subtext' | 'meta'>>
  ): Promise<ChatMessage | null> {
    try {
      const response = await fetch(`/api/workflows/${flowId}/chat`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, ...updates })
      })

      if (!response.ok) {
        throw new Error(`Failed to update message: ${response.status}`)
      }

      const { message } = await response.json()
      return message
    } catch (error) {
      logger.error('ChatService.updateMessage failed', { error, messageId })
      return null
    }
  }

  /**
   * Add user prompt
   */
  static async addUserPrompt(flowId: string, prompt: string): Promise<ChatMessage | null> {
    return this.addMessage(flowId, {
      role: 'user',
      text: prompt
    })
  }

  /**
   * Add assistant response (plan, rationale, etc.)
   */
  static async addAssistantResponse(
    flowId: string,
    text: string,
    meta?: Record<string, any>
  ): Promise<ChatMessage | null> {
    return this.addMessage(flowId, {
      role: 'assistant',
      text,
      meta
    })
  }

  /**
   * Add or update status message
   * Returns the message ID so it can be updated later
   */
  static async addOrUpdateStatus(
    flowId: string,
    text: string,
    subtext?: string,
    existingMessageId?: string
  ): Promise<string | null> {
    if (!flowId) {
      return null
    }

    if (existingMessageId) {
      const updated = await this.updateMessage(flowId, existingMessageId, {
        text,
        subtext
      })
      return updated?.id || null
    }

    const message = await this.addMessage(flowId, {
      role: 'status',
      text,
      subtext
    })
    return message?.id || null
  }
}
