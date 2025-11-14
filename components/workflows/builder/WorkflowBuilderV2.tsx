"use client"

/**
 * WorkflowBuilderV2
 *
 * This component provides the legacy builder UI look and feel while using
 * the Flow V2 backend infrastructure. It reuses as much visual structure
 * from NewWorkflowBuilderContent as possible while connecting to v2 APIs.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useSearchParams } from "next/navigation"
import "@xyflow/react/dist/style.css"
import "@/components/workflows/ai-agent/agent-flow.css"

import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { WorkflowLoadingScreen } from "@/components/ui/loading-screen"
import { useToast } from "@/hooks/use-toast"
import { BuilderLayout } from "./BuilderLayout"
import { useFlowV2LegacyAdapter } from "@/src/lib/workflows/builder/useFlowV2LegacyAdapter"
import {
  BuildState,
  type BuildStateMachine,
  type PlanNode,
  getInitialState,
  getBadgeForState,
} from "@/src/lib/workflows/builder/BuildState"
import { actionTestService } from "@/lib/workflows/testing/ActionTestService"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"
import type { NodeComponent } from "@/lib/workflows/nodes/types"
import { getNodeByType } from "@/lib/workflows/nodes/registry"
import { ConfigurationModal } from "@/components/workflows/configuration"
import { usePrefetchConfig } from "@/components/workflows/configuration/hooks/usePrefetchConfig"
import "./styles/FlowBuilder.anim.css"
import { Sparkles } from "lucide-react"
import { FlowV2BuilderContent } from "./FlowV2BuilderContent"
import { FlowV2AgentPanel } from "./FlowV2AgentPanel"
import { NodeStateTestPanel } from "./NodeStateTestPanel"
import { PathLabelsOverlay } from "./PathLabelsOverlay"
import { ProviderSelectionUI } from "../ai-agent/ProviderSelectionUI"
import { ProviderBadge } from "../ai-agent/ProviderBadge"
import {
  detectVagueTerms,
  getProviderOptions,
  replaceVagueTermWithProvider,
  type ProviderCategory,
} from "@/lib/workflows/ai-agent/providerDisambiguation"
import { useIntegrationStore } from "@/stores/integrationStore"
import {
  applyDagreLayout,
  needsLayout,
  fitCanvasToFlow,
  panToNode,
  setAllNodesGrey,
  setNodeActive,
  setNodeDone,
  calculateHorizontalLayout,
  calculateSafeZoom,
  setNodeState,
} from "./layout"
import { BuildChoreographer } from "@/lib/workflows/ai-agent/build-choreography"
import { ChatService, type ChatMessage } from "@/lib/workflows/ai-agent/chat-service"
import { CostTracker, estimateWorkflowCost } from "@/lib/workflows/ai-agent/cost-tracker"
import { CostDisplay } from "@/components/workflows/ai-agent/CostDisplay"
import { useAuthStore } from "@/stores/authStore"
import { useIntegrationSelection } from "@/hooks/workflows/useIntegrationSelection"
import { swapProviderInPlan, canSwapProviders } from "@/lib/workflows/ai-agent/providerSwapping"
import { matchTemplate, logTemplateMatch, logTemplateMiss } from "@/lib/workflows/ai-agent/templateMatching"
import { logPrompt, updatePrompt } from "@/lib/workflows/ai-agent/promptAnalytics"
import { logger } from '@/lib/utils/logger'

type PendingChatMessage = {
  localId: string
  role: ChatMessage['role']
  text: string
  subtext?: string
  meta?: Record<string, any>
  createdAt?: string
}

// Agent panel dimensions - Responsive to screen size
// Mobile (< 640px): 100% width - margin
// Tablet (640-1024px): 400px
// Desktop (1024-1600px): 420px (design spec)
// Large Desktop (≥ 1600px): 25% of viewport, max 600px
const AGENT_PANEL_MARGIN = 16 // Margin on each side
const AGENT_PANEL_MIN_WIDTH = 300 // Mobile minimum
const AGENT_PANEL_MAX_WIDTH = 600 // Large desktop maximum

// Kadabra-style node display name mapping
const NODE_DISPLAY_NAME_MAP: Record<string, string> = {
  // Gmail
  'gmail_trigger_new_email': 'Gmail.Trigger',
  'gmail_action_send_email': 'Gmail.SendEmail',

  // Slack
  'slack_action_send_message': 'Slack.Post',
  'slack_action_create_channel': 'Slack.CreateChannel',

  // Discord
  'discord_action_send_message': 'Discord.SendMessage',

  // AI
  'ai_agent': 'AI.Agent',
  'ai.generate': 'AI.Generate',

  // Utility
  'transformer': 'Transformer',
  'format_transformer': 'Formatter.HTMLtoMarkdown',

  // Notion
  'notion_action_create_page': 'Notion.CreatePage',
  'notion_action_update_page': 'Notion.UpdatePage',

  // Monday.com (for when nodes are added)
  'monday_action_get_board_tasks': 'Monday.GetBoardTasks',
  'monday_trigger_new_item': 'Monday.NewItem',

  // Gmail actions
  'gmail_action_send_email_to_me': 'SendEmailToMe',

  // Generic/Legacy
  'http.trigger': 'HTTP.Trigger',
  'http.request': 'HTTP.Request',
  'notify.dispatch': 'Notify.Dispatch',
  'mapper.node': 'Mapper',
  'logic.ifSwitch': 'Logic.IfSwitch',
}

function getKadabraStyleNodeName(nodeType: string, providerId?: string, title?: string): string {
  // Check explicit mapping first
  if (NODE_DISPLAY_NAME_MAP[nodeType]) {
    return NODE_DISPLAY_NAME_MAP[nodeType]
  }

  // Fallback to Provider.Action format
  if (providerId && title) {
    const provider = providerId.charAt(0).toUpperCase() + providerId.slice(1)
    const action = title.replace(/\s+/g, '')
    return `${provider}.${action}`
  }

  return title || nodeType
}

/**
 * Compute responsive agent panel width based on viewport size
 * Mobile (< 640px): Full width minus margins
 * Tablet (640-1024px): 400px
 * Desktop (1024-1600px): 420px (design spec)
 * Large Desktop (>= 1600px): 25% of viewport, max 600px
 */
function computeReactAgentPanelWidth(win?: { innerWidth: number }) {
  if (!win) {
    return AGENT_PANEL_MAX_WIDTH // Default to desktop size during SSR
  }

  const viewportWidth = win.innerWidth

  // Mobile: Use full width minus margins
  if (viewportWidth < 640) {
    const availableWidth = viewportWidth - (AGENT_PANEL_MARGIN * 2)
    return Math.max(AGENT_PANEL_MIN_WIDTH, availableWidth)
  }

  // Tablet: Fixed 400px
  if (viewportWidth < 1024) {
    return 400
  }

  // Desktop standard: 420px (design spec)
  if (viewportWidth < 1600) {
    return 420
  }

  // Large Desktop: Scale to 25% of viewport, max 600px
  const scaledWidth = Math.floor(viewportWidth * 0.25)
  return Math.min(scaledWidth, 600)
}

/**
 * Try template matching first, fallback to LLM if no match
 * Cost: $0.00 for template match, ~$0.03 for LLM fallback
 */
async function planWorkflowWithTemplates(
  actions: any,
  prompt: string,
  providerId?: string,
  userId?: string,
  workflowId?: string
): Promise<{ result: any; usedTemplate: boolean; promptId?: string }> {
  // Try template matching first (now async)
  const match = await matchTemplate(prompt, providerId)

  if (match) {
    // Template match! Create fake "result" object that looks like askAgent response
    logTemplateMatch(match.template.id, prompt)

    // Log prompt analytics
    const promptId = await logPrompt({
      userId: userId || '',
      workflowId,
      prompt,
      templateId: match.template.id,
      usedTemplate: true,
      templateSource: match.template.id.startsWith('dynamic-') ? 'dynamic' : 'built_in',
      usedLlm: false,
      llmCost: 0.0,
      detectedProvider: providerId,
      planNodes: match.plan.length,
      planGenerated: true,
    })

    // Convert template plan to edits format
    const edits = match.plan.map((node) => ({
      op: 'addNode',
      node: {
        id: node.id,
        type: node.nodeType,
        data: {
          title: node.title,
          type: node.nodeType,
          providerId: node.providerId,
        },
      },
    }))

    return {
      result: {
        workflowName: match.template.description,
        edits,
        rationale: `Created from template: ${match.template.description}`,
      },
      usedTemplate: true,
      promptId: promptId || undefined,
    }
  }

  // No template match - use LLM (costs money)
  logTemplateMiss(prompt)

  // Log prompt analytics (LLM usage)
  const promptId = await logPrompt({
    userId: userId || '',
    workflowId,
    prompt,
    usedTemplate: false,
    usedLlm: true,
    llmCost: 0.03,
    detectedProvider: providerId,
    planGenerated: false, // Will be updated after LLM responds
  })

  const result = await actions.askAgent(prompt)

  // Update prompt with plan details
  if (promptId && result.edits) {
    await updatePrompt({
      promptId,
      planBuilt: false, // Not built yet, just planned
    })

    // Analyze for clustering (async, don't wait)
    // TODO: Re-enable when analyzePromptForClustering is implemented
    // analyzePromptForClustering(promptId, prompt).catch(error => {
    //   console.warn('[PromptAnalytics] Clustering analysis failed:', error)
    // })
  }

  return {
    result,
    usedTemplate: false,
    promptId: promptId || undefined,
  }
}

interface WorkflowBuilderV2Props {
  flowId: string
}

export function WorkflowBuilderV2({ flowId }: WorkflowBuilderV2Props) {
  const searchParams = useSearchParams()
  const promptParam = searchParams?.get("prompt") ?? searchParams?.get("initialPrompt") ?? null

  const adapter = useFlowV2LegacyAdapter(flowId)
  const { integrations, fetchIntegrations } = useIntegrationStore()
  const builder = adapter.flowState
  const actions = adapter.actions
  const flowState = builder?.flowState
  const { toast } = useToast()
  const { initialized: authInitialized, user } = useAuthStore()
  const { isIntegrationConnected } = useIntegrationSelection()
  const { prefetchNodeConfig } = usePrefetchConfig()

  // State management
  const [workflowName, setWorkflowName] = useState(adapter.state.flowName)
  const [nameDirty, setNameDirty] = useState(false)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [isIntegrationsPanelOpen, setIsIntegrationsPanelOpen] = useState(false)
  const [configuringNode, setConfiguringNode] = useState<any>(null)

  // Agent panel state
  const [agentPanelWidth, setAgentPanelWidth] = useState(() =>
    computeReactAgentPanelWidth(typeof window === "undefined" ? undefined : window)
  )

  // Update agent panel width on window resize for dynamic responsiveness
  useEffect(() => {
    if (typeof window === "undefined") return

    const handleResize = () => {
      const newWidth = computeReactAgentPanelWidth(window)
      setAgentPanelWidth(newWidth)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const [agentOpen, setAgentOpen] = useState(true)
  const [agentInput, setAgentInput] = useState("")
  const [agentMessages, setAgentMessages] = useState<ChatMessage[]>([])
  const [isAgentLoading, setIsAgentLoading] = useState(false)
  const [agentStatus, setAgentStatus] = useState("")

  // Provider disambiguation state
  const [awaitingProviderSelection, setAwaitingProviderSelection] = useState(false)
  const [pendingPrompt, setPendingPrompt] = useState<string>("")
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(null)
  const [providerCategory, setProviderCategory] = useState<any>(null)

  // Build state machine (Kadabra-style animated build)
  const [buildMachine, setBuildMachine] = useState<BuildStateMachine>(getInitialState())

  // Node configuration state (for user input during build)
  const [nodeConfigs, setNodeConfigs] = useState<Record<string, Record<string, any>>>({})

  // AI Agent Infrastructure (Spec-Compliant)
  const choreographerRef = useRef<BuildChoreographer | null>(null)
  const costTrackerRef = useRef<CostTracker | null>(null)
  const [costEstimate, setCostEstimate] = useState<number | undefined>(undefined)
  const [costActual, setCostActual] = useState<number | undefined>(undefined)
  const [isChatLoading, setIsChatLoading] = useState(false)

  const pendingChatMessagesRef = useRef<PendingChatMessage[]>([])
  const [chatPersistenceEnabled, setChatPersistenceEnabled] = useState(false)
  const initialRevisionCountRef = useRef<number | null>(null)

  // Path router state
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set())
  const [pathLabels, setPathLabels] = useState<Record<string, string>>({})
  const lastHasUnsavedChangesRef = useRef<boolean | null>(null)

  const generateLocalId = useCallback(() => {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `local-${crypto.randomUUID()}`
    }
    return `local-${Date.now()}-${Math.random()}`
  }, [])

  const replaceMessageByLocalId = useCallback((localId: string, saved: ChatMessage) => {
    console.log('🔄 [Chat Debug] replaceMessageByLocalId called')
    console.log('  Replacing local ID:', localId)
    console.log('  With DB message:', { id: saved.id, role: saved.role, text: saved.text?.substring(0, 50) })
    setAgentMessages(prev => {
      const replaced = prev.map(message => (message.id === localId ? saved : message))
      const foundMatch = prev.some(m => m.id === localId)
      console.log('  Found match:', foundMatch, '| Messages before:', prev.length, '| After:', replaced.length)
      return replaced
    })
  }, [setAgentMessages])

  const enqueuePendingMessage = useCallback((message: PendingChatMessage) => {
    pendingChatMessagesRef.current.push(message)
  }, [])

  const persistOrQueueStatus = useCallback(
    async (text: string, subtext?: string) => {
      if (chatPersistenceEnabled && flowState?.flow) {
        try {
          await ChatService.addOrUpdateStatus(flowId, text, subtext)
        } catch (error) {
          console.error("Failed to persist status message:", error)
        }
        return
      }

      enqueuePendingMessage({
        localId: generateLocalId(),
        role: 'status',
        text,
        subtext,
        createdAt: new Date().toISOString(),
      })
    },
    [chatPersistenceEnabled, enqueuePendingMessage, flowId, flowState?.flow, generateLocalId]
  )

  // Initialize AI Agent infrastructure
  useEffect(() => {
    if (typeof window === "undefined") return

    // Initialize BuildChoreographer with reduced motion detection
    const preferReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    choreographerRef.current = new BuildChoreographer(preferReducedMotion)

    // Initialize CostTracker
    costTrackerRef.current = new CostTracker()
  }, [])

  // Fetch integrations once on mount (cached for 5 seconds per integrationStore)
  // This prevents repeated force fetches throughout the session
  useEffect(() => {
    if (!authInitialized) return

    console.log('[Integration Cache] Fetching integrations on mount (uses cache if <5s old)')
    fetchIntegrations(false) // Don't force - use cache if available
  }, [flowId, authInitialized, fetchIntegrations])

  // Cleanup: Clear pending messages on unmount if workflow was never saved
  useEffect(() => {
    return () => {
      if (!chatPersistenceEnabled && pendingChatMessagesRef.current.length > 0) {
        console.log('🧹 [Chat Debug] Clearing pending messages on unmount (workflow never saved)')
        pendingChatMessagesRef.current = []
      }
    }
  }, [chatPersistenceEnabled])

  // Load chat history on mount (only for saved workflows with auth ready)
  useEffect(() => {
    console.log('📌 [Chat Debug] useEffect triggered - loadChatHistory dependency changed')
    console.log('  Dependencies:', { flowId, hasFlow: !!flowState?.flow, revisionId: flowState?.revisionId, authInitialized })

    if (!flowId || !flowState?.flow || !flowState?.revisionId || !authInitialized) {
      console.log('  → Skipping loadChatHistory (dependencies not ready)')
      return
    }

    console.log('  → Dependencies ready, loading chat history...')
    const loadChatHistory = async () => {
      setIsChatLoading(true)
      try {
        const messages = await ChatService.getHistory(flowId)
        console.log('🔍 [Chat Debug] loadChatHistory called')
        console.log('  Loaded from DB:', messages.length, 'messages')
        messages.forEach((msg, i) => {
          console.log(`  [DB-${i}]`, {
            id: msg.id,
            role: msg.role,
            text: msg.text?.substring(0, 50),
            createdAt: msg.createdAt
          })
        })

        setAgentMessages(prev => {
          console.log('  Current state:', prev.length, 'messages')
          prev.forEach((msg, i) => {
            console.log(`  [State-${i}]`, {
              id: msg.id,
              role: msg.role,
              text: msg.text?.substring(0, 50),
              createdAt: msg.createdAt
            })
          })

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
            // Also track by content for dedupe when IDs don't match (local vs DB IDs)
            if (message?.text && message?.role) {
              const contentKey = `${message.role}:${message.text}:${message.createdAt || ''}`
              seenContent.set(contentKey, index)
              console.log(`    Tracking [${index}]: ID="${message.id}" contentKey="${contentKey.substring(0, 60)}..."`)
            }
          })

          messages.forEach((message, msgIndex) => {
            if (!message) {
              return
            }

            // Check for existing message by ID first
            if (message.id && indexById.has(message.id)) {
              const existingIndex = indexById.get(message.id)!
              console.log(`    ✓ [DB-${msgIndex}] Matched by ID at [${existingIndex}], replacing`)
              merged[existingIndex] = message
              return
            }

            // Check for duplicate by content (handles local ID vs DB ID mismatch)
            const contentKey = `${message.role}:${message.text}:${message.createdAt || ''}`
            if (seenContent.has(contentKey)) {
              const existingIndex = seenContent.get(contentKey)!
              console.log(`    ✓ [DB-${msgIndex}] Matched by content at [${existingIndex}], replacing`)
              console.log(`      Old ID: "${merged[existingIndex].id}" → New ID: "${message.id}"`)
              merged[existingIndex] = message
              return
            }

            // No duplicate found, add it
            console.log(`    + [DB-${msgIndex}] No match found, adding as new (ID: ${message.id})`)
            merged.push(message)
          })

          console.log('  Final merged state:', merged.length, 'messages')
          merged.forEach((msg, i) => {
            console.log(`  [Merged-${i}]`, {
              id: msg.id,
              role: msg.role,
              text: msg.text?.substring(0, 50),
              createdAt: msg.createdAt
            })
          })

          return merged
        })
      } catch (error) {
        console.error("Failed to load chat history:", error)
      } finally {
        setIsChatLoading(false)
      }
    }

    loadChatHistory()
  }, [flowId, flowState?.flow, flowState?.revisionId, authInitialized])

  // Determine when chat persistence should be enabled
  useEffect(() => {
    if (!flowState) {
      return
    }

    const revisionCount = flowState.revisionCount ?? 0
    if (initialRevisionCountRef.current === null) {
      initialRevisionCountRef.current = revisionCount
    }

    if (!chatPersistenceEnabled) {
      // Only enable chat persistence if the workflow has been saved at least once
      // This prevents saving messages for workflows that never get saved
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
  }, [agentMessages.length, flowState, chatPersistenceEnabled])

  // Enable persistence once a manual save clears unsaved changes
  useEffect(() => {
    if (typeof builder?.hasUnsavedChanges !== "boolean") {
      return
    }

    if (lastHasUnsavedChangesRef.current === null) {
      lastHasUnsavedChangesRef.current = builder.hasUnsavedChanges
      return
    }

    if (
      !chatPersistenceEnabled &&
      lastHasUnsavedChangesRef.current &&
      !builder.hasUnsavedChanges
    ) {
      setChatPersistenceEnabled(true)
    }

    lastHasUnsavedChangesRef.current = builder.hasUnsavedChanges
  }, [builder?.hasUnsavedChanges, chatPersistenceEnabled])

  // Flush pending messages to database (only for saved workflows with auth ready)
  useEffect(() => {
    if (
      !chatPersistenceEnabled ||
      !flowState?.flow ||
      !flowState?.revisionId ||
      !authInitialized ||
      pendingChatMessagesRef.current.length === 0
    ) {
      return
    }

    let cancelled = false

    const flushPendingMessages = async () => {
      const pending = [...pendingChatMessagesRef.current]
      pendingChatMessagesRef.current = []

      console.log('🚀 [Chat Debug] Flushing pending messages:', pending.length)

      // Get current messages to check for duplicates
      const currentMessages = agentMessages

      for (const item of pending) {
        if (cancelled) return

        // Check if message already exists (by content, to avoid duplicates)
        const alreadyExists = currentMessages.some(
          msg => msg.role === item.role && msg.text === item.text
        )

        if (alreadyExists) {
          console.log('  ⏭️  Skipping pending message (already exists):', {
            role: item.role,
            text: item.text.substring(0, 50)
          })
          continue
        }

        console.log('  💾 Saving pending message:', {
          role: item.role,
          text: item.text.substring(0, 50)
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
          console.error("Failed to persist pending chat message:", error)
        }
      }
    }

    flushPendingMessages()

    return () => {
      cancelled = true
    }
  }, [chatPersistenceEnabled, flowId, flowState?.flow, flowState?.revisionId, authInitialized, replaceMessageByLocalId])

  const nodeComponentMap = useMemo(() => {
    const map = new Map<string, NodeComponent>()
    ALL_NODE_COMPONENTS.forEach((component) => {
      map.set(component.type, component)
    })
    return map
  }, [])

  const saveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const promptProcessedRef = useRef(false)
  const reactFlowInstanceRef = useRef<any>(null)

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    const handleResize = () => {
      setAgentPanelWidth(computeReactAgentPanelWidth(window))
    }

    handleResize()
    window.addEventListener("resize", handleResize)
    return () => {
      window.removeEventListener("resize", handleResize)
    }
  }, [])

  // Sync workflow name
  useEffect(() => {
    if (!nameDirty) {
      setWorkflowName(adapter.state.flowName)
    }
  }, [adapter.state.flowName, nameDirty])

  // Restore agent panel state from localStorage
  useEffect(() => {
    if (typeof window === "undefined") return
    const stored = window.localStorage.getItem("reactAgentPanelOpen")
    if (stored) {
      setAgentOpen(stored === "true")
    }
  }, [])

  // Persist agent panel state to localStorage
  useEffect(() => {
    if (typeof window === "undefined") return
    window.localStorage.setItem("reactAgentPanelOpen", String(agentOpen))
  }, [agentOpen])

  // Build state machine handlers (defined early for use in URL prompt handler)
  const transitionTo = useCallback((nextState: BuildState) => {
    setBuildMachine(prev => {
      const badge = getBadgeForState(
        nextState,
        prev.plan[prev.progress.currentIndex]?.title
      )
      return { ...prev, state: nextState, badge }
    })
  }, [])

  // Helper function for plan generation (extracted to avoid duplication)
  const continueWithPlanGeneration = useCallback(async (
    result: any,
    originalPrompt: string,
    providerMeta?: { category: any; provider: any; allProviders: any[] }
  ) => {
    // Generate plan from edits
    const plan: PlanNode[] = (result.edits || [])
      .filter((edit: any) => edit.op === 'addNode')
      .map((edit: any, index: number) => {
        const nodeType = edit.node?.type || 'unknown'
        const nodeComponent = ALL_NODE_COMPONENTS.find(n => n.type === nodeType)

        // Use actual node title instead of Kadabra-style names
        const displayTitle = nodeComponent?.title || nodeType

        return {
          id: `node-${index}`,
          title: displayTitle,
          description: nodeComponent?.description || `${nodeComponent?.title || nodeType} node`,
          nodeType,
          providerId: nodeComponent?.providerId,
          icon: nodeComponent?.icon,
          requires: {
            secretNames: [],
            params: [],
          },
        }
      })

    // Silent plan - no assistant message (workflow speaks for itself)
    const assistantText = ''
    const assistantMeta: Record<string, any> = {
      plan: { edits: result.edits, nodeCount: plan.length }
    }

    // Include provider metadata if auto-selected
    if (providerMeta) {
      assistantMeta.autoSelectedProvider = providerMeta
    }

    setBuildMachine(prev => ({
      ...prev,
      plan,
      edits: result.edits,
      stagedText: {
        purpose: result.rationale || `Create a workflow to ${originalPrompt}`,
        subtasks: plan.map(p => p.title),
        relevantNodes: plan.map(p => ({
          title: p.title,
          description: `${p.providerId || 'Generic'} node`,
          providerId: p.providerId,
        })),
      },
      progress: { currentIndex: -1, done: 0, total: plan.length },
    }))

    const assistantLocalId = generateLocalId()
    const assistantCreatedAt = new Date().toISOString()
    const localAssistantMessage: ChatMessage = {
      id: assistantLocalId,
      flowId,
      role: 'assistant',
      text: assistantText,
      meta: assistantMeta,
      createdAt: assistantCreatedAt,
    }

    setAgentMessages(prev => [...prev, localAssistantMessage])

    if (!chatPersistenceEnabled || !flowState?.flow) {
      enqueuePendingMessage({
        localId: assistantLocalId,
        role: 'assistant',
        text: assistantText,
        meta: assistantMeta,
        createdAt: assistantCreatedAt,
      })
    } else {
      ChatService.addAssistantResponse(flowId, assistantText, assistantMeta)
        .then((saved) => {
          if (saved) {
            replaceMessageByLocalId(assistantLocalId, saved)
          }
        })
        .catch((error) => {
          console.error("Failed to save assistant response:", error)
        })
    }

    // Calculate cost estimate
    if (builder?.nodes) {
      try {
        const estimate = await estimateWorkflowCost(builder.nodes)
        setCostEstimate(estimate)
      } catch (error) {
        console.error("Failed to estimate cost:", error)
      }
    }

    // Update workflow name if AI generated one
    console.log('[WorkflowBuilderV2] Checking if we should update workflow name:', {
      hasWorkflowName: !!result.workflowName,
      workflowName: result.workflowName,
      hasUpdateFunction: !!actions?.updateFlowName
    })

    if (result.workflowName && actions?.updateFlowName) {
      console.log('[WorkflowBuilderV2] Updating workflow name from "New Workflow" to:', result.workflowName)
      try {
        await actions.updateFlowName(result.workflowName)
        console.log('[WorkflowBuilderV2] ✅ updateFlowName API call succeeded')

        // Update local UI state to show the new name immediately
        setWorkflowName(result.workflowName)
        setNameDirty(false)
        console.log('[WorkflowBuilderV2] ✅ Local state updated - workflowName:', result.workflowName, 'nameDirty:', false)
      } catch (error) {
        console.error('[WorkflowBuilderV2] ❌ Failed to update workflow name:', error)
        // Non-critical, continue anyway
      }
    } else {
      console.log('[WorkflowBuilderV2] ❌ Skipping workflow name update - missing workflowName or updateFlowName function')
    }

    await new Promise(resolve => setTimeout(resolve, 500))
    transitionTo(BuildState.PLAN_READY)
    setIsAgentLoading(false)
  }, [actions, builder, chatPersistenceEnabled, enqueuePendingMessage, flowId, flowState?.flow, generateLocalId, replaceMessageByLocalId, transitionTo])

  // Provider selection handlers
  const handleProviderSelect = useCallback(async (providerId: string) => {
    if (!pendingPrompt || !providerCategory || !actions) return

    console.log('[Provider Selection] User selected provider:', providerId)

    // Reset selection state
    setAwaitingProviderSelection(false)
    setIsAgentLoading(true)

    // Replace vague term with specific provider in prompt
    const modifiedPrompt = replaceVagueTermWithProvider(
      pendingPrompt,
      providerCategory.vagueTerm,
      providerId
    )

    console.log('[Provider Selection] Modified prompt:', modifiedPrompt)

    // Get provider metadata
    const providerOptions = getProviderOptions(
      providerCategory,
      integrations.map(i => ({ provider: i.provider, id: i.id, status: i.status }))
    )
    const selectedProvider = providerOptions.find(p => p.id === providerId)

    // Prepare provider metadata to include in plan message
    const providerMetadata = selectedProvider ? {
      category: providerCategory,
      provider: selectedProvider,
      allProviders: providerOptions
    } : undefined

    // Clear pending state
    setPendingPrompt("")
    setProviderCategory(null)

    // Start planning with modified prompt
    transitionTo(BuildState.THINKING)

    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      transitionTo(BuildState.SUBTASKS)

      await new Promise(resolve => setTimeout(resolve, 800))
      transitionTo(BuildState.COLLECT_NODES)

      await new Promise(resolve => setTimeout(resolve, 800))
      transitionTo(BuildState.OUTLINE)

      await new Promise(resolve => setTimeout(resolve, 800))
      transitionTo(BuildState.PURPOSE)

      const { result, usedTemplate, promptId } = await planWorkflowWithTemplates(
        actions, modifiedPrompt, providerId, user?.id, flowId
      )
      console.log('[Provider Selection] Received result from askAgent:', {
        workflowName: result.workflowName,
        editsCount: result.edits?.length,
        usedTemplate,
        cost: usedTemplate ? '$0.00 (template)' : '~$0.03 (LLM)',
        promptId
      })

      // Pass provider metadata to include in plan message
      await continueWithPlanGeneration(result, modifiedPrompt, providerMetadata)
    } catch (error: any) {
      toast({
        title: "Failed to create plan",
        description: error?.message || "Unable to generate workflow plan",
        variant: "destructive",
      })
      transitionTo(BuildState.IDLE)
      setIsAgentLoading(false)
    }
  }, [actions, continueWithPlanGeneration, flowId, generateLocalId, integrations, pendingPrompt, providerCategory, toast, transitionTo])

  const handleProviderConnect = useCallback(async (providerId: string) => {
    console.log('[Provider Connect] User clicked connect for:', providerId)

    try {
      // Use integration store's connect function which opens OAuth popup
      await useIntegrationStore.getState().connectIntegration(providerId)

      // Integration store will refresh integrations automatically on success
      // After connection, automatically proceed with the provider selection
      console.log('[Provider Connect] Connection successful, proceeding with provider selection')

      // Give a small delay for integrations to refresh
      setTimeout(() => {
        // Now that provider is connected, proceed with selection
        handleProviderSelect(providerId)
      }, 500)

    } catch (error: any) {
      console.error('[Provider Connect] Connection failed:', error)
      toast({
        title: "Connection Failed",
        description: error?.message || `Failed to connect ${providerId}`,
        variant: "destructive",
      })
    }
  }, [toast, handleProviderSelect])

  const handleProviderChange = useCallback(async (newProviderId: string) => {
    console.log('[Provider Change] User changed provider to:', newProviderId)

    // Find current provider from chat messages
    const assistantMessages = agentMessages.filter(m => m && m.role === 'assistant')
    const lastMessage = assistantMessages[assistantMessages.length - 1]
    const meta = (lastMessage as any)?.meta ?? {}
    const currentProvider = meta.autoSelectedProvider?.provider

    if (!currentProvider) {
      console.warn('[Provider Change] No current provider found')
      return
    }

    const oldProviderId = currentProvider.id

    // Validate swap
    if (!canSwapProviders(oldProviderId, newProviderId)) {
      toast({
        title: "Cannot Change Provider",
        description: "These providers are not compatible",
        variant: "destructive",
      })
      return
    }

    // Show updating toast (instant feedback)
    toast({
      title: "Provider Updated",
      description: `Switched to ${newProviderId}`,
    })

    // Swap providers in plan (instant, no API call)
    const updatedPlan = swapProviderInPlan(buildMachine.plan, oldProviderId, newProviderId)

    // Update build machine with new plan
    setBuildMachine(prev => ({
      ...prev,
      plan: updatedPlan,
    }))

    // Update provider metadata in chat message
    const updatedMessages = agentMessages.map((msg, index) => {
      // Update the last assistant message with new provider
      if (index === assistantMessages.length - 1 && msg.role === 'assistant') {
        const providerOptions = meta.autoSelectedProvider?.allProviders || []
        const newProvider = providerOptions.find((p: any) => p.id === newProviderId)

        return {
          ...msg,
          meta: {
            ...meta,
            autoSelectedProvider: {
              ...meta.autoSelectedProvider,
              provider: newProvider || { id: newProviderId, displayName: newProviderId },
            },
          },
        }
      }
      return msg
    })

    setAgentMessages(updatedMessages)

    console.log('[Provider Change] ✅ Provider swapped instantly (no LLM call, cost: $0.00)')
  }, [agentMessages, buildMachine.plan, toast])

  // Handle prompt parameter from URL (e.g., from AI agent page)
  useEffect(() => {
    if (!actions) return
    if (promptProcessedRef.current) return

    let prompt: string | null = null

    if (typeof window !== "undefined") {
      prompt = window.sessionStorage.getItem("flowv2:pendingPrompt")
      if (prompt) {
        window.sessionStorage.removeItem("flowv2:pendingPrompt")
      }
    }

    if (!prompt && promptParam) {
      prompt = decodeURIComponent(promptParam)
    }

    if (!prompt || prompt.trim().length === 0) return

    promptProcessedRef.current = true
    setAgentInput(prompt)
    setAgentOpen(true)

    // Auto-submit the prompt after a short delay to ensure UI is ready
    setTimeout(() => {
      if (prompt) {
        const initialLocalId = generateLocalId()
        const createdAtIso = new Date().toISOString()
        const initialMessage: ChatMessage = {
          id: initialLocalId,
          flowId,
          role: 'user',
          text: prompt,
          createdAt: createdAtIso,
        }

        console.log('💬 [Chat Debug] Adding user message to state (from URL prompt)')
        console.log('  Message:', { id: initialLocalId, role: 'user', text: prompt.substring(0, 50) })
        setAgentMessages(prev => {
          console.log('  Previous messages:', prev.length)
          return [...prev, initialMessage]
        })

        if (!chatPersistenceEnabled || !flowState?.flow) {
          console.log('  → Chat persistence disabled, enqueueing as pending')
          enqueuePendingMessage({
            localId: initialLocalId,
            role: 'user',
            text: prompt,
            createdAt: createdAtIso,
          })
        } else {
          console.log('  → Saving to database...')
          ChatService.addUserPrompt(flowId, prompt)
            .then((saved) => {
              if (saved) {
                console.log('  ✓ Saved to DB, replacing local ID with DB ID:', saved.id)
                replaceMessageByLocalId(initialLocalId, saved)
              }
            })
            .catch((error) => {
              console.error("Failed to save user prompt:", error)
            })
        }

        setAgentInput("")
        setIsAgentLoading(true)

        // Run the agent query
        ;(async () => {
          try {
            // Check for vague provider terms
            const vagueTermResult = detectVagueTerms(prompt)
            let finalPrompt = prompt
            let providerMetadata: { category: any; provider: any; allProviders: any[] } | undefined

            if (vagueTermResult.found && vagueTermResult.category) {
              console.log('[URL Prompt Handler] Detected vague term:', vagueTermResult.category.vagueTerm)

              // Use cached integrations (refreshed on mount, cached for 5s)
              // No need to force fetch - integrations are already fresh from mount effect
              const freshIntegrations = useIntegrationStore.getState().integrations
              console.log('[URL Prompt Handler] Using cached integrations:', freshIntegrations.length)

              const providerOptions = getProviderOptions(
                vagueTermResult.category,
                freshIntegrations.map(i => ({ provider: i.provider, id: i.id, status: i.status }))
              )

              const connectedProviders = providerOptions.filter(p => p.isConnected)
              console.log('[URL Prompt Handler] Connected providers:', connectedProviders.length)

              if (connectedProviders.length === 0) {
                // No providers - stop and show selection UI
                console.log('[URL Prompt Handler] No providers connected, showing selection UI')
                setAwaitingProviderSelection(true)
                setPendingPrompt(prompt)
                setProviderCategory(vagueTermResult.category)
                setIsAgentLoading(false)

                const askMessage: ChatMessage = {
                  id: generateLocalId(),
                  flowId,
                  role: 'assistant',
                  text: `To continue, please connect one of your ${vagueTermResult.category.displayName.toLowerCase()} apps.`,
                  meta: {
                    providerSelection: {
                      category: vagueTermResult.category,
                      providers: providerOptions,
                      reason: 'no_providers_connected'
                    }
                  },
                  createdAt: new Date().toISOString(),
                }
                setAgentMessages(prev => [...prev, askMessage])
                return
              } else if (connectedProviders.length === 1) {
                // Auto-select the only provider
                const selectedProvider = connectedProviders[0]
                console.log('[URL Prompt Handler] Auto-selecting provider:', selectedProvider.displayName)

                finalPrompt = replaceVagueTermWithProvider(
                  prompt,
                  vagueTermResult.category.vagueTerm,
                  selectedProvider.id
                )

                providerMetadata = {
                  category: vagueTermResult.category,
                  provider: selectedProvider,
                  allProviders: providerOptions
                }
              } else {
                // Multiple providers - stop and show selection UI
                console.log('[URL Prompt Handler] Multiple providers connected, showing selection UI')
                setAwaitingProviderSelection(true)
                setPendingPrompt(prompt)
                setProviderCategory(vagueTermResult.category)
                setIsAgentLoading(false)

                const askMessage: ChatMessage = {
                  id: generateLocalId(),
                  flowId,
                  role: 'assistant',
                  text: `I found multiple ${vagueTermResult.category.displayName.toLowerCase()} apps connected. Which one would you like to use?`,
                  meta: {
                    providerSelection: {
                      category: vagueTermResult.category,
                      providers: providerOptions,
                      reason: 'multiple_providers'
                    }
                  },
                  createdAt: new Date().toISOString(),
                }
                setAgentMessages(prev => [...prev, askMessage])
                return
              }
            }

            // Start the animated build process
            transitionTo(BuildState.THINKING)

            await new Promise(resolve => setTimeout(resolve, 1000))
            transitionTo(BuildState.SUBTASKS)

            await new Promise(resolve => setTimeout(resolve, 800))
            transitionTo(BuildState.COLLECT_NODES)

            await new Promise(resolve => setTimeout(resolve, 800))
            transitionTo(BuildState.OUTLINE)

            await new Promise(resolve => setTimeout(resolve, 800))
            transitionTo(BuildState.PURPOSE)

            const { result, usedTemplate, promptId } = await planWorkflowWithTemplates(
              actions, finalPrompt, selectedProvider?.id, user?.id, flowId
            )
            console.log('[URL Prompt Handler] Received result from askAgent:', {
              workflowName: result.workflowName,
              editsCount: result.edits?.length,
              rationale: result.rationale,
              usedTemplate,
              cost: usedTemplate ? '$0.00 (template)' : '~$0.03 (LLM)',
              promptId
            })

            // Use helper function to generate plan and update UI (with provider metadata if auto-selected)
            await continueWithPlanGeneration(result, finalPrompt, providerMetadata)
          } catch (error: any) {
            toast({
              title: "Failed to create plan",
              description: error?.message || "Unable to generate workflow plan",
              variant: "destructive",
            })
            transitionTo(BuildState.IDLE)
            setIsAgentLoading(false)
          }
        })()
      }
    }, 300)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    actions,
    chatPersistenceEnabled,
    continueWithPlanGeneration,
    enqueuePendingMessage,
    flowId,
    flowState?.flow,
    generateLocalId,
    integrations,
    promptParam,
    replaceMessageByLocalId,
    toast,
    transitionTo,
  ])

  // Handler for adding a node after a specific node (Zapier-style)
  const handleAddNodeAfter = useCallback(async (afterNodeId: string, nodeType: string, component: NodeComponent, sourceHandle?: string) => {
    if (!actions || !builder) return

    const afterNode = builder.nodes.find((n: any) => n.id === afterNodeId)
    if (!afterNode) return

    // For Path Condition nodes from Path Router, position horizontally
    let position = {
      x: afterNode.position.x,
      y: afterNode.position.y + 200
    }

    if (nodeType === 'path_condition' && afterNode.data?.type === 'path') {
      // Count existing Path Condition nodes connected to this router
      const connectedPathNodes = builder.nodes.filter((node: any) => {
        const edges = builder.edges || []
        return edges.some((edge: any) =>
          edge.source === afterNodeId &&
          edge.target === node.id &&
          node.data?.type === 'path_condition'
        )
      })

      const pathIndex = connectedPathNodes.length
      const horizontalSpacing = 500 // Zapier-style horizontal spacing

      // Position horizontally: first path at original x, subsequent paths to the right
      position = {
        x: afterNode.position.x + (pathIndex * horizontalSpacing),
        y: afterNode.position.y + 200
      }
    }

    try {
      // Add the new node
      await actions.addNode(nodeType, position)

      // Get the newly added node ID (it will be the last node added)
      const newNodes = builder.nodes
      const newNode = newNodes[newNodes.length - 1]

      if (newNode) {
        // Connect the previous node to the new node
        await actions.connectEdge({
          sourceId: afterNodeId,
          targetId: newNode.id,
          sourceHandle: sourceHandle || 'source'
        })

        // Auto-open configuration for Path Condition nodes
        if (nodeType === 'path_condition' && newNode.id) {
          setTimeout(() => {
            handleConfigureNode(newNode.id)
          }, 100)
        }
      }

      toast({
        title: "Node added",
        description: `${component.title} has been added to your workflow.`,
      })
    } catch (error: any) {
      toast({
        title: "Failed to add node",
        description: error?.message ?? "Unable to add node",
        variant: "destructive",
      })
    }
  }, [actions, builder, toast])

  // React Flow props with last-node detection
  // Handle test node from context menu
  const handleTestNode = useCallback(async (nodeId: string) => {
    const node = builder?.nodes?.find((n: any) => n.id === nodeId)
    if (!node || !reactFlowInstanceRef.current) {
      logger.error('[WorkflowBuilder] Cannot test node - node or ReactFlow instance not found')
      return
    }

    const reactFlowNode = reactFlowInstanceRef.current.getNode(nodeId)
    if (!reactFlowNode) {
      logger.error('[WorkflowBuilder] Cannot find ReactFlow node:', nodeId)
      return
    }

    try {
      logger.debug('[WorkflowBuilder] Testing node:', { nodeId, nodeType: node.data?.type })

      // Set node to running state
      setNodeState(reactFlowInstanceRef.current, nodeId, 'running')

      // Strip test metadata from config
      const config = node.data?.config || {}
      const cleanConfig = Object.keys(config).reduce((acc, key) => {
        if (!key.startsWith('__test') && !key.startsWith('__validation')) {
          acc[key] = config[key]
        }
        return acc
      }, {} as Record<string, any>)

      // Call test-node API
      const response = await fetch('/api/workflows/test-node', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nodeType: node.data?.type,
          config: cleanConfig,
          testData: {}
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to test node')
      }

      logger.debug('[WorkflowBuilder] Test completed:', result)

      // Update node with test results
      if (actions?.updateConfig) {
        const updatedConfig = {
          ...config,
          __testData: result.testResult?.output || {},
          __testResult: {
            success: result.testResult?.success !== false,
            executionTime: result.testResult?.executionTime,
            timestamp: new Date().toISOString(),
            error: result.testResult?.error,
            message: result.testResult?.message,
            rawResponse: result.testResult?.output
          }
        }
        actions.updateConfig(nodeId, updatedConfig)
      }

      // Set node to passed or failed state
      if (result.testResult?.success !== false) {
        setNodeState(reactFlowInstanceRef.current, nodeId, 'passed')
        toast({
          title: "Test passed",
          description: result.testResult?.message || "Node executed successfully",
        })
      } else {
        setNodeState(reactFlowInstanceRef.current, nodeId, 'failed')
        toast({
          title: "Test failed",
          description: result.testResult?.error || result.testResult?.message || "Node test failed",
          variant: "destructive"
        })
      }

    } catch (error: any) {
      logger.error('[WorkflowBuilder] Test failed:', error)
      setNodeState(reactFlowInstanceRef.current, nodeId, 'failed')
      toast({
        title: "Test failed",
        description: error.message || "Failed to execute test",
        variant: "destructive"
      })
    }
  }, [builder?.nodes, actions, toast])

  const reactFlowProps = useMemo(() => {
    if (!builder) {
      return null
    }

    // Detect last nodes (nodes with no outgoing edges)
    const lastNodeIds = new Set<string>()
    const nodesWithOutgoing = new Set<string>()

    builder.edges.forEach((edge: any) => {
      nodesWithOutgoing.add(edge.source)
    })

    builder.nodes.forEach((node: any) => {
      if (!node.data?.isTrigger && !nodesWithOutgoing.has(node.id)) {
        lastNodeIds.add(node.id)
      }
    })

    // Enhance nodes with isLastNode, onAddNodeAfter, and onTestNode
    const enhancedNodes = builder.nodes.map((node: any) => ({
      ...node,
      data: {
        ...node.data,
        isLastNode: lastNodeIds.has(node.id),
        onAddNodeAfter: handleAddNodeAfter,
        onTestNode: handleTestNode,
      }
    }))

    // Handler for inserting a node in the middle of an edge
    const handleInsertNodeOnEdge = (edgeId: string, position: { x: number; y: number }) => {
      // Open integrations panel at the edge position
      // TODO: Implement node insertion at edge midpoint
      console.log('Insert node on edge:', edgeId, 'at position:', position)
    }

    // Enhance edges with onInsertNode handler
    const enhancedEdges = builder.edges.map((edge: any) => ({
      ...edge,
      data: {
        ...edge.data,
        onInsertNode: handleInsertNodeOnEdge,
      }
    }))

    return {
      nodes: enhancedNodes,
      edges: enhancedEdges,
      onNodesChange: builder.optimizedOnNodesChange ?? builder.onNodesChange,
      onEdgesChange: builder.onEdgesChange,
      onConnect: builder.onConnect,
      nodeTypes: builder.nodeTypes,
      edgeTypes: builder.edgeTypes,
    }
  }, [builder, handleAddNodeAfter, handleTestNode])

  // Name update handler
  const persistName = useCallback(
    async (name: string) => {
      if (!actions) return
      try {
        await actions.updateFlowName(name)
        setNameDirty(false)
      } catch (error: any) {
        toast({
          title: "Rename failed",
          description: error?.message ?? "Unable to save the workflow name.",
          variant: "destructive",
        })
      }
    },
    [actions, toast]
  )

  const handleNameChange = useCallback(
    (name: string) => {
      setWorkflowName(name)
      setNameDirty(true)
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
      saveTimerRef.current = setTimeout(() => {
        persistName(name.trim())
      }, 600)
    },
    [persistName]
  )

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
      }
    }
  }, [])

  // Selection handler
  const handleSelectionChange = useCallback((params: any) => {
    const first = params?.nodes?.[0]
    setSelectedNodeId(first?.id ?? null)
  }, [])

  // Node selection from panel
  const handleNodeSelectFromPanel = useCallback(async (nodeData: any) => {
    if (!actions || !builder) return

    const position = nodeData.position || { x: 400, y: 300 }
    const nodeComponent = nodeComponentMap.get(nodeData.type)
    const providerId = nodeComponent?.providerId ?? nodeData.providerId

    // Generate a temporary ID that will be replaced by the real one from DB
    const tempId = `node-${Date.now()}`

    // Create the node immediately for instant UI feedback
    const optimisticNode = {
      id: tempId,
      type: "custom",
      position,
      data: {
        label: nodeComponent?.title ?? nodeData.title ?? nodeData.type,
        title: nodeComponent?.title ?? nodeData.title ?? nodeData.type,
        type: nodeData.type,
        description: nodeComponent?.description ?? "",
        providerId,
        icon: nodeComponent?.icon,
        config: {},
        isTrigger: nodeComponent?.isTrigger ?? false,
        _optimistic: true, // Mark as optimistic so we know to replace it
      },
    }

    const currentNodes = builder.nodes ?? []
    const currentEdges = builder.edges ?? []

    // Add node to canvas immediately
    builder.setNodes([...currentNodes, optimisticNode])

    // Close panel immediately for better UX
    setIsIntegrationsPanelOpen(false)

    // Open config modal immediately for instant configuration
    setConfiguringNode(optimisticNode)

    try {
      // Persist to database in background
      const newNode = await actions.addNode(nodeData.type, position)

      // Update the configuring node with the real node ID from DB
      if (newNode) {
        setConfiguringNode((current: any) => {
          if (current && current.id === tempId) {
            return { ...current, id: newNode.id, data: { ...current.data, _optimistic: false } }
          }
          return current
        })
      }
    } catch (error: any) {
      // Only rollback if it failed
      builder.setNodes(currentNodes)
      builder.setEdges(currentEdges)
      setConfiguringNode(null)
      toast({
        title: "Failed to add node",
        description: error?.message ?? "Unable to add node",
        variant: "destructive",
      })
      setIsIntegrationsPanelOpen(true)
    }
  }, [actions, builder, nodeComponentMap, toast])

  // Node deletion with optimistic update for instant feedback
  const handleDeleteNodes = useCallback(async (nodeIds: string[]) => {
    if (!actions || !builder || nodeIds.length === 0) return

    const nodeIdSet = new Set(nodeIds)

    // Store current nodes/edges for rollback if delete fails
    const currentNodes = builder.nodes
    const currentEdges = builder.edges

    // Record history snapshot for undo
    builder.pushHistorySnapshot?.(currentNodes, currentEdges)

    // Optimistically remove nodes from UI immediately
    const updatedNodes = currentNodes.filter((node: any) => !nodeIdSet.has(node.id))
    const updatedEdges = currentEdges.filter(
      (edge: any) => !nodeIdSet.has(edge.source) && !nodeIdSet.has(edge.target)
    )

    builder.setNodes(updatedNodes)
    builder.setEdges(updatedEdges)

    // Clear selection when deleting current node(s)
    setSelectedNodeId(prev => (prev && nodeIdSet.has(prev) ? null : prev))

    try {
      const deleteEdits = nodeIds.map(nodeId => ({ op: "deleteNode", nodeId }))
      await actions.applyEdits(deleteEdits)
    } catch (error: any) {
      // Rollback on error
      builder.setNodes(currentNodes)
      builder.setEdges(currentEdges)

      toast({
        title: "Failed to delete node",
        description: error?.message ?? "Unable to delete node(s)",
        variant: "destructive",
      })
    }
  }, [actions, builder, toast])

  const handleNodeDelete = useCallback(async (nodeId: string) => {
    await handleDeleteNodes([nodeId])
  }, [handleDeleteNodes])

  // Handle node configuration (double-click or manual trigger)
  const handleNodeConfigure = useCallback(async (nodeId: string) => {
    const node = reactFlowProps?.nodes?.find((n: any) => n.id === nodeId)
    if (node) {
      console.log('🔧 [WorkflowBuilder] Opening configuration for node:', nodeId, node)

      // Prefetch config data before opening modal for instant UX
      const nodeInfo = getNodeByType(node.data?.nodeType || node.type)
      if (nodeInfo && nodeInfo.configSchema) {
        console.log('🚀 [WorkflowBuilder] Prefetching config data for:', node.data?.nodeType)
        // Don't await - let it load in parallel with modal opening
        prefetchNodeConfig(
          node.data?.nodeType || node.type,
          nodeInfo.providerId || '',
          nodeInfo.configSchema
        ).catch(err => {
          console.warn('⚠️ [WorkflowBuilder] Prefetch failed (non-critical):', err)
        })
      }

      setConfiguringNode(node)
    } else {
      console.warn('🔧 [WorkflowBuilder] Node not found for configuration:', nodeId)
    }
  }, [reactFlowProps?.nodes, prefetchNodeConfig])

  // Handle saving node configuration
  const handleSaveNodeConfig = useCallback(async (nodeId: string, config: Record<string, any>) => {
    console.log('💾 [WorkflowBuilder] Saving configuration for node:', nodeId, config)

    if (!actions) {
      console.warn('💾 [WorkflowBuilder] No actions available to save config')
      return
    }

    try {
      // Update the node with the new config
      actions.updateConfig(nodeId, config)
    } catch (error: any) {
      console.error('💾 [WorkflowBuilder] Error saving config:', error)
      toast({
        title: "Failed to save configuration",
        description: error?.message ?? "Unable to save node configuration",
        variant: "destructive",
      })
    }
  }, [actions, toast])

  // Placeholder handlers (to be implemented)
  const comingSoon = useCallback(
    () =>
      toast({
        title: "Coming soon",
        description: "This action is not yet wired to the Flow v2 backend.",
      }),
    [toast]
  )

  const handleAgentSubmit = useCallback(async () => {
    if (!agentInput.trim() || !actions) return

    const userPrompt = agentInput.trim()
    setAgentInput("")
    setIsAgentLoading(true)

    const userLocalId = generateLocalId()
    const createdAtIso = new Date().toISOString()
    const localUserMessage: ChatMessage = {
      id: userLocalId,
      flowId,
      role: 'user',
      text: userPrompt,
      createdAt: createdAtIso,
    }

    setAgentMessages(prev => [...prev, localUserMessage])

    if (!chatPersistenceEnabled || !flowState?.flow) {
      enqueuePendingMessage({
        localId: userLocalId,
        role: 'user',
        text: userPrompt,
        createdAt: createdAtIso,
      })
    } else {
      ChatService.addUserPrompt(flowId, userPrompt)
        .then((saved) => {
          if (saved) {
            replaceMessageByLocalId(userLocalId, saved)
          }
        })
        .catch((error) => {
          console.error("Failed to save user prompt:", error)
        })
    }

    // STEP 1: Check for vague provider terms
    const vagueTermResult = detectVagueTerms(userPrompt)

    if (vagueTermResult.found && vagueTermResult.category) {
      console.log('[Provider Disambiguation] Detected vague term:', vagueTermResult.category.vagueTerm)

      // Use cached integrations (refreshed on mount, cached for 5s)
      // No need to force fetch - integrations are already fresh from mount effect
      const freshIntegrations = useIntegrationStore.getState().integrations
      console.log('[Provider Disambiguation] Using cached integrations:', freshIntegrations.length)

      // Get provider options for this category
      const providerOptions = getProviderOptions(
        vagueTermResult.category,
        freshIntegrations.map(i => ({ provider: i.provider, id: i.id, status: i.status }))
      )

      const connectedProviders = providerOptions.filter(p => p.isConnected)
      console.log('[Provider Disambiguation] Connected providers:', connectedProviders.length)

      if (connectedProviders.length === 0) {
        // No providers connected - ask user to connect
        console.log('[Provider Disambiguation] No providers connected, showing selection UI')
        setAwaitingProviderSelection(true)
        setPendingPrompt(userPrompt)
        setProviderCategory(vagueTermResult.category)
        setIsAgentLoading(false)

        // Add assistant message asking user to connect a provider
        const askMessage: ChatMessage = {
          id: generateLocalId(),
          flowId,
          role: 'assistant',
          text: `To continue, please connect one of your ${vagueTermResult.category.displayName.toLowerCase()} apps.`,
          meta: {
            providerSelection: {
              category: vagueTermResult.category,
              providers: providerOptions,
              reason: 'no_providers_connected'
            }
          },
          createdAt: new Date().toISOString(),
        }
        setAgentMessages(prev => [...prev, askMessage])
        return
      } else if (connectedProviders.length === 1) {
        // Exactly 1 provider - auto-select and continue with modified prompt
        const selectedProvider = connectedProviders[0]
        console.log('[Provider Disambiguation] Auto-selecting provider:', selectedProvider.displayName)

        // Replace vague term with specific provider in prompt
        const modifiedPrompt = replaceVagueTermWithProvider(
          userPrompt,
          vagueTermResult.category.vagueTerm,
          selectedProvider.id
        )

        console.log('[Provider Disambiguation] Modified prompt:', modifiedPrompt)

        // Prepare provider metadata to include in plan message
        const providerMetadata = {
          category: vagueTermResult.category,
          provider: selectedProvider,
          allProviders: providerOptions
        }

        // Start animated build progression
        transitionTo(BuildState.THINKING)

        try {
          // Simulate staged progression through planning states
          await new Promise(resolve => setTimeout(resolve, 1000))
          transitionTo(BuildState.SUBTASKS)

          await new Promise(resolve => setTimeout(resolve, 800))
          transitionTo(BuildState.COLLECT_NODES)

          await new Promise(resolve => setTimeout(resolve, 800))
          transitionTo(BuildState.OUTLINE)

          await new Promise(resolve => setTimeout(resolve, 800))
          transitionTo(BuildState.PURPOSE)

          // Call actual askAgent API with MODIFIED prompt (template matching first)
          const { result, usedTemplate, promptId } = await planWorkflowWithTemplates(
            actions, modifiedPrompt, selectedProvider.id, user?.id, flowId
          )
          console.log('[WorkflowBuilderV2] Received result from askAgent:', {
            workflowName: result.workflowName,
            editsCount: result.edits?.length,
            rationale: result.rationale,
            usedTemplate,
            cost: usedTemplate ? '$0.00 (template)' : '~$0.03 (LLM)',
            promptId
          })

          // Pass provider metadata to include in plan message
          await continueWithPlanGeneration(result, modifiedPrompt, providerMetadata)
        } catch (error: any) {
          toast({
            title: "Failed to create plan",
            description: error?.message || "Unable to generate workflow plan",
            variant: "destructive",
          })
          transitionTo(BuildState.IDLE)
          setIsAgentLoading(false)
        }
        return
      } else {
        // 2+ providers connected - ask user to choose
        console.log('[Provider Disambiguation] Multiple providers connected, showing selection UI')
        setAwaitingProviderSelection(true)
        setPendingPrompt(userPrompt)
        setProviderCategory(vagueTermResult.category)
        setIsAgentLoading(false)

        // Add assistant message asking user to select
        const askMessage: ChatMessage = {
          id: generateLocalId(),
          flowId,
          role: 'assistant',
          text: `I found multiple ${vagueTermResult.category.displayName.toLowerCase()} apps connected. Which one would you like to use?`,
          meta: {
            providerSelection: {
              category: vagueTermResult.category,
              providers: providerOptions,
              reason: 'multiple_providers'
            }
          },
          createdAt: new Date().toISOString(),
        }
        setAgentMessages(prev => [...prev, askMessage])
        return
      }
    }

    // No vague terms detected - proceed normally
    // Start animated build progression
    transitionTo(BuildState.THINKING)

    try {
      // Simulate staged progression through planning states
      await new Promise(resolve => setTimeout(resolve, 1000))
      transitionTo(BuildState.SUBTASKS)

      await new Promise(resolve => setTimeout(resolve, 800))
      transitionTo(BuildState.COLLECT_NODES)

      await new Promise(resolve => setTimeout(resolve, 800))
      transitionTo(BuildState.OUTLINE)

      await new Promise(resolve => setTimeout(resolve, 800))
      transitionTo(BuildState.PURPOSE)

      // Call actual askAgent API (template matching first)
      const { result, usedTemplate, promptId } = await planWorkflowWithTemplates(
        actions, userPrompt, undefined, user?.id, flowId
      )
      console.log('[WorkflowBuilderV2] Received result from askAgent:', {
        workflowName: result.workflowName,
        editsCount: result.edits?.length,
        rationale: result.rationale,
        usedTemplate,
        cost: usedTemplate ? '$0.00 (template)' : '~$0.03 (LLM)',
        promptId
      })

      // Use helper function to generate plan and update UI
      await continueWithPlanGeneration(result, userPrompt)

    } catch (error: any) {
      toast({
        title: "Failed to create plan",
        description: error?.message || "Unable to generate workflow plan",
        variant: "destructive",
      })
      transitionTo(BuildState.IDLE)
      setIsAgentLoading(false)
    }
  }, [
    agentInput,
    actions,
    builder,
    chatPersistenceEnabled,
    continueWithPlanGeneration,
    enqueuePendingMessage,
    flowId,
    flowState?.flow,
    generateLocalId,
    integrations,
    replaceMessageByLocalId,
    toast,
    transitionTo,
  ])

  const handleBuild = useCallback(async () => {
    if (!actions || !buildMachine.edits || buildMachine.state !== BuildState.PLAN_READY) return

    try {
      transitionTo(BuildState.BUILDING_SKELETON)
      await persistOrQueueStatus("Building workflow...")

      // STEP 1: Create mapping of plan nodes to ReactFlow node IDs AND cache the nodes
      const addNodeEdits = buildMachine.edits.filter(e => e.op === 'addNode')
      const nodeMapping: Record<string, string> = {}
      const nodesCache: any[] = []
      addNodeEdits.forEach((edit, index) => {
        if (edit.op === 'addNode' && edit.node && buildMachine.plan[index]) {
          // Map planNode.id -> reactFlowNode.id
          nodeMapping[buildMachine.plan[index].id] = edit.node.id
          // Cache the actual node object
          nodesCache.push(edit.node)
          console.log(`[handleBuild] Mapped plan node "${buildMachine.plan[index].id}" -> ReactFlow node "${edit.node.id}"`)
        }
      })

      // Store mapping AND nodes cache in build machine
      setBuildMachine(prev => ({
        ...prev,
        nodeMapping,
        nodesCache,
      }))

      console.log('[handleBuild] Cached nodes count:', nodesCache.length)

      // STEP 2: Add nodes ONE AT A TIME with animation
      // Extract node edits (connect edges will be created sequentially)
      const nodeEdits = buildMachine.edits.filter((e: any) => e.op === 'addNode')

      console.log('[handleBuild] Adding', nodeEdits.length, 'nodes sequentially with animation')

      // STEP 3: Animate nodes appearing one by one
      setTimeout(async () => {
        if (!reactFlowInstanceRef.current || !builder?.setNodes || !builder?.setEdges) {
          console.error('[handleBuild Animation] Missing required refs')
          return
        }

        // Clear canvas
        builder.setNodes([])
        builder.setEdges([])

        // Positioning - nodes in horizontal row
        // Place nodes AFTER the agent panel with generous offset and centered vertically
        const BASE_X = agentPanelWidth + 400 // Agent panel width + 400px margin (more right, better centered)
        const BASE_Y = 350 // Vertical center - more in middle of viewport
        const H_SPACING = 500 // Wide spacing between nodes

        console.log('[handleBuild] Node positioning:', {
          agentPanelWidth,
          BASE_X,
          BASE_Y,
          firstNodeX: BASE_X,
          secondNodeX: BASE_X + H_SPACING
        })

        // Create all nodes at once (simpler, more reliable)
        const allNodes = nodeEdits.map((nodeEdit, i) => {
          const plannerNode = nodeEdit.node
          const metadata = (plannerNode?.metadata ?? {}) as any
          const catalogNode = ALL_NODE_COMPONENTS.find(c => c.type === plannerNode.type)

          const nodePosition = {
            x: BASE_X + (i * H_SPACING),
            y: BASE_Y,
          }

          return {
            id: plannerNode.id,
            type: 'custom',
            position: nodePosition,
            positionAbsolute: nodePosition, // Force absolute positioning
            selected: false,
            draggable: false, // Prevent any dragging/repositioning
            connectable: true,
            data: {
              label: plannerNode.label ?? plannerNode.type,
              title: plannerNode.label ?? plannerNode.type,
              type: plannerNode.type,
              config: plannerNode.config ?? {},
              description: plannerNode.description ?? catalogNode?.description,
              providerId: metadata.providerId ?? catalogNode?.providerId,
              icon: catalogNode?.icon,
              isTrigger: metadata.isTrigger ?? false,
              state: 'skeleton',
              aiStatus: 'skeleton',
              agentHighlights: metadata.agentHighlights ?? [],
              costHint: plannerNode.costHint ?? 0,
            },
            className: 'node-skeleton',
            style: {
              // Force exact alignment - override any CSS causing offset
              margin: 0,
              marginTop: 0,
              marginBottom: 0,
              verticalAlign: 'top',
              alignSelf: 'flex-start',
              top: 0,
            },
          }
        }).filter(Boolean)

        // Create all edges - connect half-moon to half-moon directly
        const allEdges = []
        for (let i = 1; i < allNodes.length; i++) {
          allEdges.push({
            id: `${allNodes[i-1].id}-${allNodes[i].id}`,
            source: allNodes[i-1].id,
            target: allNodes[i].id,
            sourceHandle: 'source',
            targetHandle: 'target',
            type: 'custom', // Align with FlowEdge styling used in ready state
            style: {
              stroke: '#94a3b8',
              strokeWidth: 2,
            },
          })
        }

        console.log('[handleBuild] Preparing to add nodes one at a time:', {
          count: allNodes.length,
          positions: allNodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y })),
          edges: allEdges.map(e => ({ id: e.id, source: e.source, target: e.target }))
        })

        // STEP 4: Add nodes one at a time with animation
        const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

        // Start with empty nodes and edges
        builder.setNodes([])
        builder.setEdges([])

        // Add nodes one at a time
        for (let i = 0; i < allNodes.length; i++) {
          const node = allNodes[i]
          console.log(`[handleBuild] Adding node ${i + 1}/${allNodes.length}:`, node.id)

          // Add the node
          builder.setNodes(prev => [...prev, node])

          // Add edge if this isn't the first node
          if (i > 0) {
            const edge = allEdges[i - 1]
            builder.setEdges(prev => [...prev, edge])
          }

          // Wait 700ms before adding next node (slower, more visible)
          await wait(700)
        }

        console.log('[handleBuild] All nodes added, waiting before zoom animation')

        // Force positions to stay fixed - check multiple times
        // React Flow sometimes repositions nodes after initial render
        const fixPositions = () => {
          const currentNodes = reactFlowInstanceRef.current?.getNodes()
          if (!currentNodes) return false

          console.log('[handleBuild] Position check:',
            currentNodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y }))
          )

          // Check if any Y positions changed
          const needsFixing = currentNodes.some(node => {
            const originalNode = allNodes.find(n => n.id === node.id)
            return originalNode && Math.abs(node.position.y - originalNode.position.y) > 5
          })

          if (needsFixing) {
            console.log('[handleBuild] ⚠️ Positions changed! Forcing back to Y=' + BASE_Y)
            const fixedNodes = currentNodes.map(node => {
              const originalNode = allNodes.find(n => n.id === node.id)
              if (originalNode) {
                return {
                  ...node,
                  position: {
                    ...node.position,
                    y: BASE_Y, // Force all nodes to same Y
                  }
                }
              }
              return node
            })
            builder.setNodes(fixedNodes)
            return true
          }
          return false
        }

        // Check positions at 100ms, 300ms, 600ms, and 1000ms
        setTimeout(() => fixPositions(), 100)
        setTimeout(() => fixPositions(), 300)
        setTimeout(() => fixPositions(), 600)
        setTimeout(() => fixPositions(), 1000)

        setBuildMachine(prev => ({
          ...prev,
          nodesCache: allNodes,
        }))

        // STEP 5: Wait longer after all nodes added so user sees them all in skeleton state
        await wait(1000)

        // Log actual node positions after render
        if (reactFlowInstanceRef.current) {
          const currentNodes = reactFlowInstanceRef.current.getNodes()
          console.log('[handleBuild] Actual node positions after render:',
            currentNodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y }))
          )
        }

        const firstNode = allNodes[0]

        // STEP 6: Transition first node to ready state after all nodes visible
        console.log('[handleBuild] Transitioning first node to ready state')
        const firstPlanNode = buildMachine.plan[0]
        // Use allNodes[0].id directly instead of relying on state mapping
        const firstReactNodeId = allNodes[0]?.id

        console.log('[handleBuild] First node transition:', {
          firstPlanNode: firstPlanNode?.id,
          firstReactNodeId,
          firstNodeFromArray: allNodes[0]?.id,
          hasBuilder: !!builder,
          hasInstance: !!reactFlowInstanceRef.current
        })

        if (firstReactNodeId && reactFlowInstanceRef.current) {
          console.log('[handleBuild] ✨ TRANSITIONING NODE FROM SKELETON TO READY:', firstReactNodeId)

          setNodeState(reactFlowInstanceRef.current, firstReactNodeId, 'ready')
          builder.setNodes((current: any[]) => {
            const working = current && current.length > 0 ? current : (buildMachine.nodesCache ?? [])
            const updated = working.map(node => {
              if (node.id === firstReactNodeId) {
                console.log('[handleBuild] 🎯 Updating node data:', {
                  nodeId: node.id,
                  oldState: node.data?.state,
                  newState: 'ready',
                  oldAiStatus: node.data?.aiStatus,
                  newAiStatus: 'awaiting_user'
                })
                return {
                  ...node,
                  data: {
                    ...node.data,
                    state: 'ready',
                    aiStatus: 'awaiting_user',
                  },
                  className: 'node-ready',
                }
              }
              return node
            })
            console.log('[handleBuild] Updated nodes count:', updated.length)
            return updated
          })

          // Wait longer for state transition to be visible before zoom
          await wait(600)
        } else {
          console.log('[handleBuild] ⚠️ Cannot transition first node - missing ID or instance')
        }

        // STEP 7: Zoom to first node with animation
        console.log('[handleBuild] Starting zoom animation to first node')
        if (reactFlowInstanceRef.current && firstNode) {
          const instance = reactFlowInstanceRef.current

          // Pan to the LEFT (negative adjustment) so nodes appear more to the RIGHT
          // This keeps them out from under the agent panel
          const nodeCenterX = firstNode.position.x - 150 // Pan 150px to the left
          const nodeCenterY = firstNode.position.y + 50 // Vertical center

          console.log('[handleBuild] Zoom calculation:', {
            agentPanelWidth,
            nodeCenterX,
            nodeCenterY,
            nodePosition: firstNode.position,
            panAdjustment: '-150px to left'
          })

          // Zoom to first node with smooth animation
          instance.setCenter(nodeCenterX, nodeCenterY, {
            zoom: 1.0, // Keep at 1x zoom to ensure all nodes stay visible
            duration: 1200, // 1.2 second animation (smooth)
          })

          // Wait for zoom animation to complete
          await wait(1400)
        }

        // STEP 8: Update status and transition to WAITING_USER
        await persistOrQueueStatus("Flow ready ✅")

        setBuildMachine(prev => ({
          ...prev,
          progress: { ...prev.progress, currentIndex: 0, total: buildMachine.plan.length },
        }))

        transitionTo(BuildState.WAITING_USER)
      }, 100) // Small delay to let React update

    } catch (error: any) {
      toast({
        title: "Build failed",
        description: error?.message || "Unable to build workflow skeleton",
        variant: "destructive",
      })
      transitionTo(BuildState.PLAN_READY)
      await persistOrQueueStatus("Build failed ❌")
    }
  }, [actions, agentPanelWidth, buildMachine, builder?.nodes, builder?.setNodes, isIntegrationConnected, persistOrQueueStatus, toast, transitionTo, setBuildMachine])

  const handleContinueNode = useCallback(async () => {
    console.log('[handleContinueNode] Starting...')
    const currentIndex = buildMachine.progress.currentIndex
    console.log('[handleContinueNode] currentIndex:', currentIndex)
    console.log('[handleContinueNode] buildMachine.nodeMapping:', buildMachine.nodeMapping)
    console.log('[handleContinueNode] buildMachine.nodesCache:', buildMachine.nodesCache)

    if (currentIndex < 0 || !buildMachine.plan[currentIndex]) {
      console.log('[handleContinueNode] Invalid index or no plan node')
      return
    }
    if (!builder?.setNodes) {
      console.log('[handleContinueNode] No builder setNodes')
      return
    }

    const planNode = buildMachine.plan[currentIndex]
    console.log('[handleContinueNode] planNode:', planNode)

    // Use the mapping to find the ReactFlow node ID
    const reactFlowNodeId = buildMachine.nodeMapping?.[planNode.id]
    console.log('[handleContinueNode] Looking for ReactFlow node ID:', reactFlowNodeId)

    if (!reactFlowNodeId) {
      console.log('[handleContinueNode] No mapping found for plan node:', planNode.id)
      toast({
        title: "Node mapping error",
        description: "Could not find the workflow node mapping. Please try rebuilding.",
        variant: "destructive",
      })
      return
    }

    // Try to find node in cached nodes first, then fall back to builder.nodes
    let reactFlowNode = buildMachine.nodesCache?.find(n => n.id === reactFlowNodeId)

    if (!reactFlowNode) {
      console.log('[handleContinueNode] Node not in cache, checking builder.nodes...')
      reactFlowNode = builder.nodes?.find(n => n.id === reactFlowNodeId)
    }

    console.log('[handleContinueNode] reactFlowNode:', reactFlowNode)

    if (!reactFlowNode) {
      console.log('[handleContinueNode] No reactFlowNode found with ID:', reactFlowNodeId)
      console.log('[handleContinueNode] builder.nodes:', builder.nodes)
      console.log('[handleContinueNode] nodesCache:', buildMachine.nodesCache)
      toast({
        title: "Node not found",
        description: "Could not find the workflow node. Please try rebuilding.",
        variant: "destructive",
      })
      return
    }

    console.log('[handleContinueNode] Transitioning to PREPARING_NODE')
    transitionTo(BuildState.PREPARING_NODE)

    try {
      const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
      const userConfig = nodeConfigs[planNode.id] || {}
      const nodeComponent = ALL_NODE_COMPONENTS.find(component => component.type === planNode.nodeType)
      const configSchema = nodeComponent?.configSchema ?? []

      const prioritizedFields = [
        ...configSchema.filter(field => field?.required && !field?.hidden),
        ...configSchema.filter(field => !field?.required && !field?.hidden),
      ]

      const seenFieldNames = new Set<string>()
      const uniqueFields = prioritizedFields.filter(field => {
        if (!field?.name || seenFieldNames.has(field.name)) return false
        seenFieldNames.add(field.name)
        return true
      })

      const existingConfig = (reactFlowNode?.data?.config ?? {}) as Record<string, any>
      const fieldsToPopulate = uniqueFields
        .filter(field => existingConfig[field.name] === undefined && userConfig[field.name] === undefined)
        .slice(0, 6)

      const progressEntries: Array<{ key: string; value: any; displayValue?: string }> = []

      const generateAIValue = (field: any, index: number) => {
        const label = (field?.label || field?.name || `Field ${index + 1}`).trim()
        const normalizedName = (field?.name || '').toLowerCase()

        if (normalizedName.includes('channel')) return '#general'
        if (normalizedName.includes('email')) return `team${index + 1}@example.com`
        if (normalizedName.includes('subject')) return `AI Draft: ${label}`
        if (normalizedName.includes('name')) return `${label} (auto-generated)`
        if (normalizedName.includes('message') || normalizedName.includes('body') || field?.type === 'textarea') {
          return `Automatically generated ${label.toLowerCase()} for this workflow step.`
        }
        if (normalizedName.includes('title')) {
          return `${label} — generated for ${planNode.title}`
        }
        return `AI suggestion for ${label}`
      }

      const applyNodeUpdate = (transform: (node: any) => any) => {
        let updatedNode = reactFlowNode
        builder.setNodes((current: any[]) => {
          const working = current && current.length > 0 ? current : (buildMachine.nodesCache ?? [])
          const nextNodes = working.map(node => {
            if (node.id !== reactFlowNode.id) return node
            updatedNode = transform(node)
            return updatedNode
          })
          return nextNodes
        })
        reactFlowNode = updatedNode
      }

      if (reactFlowInstanceRef.current) {
        // Extract savedDynamicOptions from userConfig (special key set by FlowV2AgentPanel)
        const { __savedDynamicOptions__, ...regularConfig } = userConfig

        applyNodeUpdate(node => ({
          ...node,
          data: {
            ...node.data,
            config: {
              ...(node.data?.config ?? {}),
              ...regularConfig, // Apply regular config (without __savedDynamicOptions__)
            },
            savedDynamicOptions: __savedDynamicOptions__ || node.data?.savedDynamicOptions, // Add savedDynamicOptions to node data
            aiStatus: 'preparing',
            state: 'ready',
            aiProgressConfig: progressEntries,
          },
          className: 'node-ready',
        }))

        await wait(150)
        setNodeState(reactFlowInstanceRef.current, reactFlowNode.id, 'ready')
        await wait(250)

        if (fieldsToPopulate.length > 0) {
          applyNodeUpdate(node => ({
            ...node,
            data: {
              ...node.data,
              aiStatus: 'configuring',
              aiProgressConfig: [...progressEntries],
            },
          }))

          for (let index = 0; index < fieldsToPopulate.length; index++) {
            const field = fieldsToPopulate[index]
            const aiValue = generateAIValue(field, index)
            const displayValue = typeof aiValue === 'string' ? aiValue : JSON.stringify(aiValue)
            progressEntries.push({
              key: field.name,
              value: aiValue,
              displayValue,
            })

            // Extract savedDynamicOptions from userConfig
            const { __savedDynamicOptions__, ...regularConfig } = userConfig

            applyNodeUpdate(node => ({
              ...node,
              data: {
                ...node.data,
                aiStatus: 'configuring',
                aiProgressConfig: [...progressEntries],
                config: {
                  ...(node.data?.config ?? {}),
                  ...regularConfig,
                  [field.name]: aiValue,
                },
                savedDynamicOptions: __savedDynamicOptions__ || node.data?.savedDynamicOptions,
              },
            }))

            await wait(350)
          }
        } else {
          applyNodeUpdate(node => ({
            ...node,
            data: {
              ...node.data,
              aiStatus: 'configuring',
              aiProgressConfig: [],
            },
          }))
          await wait(300)
        }

        transitionTo(BuildState.TESTING_NODE)

        applyNodeUpdate(node => ({
          ...node,
          data: {
            ...node.data,
            aiStatus: 'testing',
          },
        }))
        setNodeState(reactFlowInstanceRef.current, reactFlowNode.id, 'running')
        await wait(500)

        // Execute REAL test for actions, validate for triggers
        let testResult
        const catalog = ALL_NODE_COMPONENTS.find(c => c.type === planNode.nodeType)
        const isTrigger = catalog?.isTrigger || false

        try {
          if (isTrigger) {
            // For triggers: just validate configuration
            // Webhooks are created on workflow activation, not during testing
            console.log('[WorkflowBuilderV2] 📋 Validating trigger configuration:', planNode.nodeId)

            // Check if connection exists
            const connectionId = userConfig.connection
            if (!connectionId) {
              throw new Error('No integration connected')
            }

            testResult = {
              success: true,
              message: '✅ Trigger configuration validated',
              testData: { validated: true, trigger: true }
            }

            await wait(600) // Brief pause to show testing state
          } else {
            // For actions: execute REAL API call
            console.log('[WorkflowBuilderV2] 🧪 Executing real action test:', planNode.nodeId)

            // Use the complete config from the node, which includes both user config and AI-generated values
            const completeConfig = reactFlowNode.data.config || userConfig

            testResult = await actionTestService.testAction({
              userId: builder.userId!,
              workflowId: builder.id!,
              nodeId: planNode.nodeId,
              nodeType: planNode.nodeType,
              providerId: planNode.providerId || '',
              config: completeConfig,
              integrationId: completeConfig.connection || userConfig.__savedDynamicOptions__?.integrationId || ''
            })
          }

          console.log('[WorkflowBuilderV2] Test result:', testResult)

        } catch (error: any) {
          console.error('[WorkflowBuilderV2] Test failed:', error)
          testResult = {
            success: false,
            message: error.message || 'Test failed',
            error: {
              code: error.code || 'TEST_FAILED',
              message: error.message,
              details: error
            }
          }
        }

        if (testResult.success) {
          setNodeState(reactFlowInstanceRef.current, reactFlowNode.id, 'passed')
          applyNodeUpdate(node => ({
            ...node,
            data: {
              ...node.data,
              aiStatus: 'ready',
              state: 'passed',
              testResult: testResult.testData // Store test data
            },
          }))
        } else {
          setNodeState(reactFlowInstanceRef.current, reactFlowNode.id, 'failed')
          applyNodeUpdate(node => ({
            ...node,
            data: {
              ...node.data,
              aiStatus: 'error',
              state: 'failed',
              testError: testResult.error // Store error for display
            },
          }))

          // Show error to user
          toast({
            title: "Test Failed",
            description: testResult.message,
            variant: "destructive"
          })

          throw new Error(testResult.message)
        }
      }

      setBuildMachine(prev => ({
        ...prev,
        nodesCache: builder.nodes ?? prev.nodesCache,
      }))

      // STEP 8: Move to next node or complete
      const nextIndex = currentIndex + 1
      if (nextIndex >= buildMachine.plan.length) {
        setBuildMachine(prev => ({
          ...prev,
          progress: { ...prev.progress, currentIndex: nextIndex, done: nextIndex },
        }))
        transitionTo(BuildState.COMPLETE)
      } else {
        setBuildMachine(prev => ({
          ...prev,
          progress: { ...prev.progress, currentIndex: nextIndex, done: nextIndex },
        }))
        transitionTo(BuildState.WAITING_USER)

        const nextPlanNode = buildMachine.plan[nextIndex]
        const nextReactNodeId = nextPlanNode ? buildMachine.nodeMapping?.[nextPlanNode.id] : null

        if (nextReactNodeId && reactFlowInstanceRef.current) {
          setNodeState(reactFlowInstanceRef.current, nextReactNodeId, 'ready')
          builder.setNodes((current: any[]) => {
            const working = current && current.length > 0 ? current : (buildMachine.nodesCache ?? [])
            return working.map(node => {
              if (node.id !== nextReactNodeId) return node
              return {
                ...node,
                data: {
                  ...node.data,
                  state: 'ready',
                  aiStatus: 'awaiting_user',
                },
                className: 'node-ready',
              }
            })
          })
        }

        // STEP 9: No camera panning - keep viewport where user positioned it
        // Camera was positioned perfectly after "Build", so we maintain that view
        // during the guided setup flow
      }
    } catch (error: any) {
      toast({
        title: "Node configuration failed",
        description: error?.message || "Unable to configure node",
        variant: "destructive",
      })

      // Mark node as failed
      if (reactFlowInstanceRef.current && reactFlowNode) {
        setNodeState(reactFlowInstanceRef.current, reactFlowNode.id, 'failed')
      }

      transitionTo(BuildState.WAITING_USER)
    }
  }, [buildMachine, builder?.nodes, builder?.setNodes, nodeConfigs, toast, transitionTo, setBuildMachine])

  const handleSkipNode = useCallback(() => {
    const nextIndex = buildMachine.progress.currentIndex + 1
    if (nextIndex >= buildMachine.plan.length) {
      setBuildMachine(prev => ({
        ...prev,
        progress: { ...prev.progress, currentIndex: nextIndex, done: nextIndex },
      }))
      transitionTo(BuildState.COMPLETE)
    } else {
      setBuildMachine(prev => ({
        ...prev,
        progress: { ...prev.progress, currentIndex: nextIndex },
      }))
      transitionTo(BuildState.WAITING_USER)
    }
  }, [buildMachine.plan.length, buildMachine.progress.currentIndex, transitionTo])

  const handleNodeConfigChange = useCallback((nodeId: string, fieldName: string, value: any) => {
    setNodeConfigs(prev => ({
      ...prev,
      [nodeId]: {
        ...prev[nodeId],
        [fieldName]: value
      }
    }))
  }, [])

  const handleCancelBuild = useCallback(() => {
    transitionTo(BuildState.PLAN_READY)
  }, [transitionTo])

  const handleUndoToPreviousStage = useCallback(() => {
    transitionTo(BuildState.PLAN_READY)
  }, [transitionTo])

  // Path menu handlers for PathLabelsOverlay
  const handleTogglePathCollapse = useCallback((pathId: string) => {
    if (!builder?.nodes || !builder?.edges || !builder.setNodes) return

    const isCurrentlyCollapsed = collapsedPaths.has(pathId)

    // Find the edge that represents this path
    const pathEdge = builder.edges.find((e: any) => e.id === pathId)
    if (!pathEdge) return

    // Find the target node (Path Condition node)
    const pathConditionNode = builder.nodes.find((n: any) => n.id === pathEdge.target)
    if (!pathConditionNode) return

    // Helper function to find all descendant nodes in a path
    const findDescendantNodes = (startNodeId: string): string[] => {
      const descendants: string[] = []
      const toVisit = [startNodeId]
      const visited = new Set<string>()

      while (toVisit.length > 0) {
        const currentId = toVisit.shift()!
        if (visited.has(currentId)) continue
        visited.add(currentId)
        descendants.push(currentId)

        // Find all edges from this node
        const outgoingEdges = builder.edges.filter((e: any) => e.source === currentId)
        for (const edge of outgoingEdges) {
          if (!visited.has(edge.target)) {
            toVisit.push(edge.target)
          }
        }
      }

      return descendants
    }

    // Get all nodes in this path (including the path condition node)
    const pathNodeIds = findDescendantNodes(pathConditionNode.id)

    // Toggle visibility of all nodes in this path
    const updatedNodes = builder.nodes.map((node: any) => {
      if (pathNodeIds.includes(node.id)) {
        return {
          ...node,
          hidden: !isCurrentlyCollapsed, // Toggle: if currently collapsed, show; if shown, hide
        }
      }
      return node
    })

    builder.setNodes(updatedNodes)

    // Update collapsed state
    setCollapsedPaths((prev) => {
      const next = new Set(prev)
      if (isCurrentlyCollapsed) {
        next.delete(pathId)
      } else {
        next.add(pathId)
      }
      return next
    })
  }, [builder, collapsedPaths])

  const handleRenamePath = useCallback((pathId: string) => {
    // TODO: Open rename dialog
    const newName = prompt('Enter new path name:')
    if (newName) {
      setPathLabels((prev) => ({ ...prev, [pathId]: newName }))
      // Also update the node config
      const edge = builder?.edges?.find((e: any) => e.id === pathId)
      if (edge && builder?.nodes) {
        const targetNode = builder.nodes.find((n: any) => n.id === edge.target)
        if (targetNode && builder.updateNodeData) {
          builder.updateNodeData(targetNode.id, {
            ...targetNode.data,
            config: {
              ...targetNode.data.config,
              pathName: newName,
            },
          })
        }
      }
    }
  }, [builder])

  const handleDuplicatePath = useCallback(async (pathId: string) => {
    // TODO: Implement path duplication
    toast({ title: 'Duplicate Path', description: 'Path duplication coming soon!' })
  }, [toast])

  const handleCopyPath = useCallback((pathId: string) => {
    // TODO: Implement path copy to clipboard
    toast({ title: 'Copy Path', description: 'Path copied to clipboard!' })
  }, [toast])

  const handleAddPathNote = useCallback((pathId: string) => {
    // TODO: Implement path note
    toast({ title: 'Add Note', description: 'Path notes coming soon!' })
  }, [toast])

  const handleDeletePath = useCallback(async (pathId: string) => {
    if (!confirm('Are you sure you want to delete this path?')) return

    // Find the edge and target node
    const edge = builder?.edges?.find((e: any) => e.id === pathId)
    if (edge && builder?.nodes) {
      const targetNode = builder.nodes.find((n: any) => n.id === edge.target)
      if (targetNode) {
        // Delete all nodes in this path
        await handleDeleteNodes([targetNode.id])
        // Remove from collapsed paths if present
        setCollapsedPaths((prev) => {
          const next = new Set(prev)
          next.delete(pathId)
          return next
        })
        // Remove from path labels
        setPathLabels((prev) => {
          const next = { ...prev }
          delete next[pathId]
          return next
        })
      }
    }
  }, [builder, handleDeleteNodes])

  // Auto-create 2 paths when Path Router is added (Zapier-style)
  // Track which routers are currently being processed to prevent race conditions
  const processingRoutersRef = useRef<Set<string>>(new Set())
  const autoCreateTimeoutRef = useRef<NodeJS.Timeout>()

  useEffect(() => {
    if (!builder?.nodes || !builder?.edges || !actions) return

    // Debounce to prevent multiple simultaneous executions
    if (autoCreateTimeoutRef.current) {
      clearTimeout(autoCreateTimeoutRef.current)
    }

    autoCreateTimeoutRef.current = setTimeout(async () => {
      // Find Path Router nodes that don't have any connected Path Condition nodes
      const routerNodes = builder.nodes.filter((node: any) => node.data?.type === 'path')

      for (const routerNode of routerNodes) {
        // Skip if already processing this router
        if (processingRoutersRef.current.has(routerNode.id)) {
          console.log('[Path Router] Already processing router:', routerNode.id)
          continue
        }

        // Check if this router already has path condition nodes
        const connectedEdges = builder.edges.filter((e: any) => e.source === routerNode.id)
        const hasPathConditions = connectedEdges.some((edge: any) => {
          const targetNode = builder.nodes.find((n: any) => n.id === edge.target)
          return targetNode?.data?.type === 'path_condition'
        })

        // If no paths exist, auto-create 2 paths
        if (!hasPathConditions) {
          // Mark as processing
          processingRoutersRef.current.add(routerNode.id)
          console.log('[Path Router] Auto-creating 2 paths for router:', routerNode.id)

          try {
            // Create Path A (left) - 250px to the left
            const pathAPosition = {
              x: routerNode.position.x - 250,
              y: routerNode.position.y + 200
            }
            await actions.addNode('path_condition', pathAPosition)

            // Wait a moment for the node to be added to the state
            await new Promise(resolve => setTimeout(resolve, 150))

            // Find the newly created Path A node
            const pathANode = builder.nodes.find((n: any) =>
              n.data?.type === 'path_condition' &&
              Math.abs(n.position.x - pathAPosition.x) < 10 &&
              Math.abs(n.position.y - pathAPosition.y) < 10
            )

            // Create Path B (right) - 250px to the right
            const pathBPosition = {
              x: routerNode.position.x + 250,
              y: routerNode.position.y + 200
            }
            await actions.addNode('path_condition', pathBPosition)

            // Wait a moment for the node to be added
            await new Promise(resolve => setTimeout(resolve, 150))

            // Find the newly created Path B node
            const pathBNode = builder.nodes.find((n: any) =>
              n.data?.type === 'path_condition' &&
              Math.abs(n.position.x - pathBPosition.x) < 10 &&
              Math.abs(n.position.y - pathBPosition.y) < 10
            )

            // Connect router to both paths
            if (pathANode) {
              await actions.connectEdge({
                sourceId: routerNode.id,
                targetId: pathANode.id,
                sourceHandle: 'path_0'
              })
            }

            if (pathBNode) {
              await actions.connectEdge({
                sourceId: routerNode.id,
                targetId: pathBNode.id,
                sourceHandle: 'path_1'
              })
            }

            console.log('[Path Router] Successfully created 2 paths')
          } catch (error) {
            console.error('[Path Router] Failed to auto-create paths:', error)
          } finally {
            // Always remove from processing set
            processingRoutersRef.current.delete(routerNode.id)
          }
        }
      }
    }, 300) // 300ms debounce

    // Cleanup timeout on unmount
    return () => {
      if (autoCreateTimeoutRef.current) {
        clearTimeout(autoCreateTimeoutRef.current)
      }
    }
  }, [builder?.nodes, builder?.edges, actions])

  // Auto-center Path Router nodes (Zapier-style 300ms animation)
  useEffect(() => {
    if (!builder?.nodes || !builder?.edges || !builder.setNodes) return

    // Find all Path Router nodes
    const routerNodes = builder.nodes.filter((node: any) => node.data?.type === 'path')
    if (routerNodes.length === 0) return

    let needsUpdate = false
    const updatedNodes = builder.nodes.map((node: any) => {
      if (node.data?.type === 'path') {
        // Find all connected Path Condition nodes
        const connectedEdges = builder.edges.filter((e: any) => e.source === node.id)
        const pathConditionNodes = connectedEdges
          .map((edge: any) => builder.nodes.find((n: any) => n.id === edge.target))
          .filter((n: any) => n && n.data?.type === 'path_condition')

        if (pathConditionNodes.length === 0) return node

        // Calculate center X position of all path nodes
        const totalX = pathConditionNodes.reduce((sum: number, n: any) => sum + n.position.x, 0)
        const centerX = totalX / pathConditionNodes.length

        // Calculate desired router X position (centered above paths)
        const desiredX = centerX

        // Only update if position changed significantly (>5px to avoid jitter)
        const currentX = node.position.x
        if (Math.abs(desiredX - currentX) > 5) {
          needsUpdate = true
          return {
            ...node,
            position: {
              ...node.position,
              x: desiredX,
            },
            // Add style for smooth animation
            style: {
              ...node.style,
              transition: 'transform 300ms cubic-bezier(0.4, 0, 0.2, 1)',
            },
          }
        }
      }
      return node
    })

    // Only update if we actually need to move a router
    if (needsUpdate) {
      // Use requestAnimationFrame for smooth animation
      requestAnimationFrame(() => {
        if (builder.setNodes) {
          builder.setNodes(updatedNodes)
        }
      })
    }
  }, [builder?.nodes, builder?.edges, builder?.setNodes])

  // Apply node styling based on node state (not build progress)
  useEffect(() => {
    if (!builder?.nodes || buildMachine.state === BuildState.IDLE) {
      return
    }

    const { state, progress } = buildMachine

    // Apply CSS classes based on actual node state
    const updatedNodes = builder.nodes.map((node, index) => {
      const nodeState = node.data?.state || 'ready'
      let className = ''

      if (state === BuildState.BUILDING_SKELETON) {
        // All nodes are grey during skeleton building
        className = 'node-skeleton node-grey'
      } else {
        // Use node's actual state to determine styling
        if (nodeState === 'skeleton') {
          className = 'node-skeleton node-grey'
        } else if (nodeState === 'ready') {
          // Ready node waiting for user interaction
          if (index === progress.currentIndex) {
            className = 'node-ready' // Current node ready for configuration
          } else {
            className = 'node-ready' // Ready but not current
          }
        } else if (nodeState === 'running') {
          className = 'node-active' // Node is being configured/tested
        } else if (nodeState === 'passed' || nodeState === 'failed') {
          className = 'node-done' // Node completed (never changes back)
        }
      }

      return {
        ...node,
        className,
      }
    })

    // Only update if classes actually changed
    const hasChanges = updatedNodes.some((node, i) => node.className !== builder.nodes[i].className)
    if (hasChanges && builder.setNodes) {
      builder.setNodes(updatedNodes)
    }
  }, [buildMachine.state, buildMachine.progress, builder])

  // Clear node selection during build states to prevent accidental mass deletion
  useEffect(() => {
    const isBuildActive =
      buildMachine.state === BuildState.BUILDING_SKELETON ||
      buildMachine.state === BuildState.WAITING_USER ||
      buildMachine.state === BuildState.PREPARING_NODE ||
      buildMachine.state === BuildState.CONFIGURING_NODE ||
      buildMachine.state === BuildState.TESTING_NODE

    if (isBuildActive && builder?.nodes && builder.setNodes) {
      // Check if any nodes are actually selected before updating
      const hasSelectedNodes = builder.nodes.some(node => node.selected === true)

      if (hasSelectedNodes) {
        console.log('[WorkflowBuilderV2] Clearing node selection during build state:', buildMachine.state)
        const updatedNodes = builder.nodes.map(node => ({
          ...node,
          selected: false,
        }))
        builder.setNodes(updatedNodes)
      }
    }
    // Only depend on buildMachine.state to avoid infinite loops
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildMachine.state])

  // Get cost breakdown for CostDisplay
  const costBreakdown = useMemo(() => {
    return costTrackerRef.current?.getCostBreakdown() ?? []
  }, [costActual])

  // Header props matching legacy structure
  const headerProps = useMemo(() => ({
    workflowName,
    setWorkflowName: handleNameChange,
    hasUnsavedChanges: nameDirty || Boolean(flowState?.hasUnsavedChanges),
    isSaving: flowState?.isSaving ?? false,
    isExecuting: false,
    handleSave: nameDirty
      ? () => persistName(workflowName.trim())
      : async () => {},
    handleToggleLive: comingSoon,
    isUpdatingStatus: false,
    currentWorkflow: null,
    workflowId: flowId,
    editTemplateId: null,
    isTemplateEditing: false,
    onOpenTemplateSettings: undefined,
    templateSettingsLabel: undefined,
    handleTestSandbox: comingSoon,
    handleExecuteLive: comingSoon,
    handleExecuteLiveSequential: comingSoon,
    handleRunPreflight: comingSoon,
    isRunningPreflight: false,
    isStepMode: false,
    listeningMode: false,
    handleUndo: builder?.handleUndo ?? comingSoon,
    handleRedo: builder?.handleRedo ?? comingSoon,
    canUndo: builder?.canUndo ?? false,
    canRedo: builder?.canRedo ?? false,
    setShowExecutionHistory: () => {},
  }), [builder, comingSoon, flowId, flowState?.hasUnsavedChanges, flowState?.isSaving, handleNameChange, nameDirty, persistName, workflowName])

  if (!builder || !actions || flowState?.isLoading) {
    return <WorkflowLoadingScreen />
  }

  return (
    <TooltipProvider>
      <BuilderLayout headerProps={headerProps} workflowId={flowId}>
        {/* Main Canvas Area - Matching legacy structure */}
        <div
          style={{ height: "100%", width: "100%", position: "relative" }}
        >
          {/* Cost Display in Top Right */}
          {(costEstimate !== undefined || costActual !== undefined) && (
            <div className="absolute top-4 right-4 z-50">
              <CostDisplay
                estimate={costEstimate}
                actual={costActual}
                breakdown={costBreakdown}
                variant="header"
              />
            </div>
          )}

          <FlowV2BuilderContent
            nodes={reactFlowProps?.nodes ?? []}
            edges={reactFlowProps?.edges ?? []}
            onNodesChange={reactFlowProps?.onNodesChange}
            onEdgesChange={reactFlowProps?.onEdgesChange}
            onConnect={reactFlowProps?.onConnect}
            nodeTypes={reactFlowProps?.nodeTypes}
            edgeTypes={reactFlowProps?.edgeTypes}
            onSelectionChange={handleSelectionChange}
            onNodeDelete={handleNodeDelete}
            onDeleteNodes={handleDeleteNodes}
            onInit={(instance) => { reactFlowInstanceRef.current = instance }}
            agentPanelWidth={agentPanelWidth}
            isAgentPanelOpen={agentOpen}
            buildState={buildMachine.state}
            badge={buildMachine.badge}
            isIntegrationsPanelOpen={isIntegrationsPanelOpen}
            setIsIntegrationsPanelOpen={setIsIntegrationsPanelOpen}
            onNodeSelect={handleNodeSelectFromPanel}
            onNodeConfigure={handleNodeConfigure}
            onUndoToPreviousStage={handleUndoToPreviousStage}
            onCancelBuild={handleCancelBuild}
          >
            {/* Path Labels Overlay - Zapier-style floating pills */}
            <PathLabelsOverlay
              collapsedPaths={collapsedPaths}
              pathLabels={pathLabels}
              onToggleCollapse={handleTogglePathCollapse}
              onRename={handleRenamePath}
              onDuplicate={handleDuplicatePath}
              onCopy={handleCopyPath}
              onAddNote={handleAddPathNote}
              onDelete={handleDeletePath}
            />
          </FlowV2BuilderContent>

          <FlowV2AgentPanel
            layout={{
              isOpen: agentOpen,
              width: agentPanelWidth,
              onClose: () => setAgentOpen(false),
            }}
            state={{
              buildMachine,
              agentInput,
              isAgentLoading,
              agentMessages,
              nodeConfigs,
              awaitingProviderSelection,
              providerCategory,
            }}
            actions={{
              onInputChange: value => setAgentInput(value),
              onSubmit: handleAgentSubmit,
              onBuild: handleBuild,
              onContinueNode: handleContinueNode,
              onSkipNode: handleSkipNode,
              onUndoToPreviousStage: handleUndoToPreviousStage,
              onCancelBuild: handleCancelBuild,
              onNodeConfigChange: handleNodeConfigChange,
              onProviderSelect: handleProviderSelect,
              onProviderConnect: handleProviderConnect,
              onProviderChange: handleProviderChange,
            }}
          />

          {/* Agent Toggle Button (when closed) */}
          {!agentOpen && (
            <Button
              onClick={() => setAgentOpen(true)}
              className="fixed left-0 top-1/2 -translate-y-1/2 z-40 rounded-l-none rounded-r-lg shadow-lg px-3 py-2 flex-col gap-1 h-auto"
              variant="default"
              style={{ marginTop: '32px' }}
            >
              <Sparkles className="w-4 h-4" />
              <span className="text-[10px]">Agent</span>
            </Button>
          )}

          {/* Node State Test Panel - Phase 1 Testing - Removed for cleaner UI */}
          {/* <NodeStateTestPanel /> */}
        </div>
      </BuilderLayout>

      {/* Configuration Modal - Renders outside layout for proper z-index */}
      {configuringNode && (() => {
        const nodeType = configuringNode?.data?.type || configuringNode?.type
        const nodeInfo = nodeType ? getNodeByType(nodeType) : null

        // Debug logging
        console.log('🔧 [WorkflowBuilder] Opening config for node:', {
          nodeId: configuringNode?.id,
          nodeType,
          nodeInfo: nodeInfo ? { type: nodeInfo.type, title: (nodeInfo as any).title, label: (nodeInfo as any).label } : null,
          nodeData: configuringNode?.data,
        })

        return (
          <ConfigurationModal
            isOpen={!!configuringNode}
            onClose={() => setConfiguringNode(null)}
            onSave={(config) => {
              handleSaveNodeConfig(configuringNode.id, config)
              setConfiguringNode(null)
            }}
            nodeInfo={nodeInfo}
            integrationName={configuringNode?.data?.providerId || nodeType || 'Unknown'}
            initialData={configuringNode?.data?.config || {}}
            workflowData={{
              nodes: reactFlowProps?.nodes ?? [],
              edges: reactFlowProps?.edges ?? [],
              id: flowId,
              name: workflowName,
            }}
            currentNodeId={configuringNode?.id}
            nodeTitle={configuringNode?.data?.title || null}
          />
        )
      })()}
    </TooltipProvider>
  )
}
