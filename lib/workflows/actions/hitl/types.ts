/**
 * Type definitions for Human-in-the-Loop feature
 */

export interface HITLConfig {
  channel: 'discord' | 'slack' | 'sms'
  discordGuildId?: string
  discordChannelId?: string

  // Auto-context detection (new)
  autoDetectContext?: boolean | string  // Can be boolean (legacy) or "true"/"false" string (new dropdown)
  customMessage?: string

  // Manual mode (legacy)
  initialMessage?: string
  contextData?: string

  // AI configuration
  systemPrompt?: string
  extractVariables?: Record<string, string>

  // Timeout configuration
  timeoutPreset?: string  // Preset timeout option ("0", "15", "30", "60", "120", "240", "480", "1440", "custom")
  timeout?: number        // Custom timeout value in minutes (only used when timeoutPreset is "custom")
  timeoutAction?: 'cancel' | 'proceed'
  continuationSignals?: string[]

  // Memory & learning (new)
  enableMemory?: boolean | string  // Can be boolean (legacy) or "true"/"false" string (new)
  memoryStorageProvider?: 'chainreact' | 'google_docs' | 'notion' | 'onedrive'
  memoryDocumentId?: string  // UUID for ChainReact Memory documents
  memoryStorageDocument?: any  // For external providers (Google Docs, Notion, etc.)
  knowledgeBaseDocuments?: any[]
  knowledgeBaseProvider?: 'chainreact' | 'google_docs' | 'notion' | 'onedrive'
  knowledgeBaseDocumentIds?: string[]  // UUIDs for ChainReact KB documents
  memoryCategories?: string[]
  cacheInDatabase?: boolean | string  // Can be boolean (legacy) or "true"/"false" string (new)
}

export interface MemoryDocument {
  id: string
  userId: string
  workflowId?: string
  docType: 'memory' | 'knowledge_base'
  title: string
  description?: string
  content?: string
  structuredData?: Record<string, any>
  scope: 'user' | 'workflow' | 'global'
  createdAt: string
  updatedAt: string
  lastAccessedAt?: string
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
