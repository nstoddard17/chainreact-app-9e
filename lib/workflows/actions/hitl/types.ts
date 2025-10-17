/**
 * Type definitions for Human-in-the-Loop feature
 */

export interface HITLConfig {
  channel: 'discord' | 'slack' | 'sms'
  discordGuildId?: string
  discordChannelId?: string
  initialMessage: string
  contextData?: string
  systemPrompt?: string
  extractVariables?: Record<string, string>
  timeout?: number
  timeoutAction?: 'cancel' | 'proceed'
  continuationSignals?: string[]
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
