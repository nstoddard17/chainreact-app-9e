/**
 * AI Agent Flow Builder Hook
 * Integrates chat persistence, build choreography, guided setup, and cost tracking
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { useReactFlow } from '@xyflow/react'
import { ChatService, ChatMessage } from '@/lib/workflows/ai-agent/chat-service'
import { BuildChoreographer, ChoreographyStage } from '@/lib/workflows/ai-agent/build-choreography'
import { CostTracker, estimateWorkflowCost } from '@/lib/workflows/ai-agent/cost-tracker'
import { DESIGN_TOKENS } from '@/lib/workflows/ai-agent/design-tokens'
import { logger } from '@/lib/utils/logger'

export interface AgentFlowState {
  stage: ChoreographyStage
  messages: ChatMessage[]
  currentSetupNodeId: string | null
  badgeText: string
  badgeSubtext?: string
  costEstimate: number
  totalCost: number
  isBuilding: boolean
  activeNodeId: string | null
}

export interface UseAgentFlowBuilderOptions {
  flowId: string
  onBuildComplete?: () => void
  onNodeSetupComplete?: (nodeId: string) => void
  preferReducedMotion?: boolean
}

export function useAgentFlowBuilder({
  flowId,
  onBuildComplete,
  onNodeSetupComplete,
  preferReducedMotion = false
}: UseAgentFlowBuilderOptions) {
  const reactFlowInstance = useReactFlow()
  const [state, setState] = useState<AgentFlowState>({
    stage: 'idle',
    messages: [],
    currentSetupNodeId: null,
    badgeText: '',
    badgeSubtext: undefined,
    costEstimate: 0,
    totalCost: 0,
    isBuilding: false,
    activeNodeId: null
  })

  const choreographer = useRef<BuildChoreographer | null>(null)
  const costTracker = useRef<CostTracker>(new CostTracker())
  const currentStatusMessageId = useRef<string | null>(null)

  // Initialize choreographer
  useEffect(() => {
    choreographer.current = new BuildChoreographer({
      preferReducedMotion,
      onStageChange: (stage) => {
        const badgeConfig = choreographer.current?.getBadgeConfig() || { text: '', subtext: undefined }
        setState(prev => ({
          ...prev,
          stage,
          badgeText: badgeConfig.text,
          badgeSubtext: badgeConfig.subtext
        }))
      },
      onNodeFocus: (nodeId) => {
        setState(prev => ({ ...prev, activeNodeId: nodeId }))
      }
    })
  }, [preferReducedMotion])

  // Load chat history on mount
  useEffect(() => {
    const loadHistory = async () => {
      const messages = await ChatService.getHistory(flowId)
      setState(prev => {
        // Deduplicate by ID - keep existing messages that aren't in the new history
        const existingIds = new Set(messages.map(m => m.id).filter(Boolean))
        const existingMessages = prev.messages.filter(m => !m.id || !existingIds.has(m.id))

        return { ...prev, messages }
      })
    }
    loadHistory()
  }, [flowId])

  /**
   * Add user prompt to chat
   */
  const addUserPrompt = useCallback(async (prompt: string) => {
    const message = await ChatService.addUserPrompt(flowId, prompt)
    if (message) {
      setState(prev => {
        // Deduplicate - only add if message ID doesn't already exist
        const exists = prev.messages.some(m => m.id === message.id)
        if (exists) {
          return prev
        }
        return {
          ...prev,
          messages: [message, ...prev.messages]
        }
      })
    }
    return message
  }, [flowId])

  /**
   * Add assistant response (plan, etc.)
   */
  const addAssistantResponse = useCallback(async (
    text: string,
    meta?: Record<string, any>
  ) => {
    const message = await ChatService.addAssistantResponse(flowId, text, meta)
    if (message) {
      setState(prev => {
        // Deduplicate - only add if message ID doesn't already exist
        const exists = prev.messages.some(m => m.id === message.id)
        if (exists) {
          return prev
        }
        return {
          ...prev,
          messages: [message, ...prev.messages]
        }
      })
    }
    return message
  }, [flowId])

  /**
   * Update status message (in-place, no duplication)
   */
  const updateStatus = useCallback(async (
    text: string,
    subtext?: string
  ) => {
    const messageId = await ChatService.addOrUpdateStatus(
      flowId,
      text,
      subtext,
      currentStatusMessageId.current || undefined
    )

    if (messageId && !currentStatusMessageId.current) {
      currentStatusMessageId.current = messageId
    }

    // Update local state
    setState(prev => {
      const messages = [...prev.messages]
      const existingIndex = messages.findIndex(m => m.id === currentStatusMessageId.current)

      if (existingIndex >= 0) {
        messages[existingIndex] = {
          ...messages[existingIndex],
          text,
          subtext
        }
      } else if (messageId) {
        messages.unshift({
          id: messageId,
          flowId,
          role: 'status',
          text,
          subtext,
          createdAt: new Date().toISOString()
        })
      }

      return { ...prev, messages }
    })
  }, [flowId])

  /**
   * Execute build choreography
   */
  const executeBuildSequence = useCallback(async (nodes: any[], edges: any[]) => {
    if (!choreographer.current || !reactFlowInstance) return

    setState(prev => ({ ...prev, isBuilding: true }))

    // Calculate cost estimate
    const estimate = estimateWorkflowCost(nodes)
    setState(prev => ({ ...prev, costEstimate: estimate.total }))

    // Update status
    await updateStatus('Agent building flow', undefined)

    // Execute choreography
    try {
      await choreographer.current.executeBuildSequence(nodes, edges, reactFlowInstance)

      // Mark as ready
      await updateStatus('Flow ready ✅', undefined)

      setState(prev => ({ ...prev, isBuilding: false }))
      onBuildComplete?.()
    } catch (error) {
      logger.error('Build choreography failed', { error })
      setState(prev => ({ ...prev, isBuilding: false }))
    }
  }, [reactFlowInstance, updateStatus, onBuildComplete])

  /**
   * Start guided setup for a node
   */
  const startNodeSetup = useCallback((nodeId: string) => {
    setState(prev => ({
      ...prev,
      currentSetupNodeId: nodeId,
      stage: 'guided-setup'
    }))
    updateStatus('Agent building flow', 'Waiting for user action')
  }, [updateStatus])

  /**
   * Complete node setup and move to next
   */
  const completeNodeSetup = useCallback(async (
    nodeId: string,
    cost?: number,
    tokens?: { input: number; output: number; total: number }
  ) => {
    // Track cost if provided
    if (cost !== undefined && costTracker.current) {
      costTracker.current.addEntry({
        nodeId,
        nodeName: nodeId, // TODO: get actual node name
        provider: 'unknown', // TODO: get from node
        operation: 'test',
        cost,
        tokens,
        timestamp: new Date().toISOString()
      })

      const totalCost = costTracker.current.getTotalCost()
      setState(prev => ({ ...prev, totalCost }))
    }

    // Clear current setup node
    setState(prev => ({ ...prev, currentSetupNodeId: null }))

    onNodeSetupComplete?.(nodeId)
  }, [onNodeSetupComplete])

  /**
   * Skip node setup
   */
  const skipNodeSetup = useCallback((nodeId: string) => {
    setState(prev => ({ ...prev, currentSetupNodeId: null }))
    onNodeSetupComplete?.(nodeId)
  }, [onNodeSetupComplete])

  /**
   * Get cost breakdown
   */
  const getCostBreakdown = useCallback(() => {
    return costTracker.current?.getBreakdown() || []
  }, [])

  /**
   * Focus camera on specific node
   */
  const focusNode = useCallback(async (nodeId: string) => {
    const node = reactFlowInstance?.getNode(nodeId)
    if (node && choreographer.current) {
      await choreographer.current.focusNode(node, reactFlowInstance)
    }
  }, [reactFlowInstance])

  return {
    state,
    actions: {
      addUserPrompt,
      addAssistantResponse,
      updateStatus,
      executeBuildSequence,
      startNodeSetup,
      completeNodeSetup,
      skipNodeSetup,
      getCostBreakdown,
      focusNode
    }
  }
}
