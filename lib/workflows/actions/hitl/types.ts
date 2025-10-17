/**
 * Type definitions for Human-in-the-Loop feature
 */

export interface HITLConfig {
  channel: 'discord' | 'slack' | 'sms'
  discordGuildId?: string
  discordChannelId?: string

  // Auto-context detection (new)
  autoDetectContext?: boolean
  customMessage?: string

  // Manual mode (legacy)
  initialMessage?: string
  contextData?: string

  // AI configuration
  systemPrompt?: string
  extractVariables?: Record<string, string>

  // Timeout configuration
  timeout?: number
  timeoutAction?: 'cancel' | 'proceed'
  continuationSignals?: string[]

  // Memory & learning (new)
  enableMemory?: boolean
  knowledgeBaseDocuments?: any[]
  memoryStorageDocument?: any
  memoryCategories?: string[]
  cacheInDatabase?: boolean
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: string
}

export interface ConversationState {
  id: string
  executionId: string
  nodeId: string
  channelType: string
  channelId: string
  userId: string
  externalUserId?: string
  conversationHistory: ConversationMessage[]
  extractedVariables?: Record<string, any>
  status: 'active' | 'completed' | 'timeout' | 'cancelled'
  startedAt: string
  completedAt?: string
  timeoutAt: string
}

export interface ExtractedVariables {
  [key: string]: any
}

export interface ContinuationDetectionResult {
  shouldContinue: boolean
  extractedVariables: ExtractedVariables
  summary: string
}
