/**
 * Human-in-the-Loop Action Handler
 * Pauses workflow execution for conversational human input
 * Supports auto-context detection, AI memory, and knowledge base loading
 */

import { createSupabaseServerClient } from '@/utils/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/utils/logger'
import type { ActionResult } from '../core/executeWait'
import type { HITLConfig } from './types'
import { sendDiscordHITLMessage } from './discord'
import { resolveValue } from '../core/resolveValue'

/**
 * Create service role client for HITL database operations
 * HITL needs service role to bypass RLS when creating conversation records
 */
function getServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Format previous node output into readable context
 */
function formatPreviousNodeContext(previousOutput: any): string {
  if (!previousOutput) {
    return 'No data available from previous step.'
  }

  // If it's a simple string or number, return directly
  if (typeof previousOutput === 'string' || typeof previousOutput === 'number') {
    return String(previousOutput)
  }

  // If it's an array, format each item
  if (Array.isArray(previousOutput)) {
    if (previousOutput.length === 0) {
      return 'No items from previous step.'
    }

    return previousOutput.map((item, index) => {
      if (typeof item === 'object' && item !== null) {
        return `**Item ${index + 1}:**\n${formatObject(item)}`
      }
      return `**Item ${index + 1}:** ${item}`
    }).join('\n\n')
  }

  // If it's an object, format key-value pairs
  if (typeof previousOutput === 'object' && previousOutput !== null) {
    return formatObject(previousOutput)
  }

  return String(previousOutput)
}

/**
 * Format an object into readable key-value pairs
 */
function formatObject(obj: Record<string, any>, indent = 0): string {
  const spaces = '  '.repeat(indent)

  return Object.entries(obj)
    .filter(([key, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      // Format the key nicely (convert camelCase to Title Case)
      const formattedKey = key
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, str => str.toUpperCase())
        .trim()

      // Handle different value types
      if (Array.isArray(value)) {
        if (value.length === 0) return `${spaces}**${formattedKey}:** (empty list)`
        if (value.length === 1 && typeof value[0] !== 'object') {
          return `${spaces}**${formattedKey}:** ${value[0]}`
        }
        return `${spaces}**${formattedKey}:**\n${value.map((item, idx) => {
          if (typeof item === 'object') {
            return `${spaces}  ${idx + 1}. ${formatObject(item, indent + 2)}`
          }
          return `${spaces}  ${idx + 1}. ${item}`
        }).join('\n')}`
      }

      if (typeof value === 'object' && value !== null) {
        return `${spaces}**${formattedKey}:**\n${formatObject(value, indent + 1)}`
      }

      if (typeof value === 'boolean') {
        return `${spaces}**${formattedKey}:** ${value ? 'Yes' : 'No'}`
      }

      // For strings, truncate if too long
      let displayValue = String(value)
      if (displayValue.length > 200) {
        displayValue = displayValue.substring(0, 200) + '...'
      }

      return `${spaces}**${formattedKey}:** ${displayValue}`
    })
    .join('\n')
}

/**
 * Load ChainReact Memory document
 */
async function loadChainReactMemoryDocument(documentId: string, userId: string): Promise<string | null> {
  try {
    const supabase = await createSupabaseServerClient()

    const { data: document, error } = await supabase
      .from('user_memory_documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', userId)
      .single()

    if (error || !document) {
      logger.error('[HITL] Failed to load ChainReact Memory document', { error, documentId })
      return null
    }

    // Update last accessed time
    await supabase
      .from('user_memory_documents')
      .update({ last_accessed_at: new Date().toISOString() })
      .eq('id', documentId)

    return document.content || null
  } catch (error) {
    logger.error('[HITL] Error loading ChainReact Memory document', { error, documentId })
    return null
  }
}

/**
 * Load knowledge base documents from user's cloud storage or ChainReact Memory
 */
async function loadKnowledgeBase(
  config: HITLConfig,
  userId: string
): Promise<string[]> {
  const { knowledgeBaseProvider, knowledgeBaseDocumentIds, knowledgeBaseDocuments } = config

  // Handle ChainReact Memory provider
  if (knowledgeBaseProvider === 'chainreact' && knowledgeBaseDocumentIds && knowledgeBaseDocumentIds.length > 0) {
    logger.info('[HITL] Loading knowledge base from ChainReact Memory', { count: knowledgeBaseDocumentIds.length })

    const loadedContent: string[] = []
    for (const docId of knowledgeBaseDocumentIds) {
      const content = await loadChainReactMemoryDocument(docId, userId)
      if (content) {
        loadedContent.push(content)
      }
    }

    logger.info('[HITL] Loaded knowledge base from ChainReact Memory', { documentsLoaded: loadedContent.length })
    return loadedContent
  }

  // Handle external providers (Google Docs, Notion, etc.)
  if (!knowledgeBaseDocuments || knowledgeBaseDocuments.length === 0) {
    return []
  }

  logger.info('[HITL] Loading knowledge base from external providers', { count: knowledgeBaseDocuments.length })

  const loadedContent: string[] = []

  for (const doc of knowledgeBaseDocuments) {
    try {
      // Parse document info if it's a JSON string
      const docInfo = typeof doc === 'string' ? JSON.parse(doc) : doc

      // Load document content based on provider
      const content = await loadDocumentContent(docInfo, userId)
      if (content) {
        loadedContent.push(content)
      }
    } catch (error) {
      logger.error('[HITL] Failed to load knowledge base document', { error, doc })
    }
  }

  logger.info('[HITL] Loaded knowledge base from external providers', { documentsLoaded: loadedContent.length })
  return loadedContent
}

/**
 * Load content from a specific document
 */
async function loadDocumentContent(docInfo: any, userId: string): Promise<string | null> {
  const { provider, id, url } = docInfo

  try {
    switch (provider) {
      case 'google_docs':
        // TODO: Implement Google Docs content fetching
        logger.warn('[HITL] Google Docs content loading not yet implemented')
        return null

      case 'notion':
        // TODO: Implement Notion content fetching
        logger.warn('[HITL] Notion content loading not yet implemented')
        return null

      case 'onedrive':
        // TODO: Implement OneDrive content fetching
        logger.warn('[HITL] OneDrive content loading not yet implemented')
        return null

      default:
        logger.warn('[HITL] Unknown document provider', { provider })
        return null
    }
  } catch (error) {
    logger.error('[HITL] Failed to load document content', { error, provider, id })
    return null
  }
}

/**
 * Load AI memory from user's chosen storage document or ChainReact Memory
 */
async function loadAIMemory(
  config: HITLConfig,
  userId: string,
  workflowId: string
): Promise<any> {
  const { memoryStorageProvider, memoryDocumentId, memoryStorageDocument } = config

  // Handle ChainReact Memory provider
  if (memoryStorageProvider === 'chainreact' && memoryDocumentId) {
    logger.info('[HITL] Loading AI memory from ChainReact Memory', { documentId: memoryDocumentId })

    const memoryContent = await loadChainReactMemoryDocument(memoryDocumentId, userId)

    if (!memoryContent) {
      logger.warn('[HITL] No memory content found in ChainReact document')
      return null
    }

    // Parse memory structure (expecting JSON or structured text)
    try {
      return JSON.parse(memoryContent)
    } catch {
      // If not JSON, return as plain text
      return { raw: memoryContent }
    }
  }

  // Handle external providers (Google Docs, Notion, etc.)
  if (!memoryStorageDocument) {
    logger.debug('[HITL] No external memory document configured')
    return null
  }

  try {
    // Parse document info if it's a JSON string
    const docInfo = typeof memoryStorageDocument === 'string' ? JSON.parse(memoryStorageDocument) : memoryStorageDocument

    logger.info('[HITL] Loading AI memory from external provider', { provider: docInfo.provider, id: docInfo.id })

    // Load memory content from the document
    const memoryContent = await loadDocumentContent(docInfo, userId)

    if (!memoryContent) {
      logger.warn('[HITL] No memory content found in external document')
      return null
    }

    // Parse memory structure (expecting JSON or structured text)
    try {
      return JSON.parse(memoryContent)
    } catch {
      // If not JSON, return as plain text
      return { raw: memoryContent }
    }
  } catch (error) {
    logger.error('[HITL] Failed to load AI memory from external provider', { error })
    return null
  }
}

/**
 * Build AI system prompt with memory and knowledge base
 */
function buildSystemPrompt(
  config: HITLConfig,
  aiMemory: any,
  knowledgeBase: string[]
): string {
  let prompt = config.systemPrompt ||
    "You are a helpful workflow assistant. Help the user review and refine this workflow step. Answer questions about the data and accept modifications. When the user is satisfied, detect continuation signals like 'continue', 'proceed', 'go ahead', or 'send it'."

  // Add memory context if available
  if (aiMemory) {
    prompt += '\n\n**AI Memory & Learnings:**\nBased on previous conversations, here are your learnings:\n'

    if (aiMemory.raw) {
      prompt += aiMemory.raw
    } else {
      // Format structured memory
      const categories = config.memoryCategories || []
      categories.forEach(category => {
        if (aiMemory[category]) {
          const categoryName = category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
          prompt += `\n**${categoryName}:**\n${JSON.stringify(aiMemory[category], null, 2)}\n`
        }
      })
    }
  }

  // Add knowledge base context if available
  if (knowledgeBase.length > 0) {
    prompt += '\n\n**Knowledge Base:**\nUse the following business policies and guidelines when reviewing:\n'
    knowledgeBase.forEach((content, index) => {
      prompt += `\n**Document ${index + 1}:**\n${content}\n`
    })
  }

  return prompt
}

/**
 * Execute HITL action - pause workflow and initiate conversation
 */
export async function executeHITL(
  config: HITLConfig,
  userId: string,
  input: Record<string, any>,
  context?: any
): Promise<ActionResult> {
  try {
    if (!context?.workflowId || !context?.nodeId) {
      throw new Error('Workflow ID and Node ID are required for HITL actions')
    }

    if (!context?.executionId) {
      throw new Error('Execution ID is required for HITL actions')
    }

    const supabase = await createSupabaseServerClient()

    // 1. Format context from previous node (auto-detect or manual)
    let contextText = ''
    if (config.autoDetectContext) {
      // Auto-detect: format the previous node's output nicely
      contextText = formatPreviousNodeContext(input)
      logger.debug('[HITL] Auto-detected context', { contextLength: contextText.length })
    } else {
      // Manual mode: use contextData field with variable resolution
      const resolvedContextData = config.contextData
        ? await resolveValue(config.contextData, input, userId, context)
        : JSON.stringify(input, null, 2)
      contextText = resolvedContextData
    }

    // 2. Load knowledge base documents (if memory is enabled)
    // Handle enableMemory as both boolean (legacy) and string (new dropdown)
    const isMemoryEnabled = config.enableMemory === true || config.enableMemory === 'true'

    let knowledgeBase: string[] = []
    if (isMemoryEnabled) {
      knowledgeBase = await loadKnowledgeBase(config, userId)
    }

    // 3. Load AI memory from user's document or ChainReact Memory
    let aiMemory: any = null
    if (isMemoryEnabled) {
      aiMemory = await loadAIMemory(config, userId, context?.workflowId)
    }

    // 4. Build system prompt with memory and knowledge
    const enhancedSystemPrompt = buildSystemPrompt(config, aiMemory, knowledgeBase)

    // 5. Build initial message
    let resolvedInitialMessage = ''
    if (config.autoDetectContext) {
      // Auto-format message with optional custom introduction
      if (config.customMessage) {
        const resolvedCustom = await resolveValue(config.customMessage, input, userId, context)
        resolvedInitialMessage = `${resolvedCustom}\n\n**Data from previous step:**\n${contextText}`
      } else {
        resolvedInitialMessage = `**Workflow Paused for Review**\n\nHere's the data from the previous step:\n\n${contextText}\n\nLet me know when you're ready to continue!`
      }
    } else {
      // Manual mode: use initialMessage field with variable resolution
      resolvedInitialMessage = await resolveValue(
        config.initialMessage,
        input,
        userId,
        context
      )
    }

    // Parse extracted variables config (it might be a JSON string)
    let extractVariables = config.extractVariables
    if (typeof extractVariables === 'string') {
      try {
        extractVariables = JSON.parse(extractVariables)
      } catch (e) {
        logger.warn('Failed to parse extractVariables, using default')
        extractVariables = {
          decision: "The user's final decision",
          notes: "Any additional context provided"
        }
      }
    }

    // Parse continuation signals (might be JSON string or array)
    let continuationSignals = config.continuationSignals || []
    if (typeof continuationSignals === 'string') {
      try {
        continuationSignals = JSON.parse(continuationSignals)
      } catch (e) {
        // Try splitting by comma if it's a comma-separated string
        continuationSignals = continuationSignals.split(',').map(s => s.trim())
      }
    }

    // Calculate timeout from preset or custom value
    // If timeoutPreset is "custom", use the timeout field, otherwise use timeoutPreset
    let timeoutMinutes = 60 // Default to 1 hour

    if (config.timeoutPreset === 'custom') {
      // Use custom timeout value
      timeoutMinutes = config.timeout ?? 60
    } else if (config.timeoutPreset !== undefined) {
      // Use preset value (convert string to number)
      timeoutMinutes = parseInt(config.timeoutPreset as string, 10)
    } else if (config.timeout !== undefined) {
      // Fallback to old timeout field for backward compatibility
      timeoutMinutes = config.timeout
    }

    const timeoutAt = timeoutMinutes > 0
      ? new Date(Date.now() + timeoutMinutes * 60 * 1000)
      : null  // No timeout if 0

    // Send initial message based on channel type
    let channelId = ''
    let threadId = ''

    if (config.channel === 'discord') {
      if (!config.discordGuildId || !config.discordChannelId) {
        throw new Error('Discord server and channel are required for Discord HITL')
      }

      // Generate a conversation ID for tracking
      const conversationId = `hitl_${context.executionId}_${context.nodeId}_${Date.now()}`

      const result = await sendDiscordHITLMessage(
        userId,
        config.discordGuildId,
        config.discordChannelId,
        resolvedInitialMessage,
        conversationId
      )

      if (!result.success) {
        throw new Error(`Failed to send Discord message: ${result.error}`)
      }

      channelId = result.threadId || result.channelId || ''
      threadId = result.threadId || ''
    } else {
      throw new Error(`Channel type ${config.channel} not yet supported`)
    }

    // Create conversation record in database using service role client
    // (HITL is a system operation that needs to bypass RLS)
    const serviceClient = getServiceRoleClient()
    const { data: conversation, error: conversationError} = await serviceClient
      .from('hitl_conversations')
      .insert({
        execution_id: context.executionId,
        node_id: context.nodeId,
        workflow_id: context.workflowId,
        channel_type: config.channel,
        channel_id: channelId,
        guild_id: config.channel === 'discord' ? config.discordGuildId : null,
        user_id: userId,
        conversation_history: [
          {
            role: 'assistant',
            content: resolvedInitialMessage,
            timestamp: new Date().toISOString()
          }
        ],
        status: 'active',
        timeout_at: timeoutAt ? timeoutAt.toISOString() : null,
        system_prompt: enhancedSystemPrompt,
        initial_message: resolvedInitialMessage,
        context_data: contextText,
        extract_variables: extractVariables || {},
        continuation_signals: continuationSignals || ['continue', 'proceed', 'go ahead', 'send it', 'looks good', 'approve'],
        timeout_minutes: timeoutMinutes,
        timeout_action: config.timeoutAction || 'cancel',
        started_at: new Date().toISOString(),
        knowledge_base_used: config.knowledgeBaseDocuments || [],
        memory_context_provided: aiMemory ? 'Loaded from user document' : null
      })
      .select()
      .single()

    if (conversationError) {
      logger.error('Failed to create HITL conversation', { error: conversationError })
      throw new Error(`Failed to create conversation record: ${conversationError.message}`)
    }

    // Update workflow execution to paused state using service role client
    const { error: updateError } = await serviceClient
      .from('workflow_executions')
      .update({
        status: 'paused',
        paused_node_id: context.nodeId,
        paused_at: new Date().toISOString(),
        resume_data: {
          conversation_id: conversation.id,
          hitl_config: {
            ...config,
            extractVariables,
            continuationSignals
          },
          context_data: contextText,
          system_prompt: enhancedSystemPrompt,
          has_memory: !!aiMemory,
          knowledge_base_count: knowledgeBase.length,
          channel_id: channelId,
          thread_id: threadId,
          input
        }
      })
      .eq('id', context.executionId)

    if (updateError) {
      logger.error('Failed to update execution status', { error: updateError })
      throw new Error(`Failed to pause execution: ${updateError.message}`)
    }

    logger.info('HITL conversation initiated', {
      executionId: context.executionId,
      conversationId: conversation.id,
      channelType: config.channel,
      channelId,
      timeoutAt: timeoutAt ? timeoutAt.toISOString() : 'no timeout',
      timeoutMinutes
    })

    return {
      success: true,
      output: {
        ...input,
        hitlInitiated: true,
        conversationId: conversation.id,
        channelType: config.channel,
        channelId,
        threadId,
        timeoutAt: timeoutAt ? timeoutAt.toISOString() : null,
        timeoutMinutes,
        hasTimeout: timeoutMinutes > 0,
        status: 'waiting_for_input'
      },
      message: `Workflow paused - waiting for user input via ${config.channel}${timeoutMinutes > 0 ? ` (timeout: ${timeoutMinutes} minutes)` : ' (no timeout)'}`,
      pauseExecution: true // Critical flag to pause execution
    }

  } catch (error: any) {
    logger.error('HITL execution error', { error: error.message })
    return {
      success: false,
      error: error.message,
      message: `HITL failed: ${error.message}`
    }
  }
}

// Re-export types
export type { HITLConfig, ConversationMessage, ConversationState, ExtractedVariables, ContinuationDetectionResult } from './types'
