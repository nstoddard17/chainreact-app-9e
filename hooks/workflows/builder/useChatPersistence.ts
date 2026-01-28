/**
 * useChatPersistence
 *
 * Manages chat message persistence for the workflow builder.
 * Handles loading chat history, queuing messages before workflow is saved,
 * and flushing pending messages once persistence is enabled.
 *
 * Extended to support LLM planner features:
 * - Reasoning steps metadata
 * - Plan version tracking
 * - Workflow snapshots for refinement context
 * - Partial configuration metadata
 *
 * Extracted from WorkflowBuilderV2.tsx to reduce complexity.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChatService, type ChatMessage } from '@/lib/workflows/ai-agent/chat-service'
import type { ReasoningStep, NodeConfiguration } from '@/src/lib/workflows/builder/agent/types'

/**
 * Extended metadata for chat messages with LLM planner support
 */
export interface ChatMessageMeta {
  /** Reasoning steps from LLM planner */
  reasoningSteps?: ReasoningStep[]
  /** Plan version for refinement tracking */
  planVersion?: number
  /** JSON serialized workflow state for context */
  workflowSnapshot?: string
  /** Partial configuration metadata per node */
  partialConfigs?: Record<string, NodeConfiguration>
  /** Whether this message is a refinement */
  isRefinement?: boolean
  /** Type of refinement if applicable */
  refinementType?: string
  /** Planning method used */
  planningMethod?: 'llm' | 'pattern'
  /** Original prompt for reference */
  originalPrompt?: string
  /** Any other metadata */
  [key: string]: any
}

type PendingChatMessage = {
  localId: string
  role: ChatMessage['role']
  text: string
  subtext?: string
  meta?: ChatMessageMeta
  createdAt?: string
  ephemeral?: boolean  // Mark messages that should NOT be persisted (UI state only)
}

interface UseChatPersistenceOptions {
  flowId: string
  flowState: {
    flow: any
    revisionId?: string
    revisionCount?: number
  } | null | undefined
  authInitialized: boolean
  hasUnsavedChanges: boolean | undefined
  agentMessages: ChatMessage[]
  setAgentMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>
}

interface UseChatPersistenceReturn {
  // State
  chatPersistenceEnabled: boolean
  isChatLoading: boolean
  chatHistoryLoaded: boolean

  // Functions
  generateLocalId: () => string
  replaceMessageByLocalId: (localId: string, saved: ChatMessage) => void
  enqueuePendingMessage: (message: PendingChatMessage) => void
  persistOrQueueStatus: (text: string, subtext?: string) => Promise<void>
  /** Get the current plan version from conversation history */
  getCurrentPlanVersion: () => number
  /** Create a workflow snapshot for refinement context */
  createWorkflowSnapshot: (flow: any) => string
}

export function useChatPersistence({
  flowId,
  flowState,
  authInitialized,
  hasUnsavedChanges,
  agentMessages,
  setAgentMessages,
}: UseChatPersistenceOptions): UseChatPersistenceReturn {
  // State
  const [chatPersistenceEnabled, setChatPersistenceEnabled] = useState(false)
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false)

  // Debug: Log when chatHistoryLoaded changes (helps diagnose stuck URL Prompt Handler)
  useEffect(() => {
    console.log('[ChatPersistence] chatHistoryLoaded changed to:', chatHistoryLoaded, {
      flowId,
      timestamp: new Date().toISOString(),
    })
  }, [chatHistoryLoaded, flowId])

  // Refs
  const pendingChatMessagesRef = useRef<PendingChatMessage[]>([])
  const initialRevisionCountRef = useRef<number | null>(null)
  const lastHasUnsavedChangesRef = useRef<boolean | null>(null)

  // Generate unique local ID for messages
  const generateLocalId = useCallback(() => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `local-${crypto.randomUUID()}`
    }
    return `local-${Date.now()}-${Math.random()}`
  }, [])

  // Replace a message by its local ID with a saved message from the database
  const replaceMessageByLocalId = useCallback(
    (localId: string, saved: ChatMessage) => {
      console.log('🔄 [Chat Debug] replaceMessageByLocalId called')
      console.log('  Replacing local ID:', localId)
      console.log('  With DB message:', {
        id: saved.id,
        role: saved.role,
        text: saved.text?.substring(0, 50),
      })
      setAgentMessages((prev) => {
        const replaced = prev.map((message) => (message.id === localId ? saved : message))
        const foundMatch = prev.some((m) => m.id === localId)
        console.log(
          '  Found match:',
          foundMatch,
          '| Messages before:',
          prev.length,
          '| After:',
          replaced.length
        )
        return replaced
      })
    },
    [setAgentMessages]
  )

  // Queue a message for later persistence
  const enqueuePendingMessage = useCallback((message: PendingChatMessage) => {
    console.log('📥 [Chat Debug] Enqueueing message:', {
      role: message.role,
      text: message.text?.substring(0, 50),
      localId: message.localId?.substring(0, 15),
      ephemeral: message.ephemeral,
      queueLength: pendingChatMessagesRef.current.length + 1
    })
    pendingChatMessagesRef.current.push(message)
  }, [])

  // Add a status message to the UI (always ephemeral - never persisted to database)
  // Status messages like "Building workflow...", "Flow ready ✅" are UI state only
  const persistOrQueueStatus = useCallback(
    async (text: string, subtext?: string) => {
      // Status messages are ephemeral - they're UI state that should always be shown
      // during the session but never saved to the database
      enqueuePendingMessage({
        localId: generateLocalId(),
        role: 'status',
        text,
        subtext,
        createdAt: new Date().toISOString(),
        ephemeral: true,  // UI state only - should NOT be persisted
      })
    },
    [enqueuePendingMessage, generateLocalId]
  )

  // Track whether persistence was ever enabled to determine cleanup behavior
  const wasEverPersistenceEnabledRef = useRef(false)
  useEffect(() => {
    if (chatPersistenceEnabled) {
      wasEverPersistenceEnabledRef.current = true
    }
  }, [chatPersistenceEnabled])

  // Cleanup: Clear pending messages ONLY on actual component unmount if workflow was never saved
  // IMPORTANT: We must use empty deps [] to only run on true unmount, NOT on state changes.
  // Otherwise, when chatPersistenceEnabled changes from false to true, the cleanup runs
  // with the OLD closure value (false), clearing messages before they can be flushed.
  useEffect(() => {
    return () => {
      // Only clear if persistence was NEVER enabled (workflow never saved)
      if (!wasEverPersistenceEnabledRef.current && pendingChatMessagesRef.current.length > 0) {
        console.log('🧹 [Chat Debug] Clearing pending messages on unmount (workflow never saved)')
        pendingChatMessagesRef.current = []
      }
    }
  }, []) // Empty deps - only run on true unmount

  // Load chat history on mount (only for saved workflows with auth ready)
  useEffect(() => {
    console.log('📌 [Chat Debug] useEffect triggered - loadChatHistory dependency changed')
    console.log('  Dependencies:', {
      flowId,
      hasFlow: !!flowState?.flow,
      revisionId: flowState?.revisionId,
      authInitialized,
    })

    if (!flowId || !flowState?.flow || !authInitialized) {
      console.log('  → Skipping loadChatHistory (dependencies not ready)', {
        hasFlowId: !!flowId,
        hasFlow: !!flowState?.flow,
        flowStateExists: !!flowState,
        revisionId: flowState?.revisionId,
        authInitialized,
      })
      // IMPORTANT: For new workflows coming from AI agent page, we need to mark
      // chatHistoryLoaded as true even if flowState.flow isn't ready yet.
      // Otherwise the URL Prompt Handler waits forever.
      // If flowState exists but has no revisionId, this is a new workflow - safe to proceed
      // If flowState doesn't exist yet, we can't determine this, so we wait
      if (flowId && authInitialized && flowState && !flowState.revisionId) {
        console.log('  → New workflow (flowState exists but no revisionId), marking chat history as loaded to unblock URL Prompt Handler')
        setChatHistoryLoaded(true)
      }
      return
    }

    // For new workflows (no revisionId), there's no chat history to load
    // Mark as loaded immediately so URL Prompt Handler can proceed
    if (!flowState?.revisionId) {
      console.log('  → New workflow (no revisionId), marking chat history as loaded')
      setChatHistoryLoaded(true)
      return
    }

    console.log('  → Dependencies ready, loading chat history...')
    const loadChatHistory = async () => {
      setIsChatLoading(true)
      try {
        const messages = await ChatService.getHistory(flowId)
        console.log('🔍 [Chat Debug] loadChatHistory called')
        console.log('  Loaded from DB:', messages.length, 'messages')

        // Log any dropdown messages to debug persistence
        const dropdownMsgs = messages.filter((m: any) => m.meta?.providerDropdown)
        if (dropdownMsgs.length > 0) {
          console.log('  📦 Dropdown messages in DB:', dropdownMsgs.map((m: any) => ({
            id: m.id,
            metaKeys: Object.keys(m.meta || {}),
            hasPendingPrompt: !!m.meta?.pendingPrompt,
            pendingPrompt: m.meta?.pendingPrompt?.substring(0, 50),
          })))
        }

        setAgentMessages((prev) => {
          if (!messages || messages.length === 0) {
            console.log('  → No new messages, keeping current state')
            return prev
          }

          if (prev.length === 0) {
            console.log('  → Empty state, replacing with DB messages')
            return messages
          }

          console.log('  → Merging messages...')
          const merged = [...prev]
          const indexById = new Map<string, number>()
          const seenContent = new Map<string, number>()

          merged.forEach((message, index) => {
            if (message?.id) {
              indexById.set(message.id, index)
            }
            if (message?.text && message?.role) {
              const contentKey = `${message.role}:${message.text}:${message.createdAt || ''}`
              seenContent.set(contentKey, index)
            }
          })

          messages.forEach((message) => {
            if (!message) return

            if (message.id && indexById.has(message.id)) {
              const existingIndex = indexById.get(message.id)!
              merged[existingIndex] = message
              return
            }

            const contentKey = `${message.role}:${message.text}:${message.createdAt || ''}`
            if (seenContent.has(contentKey)) {
              const existingIndex = seenContent.get(contentKey)!
              merged[existingIndex] = message
              return
            }

            merged.push(message)
          })

          console.log('  Final merged state:', merged.length, 'messages')
          return merged
        })
      } catch (error) {
        console.error('Failed to load chat history:', error)
      } finally {
        setIsChatLoading(false)
        // Mark chat history as loaded AFTER setAgentMessages has been called
        // This ensures the URL Prompt Handler waits for messages to be in state
        setChatHistoryLoaded(true)
      }
    }

    loadChatHistory()
  }, [flowId, flowState?.flow, flowState?.revisionId, authInitialized, setAgentMessages])

  // Determine when chat persistence should be enabled
  // NOTE: Removed agentMessages.length from deps - it was causing unnecessary re-runs.
  // This effect only needs to check flowState changes to detect when workflow is saved.
  useEffect(() => {
    if (!flowState) return

    const revisionCount = flowState.revisionCount ?? 0
    if (initialRevisionCountRef.current === null) {
      initialRevisionCountRef.current = revisionCount
    }

    if (!chatPersistenceEnabled) {
      const workflowHasBeenSaved = Boolean(flowState.revisionId)

      if (workflowHasBeenSaved) {
        console.log('✅ [Chat Debug] Enabling chat persistence (workflow has been saved)')
        setChatPersistenceEnabled(true)
        return
      } else {
        console.log('⏸️  [Chat Debug] Chat persistence disabled (workflow not yet saved)')
      }
    }

    if (
      !chatPersistenceEnabled &&
      initialRevisionCountRef.current !== null &&
      revisionCount > initialRevisionCountRef.current
    ) {
      setChatPersistenceEnabled(true)
    }
  }, [flowState, chatPersistenceEnabled])

  // Enable persistence once a manual save clears unsaved changes
  useEffect(() => {
    if (typeof hasUnsavedChanges !== 'boolean') return

    if (lastHasUnsavedChangesRef.current === null) {
      lastHasUnsavedChangesRef.current = hasUnsavedChanges
      return
    }

    if (!chatPersistenceEnabled && lastHasUnsavedChangesRef.current && !hasUnsavedChanges) {
      setChatPersistenceEnabled(true)
    }

    lastHasUnsavedChangesRef.current = hasUnsavedChanges
  }, [hasUnsavedChanges, chatPersistenceEnabled])

  // Flush pending messages to database (only for saved workflows with auth ready)
  useEffect(() => {
    // Debug: Log all conditions to understand when flush runs
    console.log('🔍 [Flush Effect] Checking conditions:', {
      chatPersistenceEnabled,
      hasFlow: !!flowState?.flow,
      revisionId: flowState?.revisionId?.substring(0, 8),
      authInitialized,
      pendingCount: pendingChatMessagesRef.current.length,
      pendingMessages: pendingChatMessagesRef.current.map(m => ({
        role: m.role,
        text: m.text?.substring(0, 30),
        localId: m.localId?.substring(0, 10),
        ephemeral: m.ephemeral
      }))
    })

    if (
      !chatPersistenceEnabled ||
      !flowState?.flow ||
      !flowState?.revisionId ||
      !authInitialized ||
      pendingChatMessagesRef.current.length === 0
    ) {
      console.log('🔍 [Flush Effect] Skipping - conditions not met')
      return
    }

    let cancelled = false

    const flushPendingMessages = async () => {
      const pending = [...pendingChatMessagesRef.current]
      pendingChatMessagesRef.current = []

      console.log('🚀 [Chat Debug] Flushing pending messages:', pending.length, pending.map(m => ({ role: m.role, text: m.text?.substring(0, 30) })))

      for (const item of pending) {
        if (cancelled) return

        // Skip ephemeral messages - they are UI state only (e.g., provider dropdowns)
        if (item.ephemeral) {
          console.log('  ⏭️  Skipping ephemeral message (UI state only):', item.role)
          continue
        }

        // Skip messages with empty text - these should never be persisted
        if (!item.text?.trim()) {
          console.log('  ⏭️  Skipping message with empty text:', item.role)
          continue
        }

        // Check if message already has a database ID (was already saved)
        // Only skip if there's a matching message with a REAL database ID (not local-)
        const existingWithDbId = agentMessages.find(
          (msg) => msg.id === item.localId ||
            (msg.role === item.role && msg.text === item.text && msg.id && !msg.id.startsWith('local-'))
        )

        if (existingWithDbId && existingWithDbId.id && !existingWithDbId.id.startsWith('local-')) {
          console.log('  ⏭️  Skipping pending message (already saved to DB):', {
            role: item.role,
            text: item.text.substring(0, 50),
            dbId: existingWithDbId.id,
          })
          continue
        }

        console.log('  💾 Saving pending message:', {
          role: item.role,
          text: item.text.substring(0, 50),
        })

        try {
          let saved: ChatMessage | null = null
          if (item.role === 'user') {
            saved = await ChatService.addUserPrompt(flowId, item.text)
          } else if (item.role === 'assistant') {
            saved = await ChatService.addAssistantResponse(flowId, item.text, item.meta)
          } else if (item.role === 'status') {
            const statusId = await ChatService.addOrUpdateStatus(flowId, item.text, item.subtext)
            if (statusId) {
              saved = {
                id: statusId,
                flowId,
                role: 'status',
                text: item.text,
                subtext: item.subtext,
                meta: item.meta,
                createdAt: item.createdAt || new Date().toISOString(),
              }
            }
          }

          if (saved) {
            replaceMessageByLocalId(item.localId, saved)
          }
        } catch (error) {
          console.error('Failed to persist pending chat message:', error)
        }
      }
    }

    flushPendingMessages()

    return () => {
      cancelled = true
    }
  }, [
    chatPersistenceEnabled,
    flowId,
    flowState?.flow,
    flowState?.revisionId,
    authInitialized,
    agentMessages,
    replaceMessageByLocalId,
  ])

  // Get the current plan version from conversation history
  const getCurrentPlanVersion = useCallback((): number => {
    // Find the most recent message with a plan version
    const messagesWithVersion = agentMessages
      .filter(m => m.meta?.planVersion !== undefined)
      .sort((a, b) => {
        const aTime = new Date(a.createdAt || 0).getTime()
        const bTime = new Date(b.createdAt || 0).getTime()
        return bTime - aTime // Sort descending (most recent first)
      })

    return messagesWithVersion[0]?.meta?.planVersion ?? 0
  }, [agentMessages])

  // Create a workflow snapshot for refinement context
  const createWorkflowSnapshot = useCallback((flow: any): string => {
    if (!flow) return ''
    try {
      // Create a minimal snapshot with just node types and connections
      const snapshot = {
        nodes: flow.nodes?.map((n: any) => ({
          id: n.id,
          type: n.type,
          label: n.label,
        })) || [],
        edges: flow.edges?.map((e: any) => ({
          from: e.from?.nodeId,
          to: e.to?.nodeId,
        })) || [],
      }
      return JSON.stringify(snapshot)
    } catch {
      return ''
    }
  }, [])

  return {
    chatPersistenceEnabled,
    isChatLoading,
    chatHistoryLoaded,
    generateLocalId,
    replaceMessageByLocalId,
    enqueuePendingMessage,
    persistOrQueueStatus,
    getCurrentPlanVersion,
    createWorkflowSnapshot,
  }
}
