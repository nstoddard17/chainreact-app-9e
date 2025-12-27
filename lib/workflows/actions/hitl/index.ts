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
import { generateInitialAssistantOpening, detectScenario, type ScenarioDescriptor } from './conversation'
import { generateContextAwareMessage } from './enhancedConversation'
import { buildNodeContext } from './nodeContext'
import { getDownstreamRequiredVariables, formatVariablesForPrompt, type DownstreamVariable } from './downstreamVariables'

/**
 * Create service role client for HITL database operations
 * HITL needs service role to bypass RLS when creating conversation records
 */
function getServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
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

function truncate(text: string, maxLength: number = 280): string {
  if (!text) return ''
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}…`
}

function extractEmailPayload(input: Record<string, any>): any {
  return input.email || input.message?.email || null
}

function extractChatPayload(input: Record<string, any>): any {
  const payload = input.message || input.chat || input.slack || input.discord || input.text || null
  if (payload && typeof payload === 'string') {
    return { content: payload }
  }
  return payload
}

function inferNameFromEmailAddress(address?: string): string {
  if (!address) return 'there'
  const match = address.match(/"?([^"<]+)"?\s*(<|$)/)
  if (match && match[1]) {
    return match[1].trim()
  }
  const beforeAt = address.split('@')[0]
  return beforeAt.replace(/[._]/g, ' ') || 'there'
}

function buildEmailDraft(input: Record<string, any>): { opening: string; contextSection: string } {
  const email = extractEmailPayload(input) || {}
  const subject = email.subject || 'this email'
  const from = email.from || 'the sender'
  const preview = truncate(email.body?.replace(/\s+/g, ' ').trim() || 'No email body supplied.', 360)
  const senderName = inferNameFromEmailAddress(from)
  const recipient = Array.isArray(email.to) ? email.to.join(', ') : (email.to || 'your intended recipient')

  const draft = [
    `**📬 Draft Reply Ready to Review**`,
    '',
    `> Subject: ${subject}`,
    `> From: ${from}`,
    `> To: ${recipient}`,
    '',
    `Hi ${senderName},`,
    '',
    `Thanks for reaching out about **${subject}**. I’ve reviewed your message and plan to respond with the following:`,
    '',
    `> ${preview}`,
    '',
    `If this looks good, I’ll send it and move on to the next workflow step.`,
    '',
    `**Questions for you**`,
    `- Do we want to add any additional context before sending?`,
    `- Should I adjust the tone or provide more details?`,
    '',
    `Let me know how you’d like to proceed.`
  ].join('\n')

  const contextLines: string[] = []
  if (email.subject) contextLines.push(`- **Subject:** ${email.subject}`)
  if (email.from) contextLines.push(`- **From:** ${email.from}`)
  if (email.to) contextLines.push(`- **To:** ${Array.isArray(email.to) ? email.to.join(', ') : email.to}`)
  if (email.timestamp) contextLines.push(`- **Received:** ${new Date(email.timestamp).toLocaleString()}`)
  if (email.labels) contextLines.push(`- **Labels:** ${Array.isArray(email.labels) ? email.labels.join(', ') : email.labels}`)
  if (email.body) {
    contextLines.push('')
    contextLines.push(`**Message Excerpt**`)
    contextLines.push(`> ${truncate(email.body, 420)}`)
  }

  const contextSection = contextLines.length > 0
    ? `**Email Snapshot**\n${contextLines.join('\n')}`
    : ''

  return { opening: draft, contextSection }
}

function buildChatDraft(input: Record<string, any>): { opening: string; contextSection: string } {
  const chat = extractChatPayload(input) || {}
  const channel = chat.channel || chat.channelName || 'the selected channel'
  const author = chat.author || chat.from || 'the requester'
  const messageContent = truncate(chat.content || chat.body || chat.text || 'No message text supplied.', 280)

  const draft = [
    `**💬 Proposed Chat Reply for ${channel}**`,
    '',
    `> Latest message from ${author}:`,
    `> ${messageContent}`,
    '',
    `Here's the response I'm planning to post:`,
    '',
    `> Thanks for the update! I’ll take care of the next steps and keep you posted. Let me know if you need anything else in the meantime.`,
    '',
    `**Next Step**`,
    `- Post the draft above to ${channel}`,
    '',
    `Let me know if you'd like any tweaks before I send it.`
  ].join('\n')

  const contextLines: string[] = []
  if (chat.thread) contextLines.push(`- **Thread:** ${chat.thread}`)
  if (chat.timestamp) contextLines.push(`- **Received:** ${new Date(chat.timestamp).toLocaleString()}`)
  if (messageContent) {
    contextLines.push('')
    contextLines.push(`**Message Excerpt**`)
    contextLines.push(`> ${messageContent}`)
  }

  const contextSection = contextLines.length > 0
    ? `**Conversation Snapshot**\n${contextLines.join('\n')}`
    : ''

  return { opening: draft, contextSection }
}

function buildGeneralDraft(contextText: string): { opening: string; contextSection: string } {
  const condensed = truncate(
    contextText.replace(/\*\*/g, '').replace(/\n{2,}/g, '\n').trim(),
    400
  )

  const draft = [
    `**📝 Proposed Next Actions**`,
    '',
    `I'm ready to execute the upcoming workflow step. Here's the plan:`,
    `- Apply the configured action using the latest data.`,
    `- Double-check for any edge cases noted below.`,
    '',
    `**Before I continue:**`,
    `- Does this direction look correct?`,
    `- Should I adjust anything or capture extra details?`,
    '',
    `Let me know and I can tweak the plan or proceed.`
  ].join('\n')

  const contextSection = condensed
    ? `**Workflow Data Snapshot**\n> ${condensed}`
    : ''

  return { opening: draft, contextSection }
}

function buildFallbackOpening(
  scenario: ScenarioDescriptor,
  input: Record<string, any>,
  contextText: string
): { opening: string; contextSection: string } {
  switch (scenario.type) {
    case 'email':
      return buildEmailDraft(input)
    case 'chat':
      return buildChatDraft(input)
    default:
      return buildGeneralDraft(contextText)
  }
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
 * Build AI system prompt with memory, knowledge base, node context, and downstream variable requirements
 */
function buildSystemPrompt(
  config: HITLConfig,
  aiMemory: any,
  knowledgeBase: string[],
  nodeContext?: string,
  downstreamVariables?: DownstreamVariable[]
): string {
  let prompt = config.systemPrompt ||
    "You are a helpful workflow assistant. Help the user review and refine this workflow step. Answer questions about the data and accept modifications. When the user is satisfied, detect continuation signals like 'continue', 'proceed', 'go ahead', or 'send it'."

  // Add node context (available nodes and current workflow structure)
  if (nodeContext) {
    prompt += '\n\n' + nodeContext
  }

  // Add downstream variable extraction requirements
  // This tells the AI exactly what variables to extract based on the next workflow step
  if (downstreamVariables && downstreamVariables.length > 0) {
    prompt += '\n\n' + formatVariablesForPrompt(downstreamVariables)
  }

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

    // 4. Load node context (available nodes catalog + current workflow structure)
    let nodeContext: string | undefined
    try {
      nodeContext = await buildNodeContext(context?.workflowId)
      logger.debug('[HITL] Loaded node context for AI', {
        workflowId: context?.workflowId,
        contextLength: nodeContext?.length
      })
    } catch (error) {
      logger.warn('[HITL] Could not load node context', { error })
    }

    // 5. Detect downstream nodes and their required variables
    // This tells the AI exactly what variables to extract based on the next workflow step
    let downstreamVariables: DownstreamVariable[] = []
    try {
      // Load workflow to get nodes and edges
      const { data: workflow, error: workflowError } = await supabase
        .from('workflows')
        .select('nodes, edges, connections')
        .eq('id', context.workflowId)
        .single()

      if (!workflowError && workflow) {
        const nodes = workflow.nodes || []
        const edges = workflow.edges || workflow.connections || []

        downstreamVariables = getDownstreamRequiredVariables(
          context.nodeId,
          nodes,
          edges
        )

        logger.info('[HITL] Detected downstream variables', {
          nodeId: context.nodeId,
          variableCount: downstreamVariables.length,
          variables: downstreamVariables.map(v => v.name)
        })
      }
    } catch (error) {
      logger.warn('[HITL] Could not detect downstream variables', { error })
    }

    // 6. Build system prompt with memory, knowledge, node context, and downstream variables
    const enhancedSystemPrompt = buildSystemPrompt(config, aiMemory, knowledgeBase, nodeContext, downstreamVariables)

    // 6. Generate AI drafted opening message (if possible)
    let scenario: ScenarioDescriptor = detectScenario(input)
    let aiDraftedOpening: string | null = null
    let contextSection = ''

    if (config.autoDetectContext) {
      const openingResult = await generateInitialAssistantOpening(
        enhancedSystemPrompt,
        contextText,
        input,
        config
      )
      aiDraftedOpening = openingResult.message
      scenario = openingResult.scenario
    }

    const fallback = buildFallbackOpening(scenario, input, contextText)
    contextSection = fallback.contextSection

    // 6. Build initial message using enhanced conversation system
    let resolvedInitialMessage = ''
    if (config.autoDetectContext) {
      // Use enhanced AI-powered message generation
      try {
        resolvedInitialMessage = await generateContextAwareMessage(input, config)
      } catch (error: any) {
        logger.warn('Failed to generate enhanced message, using fallback', { error: error.message })
        // Fallback to original logic
        if (config.customMessage) {
          const resolvedCustom = await resolveValue(config.customMessage, input, userId, context)
          const base = aiDraftedOpening || resolvedCustom
          const contextBlock = contextSection || `**Data from previous step:**\n${contextText}`
          resolvedInitialMessage = `${base}\n\n---\n\n${contextBlock}`
        } else {
          const header = aiDraftedOpening || fallback.opening
          const contextBlock = contextSection || `**Data from the previous step:**\n${contextText}`
          resolvedInitialMessage = `${header}\n\n---\n\n${contextBlock}\n\nLet me know what you think!`
        }
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

    // Parse extracted variables config (it might be a JSON string, array, or object)
    let extractVariables: Record<string, string> | string[] | undefined = config.extractVariables
    if (typeof extractVariables === 'string') {
      try {
        extractVariables = JSON.parse(extractVariables)
      } catch (e) {
        logger.warn('Failed to parse extractVariables, using default')
        extractVariables = ['decision', 'notes']  // New array format
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

    // DEBUG: Log the created conversation details
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('✅ [HITL] Conversation created successfully!')
    console.log(`   ID: ${conversation.id}`)
    console.log(`   Channel ID: ${conversation.channel_id}`)
    console.log(`   Status: ${conversation.status}`)
    console.log(`   Execution ID: ${conversation.execution_id}`)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

    // Update workflow execution to paused state using service role client
    // IMPORTANT: Store testMode so it's preserved when resuming
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
          testMode: context.testMode || false, // Store test/sandbox mode
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
