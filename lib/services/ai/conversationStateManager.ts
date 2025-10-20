/**
 * Conversation State Manager
 * Tracks conversation context, pending questions, and user choices
 */

export interface ConversationContext {
  conversationId: string
  userId: string
  history: ConversationTurn[]
  pendingQuestion?: PendingQuestion
  state: Record<string, any>
  createdAt: Date
  lastUpdated: Date
}

export interface ConversationTurn {
  role: 'user' | 'assistant'
  message: string
  timestamp: Date
  metadata?: any
}

export interface PendingQuestion {
  questionId: string
  type: 'clarification' | 'choice' | 'confirmation'
  question: string
  options: QuestionOption[]
  context: Record<string, any>
  createdAt: Date
  expiresAt: Date
}

export interface QuestionOption {
  id: string
  label: string
  value: any
  description?: string
  icon?: string
}

export class ConversationStateManager {
  private contexts: Map<string, ConversationContext> = new Map()
  private readonly EXPIRY_MS = 30 * 60 * 1000 // 30 minutes

  /**
   * Get or create conversation context for a user
   */
  getContext(userId: string, conversationId?: string): ConversationContext {
    const id = conversationId || this.generateConversationId(userId)

    let context = this.contexts.get(id)

    if (!context) {
      context = {
        conversationId: id,
        userId,
        history: [],
        state: {},
        createdAt: new Date(),
        lastUpdated: new Date()
      }
      this.contexts.set(id, context)
    }

    // Clean up expired contexts
    this.cleanupExpired()

    return context
  }

  /**
   * Add a turn to conversation history
   */
  addTurn(conversationId: string, role: 'user' | 'assistant', message: string, metadata?: any): void {
    const context = this.contexts.get(conversationId)
    if (!context) return

    context.history.push({
      role,
      message,
      timestamp: new Date(),
      metadata
    })

    context.lastUpdated = new Date()
  }

  /**
   * Set a pending question that needs user response
   */
  setPendingQuestion(
    conversationId: string,
    type: PendingQuestion['type'],
    question: string,
    options: QuestionOption[],
    context: Record<string, any>
  ): string {
    const conversationContext = this.contexts.get(conversationId)
    if (!conversationContext) throw new Error('Conversation not found')

    const questionId = this.generateQuestionId()
    const now = new Date()

    conversationContext.pendingQuestion = {
      questionId,
      type,
      question,
      options,
      context,
      createdAt: now,
      expiresAt: new Date(now.getTime() + 5 * 60 * 1000) // 5 min expiry
    }

    conversationContext.lastUpdated = new Date()

    return questionId
  }

  /**
   * Get pending question for a conversation
   */
  getPendingQuestion(conversationId: string): PendingQuestion | undefined {
    const context = this.contexts.get(conversationId)
    if (!context) return undefined

    const pending = context.pendingQuestion

    // Check if expired
    if (pending && new Date() > pending.expiresAt) {
      context.pendingQuestion = undefined
      return undefined
    }

    return pending
  }

  /**
   * Clear pending question after user responds
   */
  clearPendingQuestion(conversationId: string): void {
    const context = this.contexts.get(conversationId)
    if (context) {
      context.pendingQuestion = undefined
      context.lastUpdated = new Date()
    }
  }

  /**
   * Store state data for later retrieval
   */
  setState(conversationId: string, key: string, value: any): void {
    const context = this.contexts.get(conversationId)
    if (context) {
      context.state[key] = value
      context.lastUpdated = new Date()
    }
  }

  /**
   * Get state data
   */
  getState(conversationId: string, key: string): any {
    const context = this.contexts.get(conversationId)
    return context?.state[key]
  }

  /**
   * Check if conversation is waiting for user response
   */
  isWaitingForResponse(conversationId: string): boolean {
    const pending = this.getPendingQuestion(conversationId)
    return pending !== undefined
  }

  /**
   * Get conversation history
   */
  getHistory(conversationId: string, limit?: number): ConversationTurn[] {
    const context = this.contexts.get(conversationId)
    if (!context) return []

    const history = context.history
    if (limit) {
      return history.slice(-limit)
    }
    return history
  }

  /**
   * Clear conversation and start fresh
   */
  clearContext(conversationId: string): void {
    this.contexts.delete(conversationId)
  }

  /**
   * Clean up expired conversations
   */
  private cleanupExpired(): void {
    const now = new Date()
    const expired: string[] = []

    this.contexts.forEach((context, id) => {
      const age = now.getTime() - context.lastUpdated.getTime()
      if (age > this.EXPIRY_MS) {
        expired.push(id)
      }
    })

    expired.forEach(id => this.contexts.delete(id))
  }

  /**
   * Generate unique conversation ID
   */
  private generateConversationId(userId: string): string {
    return `conv_${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Generate unique question ID
   */
  private generateQuestionId(): string {
    return `q_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }
}

// Singleton instance
export const conversationStateManager = new ConversationStateManager()
