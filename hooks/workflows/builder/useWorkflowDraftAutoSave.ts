/**
 * useWorkflowDraftAutoSave
 *
 * Auto-saves workflow builder state during the building process.
 * Uses localStorage for immediate persistence, allowing users to resume
 * their work if they accidentally close the browser or navigate away.
 *
 * State persisted:
 * - agentMessages: Chat messages in the AI agent panel
 * - buildMachine: Build state machine (plan, progress, state)
 * - nodeConfigs: User-configured values for each node
 * - collectedPreferences: Preferences collected during build
 * - providerSelections: Selected providers for vague terms
 * - pendingPrompt: Any prompt waiting to be processed
 * - pendingRequests: In-flight API requests that haven't completed
 *
 * Draft is cleared once the workflow is successfully saved to the database.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { safeLocalStorageSet } from '@/lib/utils/storage-cleanup'
import type { ChatMessage } from '@/lib/workflows/ai-agent/chat-service'
import type { BuildStateMachine } from '@/src/lib/workflows/builder/BuildState'
import { getInitialState } from '@/src/lib/workflows/builder/BuildState'
import { logger } from '@/lib/utils/logger'

const DRAFT_KEY_PREFIX = 'workflow-draft-'
const AUTO_SAVE_DEBOUNCE_MS = 1000 // 1 second debounce
const PENDING_REQUEST_TIMEOUT_MS = 5 * 60 * 1000 // 5 minutes - requests older than this are considered stale

/**
 * Represents an in-flight agent request that hasn't completed yet.
 * Used for recovery if the page crashes/refreshes mid-request.
 */
export interface PendingAgentRequest {
  id: string
  userMessage: string
  sentAt: string
  status: 'pending' | 'processing' | 'failed'
  // Context needed to retry
  providerId?: string
  promptId?: string
}

export interface WorkflowDraftState {
  // Chat state
  agentMessages: ChatMessage[]

  // Build state
  buildMachine: BuildStateMachine
  nodeConfigs: Record<string, Record<string, any>>

  // Provider/connection state
  collectedPreferences: Array<{
    id: string
    category: string
    provider: string
    providerName: string
    channel?: {
      providerId: string
      channelId: string
      channelName: string
    }
    nodeConfig?: {
      nodeType: string
      nodeDisplayName: string
      config: Record<string, any>
    }
  }>
  providerSelections: Record<string, string> // Map serialized as object
  pendingPrompt: string
  selectedProviderId: string | null

  // In-flight request tracking
  pendingRequests: PendingAgentRequest[]

  // Metadata
  lastUpdated: string
  workflowName?: string
}

interface UseWorkflowDraftAutoSaveOptions {
  flowId: string
  enabled?: boolean
}

interface UseWorkflowDraftAutoSaveReturn {
  // State restoration
  restoredDraft: WorkflowDraftState | null
  hasDraft: boolean
  isDraftLoaded: boolean

  // Auto-save
  saveDraft: (state: Partial<WorkflowDraftState>) => void

  // Manual controls
  clearDraft: () => void
  loadDraft: () => WorkflowDraftState | null

  // Pending request tracking
  addPendingRequest: (request: Omit<PendingAgentRequest, 'sentAt' | 'status'>) => void
  updatePendingRequest: (id: string, updates: Partial<PendingAgentRequest>) => void
  completePendingRequest: (id: string) => void
  getPendingRequests: () => PendingAgentRequest[]
  hasIncompleteRequests: boolean
}

function getDraftKey(flowId: string): string {
  return `${DRAFT_KEY_PREFIX}${flowId}`
}

export function useWorkflowDraftAutoSave({
  flowId,
  enabled = true,
}: UseWorkflowDraftAutoSaveOptions): UseWorkflowDraftAutoSaveReturn {
  const [restoredDraft, setRestoredDraft] = useState<WorkflowDraftState | null>(null)
  const [hasDraft, setHasDraft] = useState(false)
  const [isDraftLoaded, setIsDraftLoaded] = useState(false)

  // Refs for debouncing and tracking
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const currentDraftRef = useRef<Partial<WorkflowDraftState>>({})
  const lastSavedRef = useRef<string>('')

  // Load draft from localStorage
  const loadDraft = useCallback((): WorkflowDraftState | null => {
    if (!flowId || typeof window === 'undefined') return null

    try {
      const key = getDraftKey(flowId)
      const stored = window.localStorage.getItem(key)
      if (!stored) return null

      const draft = JSON.parse(stored) as WorkflowDraftState

      // Validate draft has required fields
      if (!draft.lastUpdated) return null

      // Check if draft is too old (7 days)
      const lastUpdated = new Date(draft.lastUpdated)
      const now = new Date()
      const daysDiff = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24)
      if (daysDiff > 7) {
        logger.debug('[DraftAutoSave] Draft is too old, clearing')
        window.localStorage.removeItem(key)
        return null
      }

      // Convert providerSelections back to Map-compatible format
      // (stored as object, used as Map in component)
      return draft
    } catch (error) {
      logger.error('[DraftAutoSave] Failed to load draft:', error)
      return null
    }
  }, [flowId])

  // Clear draft from localStorage
  const clearDraft = useCallback(() => {
    if (!flowId || typeof window === 'undefined') return

    try {
      const key = getDraftKey(flowId)
      window.localStorage.removeItem(key)
      setHasDraft(false)
      setRestoredDraft(null)
      currentDraftRef.current = {}
      lastSavedRef.current = ''
      logger.debug('[DraftAutoSave] Draft cleared for flow:', flowId)
    } catch (error) {
      logger.error('[DraftAutoSave] Failed to clear draft:', error)
    }
  }, [flowId])

  // Save draft to localStorage (debounced)
  const saveDraft = useCallback(
    (state: Partial<WorkflowDraftState>) => {
      if (!enabled || !flowId || typeof window === 'undefined') return

      // Merge with current draft state
      currentDraftRef.current = {
        ...currentDraftRef.current,
        ...state,
        lastUpdated: new Date().toISOString(),
      }

      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      // Debounce the save
      saveTimeoutRef.current = setTimeout(() => {
        try {
          const draftToSave = currentDraftRef.current as WorkflowDraftState

          // Don't save if nothing meaningful has changed
          const serialized = JSON.stringify(draftToSave)
          if (serialized === lastSavedRef.current) {
            return
          }

          // Don't save empty drafts
          const hasContent =
            (draftToSave.agentMessages?.length || 0) > 0 ||
            (draftToSave.buildMachine?.plan?.length || 0) > 0 ||
            Object.keys(draftToSave.nodeConfigs || {}).length > 0

          if (!hasContent) {
            return
          }

          const key = getDraftKey(flowId)
          safeLocalStorageSet(key, serialized)
          lastSavedRef.current = serialized
          setHasDraft(true)

          logger.debug('[DraftAutoSave] Draft saved for flow:', flowId, {
            messagesCount: draftToSave.agentMessages?.length || 0,
            planNodesCount: draftToSave.buildMachine?.plan?.length || 0,
            nodeConfigsCount: Object.keys(draftToSave.nodeConfigs || {}).length,
          })
        } catch (error) {
          logger.error('[DraftAutoSave] Failed to save draft:', error)
        }
      }, AUTO_SAVE_DEBOUNCE_MS)
    },
    [enabled, flowId]
  )

  // Load draft on mount
  useEffect(() => {
    if (!enabled || !flowId) {
      setIsDraftLoaded(true)
      return
    }

    const draft = loadDraft()
    if (draft) {
      setRestoredDraft(draft)
      setHasDraft(true)
      currentDraftRef.current = draft
      logger.debug('[DraftAutoSave] Draft restored for flow:', flowId)
    }
    setIsDraftLoaded(true)
  }, [enabled, flowId, loadDraft])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  // Pending request tracking state
  const [pendingRequests, setPendingRequests] = useState<PendingAgentRequest[]>([])

  // Initialize pending requests from restored draft
  useEffect(() => {
    if (restoredDraft?.pendingRequests?.length) {
      // Filter out stale requests (older than 5 minutes)
      const now = Date.now()
      const validRequests = restoredDraft.pendingRequests.filter((req) => {
        const sentAt = new Date(req.sentAt).getTime()
        return now - sentAt < PENDING_REQUEST_TIMEOUT_MS
      })
      setPendingRequests(validRequests)
    }
  }, [restoredDraft])

  // Add a new pending request (called before API call)
  const addPendingRequest = useCallback(
    (request: Omit<PendingAgentRequest, 'sentAt' | 'status'>) => {
      const newRequest: PendingAgentRequest = {
        ...request,
        sentAt: new Date().toISOString(),
        status: 'pending',
      }
      setPendingRequests((prev) => [...prev, newRequest])

      // Immediately save to draft (bypass debounce for critical state)
      const updatedRequests = [...(currentDraftRef.current.pendingRequests || []), newRequest]
      currentDraftRef.current.pendingRequests = updatedRequests
      saveDraft({ pendingRequests: updatedRequests })

      logger.debug('[DraftAutoSave] Added pending request:', request.id)
    },
    [saveDraft]
  )

  // Update a pending request status
  const updatePendingRequest = useCallback(
    (id: string, updates: Partial<PendingAgentRequest>) => {
      setPendingRequests((prev) =>
        prev.map((req) => (req.id === id ? { ...req, ...updates } : req))
      )

      // Update in draft
      const updatedRequests = (currentDraftRef.current.pendingRequests || []).map((req) =>
        req.id === id ? { ...req, ...updates } : req
      )
      currentDraftRef.current.pendingRequests = updatedRequests
      saveDraft({ pendingRequests: updatedRequests })

      logger.debug('[DraftAutoSave] Updated pending request:', id, updates)
    },
    [saveDraft]
  )

  // Complete/remove a pending request (called when response received)
  const completePendingRequest = useCallback(
    (id: string) => {
      setPendingRequests((prev) => prev.filter((req) => req.id !== id))

      // Remove from draft
      const updatedRequests = (currentDraftRef.current.pendingRequests || []).filter(
        (req) => req.id !== id
      )
      currentDraftRef.current.pendingRequests = updatedRequests
      saveDraft({ pendingRequests: updatedRequests })

      logger.debug('[DraftAutoSave] Completed pending request:', id)
    },
    [saveDraft]
  )

  // Get current pending requests
  const getPendingRequests = useCallback(() => pendingRequests, [pendingRequests])

  // Check if there are incomplete requests
  const hasIncompleteRequests = pendingRequests.length > 0

  return {
    restoredDraft,
    hasDraft,
    isDraftLoaded,
    saveDraft,
    clearDraft,
    loadDraft,
    // Pending request tracking
    addPendingRequest,
    updatePendingRequest,
    completePendingRequest,
    getPendingRequests,
    hasIncompleteRequests,
  }
}

/**
 * Helper to create initial draft state from component state
 */
export function createDraftState(options: {
  agentMessages: ChatMessage[]
  buildMachine: BuildStateMachine
  nodeConfigs: Record<string, Record<string, any>>
  collectedPreferences: WorkflowDraftState['collectedPreferences']
  providerSelections: Map<string, string>
  pendingPrompt: string
  selectedProviderId: string | null
  workflowName?: string
  pendingRequests?: PendingAgentRequest[]
}): WorkflowDraftState {
  return {
    agentMessages: options.agentMessages,
    buildMachine: options.buildMachine,
    nodeConfigs: options.nodeConfigs,
    collectedPreferences: options.collectedPreferences,
    providerSelections: Object.fromEntries(options.providerSelections),
    pendingPrompt: options.pendingPrompt,
    selectedProviderId: options.selectedProviderId,
    workflowName: options.workflowName,
    pendingRequests: options.pendingRequests || [],
    lastUpdated: new Date().toISOString(),
  }
}

/**
 * Helper to restore Map from stored object
 */
export function restoreProviderSelections(
  stored: Record<string, string> | undefined
): Map<string, string> {
  if (!stored) return new Map()
  return new Map(Object.entries(stored))
}
