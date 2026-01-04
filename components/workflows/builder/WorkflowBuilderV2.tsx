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
  detectAllVagueTerms,
  detectSpecificApps,
  getProviderOptions,
  replaceVagueTermWithProvider,
  getProviderDisplayName,
  PROVIDER_CATEGORIES,
  type ProviderCategory,
  type DetectedApp,
  type VagueTermDetection,
} from "@/lib/workflows/ai-agent/providerDisambiguation"
import { loadWorkflowPreferences } from "@/stores/workflowPreferencesStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useWorkspaceContext } from "@/hooks/useWorkspaceContext"
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
import { WorkflowStatusBar } from "./WorkflowStatusBar"
import { TestModeDialog } from "@/components/workflows/TestModeDialog"
import { useWorkflowTestStore } from "@/stores/workflowTestStore"
import { TestModeConfig, TriggerTestMode, ActionTestMode } from "@/lib/services/testMode/types"
import { useAuthStore } from "@/stores/authStore"
import { useIntegrationSelection } from "@/hooks/workflows/useIntegrationSelection"
import { swapProviderInPlan, canSwapProviders, getProviderCategory } from "@/lib/workflows/ai-agent/providerSwapping"
import { matchTemplate, logTemplateMatch, logTemplateMiss } from "@/lib/workflows/ai-agent/templateMatching"
import { logPrompt, updatePrompt } from "@/lib/workflows/ai-agent/promptAnalytics"
import { logger } from '@/lib/utils/logger'
import { safeLocalStorageSet } from '@/lib/utils/storage-cleanup'
import { useAppContext } from "@/lib/contexts/AppContext"
import { useChatPersistence } from "@/hooks/workflows/builder/useChatPersistence"

type PendingChatMessage = {
  localId: string
  role: ChatMessage['role']
  text: string
  subtext?: string
  meta?: Record<string, any>
  createdAt?: string
}

type NodeTestCacheEntry = {
  data: Record<string, any>
  result: {
    success: boolean
    executionTime?: number
    timestamp?: string
    error?: string
    message?: string
    rawResponse?: any
  }
}

// Agent panel dimensions - Responsive to screen size
// Mobile (< 640px): 100% width - margin
// Tablet (640-1024px): 400px
// Desktop (1024-1600px): 420px (design spec)
// Large Desktop (≥ 1600px): 25% of viewport, max 600px
const AGENT_PANEL_MARGIN = 16 // Margin on each side
const AGENT_PANEL_MIN_WIDTH = 300 // Mobile minimum
const AGENT_PANEL_MAX_WIDTH = 600 // Large desktop maximum
const LINEAR_STACK_X = 400
const LINEAR_NODE_VERTICAL_GAP = 180

type MoveNodeResult = { newOrder: string[]; changed: boolean } | null

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

const isReorderableNode = (node: any) => {
  if (!node || node.type !== 'custom') return false
  const data = node.data || {}
  if (data.isTrigger) return false
  if (data.isPlaceholder) return false
  if (data.type === 'chain_placeholder') return false
  return true
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
  console.log('[planWorkflowWithTemplates] Starting...', { prompt, providerId })

  // Try template matching first (now async)
  console.log('[planWorkflowWithTemplates] Checking templates...')
  const match = await matchTemplate(prompt, providerId)
  console.log('[planWorkflowWithTemplates] Template match result:', match ? match.template.id : 'no match')

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
  console.log('[planWorkflowWithTemplates] No template match, falling back to LLM...')
  logTemplateMiss(prompt)

  // Log prompt analytics (LLM usage)
  console.log('[planWorkflowWithTemplates] Logging prompt analytics...')
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
  console.log('[planWorkflowWithTemplates] Prompt logged, calling askAgent...')

  const result = await actions.askAgent(prompt)
  console.log('[planWorkflowWithTemplates] ✅ askAgent returned:', { hasEdits: !!result?.edits })

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
  initialRevision?: any
}

export function WorkflowBuilderV2({ flowId, initialRevision }: WorkflowBuilderV2Props) {
  const searchParams = useSearchParams()
  const promptParam = searchParams?.get("prompt") ?? searchParams?.get("initialPrompt") ?? null

  // Use unified app context
  const appContext = useAppContext()
  const { isReady: appReady } = appContext

  const adapter = useFlowV2LegacyAdapter(flowId, { initialRevision })
  const { integrations, fetchIntegrations, setWorkspaceContext: setIntegrationWorkspaceContext } = useIntegrationStore()
  const { workspaceContext } = useWorkspaceContext()
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
  const [addingAfterNodeId, setAddingAfterNodeId] = useState<string | null>(null) // Persists while integrations panel is open
  const [changingNodeId, setChangingNodeId] = useState<string | null>(null) // Set when user wants to replace a node's type
  const [isFlowTesting, setIsFlowTesting] = useState(false) // True while testing flow from a node
  const [flowTestStatus, setFlowTestStatus] = useState<{ total: number; currentIndex: number; currentNodeLabel?: string } | null>(null)
  const [isFlowTestPaused, setIsFlowTestPaused] = useState(false) // True when flow test is paused
  const [isNodeTesting, setIsNodeTesting] = useState(false) // True while testing a single node
  const [nodeTestingName, setNodeTestingName] = useState<string | null>(null) // Name of node being tested
  const [isTestModeDialogOpen, setIsTestModeDialogOpen] = useState(false) // Test/Live mode dialog

  // Ref to track if test is in progress and abort controller for cleanup
  const testAbortControllerRef = useRef<AbortController | null>(null)
  const testSessionIdRef = useRef<string | null>(null)
  const isMountedRef = useRef(true)

  // Refs for polling execution status after HITL pause
  const pausedExecutionIdRef = useRef<string | null>(null)
  const executionPollIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const lastSyncedProgressRef = useRef<{
    currentNodeId: string | null
    completedNodes: string[]
  }>({ currentNodeId: null, completedNodes: [] })

  // CRITICAL FIX: Cache the last valid reactFlowProps to prevent nodes from disappearing
  // during production re-renders when builder temporarily has no nodes
  const lastValidReactFlowPropsRef = useRef<{
    nodes: any[]
    edges: any[]
    onNodesChange: any
    onEdgesChange: any
    onConnect: any
    nodeTypes: any
    edgeTypes: any
  } | null>(null)

  // Cleanup function to deactivate webhooks when test ends
  const cleanupTestTrigger = useCallback(async () => {
    const sessionId = testSessionIdRef.current
    if (!sessionId || !flowId) {
      console.log('[TEST] No test session to cleanup')
      return
    }

    console.log('[TEST] Cleaning up test trigger...', { sessionId, workflowId: flowId })
    try {
      await fetch('/api/workflows/test-trigger', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: flowId,
          testSessionId: sessionId,
        }),
      })
      console.log('[TEST] Test trigger cleaned up successfully')
    } catch (error) {
      console.error('[TEST] Failed to cleanup test trigger:', error)
    } finally {
      testSessionIdRef.current = null
    }
  }, [flowId])

  // CONSOLIDATED: Mount/unmount + resize handler + AI infrastructure init
  // Combined for better performance (fewer effect registrations)
  useEffect(() => {
    isMountedRef.current = true

    // Window resize handler
    const handleResize = () => {
      if (typeof window === "undefined") return
      const newWidth = computeReactAgentPanelWidth(window)
      setAgentPanelWidth(newWidth)
    }
    if (typeof window !== "undefined") {
      window.addEventListener('resize', handleResize)
    }

    // Initialize AI Agent infrastructure
    if (typeof window !== "undefined") {
      const preferReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      choreographerRef.current = new BuildChoreographer(preferReducedMotion)
      costTrackerRef.current = new CostTracker()

      // Restore agent panel state from localStorage
      const stored = window.localStorage.getItem("reactAgentPanelOpen")
      if (stored) {
        setAgentOpen(stored === "true")
      }
    }

    return () => {
      isMountedRef.current = false
      // Abort any ongoing test when unmounting
      if (testAbortControllerRef.current) {
        testAbortControllerRef.current.abort()
      }
      // Stop execution polling on unmount
      if (executionPollIntervalRef.current) {
        clearInterval(executionPollIntervalRef.current)
        executionPollIntervalRef.current = null
      }
      // Cleanup test trigger on unmount
      cleanupTestTrigger()
      // Remove resize listener
      if (typeof window !== "undefined") {
        window.removeEventListener('resize', handleResize)
      }
    }
  }, [cleanupTestTrigger])

  const [isIntegrationsPanelOpen, setIsIntegrationsPanelOpen] = useState(false)
  const [integrationsPanelMode, setIntegrationsPanelMode] = useState<'trigger' | 'action'>('action')
  const [configuringNode, setConfiguringNode] = useState<any>(null)

  // Agent panel state
  const [agentPanelWidth, setAgentPanelWidth] = useState(() =>
    computeReactAgentPanelWidth(typeof window === "undefined" ? undefined : window)
  )

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
  // Multi-provider disambiguation state (for prompts with multiple vague terms)
  const [pendingVagueTerms, setPendingVagueTerms] = useState<VagueTermDetection[]>([])
  const [providerSelections, setProviderSelections] = useState<Map<string, string>>(new Map())

  // Enhanced chat flow state
  const [pendingConnectionProvider, setPendingConnectionProvider] = useState<string | null>(null)
  const [pendingNodeConfigType, setPendingNodeConfigType] = useState<string | null>(null)
  const [collectedPreferences, setCollectedPreferences] = useState<Array<{
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
  }>>([])

  // Build state machine (Kadabra-style animated build)
  const [buildMachine, setBuildMachine] = useState<BuildStateMachine>(getInitialState())

  // Node configuration state (for user input during build)
  const [nodeConfigs, setNodeConfigs] = useState<Record<string, Record<string, any>>>({})
  const [nodeTestCache, setNodeTestCache] = useState<Record<string, NodeTestCacheEntry>>({})
  const [activeReorderDrag, setActiveReorderDrag] = useState<{
    nodeId: string
    pointerId: number
    release?: () => void
  } | null>(null)
  const [reorderDragOffset, setReorderDragOffset] = useState(0)
  const reorderDragOffsetRef = useRef(0)
  const [reorderPreviewIndex, setReorderPreviewIndex] = useState<number | null>(null)
  const [reorderDragStartIndex, setReorderDragStartIndex] = useState<number | null>(null)
  const suppressNodeClickRef = useRef<string | null>(null)
  const suppressNodeClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragStartRef = useRef<number | null>(null)
  const dragVisualStateRef = useRef<{ offset: number; slot: number | null }>({ offset: 0, slot: null })
  const dragRafRef = useRef<number | null>(null)

  // AI Agent Infrastructure (Spec-Compliant)
  const choreographerRef = useRef<BuildChoreographer | null>(null)
  const costTrackerRef = useRef<CostTracker | null>(null)
  const [costEstimate, setCostEstimate] = useState<number | undefined>(undefined)
  const [costActual, setCostActual] = useState<number | undefined>(undefined)

  // Chat persistence - extracted to useChatPersistence hook
  const {
    chatPersistenceEnabled,
    isChatLoading,
    generateLocalId,
    replaceMessageByLocalId,
    enqueuePendingMessage,
    persistOrQueueStatus,
  } = useChatPersistence({
    flowId,
    flowState: flowState ? {
      flow: flowState.flow,
      revisionId: flowState.revisionId,
      revisionCount: flowState.revisionCount,
    } : null,
    authInitialized,
    hasUnsavedChanges: builder?.hasUnsavedChanges,
    agentMessages,
    setAgentMessages,
  })

  // Path router state
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set())
  const [pathLabels, setPathLabels] = useState<Record<string, string>>({})
  // NOTE: lastHasUnsavedChangesRef moved to useChatPersistence hook

  // NOTE: AI infrastructure init moved to consolidated mount effect (line ~414)

  // CONSOLIDATED: App ready init + workspace context sync
  // Previously these were 2 separate effects that both called fetchIntegrations,
  // causing double-fetch on initial load. Now combined into one effect.
  const hasInitializedRef = useRef(false)
  const lastWorkspaceIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!appReady) {
      return
    }

    // Track if this is the first run or a workspace change
    const isFirstRun = !hasInitializedRef.current
    const workspaceChanged = workspaceContext?.id !== lastWorkspaceIdRef.current

    if (!isFirstRun && !workspaceChanged) {
      return // Nothing to do
    }

    // Update refs
    hasInitializedRef.current = true
    lastWorkspaceIdRef.current = workspaceContext?.id ?? null

    console.log('[WorkflowBuilder] App context ready, initializing...', {
      isFirstRun,
      workspaceChanged,
      workspaceType: workspaceContext?.type,
      workspaceId: workspaceContext?.id,
    })

    // Set workspace context first (this clears integrations)
    if (workspaceContext) {
      setIntegrationWorkspaceContext(workspaceContext.type, workspaceContext.id)
    }

    // Single fetch with workspace context (avoids double-fetch)
    fetchIntegrations(
      false,
      workspaceContext?.type,
      workspaceContext?.id || undefined
    ).catch(error => {
      logger.error('[WorkflowBuilder] Failed to fetch integrations:', error)
    })

    // Load workflow preferences only on first run
    if (isFirstRun) {
      loadWorkflowPreferences().then(prefs => {
        if (prefs) {
          console.log('[WorkflowBuilder] Loaded workflow preferences:', {
            email: prefs.default_email_provider,
            calendar: prefs.default_calendar_provider,
            notification: prefs.default_notification_provider,
          })
        }
      }).catch(error => {
        console.warn('[WorkflowBuilder] Failed to load workflow preferences:', error)
      })
    }
  }, [appReady, workspaceContext, setIntegrationWorkspaceContext, fetchIntegrations])

  // NOTE: Chat persistence useEffects moved to useChatPersistence hook

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

  // NOTE: Duplicate window resize useEffect removed - kept the one at line ~440

  // Sync workflow name
  useEffect(() => {
    if (!nameDirty) {
      setWorkflowName(adapter.state.flowName)
    }
  }, [adapter.state.flowName, nameDirty])

  // NOTE: localStorage restore moved to consolidated mount effect (line ~433)

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
    providerMeta?: { category: any; provider: any; allProviders: any[] } | Array<{ category: any; provider: any; allProviders: any[] }>
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

    // Include provider metadata if selected
    // Support both single object (backward compat) and array (multi-provider)
    if (providerMeta) {
      if (Array.isArray(providerMeta)) {
        // Multiple providers selected
        assistantMeta.allSelectedProviders = providerMeta
        // Keep first one as autoSelectedProvider for backward compatibility
        if (providerMeta.length > 0) {
          assistantMeta.autoSelectedProvider = providerMeta[0]
        }
      } else {
        // Single provider (backward compatibility)
        assistantMeta.autoSelectedProvider = providerMeta
      }
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

  // Helper to show next provider dropdown
  const showNextProviderDropdown = useCallback((
    nextTerm: VagueTermDetection,
    prompt: string,
    remainingTerms: VagueTermDetection[]
  ) => {
    const freshIntegrations = useIntegrationStore.getState().integrations
    const providerOptions = getProviderOptions(
      nextTerm.category!,
      freshIntegrations.map(i => ({ provider: i.provider, id: i.id, status: i.status }))
    )
    const connectedProviders = providerOptions.filter(p => p.isConnected)
    const preSelectedProvider = connectedProviders.length > 0 ? connectedProviders[0] : null

    setAwaitingProviderSelection(true)
    setPendingPrompt(prompt)
    setProviderCategory(nextTerm.category)
    setPendingVagueTerms(remainingTerms)

    // Add assistant message with provider dropdown
    const dropdownMessage: ChatMessage = {
      id: generateLocalId(),
      flowId,
      role: 'assistant',
      text: '',
      meta: {
        providerDropdown: {
          category: nextTerm.category,
          providers: providerOptions,
          preSelectedProviderId: preSelectedProvider?.id,
        }
      },
      createdAt: new Date().toISOString(),
    }
    setAgentMessages(prev => [...prev, dropdownMessage])
  }, [flowId, generateLocalId])

  // Provider selection handlers
  const handleProviderSelect = useCallback(async (providerId: string) => {
    if (!pendingPrompt || !providerCategory || !actions) return

    console.log('[Provider Selection] User selected provider:', providerId)
    console.log('[Provider Selection] Current vague term:', providerCategory.vagueTerm)
    console.log('[Provider Selection] Remaining pending terms:', pendingVagueTerms.length)

    // Store the selection
    const newSelections = new Map(providerSelections)
    newSelections.set(providerCategory.vagueTerm, providerId)
    setProviderSelections(newSelections)

    // Replace vague term with specific provider in prompt
    const modifiedPrompt = replaceVagueTermWithProvider(
      pendingPrompt,
      providerCategory.vagueTerm,
      providerId
    )

    console.log('[Provider Selection] Modified prompt:', modifiedPrompt)

    // Check if there are more pending vague terms to resolve
    if (pendingVagueTerms.length > 0) {
      const [nextTerm, ...remainingTerms] = pendingVagueTerms
      console.log('[Provider Selection] More terms to resolve:', nextTerm.category?.displayName)

      // Show next provider dropdown
      setAwaitingProviderSelection(false)
      showNextProviderDropdown(nextTerm, modifiedPrompt, remainingTerms)
      return
    }

    // All vague terms resolved - proceed with workflow generation
    console.log('[Provider Selection] All terms resolved, proceeding with workflow generation')

    // Capture all selections before clearing state
    const allSelections = new Map(newSelections)
    allSelections.set(providerCategory.vagueTerm, providerId)
    console.log('[Provider Selection] All provider selections:', Object.fromEntries(allSelections))

    // Reset selection state
    setAwaitingProviderSelection(false)
    setIsAgentLoading(true)

    // Build provider metadata for ALL selected providers
    const allProviderMetadata: Array<{ category: any; provider: any; allProviders: any[] }> = []
    const freshIntegrations = useIntegrationStore.getState().integrations

    for (const [vagueTerm, selectedProviderId] of allSelections) {
      // Find the category for this vague term
      const category = PROVIDER_CATEGORIES.find(c => c.vagueTerm === vagueTerm)
      if (category) {
        const providerOptions = getProviderOptions(
          category,
          freshIntegrations.map(i => ({ provider: i.provider, id: i.id, status: i.status }))
        )
        const selectedProvider = providerOptions.find(p => p.id === selectedProviderId)
        if (selectedProvider) {
          allProviderMetadata.push({
            category,
            provider: selectedProvider,
            allProviders: providerOptions
          })
        }
      }
    }

    // Find the email provider for template matching (templates typically need the trigger provider)
    const emailProviderId = allSelections.get('email') || providerId
    console.log('[Provider Selection] Email provider for template:', emailProviderId)

    // Clear pending state
    setPendingPrompt("")
    setProviderCategory(null)
    setPendingVagueTerms([])
    setProviderSelections(new Map())

    // Start planning with modified prompt
    console.log('[Provider Selection] Starting planning sequence...')
    transitionTo(BuildState.THINKING)

    try {
      await new Promise(resolve => setTimeout(resolve, 1000))
      console.log('[Provider Selection] → SUBTASKS')
      transitionTo(BuildState.SUBTASKS)

      await new Promise(resolve => setTimeout(resolve, 800))
      console.log('[Provider Selection] → COLLECT_NODES')
      transitionTo(BuildState.COLLECT_NODES)

      await new Promise(resolve => setTimeout(resolve, 800))
      console.log('[Provider Selection] → OUTLINE')
      transitionTo(BuildState.OUTLINE)

      await new Promise(resolve => setTimeout(resolve, 800))
      console.log('[Provider Selection] → PURPOSE')
      transitionTo(BuildState.PURPOSE)

      console.log('[Provider Selection] Calling planWorkflowWithTemplates...')
      // Pass the EMAIL provider for template matching (not notification)
      const { result, usedTemplate, promptId } = await planWorkflowWithTemplates(
        actions, modifiedPrompt, emailProviderId, user?.id, flowId
      )
      console.log('[Provider Selection] ✅ Received result from askAgent:', {
        workflowName: result.workflowName,
        editsCount: result.edits?.length,
        usedTemplate,
        cost: usedTemplate ? '$0.00 (template)' : '~$0.03 (LLM)',
        promptId
      })

      // Pass ALL provider metadata to include in plan message
      console.log('[Provider Selection] Calling continueWithPlanGeneration with all providers:', allProviderMetadata.length)
      await continueWithPlanGeneration(result, modifiedPrompt, allProviderMetadata.length > 0 ? allProviderMetadata : undefined)
      console.log('[Provider Selection] ✅ Plan generation complete')
    } catch (error: any) {
      console.error('[Provider Selection] ❌ Error:', error)
      toast({
        title: "Failed to create plan",
        description: error?.message || "Unable to generate workflow plan",
        variant: "destructive",
      })
      transitionTo(BuildState.IDLE)
      setIsAgentLoading(false)
    }
  }, [actions, continueWithPlanGeneration, flowId, generateLocalId, integrations, pendingPrompt, pendingVagueTerms, providerCategory, providerSelections, showNextProviderDropdown, toast, transitionTo])

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

    // Support both single provider (autoSelectedProvider) and multiple providers (allSelectedProviders)
    const allSelectedProviders = meta.allSelectedProviders || []
    const singleProvider = meta.autoSelectedProvider?.provider

    // Find which provider is being changed by matching the new provider's category
    const newProviderCategory = getProviderCategory(newProviderId)

    let oldProviderId: string | null = null
    let providerIndex = -1

    // First try allSelectedProviders array
    if (allSelectedProviders.length > 0) {
      providerIndex = allSelectedProviders.findIndex((p: any) => {
        const currentCategory = getProviderCategory(p.provider.id)
        return currentCategory === newProviderCategory
      })

      if (providerIndex >= 0) {
        oldProviderId = allSelectedProviders[providerIndex].provider.id
      }
    }

    // Fallback to single provider
    if (!oldProviderId && singleProvider) {
      const singleCategory = getProviderCategory(singleProvider.id)
      if (singleCategory === newProviderCategory) {
        oldProviderId = singleProvider.id
      }
    }

    if (!oldProviderId) {
      console.warn('[Provider Change] No matching provider found for category:', newProviderCategory)
      toast({
        title: "Cannot Change Provider",
        description: "No matching provider found",
        variant: "destructive",
      })
      return
    }

    // Validate swap (same category check)
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
      description: `Switched to ${getProviderDisplayName(newProviderId)}`,
    })

    // Swap providers in plan (instant, no API call)
    const updatedPlan = swapProviderInPlan(buildMachine.plan, oldProviderId, newProviderId)

    // Update build machine with new plan
    setBuildMachine(prev => ({
      ...prev,
      plan: updatedPlan,
    }))

    // Update provider metadata in chat message
    const updatedMessages = agentMessages.map((msg, idx) => {
      if (msg.role !== 'assistant') return msg

      const msgMeta = (msg as any)?.meta ?? {}

      // Check if this message has allSelectedProviders
      if (msgMeta.allSelectedProviders && msgMeta.allSelectedProviders.length > 0) {
        const updatedAllProviders = [...msgMeta.allSelectedProviders]

        // Find and update the provider that matches the category
        const matchIdx = updatedAllProviders.findIndex((p: any) => {
          const cat = getProviderCategory(p.provider.id)
          return cat === newProviderCategory
        })

        if (matchIdx >= 0) {
          const providerOptions = updatedAllProviders[matchIdx].allProviders || []
          const newProvider = providerOptions.find((p: any) => p.id === newProviderId)

          updatedAllProviders[matchIdx] = {
            ...updatedAllProviders[matchIdx],
            provider: newProvider || { id: newProviderId, displayName: getProviderDisplayName(newProviderId), isConnected: false },
          }

          return {
            ...msg,
            meta: {
              ...msgMeta,
              allSelectedProviders: updatedAllProviders,
            },
          }
        }
      }

      // Fallback: Update single autoSelectedProvider
      if (msgMeta.autoSelectedProvider) {
        const providerOptions = msgMeta.autoSelectedProvider?.allProviders || []
        const newProvider = providerOptions.find((p: any) => p.id === newProviderId)

        return {
          ...msg,
          meta: {
            ...msgMeta,
            autoSelectedProvider: {
              ...msgMeta.autoSelectedProvider,
              provider: newProvider || { id: newProviderId, displayName: getProviderDisplayName(newProviderId), isConnected: false },
            },
          },
        }
      }

      return msg
    })

    setAgentMessages(updatedMessages)

    console.log('[Provider Change] ✅ Provider swapped instantly (no LLM call, cost: $0.00)')
  }, [agentMessages, buildMachine.plan, toast])

  // Enhanced chat flow handlers
  const handleProviderDropdownSelect = useCallback(async (providerId: string, isConnected: boolean) => {
    console.log('[Provider Dropdown] User selected:', providerId, 'isConnected:', isConnected)

    // Track selected provider
    setSelectedProviderId(providerId)

    // Add preference to collection (will be offered to save at end)
    const category = providerCategory?.vagueTerm || 'unknown'
    setCollectedPreferences(prev => [...prev, {
      id: `provider-${providerId}`,
      category,
      provider: providerId,
      providerName: getProviderDisplayName(providerId),
    }])

    // Always proceed with workflow building
    // Connection check happens later during WAITING_USER (node configuration)
    // This lets users see the full workflow plan before connecting accounts
    if (pendingPrompt) {
      handleProviderSelect(providerId)
    }
  }, [pendingPrompt, providerCategory, handleProviderSelect])

  const handleConnectionComplete = useCallback(async (providerId: string, email?: string) => {
    console.log('[Connection Complete]', providerId, 'email:', email)

    // Clear pending connection
    setPendingConnectionProvider(null)

    // Add to collected preferences
    const category = providerCategory?.vagueTerm || 'unknown'
    setCollectedPreferences(prev => [...prev, {
      id: `provider-${providerId}`,
      category,
      provider: providerId,
      providerName: getProviderDisplayName(providerId),
    }])

    // Update the last message to show connected status
    setAgentMessages(prev => {
      const updated = [...prev]
      const lastIndex = updated.findIndex(m =>
        m.meta?.connectionStatus?.providerId === providerId
      )
      if (lastIndex !== -1) {
        updated[lastIndex] = {
          ...updated[lastIndex],
          text: `Connected to ${getProviderDisplayName(providerId)}${email ? ` (${email})` : ''}!`,
          meta: {
            ...updated[lastIndex].meta,
            connectionStatus: {
              providerId,
              isConnected: true,
              email,
            }
          }
        }
      }
      return updated
    })

    // Continue with the flow
    if (pendingPrompt) {
      setTimeout(() => {
        handleProviderSelect(providerId)
      }, 500)
    }
  }, [providerCategory, pendingPrompt, handleProviderSelect])

  const handleConnectionSkip = useCallback((providerId: string) => {
    console.log('[Connection Skip]', providerId)

    // Clear pending connection
    setPendingConnectionProvider(null)

    // Remove the connection card message and add skip note
    setAgentMessages(prev => {
      const filtered = prev.filter(m =>
        !m.meta?.connectionStatus || m.meta?.connectionStatus?.providerId !== providerId
      )
      return [...filtered, {
        id: generateLocalId(),
        role: 'assistant',
        text: `Skipped connecting ${getProviderDisplayName(providerId)}. You'll need to connect it later to use this workflow.`,
      }]
    })

    // Still proceed with the flow, but the workflow won't work until connected
    if (pendingPrompt) {
      handleProviderSelect(providerId)
    }
  }, [generateLocalId, pendingPrompt, handleProviderSelect])

  const handleNodeConfigComplete = useCallback((nodeType: string, config: Record<string, any>) => {
    console.log('[Node Config Complete]', nodeType, config)

    // Clear pending config
    setPendingNodeConfigType(null)

    // Store the config
    setNodeConfigs(prev => ({
      ...prev,
      [nodeType]: { ...prev[nodeType], ...config }
    }))

    // Add to preferences if there's a channel or significant config
    if (config.channel || config.channelId) {
      const displayName = NODE_DISPLAY_NAME_MAP[nodeType] || nodeType
      setCollectedPreferences(prev => [...prev, {
        id: `config-${nodeType}`,
        category: 'configuration',
        provider: nodeType.split('_')[0],
        providerName: displayName,
        nodeConfig: {
          nodeType,
          nodeDisplayName: displayName,
          config,
        }
      }])
    }

    // Update the chat to show config was applied
    setAgentMessages(prev => {
      const updated = [...prev]
      const lastIndex = updated.findIndex(m =>
        m.meta?.nodeConfig?.nodeType === nodeType
      )
      if (lastIndex !== -1) {
        updated[lastIndex] = {
          ...updated[lastIndex],
          text: `Configuration applied for ${NODE_DISPLAY_NAME_MAP[nodeType] || nodeType}.`,
          meta: {
            ...updated[lastIndex].meta,
            nodeConfig: {
              ...updated[lastIndex].meta?.nodeConfig,
              completed: true,
            }
          }
        }
      }
      return updated
    })
  }, [])

  const handleNodeConfigSkip = useCallback((nodeType: string) => {
    console.log('[Node Config Skip]', nodeType)

    // Clear pending config
    setPendingNodeConfigType(null)

    // Update the chat to show config was skipped
    setAgentMessages(prev => {
      const updated = [...prev]
      const lastIndex = updated.findIndex(m =>
        m.meta?.nodeConfig?.nodeType === nodeType
      )
      if (lastIndex !== -1) {
        updated[lastIndex] = {
          ...updated[lastIndex],
          text: `Using default configuration for ${NODE_DISPLAY_NAME_MAP[nodeType] || nodeType}.`,
          meta: {
            ...updated[lastIndex].meta,
            nodeConfig: {
              ...updated[lastIndex].meta?.nodeConfig,
              skipped: true,
            }
          }
        }
      }
      return updated
    })
  }, [])

  const handlePreferencesSave = useCallback(async (selectedIds: string[]) => {
    console.log('[Preferences Save]', selectedIds)

    // This is handled by the PreferencesSaveCard component internally
    // using saveSelectedPreferences from the store

    // Clear collected preferences
    setCollectedPreferences([])

    toast({
      title: "Preferences Saved",
      description: `${selectedIds.length} preference${selectedIds.length !== 1 ? 's' : ''} saved as defaults.`,
    })
  }, [toast])

  const handlePreferencesSkip = useCallback(() => {
    console.log('[Preferences Skip]')

    // Clear collected preferences without saving
    setCollectedPreferences([])
  }, [])

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
            // STEP 0: Check if user mentioned specific apps (e.g., "Gmail", "Outlook", "Slack")
            const specificApps = detectSpecificApps(prompt)
            console.log('[URL Prompt Handler] Detected specific apps:', specificApps.map(a => a.displayName))

            // Check for ALL vague provider terms (not just the first one)
            const allVagueTerms = detectAllVagueTerms(prompt)
            console.log('[URL Prompt Handler] Detected all vague terms:', allVagueTerms.map(t => t.category?.vagueTerm))

            let finalPrompt = prompt
            let providerMetadata: { category: any; provider: any; allProviders: any[] } | undefined

            // Filter out vague terms where user already specified a specific app
            const vagueTermsNeedingSelection: VagueTermDetection[] = []
            for (const vagueTermResult of allVagueTerms) {
              if (!vagueTermResult.category) continue

              // Check if user already specified an app for this category
              const matchingSpecificApp = specificApps.find(app => {
                // Match by category or by checking if providers overlap
                const categoryMatch = app.category === vagueTermResult.category!.vagueTerm
                // Also check notification/chat categories which share providers
                const notificationCategories = ['notification', 'message', 'alert', 'chat']
                const isNotificationCategory = notificationCategories.includes(vagueTermResult.category!.vagueTerm)
                const appIsNotification = notificationCategories.includes(app.category)
                return categoryMatch || (isNotificationCategory && appIsNotification)
              })

              if (matchingSpecificApp) {
                // User mentioned a specific app - use it directly
                console.log('[URL Prompt Handler] User specified:', matchingSpecificApp.displayName, 'for', vagueTermResult.category.vagueTerm)

                finalPrompt = replaceVagueTermWithProvider(
                  finalPrompt,
                  vagueTermResult.category.vagueTerm,
                  matchingSpecificApp.provider
                )

                // Store metadata for first matched category
                if (!providerMetadata) {
                  const freshIntegrations = useIntegrationStore.getState().integrations
                  const providerOptions = getProviderOptions(
                    vagueTermResult.category,
                    freshIntegrations.map(i => ({ provider: i.provider, id: i.id, status: i.status }))
                  )
                  const selectedProvider = providerOptions.find(p => p.id === matchingSpecificApp.provider)

                  providerMetadata = selectedProvider ? {
                    category: vagueTermResult.category,
                    provider: selectedProvider,
                    allProviders: providerOptions
                  } : undefined
                }
              } else {
                // This term needs user selection
                vagueTermsNeedingSelection.push(vagueTermResult)
              }
            }

            console.log('[URL Prompt Handler] Terms needing selection:', vagueTermsNeedingSelection.map(t => t.category?.vagueTerm))

            // If there are vague terms that need selection, show provider dropdown
            if (vagueTermsNeedingSelection.length > 0) {
              const [firstTerm, ...remainingTerms] = vagueTermsNeedingSelection
              console.log('[URL Prompt Handler] Showing dropdown for:', firstTerm.category?.vagueTerm)
              console.log('[URL Prompt Handler] Remaining terms to ask:', remainingTerms.length)

              const freshIntegrations = useIntegrationStore.getState().integrations
              const providerOptions = getProviderOptions(
                firstTerm.category!,
                freshIntegrations.map(i => ({ provider: i.provider, id: i.id, status: i.status }))
              )
              const connectedProviders = providerOptions.filter(p => p.isConnected)

              // Set up multi-term disambiguation state
              setAwaitingProviderSelection(true)
              setPendingPrompt(finalPrompt) // Use modified prompt with any auto-resolved terms
              setProviderCategory(firstTerm.category)
              setPendingVagueTerms(remainingTerms) // Store remaining terms for later
              setProviderSelections(new Map()) // Reset selections
              setIsAgentLoading(false)

              // Add assistant message with provider dropdown
              const preSelectedProvider = connectedProviders.length > 0 ? connectedProviders[0] : null
              const dropdownMessage: ChatMessage = {
                id: generateLocalId(),
                flowId,
                role: 'assistant',
                text: '',
                meta: {
                  providerDropdown: {
                    category: firstTerm.category,
                    providers: providerOptions,
                    preSelectedProviderId: preSelectedProvider?.id,
                  }
                },
                createdAt: new Date().toISOString(),
              }
              setAgentMessages(prev => [...prev, dropdownMessage])
              return
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
              actions, finalPrompt, providerMetadata?.provider?.id, user?.id, flowId
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

    // Use same X position as the node we're adding after to maintain alignment
    const position = {
      x: afterNode.position.x,
      y: afterNode.position.y + 180
    }

    try {
      // Add the new node - addNode returns the node ID
      const newNodeId = await actions.addNode(nodeType, position)

      if (newNodeId) {
        // Connect the previous node to the new node
        await actions.connectEdge({
          sourceId: afterNodeId,
          targetId: newNodeId,
          sourceHandle: sourceHandle || 'source'
        })

        // Auto-open configuration for Path Condition nodes
        if (nodeType === 'path_condition') {
          setTimeout(() => {
            handleConfigureNode(newNodeId)
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
  const getReorderableData = useCallback(() => {
    if (!builder?.nodes) {
      return null
    }
    const reorderableNodes = builder.nodes
      .filter(isReorderableNode)
      .sort((a: any, b: any) => (a.position?.y ?? 0) - (b.position?.y ?? 0))
    if (reorderableNodes.length === 0) {
      return null
    }
    const ids = reorderableNodes.map((node: any) => node.id)
    const positions = reorderableNodes.map((node: any) => node.position?.y ?? 0)
    const spacing =
      positions.length > 1
        ? (positions[positions.length - 1] - positions[0]) / (positions.length - 1 || 1)
        : 160
    const boundaries = new Array(ids.length + 1)
    boundaries[0] = positions[0] - spacing / 2
    for (let i = 1; i < ids.length; i++) {
      boundaries[i] = (positions[i - 1] + positions[i]) / 2
    }
    boundaries[ids.length] = positions[positions.length - 1] + spacing / 2
    return { reorderableNodes, ids, positions, spacing, boundaries }
  }, [builder?.nodes])

  const syncReorderEdges = useCallback((orderedNodeIds: string[]) => {
    if (!builder?.setEdges || !Array.isArray(orderedNodeIds) || orderedNodeIds.length === 0) {
      return
    }

    const triggerNodeId = builder.nodes?.find((node: any) => node.data?.isTrigger)?.id ?? null

    builder.setEdges((currentEdges: any[]) => {
      if (!Array.isArray(currentEdges) || currentEdges.length === 0) {
        return currentEdges
      }

      const reorderSet = new Set(orderedNodeIds)
      if (reorderSet.size < 2) {
        return currentEdges
      }

      const preservedEdges: any[] = []
      const internalEdges: any[] = []
      const incomingEdges: any[] = []
      const outgoingEdges: any[] = []

      for (const edge of currentEdges) {
        const fromInSet = reorderSet.has(edge.source)
        const toInSet = reorderSet.has(edge.target)

        if (fromInSet && toInSet) {
          internalEdges.push(edge)
          continue
        }

        if (!fromInSet && toInSet) {
          incomingEdges.push(edge)
          continue
        }

        if (fromInSet && !toInSet) {
          outgoingEdges.push(edge)
          continue
        }

        preservedEdges.push(edge)
      }

      if (
        internalEdges.length === 0 &&
        incomingEdges.length === 0 &&
        outgoingEdges.length === 0
      ) {
        return currentEdges
      }

      if (incomingEdges.length > 1 || outgoingEdges.length > 1) {
        // Multiple boundary edges imply branching – skip local rewiring to avoid breaking the graph.
        return currentEdges
      }

      const baseEdgeTemplate =
        internalEdges[0] ??
        incomingEdges[0] ??
        outgoingEdges[0] ??
        currentEdges.find((edge) => edge?.type === 'custom') ??
        null

      const defaultTemplate = {
        id: 'synthetic-linear-edge',
        type: 'custom',
        sourceHandle: 'source',
        targetHandle: 'target',
        style: { stroke: '#d0d6e0' },
        data: {},
      }

      const makeLinearEdge = (sourceId: string, targetId: string, template?: any) => {
        const base = template ?? baseEdgeTemplate ?? defaultTemplate
        return {
          ...defaultTemplate,
          ...base,
          id: `${sourceId}-${targetId}`,
          source: sourceId,
          target: targetId,
          sourceHandle: base?.sourceHandle ?? defaultTemplate.sourceHandle,
          targetHandle: base?.targetHandle ?? defaultTemplate.targetHandle,
          data: {
            ...(base?.data ?? {}),
          },
          style: {
            ...(base?.style ?? defaultTemplate.style),
          },
        }
      }

      const nextEdges = [...preservedEdges]
      const firstNodeId = orderedNodeIds[0]
      if (firstNodeId) {
        if (incomingEdges.length === 1) {
          const incoming = incomingEdges[0]
          nextEdges.push({
            ...incoming,
            target: firstNodeId,
          })
        } else if (incomingEdges.length === 0 && triggerNodeId) {
          nextEdges.push(makeLinearEdge(triggerNodeId, firstNodeId))
        }
        if (triggerNodeId) {
          const hasTriggerEdge = nextEdges.some(
            (edge) => edge.source === triggerNodeId && edge.target === firstNodeId
          )
          if (!hasTriggerEdge) {
            nextEdges.push(makeLinearEdge(triggerNodeId, firstNodeId, incomingEdges[0]))
          }
        }
      }

      for (let i = 0; i < orderedNodeIds.length - 1; i++) {
        const sourceId = orderedNodeIds[i]
        const targetId = orderedNodeIds[i + 1]
        const template = internalEdges[i] ?? internalEdges[0]
        nextEdges.push(makeLinearEdge(sourceId, targetId, template))
      }

      const lastNodeId = orderedNodeIds[orderedNodeIds.length - 1]
      if (lastNodeId && outgoingEdges.length === 1) {
        const outgoing = outgoingEdges[0]
        nextEdges.push({
          ...outgoing,
          source: lastNodeId,
        })
      }

      return nextEdges
    })
  }, [builder?.nodes, builder?.setEdges])

  const moveNodeToIndex = useCallback((nodeId: string, targetSlot: number) => {
    const data = getReorderableData()
    if (!data || !builder?.setNodes) {
      return
    }
    const { ids, positions, spacing } = data
    let slot = Math.max(0, Math.min(ids.length, targetSlot))

    const currentIndex = ids.indexOf(nodeId)
    if (currentIndex === -1) {
      return
    }

    const newOrder = ids.slice()
    newOrder.splice(currentIndex, 1)
    if (slot > currentIndex) {
      slot -= 1
    }
    slot = Math.max(0, Math.min(newOrder.length, slot))
    newOrder.splice(slot, 0, nodeId)

    const anchorY = positions[0] ?? 0
    const stackSpacing = Math.max(spacing, LINEAR_NODE_VERTICAL_GAP)

    const positionMap = new Map<string, number>()
    newOrder.forEach((id, index) => {
      const y = anchorY + index * stackSpacing
      positionMap.set(id, y)
    })

    const orderChanged = slot !== currentIndex

    builder.setNodes(
      builder.nodes.map((node: any) => {
        const newY = positionMap.get(node.id)
        if (newY === undefined) {
          return node
        }
        const newPosition = {
          x: node.position?.x ?? LINEAR_STACK_X,
          y: newY,
        }
        return {
          ...node,
          position: newPosition,
          positionAbsolute: newPosition,
        }
      })
    )

    if (orderChanged) {
      syncReorderEdges(newOrder)
    }

    return {
      newOrder,
      changed: orderChanged,
    }
  }, [builder?.nodes, builder?.setNodes, getReorderableData, syncReorderEdges])

  const commitReorderChanges = useCallback((orderedIds: string[]) => {
    if (!actions?.applyEdits || orderedIds.length < 2) {
      return
    }
    console.log('[Reorder] Committing order', orderedIds)
    actions.applyEdits([{ op: "reorderNodes", nodeIds: orderedIds }]).catch((error) => {
      console.error("[WorkflowBuilderV2] Failed to persist reorder", error)
      toast({
        title: "Unable to reorder nodes",
        description: error?.message ?? "Please try again.",
        variant: "destructive",
      })
    })
  }, [actions, toast])

  const flushDragVisualState = useCallback(() => {
    dragRafRef.current = null
    const { offset, slot } = dragVisualStateRef.current
    setReorderDragOffset((prev) => (prev === offset ? prev : offset))
    setReorderPreviewIndex((prev) => (prev === slot ? prev : slot))
  }, [])

  const scheduleVisualUpdate = useCallback(() => {
    if (dragRafRef.current !== null) return
    dragRafRef.current = requestAnimationFrame(flushDragVisualState)
  }, [flushDragVisualState])

  const handleReorderPointerDown = useCallback((nodeId: string, event: React.PointerEvent) => {
    const data = getReorderableData()
    if (!data || !builder?.nodes) {
      return
    }
    const startIndex = data.ids.indexOf(nodeId)
    if (startIndex === -1) {
      return
    }

    const handleElement = event.currentTarget
    handleElement.setPointerCapture?.(event.pointerId)
    dragStartRef.current = event.clientY
    setActiveReorderDrag({
      nodeId,
      pointerId: event.pointerId,
      release: () => handleElement.releasePointerCapture?.(event.pointerId),
    })
    setReorderDragStartIndex(startIndex)
    dragVisualStateRef.current = { offset: 0, slot: startIndex }
    reorderDragOffsetRef.current = 0
    setReorderPreviewIndex(startIndex)
    setReorderDragOffset(0)
    scheduleVisualUpdate()
    if (suppressNodeClickTimeoutRef.current) {
      clearTimeout(suppressNodeClickTimeoutRef.current)
      suppressNodeClickTimeoutRef.current = null
    }
    suppressNodeClickRef.current = nodeId
  }, [builder?.nodes, getReorderableData, scheduleVisualUpdate])

  useEffect(() => {
    if (!activeReorderDrag) {
      return
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== activeReorderDrag.pointerId) {
        return
      }
      const startY = dragStartRef.current
      if (startY === null) return
      const nextOffset = event.clientY - startY
      const instance = reactFlowInstanceRef.current
      if (!instance || !builder?.nodes) {
        return
      }

      const flowPoint = instance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
      if (!flowPoint) {
        return
      }

      const data = getReorderableData()
      if (!data) {
        return
      }

      const { ids, positions, spacing, boundaries } = data
      const viewport = instance.getViewport?.()
      const zoom = viewport?.zoom ?? 1

      const getSlotForY = (y: number) => {
        let slot = ids.length
        if (Array.isArray(boundaries) && boundaries.length > 1) {
          slot = boundaries.length - 1
          for (let i = 1; i < boundaries.length; i++) {
            if (y < boundaries[i]) {
              slot = i - 1
              break
            }
          }
        } else {
          const estimatedHeight = Math.max(spacing, 80)
          for (let i = 0; i < ids.length; i++) {
            const nodeTop = positions[i]
            const nodeBottom = nodeTop + estimatedHeight
            if (y < nodeTop) {
              slot = i
              break
            }
            if (y < nodeBottom) {
              slot = i + 1
              break
            }
          }
        }
        return Math.max(0, Math.min(ids.length, slot))
      }

      const scaledOffset = zoom !== 0 ? nextOffset / zoom : nextOffset
      const pointerSlot = getSlotForY(flowPoint.y)
      const draggedIndex = reorderDragStartIndex ?? ids.indexOf(activeReorderDrag.nodeId)
      let targetSlot = pointerSlot

      if (draggedIndex !== -1) {
        const baseY = positions[draggedIndex] ?? flowPoint.y
        const estimatedHeight = Math.max(spacing, LINEAR_NODE_VERTICAL_GAP)
        const draggedCenterY = baseY + scaledOffset + estimatedHeight / 2
        const centerSlot = getSlotForY(draggedCenterY)

        if (scaledOffset > 0) {
          targetSlot = Math.max(pointerSlot, centerSlot)
        } else if (scaledOffset < 0) {
          targetSlot = Math.min(pointerSlot, centerSlot)
        } else {
          targetSlot = centerSlot
        }
      }

      reorderDragOffsetRef.current = scaledOffset
      dragVisualStateRef.current = {
        offset: scaledOffset,
        slot: targetSlot,
      }
      scheduleVisualUpdate()
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (event.pointerId !== activeReorderDrag.pointerId) {
        return
      }
      activeReorderDrag.release?.()
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current)
        dragRafRef.current = null
      }
      const finalSlot = dragVisualStateRef.current.slot ?? reorderDragStartIndex ?? 0
      const finishedNodeId = activeReorderDrag.nodeId
      const reorderResult = moveNodeToIndex(finishedNodeId, finalSlot)
      setActiveReorderDrag(null)
      dragStartRef.current = null
      setReorderDragStartIndex(null)
      setReorderPreviewIndex(null)
      dragVisualStateRef.current = { offset: 0, slot: null }
      reorderDragOffsetRef.current = 0
      setReorderDragOffset(0)
      if (reorderResult?.changed) {
        commitReorderChanges(reorderResult.newOrder)
      }
      if (suppressNodeClickTimeoutRef.current) {
        clearTimeout(suppressNodeClickTimeoutRef.current)
      }
      suppressNodeClickRef.current = finishedNodeId
      suppressNodeClickTimeoutRef.current = setTimeout(() => {
        if (suppressNodeClickRef.current === finishedNodeId) {
          suppressNodeClickRef.current = null
        }
      }, 250)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
      window.removeEventListener('pointercancel', handlePointerUp)
      if (dragRafRef.current !== null) {
        cancelAnimationFrame(dragRafRef.current)
        dragRafRef.current = null
      }
    }
  }, [activeReorderDrag, builder?.nodes, commitReorderChanges, getReorderableData, moveNodeToIndex, reorderPreviewIndex, reorderDragStartIndex, scheduleVisualUpdate])

  useEffect(() => {
    return () => {
      if (suppressNodeClickTimeoutRef.current) {
        clearTimeout(suppressNodeClickTimeoutRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!activeReorderDrag) {
      dragStartRef.current = null
      setReorderDragOffset(0)
      return
    }
    const prevCursor = document.body.style.cursor
    const prevUserSelect = document.body.style.userSelect
    document.body.style.cursor = 'grabbing'
    document.body.style.userSelect = 'none'
    return () => {
      document.body.style.cursor = prevCursor
      document.body.style.userSelect = prevUserSelect
    }
  }, [activeReorderDrag])

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

    const config = node.data?.config || {}

    try {
      logger.debug('[WorkflowBuilder] Testing node:', { nodeId, nodeType: node.data?.type })

      // Set node to running state
      setNodeState(reactFlowInstanceRef.current, nodeId, 'running')

      // Strip test metadata from config
      const cleanConfig = Object.keys(config).reduce((acc, key) => {
        if (!key.startsWith('__test') && !key.startsWith('__validation')) {
          acc[key] = config[key]
        }
        return acc
      }, {} as Record<string, any>)

      // Collect test data from all previous nodes to enable variable resolution
      const testData: Record<string, any> = {}

      // Get all upstream nodes (nodes that come before this one)
      const getUpstreamNodes = (targetNodeId: string, visited = new Set<string>()): string[] => {
        if (visited.has(targetNodeId) || !builder?.edges) return []
        visited.add(targetNodeId)

        const upstreamIds: string[] = []
        const incomingEdges = builder.edges.filter((edge: any) => edge.target === targetNodeId)

        for (const edge of incomingEdges) {
          upstreamIds.push(edge.source)
          const parentNodes = getUpstreamNodes(edge.source, visited)
          upstreamIds.push(...parentNodes)
        }

        return upstreamIds
      }

      const upstreamNodeIds = getUpstreamNodes(nodeId)

      // Collect test results from upstream nodes and add them to testData
      for (const upstreamId of upstreamNodeIds) {
        const upstreamNode = builder.nodes.find((n: any) => n.id === upstreamId)
        if (upstreamNode?.data?.config?.__testData) {
          // Add the upstream node's test data using the node ID as the key
          testData[upstreamId] = upstreamNode.data.config.__testData

          // Also merge the test data fields directly for backward compatibility
          Object.assign(testData, upstreamNode.data.config.__testData)
        }
      }

      logger.debug('[WorkflowBuilder] Collected test data from upstream nodes:', {
        upstreamNodeCount: upstreamNodeIds.length,
        testDataKeys: Object.keys(testData)
      })

      // Call test-node API
      const response = await fetch('/api/workflows/test-node', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nodeType: node.data?.type,
          config: cleanConfig,
          testData: testData
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to test node')
      }

      logger.debug('[WorkflowBuilder] Test completed:', result)

      // Update node with test results
      const testMetadata = {
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

      setNodeTestCache(prev => ({
        ...prev,
        [nodeId]: {
          data: testMetadata.__testData,
          result: testMetadata.__testResult
        }
      }))

      if (actions?.updateConfig) {
        actions.updateConfig(nodeId, testMetadata)

        if (builder?.setNodes) {
          builder.setNodes((nodes: any[]) =>
            nodes.map((n: any) => {
              if (n.id !== nodeId) return n
              return {
                ...n,
                data: {
                  ...n.data,
                  config: {
                    ...(n.data?.config || {}),
                    ...testMetadata,
                  }
                }
              }
            })
          )
        }
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

      persistNodeTestResult('success', testMetadata, node).catch((error) =>
        logger.error('[WorkflowBuilder] Failed to persist node test result', error)
      )

    } catch (error: any) {
      logger.error('[WorkflowBuilder] Test failed:', error)
      setNodeState(reactFlowInstanceRef.current, nodeId, 'failed')
      const errorMetadata = {
        __testData: {},
        __testResult: {
          success: false,
          timestamp: new Date().toISOString(),
          error: error.message || 'Test execution failed',
          message: error.message || 'Test execution failed'
        }
      }

      setNodeTestCache(prev => ({
        ...prev,
        [nodeId]: {
          data: errorMetadata.__testData,
          result: errorMetadata.__testResult
        }
      }))

      if (actions?.updateConfig) {
        actions.updateConfig(nodeId, errorMetadata)

        if (builder?.setNodes) {
          builder.setNodes((nodes: any[]) =>
            nodes.map((n: any) => {
              if (n.id !== nodeId) return n
              return {
                ...n,
                data: {
                  ...n.data,
                  config: {
                    ...(n.data?.config || {}),
                    ...errorMetadata,
                  }
                }
              }
            })
          )
        }
      }
      persistNodeTestResult('error', errorMetadata, node, error.message).catch((persistError) =>
        logger.error('[WorkflowBuilder] Failed to persist failed node test', persistError)
      )
      toast({
        title: "Test failed",
        description: error.message || "Failed to execute test",
        variant: "destructive"
      })
    }
    async function persistNodeTestResult(
      status: 'success' | 'error',
      payload: { __testData: Record<string, any>; __testResult: any },
      nodeData: any,
      errorMessage?: string
    ) {
      try {
        const response = await fetch(`/workflows/v2/api/flows/${flowId}/nodes/${nodeId}/tests`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            status,
            executionTime: payload.__testResult.executionTime,
            output: payload.__testData,
            rawResponse: payload.__testResult.rawResponse,
            error: status === 'error' ? { message: errorMessage || payload.__testResult.error } : null,
            message: payload.__testResult.message,
            nodeType: nodeData.data?.type,
            nodeLabel: nodeData.data?.title || nodeData.data?.label || nodeId,
          }),
        })

        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}))
          logger.error('[WorkflowBuilder] Failed to persist node test:', errorPayload)
          return
        }

        const responseBody = await response.json()
        if (responseBody?.runId && actions?.refreshRun) {
          await actions.refreshRun(responseBody.runId)
        }
      } catch (persistError) {
        logger.error('[WorkflowBuilder] Persist node test error:', persistError)
      }
    }
  }, [builder?.nodes, builder?.setNodes, actions, flowId, toast])

  const handleTestFlowFromHere = useCallback(async (nodeId: string) => {
    if (!builder?.nodes || !builder?.edges || !reactFlowInstanceRef.current) {
      logger.error('[WorkflowBuilder] Cannot test flow - builder not ready')
      return
    }

    const startNode = builder.nodes.find((n: any) => n.id === nodeId)
    if (!startNode) {
      logger.error('[WorkflowBuilder] Start node not found:', nodeId)
      return
    }

    // Get all downstream nodes
    const getDownstreamNodes = (fromNodeId: string, visited = new Set<string>()): string[] => {
      if (visited.has(fromNodeId)) return []
      visited.add(fromNodeId)

      const downstreamIds: string[] = [fromNodeId]
      const outgoingEdges = builder.edges.filter((edge: any) => edge.source === fromNodeId)

      for (const edge of outgoingEdges) {
        const childNodes = getDownstreamNodes(edge.target, visited)
        downstreamIds.push(...childNodes)
      }

      return downstreamIds
    }

    const nodesToTest = getDownstreamNodes(nodeId)
    logger.debug('[WorkflowBuilder] Testing flow from node:', nodeId, 'Total nodes:', nodesToTest.length)

    // Sort nodes in execution order (topological sort)
    const sortedNodeIds: string[] = []
    const visited = new Set<string>()

    const topologicalSort = (nId: string) => {
      if (visited.has(nId)) return
      visited.add(nId)

      const incomingEdges = builder.edges.filter((edge: any) =>
        edge.target === nId && nodesToTest.includes(edge.source)
      )
      for (const edge of incomingEdges) {
        topologicalSort(edge.source)
      }

      sortedNodeIds.push(nId)
    }

    for (const nId of nodesToTest) {
      topologicalSort(nId)
    }

    // Test nodes sequentially, passing output from one to the next
    let currentTestData: Record<string, any> = {}

    for (const nId of sortedNodeIds) {
      const node = builder.nodes.find((n: any) => n.id === nId)
      if (!node) continue

      logger.debug('[WorkflowBuilder] Testing node in flow:', node.data?.title || node.data?.type)

      // Set node to running state
      setNodeState(reactFlowInstanceRef.current, nId, 'running')

      try {
        // Strip test metadata from config
        const config = node.data?.config || {}
        const cleanConfig = Object.keys(config).reduce((acc, key) => {
          if (!key.startsWith('__test') && !key.startsWith('__validation')) {
            acc[key] = config[key]
          }
          return acc
        }, {} as Record<string, any>)

        // Call test-node API with accumulated test data
        const response = await fetch('/api/workflows/test-node', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            nodeType: node.data?.type,
            config: cleanConfig,
            testData: currentTestData,
          }),
        })

        const result = await response.json()

        if (!response.ok || result.testResult?.success === false) {
          throw new Error(result.error || result.testResult?.error || 'Test failed')
        }

        // Merge the output into currentTestData for the next node
        currentTestData = {
          ...currentTestData,
          ...(result.testResult?.output || {}),
        }

        // Update node with test results and set to passed state
        if (actions?.updateConfig) {
          const updatedConfig = {
            ...config,
            __testData: result.testResult?.output || {},
            __testResult: {
              success: true,
              executionTime: result.testResult?.executionTime,
              timestamp: new Date().toISOString(),
              message: result.testResult?.message,
              rawResponse: result.testResult?.output
            }
          }
          actions.updateConfig(nId, updatedConfig)
        }

        // Wait for debounced config save to complete (600ms debounce + 100ms buffer)
        // This ensures the database update and graph refresh complete before setting state
        await new Promise(resolve => setTimeout(resolve, 700))
        setNodeState(reactFlowInstanceRef.current, nId, 'passed')

      } catch (error: any) {
        logger.error('[WorkflowBuilder] Flow test failed at node:', node.data?.title, error)

        // Set node to failed state
        setNodeState(reactFlowInstanceRef.current, nId, 'failed')

        // Update node with error
        if (actions?.updateConfig) {
          const config = node.data?.config || {}
          const updatedConfig = {
            ...config,
            __testResult: {
              success: false,
              error: error.message,
              timestamp: new Date().toISOString(),
            }
          }
          actions.updateConfig(nId, updatedConfig)
        }

        toast({
          title: "Flow test failed",
          description: `Failed at node: ${node.data?.title || node.data?.type}. ${error.message}`,
          variant: "destructive"
        })

        // Stop testing on error
        return
      }
    }

    toast({
      title: "Flow test completed",
      description: `Successfully tested ${sortedNodeIds.length} node(s)`,
    })
  }, [builder?.nodes, builder?.edges, actions, toast])

  const reactFlowProps = useMemo(() => {
    // CRITICAL FIX: In production, builder can temporarily have no nodes during re-renders
    // When this happens, we preserve the last valid props to prevent nodes from disappearing
    if (!builder) {
      // Return cached value if available, otherwise null
      return lastValidReactFlowPropsRef.current
    }

    // If builder exists but has no nodes yet (still loading), preserve last valid state
    // This prevents the flash where nodes disappear during initial load race conditions
    if (!builder.nodes || builder.nodes.length === 0) {
      // Only return cached if we have nodes cached - otherwise let it proceed
      // (new workflows genuinely have 0 nodes initially)
      if (lastValidReactFlowPropsRef.current && lastValidReactFlowPropsRef.current.nodes.length > 0) {
        return lastValidReactFlowPropsRef.current
      }
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

    const previewOffsets = new Map<string, number>()
    const reorderData = getReorderableData()
    const orderMap = new Map<string, number>()
    const reorderableNodes = reorderData?.reorderableNodes ?? []

    if (reorderData) {
      reorderData.ids.forEach((id, index) => orderMap.set(id, index))

      if (activeReorderDrag && reorderPreviewIndex !== null) {
        const draggedId = activeReorderDrag.nodeId
        const draggedIndex = reorderData.ids.indexOf(draggedId)
        if (draggedIndex !== -1) {
          const simulated = reorderData.ids.slice()
          simulated.splice(draggedIndex, 1)
          let insertSlot = Math.max(0, Math.min(reorderData.ids.length, reorderPreviewIndex))
          if (insertSlot > draggedIndex) {
            insertSlot -= 1
          }
          insertSlot = Math.max(0, Math.min(simulated.length, insertSlot))
          simulated.splice(insertSlot, 0, draggedId)

          const simulatedMap = new Map<string, number>()
          simulated.forEach((id, idx) => simulatedMap.set(id, idx))

          reorderData.ids.forEach((id, index) => {
            if (id === draggedId) return
            const simulatedIdx = simulatedMap.get(id)
            if (simulatedIdx === undefined) return
            const currentY = reorderData.positions[index]
            const targetY = reorderData.positions[simulatedIdx]
            if (currentY === undefined || targetY === undefined) return
            previewOffsets.set(id, targetY - currentY)
          })
        }
      }
    }

    // Enhance nodes with isLastNode, onAddNodeAfter, onTestNode, onTestFlowFromHere, and isBeingConfigured
    const enhancedNodes = builder.nodes.map((node: any) => {
      const orderIndex = orderMap.get(node.id)
      const canMoveUp = typeof orderIndex === 'number' && orderIndex > 0
      const canMoveDown = typeof orderIndex === 'number' && orderIndex < reorderableNodes.length - 1

      return {
        ...node,
        data: {
          ...node.data,
          isLastNode: lastNodeIds.has(node.id),
          onAddNodeAfter: handleAddNodeAfter,
          onTestNode: handleTestNode,
          onTestFlowFromHere: handleTestFlowFromHere,
          isBeingConfigured: configuringNode?.id === node.id,
          isBeingReordered: activeReorderDrag?.nodeId === node.id,
          reorderDragOffset:
            activeReorderDrag?.nodeId === node.id ? reorderDragOffset : 0,
          previewOffset: previewOffsets.get(node.id) ?? 0,
          onStartReorder: isReorderableNode(node) ? handleReorderPointerDown : undefined,
          isReorderable: isReorderableNode(node),
          shouldSuppressConfigureClick: () => {
            if (suppressNodeClickRef.current === node.id) {
              suppressNodeClickRef.current = null
              return true
            }
            return false
          },
        }
      }
    })

    // Handler for inserting a node in the middle of an edge
    const handleInsertNodeOnEdge = (edgeId: string, position: { x: number; y: number }) => {
      // Close config modal if open
      if (configuringNode) {
        setConfiguringNode(null)
      }

      // Find the edge to get the source node
      const edge = builder.edges.find((e: any) => e.id === edgeId)
      if (!edge) return

      // Store the source node ID and open integrations panel
      setSelectedNodeId(edge.source)
      openIntegrationsPanel('action')
    }

    // Enhance edges with onInsertNode handler and deduplicate by ID
    const seenEdgeIds = new Set<string>()
    const enhancedEdges = builder.edges
      .filter((edge: any) => {
        if (seenEdgeIds.has(edge.id)) {
          console.warn(`[reactFlowProps] Skipping duplicate edge ID: ${edge.id}`)
          return false
        }
        seenEdgeIds.add(edge.id)
        return true
      })
      .map((edge: any) => ({
        ...edge,
        data: {
          ...edge.data,
          onInsertNode: handleInsertNodeOnEdge,
        }
      }))

    const result = {
      nodes: enhancedNodes,
      edges: enhancedEdges,
      onNodesChange: builder.optimizedOnNodesChange ?? builder.onNodesChange,
      onEdgesChange: builder.onEdgesChange,
      onConnect: builder.onConnect,
      nodeTypes: builder.nodeTypes,
      edgeTypes: builder.edgeTypes,
    }

    // Cache the valid result for future use during transitional states
    // Only cache if we have actual nodes (not during initial empty state)
    if (enhancedNodes.length > 0) {
      lastValidReactFlowPropsRef.current = result
    }

    return result
  }, [builder, handleAddNodeAfter, handleTestNode, handleTestFlowFromHere, handleReorderPointerDown, configuringNode, activeReorderDrag, getReorderableData, reorderDragOffset, reorderPreviewIndex])

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

  // Helper to open integrations panel with the correct mode (trigger vs action)
  const openIntegrationsPanel = useCallback((forceMode?: 'trigger' | 'action') => {
    let mode: 'trigger' | 'action'

    if (forceMode) {
      // If a specific mode is requested (e.g., when clicking a trigger node to change it), use that
      mode = forceMode
    } else {
      // Otherwise, determine automatically based on whether a trigger already exists
      const hasTrigger = builder.nodes.some((node: any) => {
        const component = ALL_NODE_COMPONENTS.find(c => c.type === node.data?.type)
        return component?.isTrigger
      })
      mode = hasTrigger ? 'action' : 'trigger'
    }

    // Lazy load integrations when panel opens (only if not already loaded)
    // Use workspace context to filter integrations to this workflow's workspace
    if (integrations.length === 0 && workspaceContext) {
      logger.debug('[WorkflowBuilder] Lazy-loading workspace-filtered integrations:', {
        workspaceType: workspaceContext.type,
        workspaceId: workspaceContext.id
      })
      fetchIntegrations(false, workspaceContext.type, workspaceContext.id || undefined).catch(error => {
        logger.error('[WorkflowBuilder] Failed to lazy-load integrations on panel open:', error)
      })
    }

    setIntegrationsPanelMode(mode)
    setIsIntegrationsPanelOpen(true)
  }, [builder.nodes, integrations.length, fetchIntegrations, workspaceContext])

  // Handler for adding node after another (from plus button)
  const handleAddNodeAfterClick = useCallback((afterNodeId: string | null) => {
    // Close config modal if open
    if (configuringNode) {
      setConfiguringNode(null)
    }
    // Store the node to add after
    if (afterNodeId) {
      setSelectedNodeId(afterNodeId)
    }
    // Open integrations panel in action mode
    openIntegrationsPanel('action')
  }, [configuringNode, openIntegrationsPanel])

  // Node selection from panel
  const handleNodeSelectFromPanel = useCallback(async (nodeData: any) => {
    console.log('🎯 [WorkflowBuilder] handleNodeSelectFromPanel called:', {
      nodeData: nodeData?.type || nodeData,
      selectedNodeId,
      changingNodeId,
      hasActions: !!actions,
      hasBuilder: !!builder
    })

    if (!actions || !builder) {
      console.log('⚠️ [WorkflowBuilder] Returning early - actions or builder missing')
      return
    }

    const currentNodes = builder.nodes ?? []

    // Check if we're changing an existing node (replacing its type)
    const nodeBeingChanged = changingNodeId
      ? currentNodes.find((n: any) => n.id === changingNodeId)
      : null

    // Check if we're replacing a placeholder node
    const replacingPlaceholder = currentNodes.find((n: any) =>
      n.id === selectedNodeId && n.data?.isPlaceholder
    )

    // Default position - use existing node's X to maintain alignment, or fallback to 400
    const existingNodeX = currentNodes[0]?.position?.x ?? 400
    let position = nodeData.position || { x: existingNodeX, y: 300 }

    // If changing an existing node, use its position
    if (nodeBeingChanged) {
      position = nodeBeingChanged.position
      console.log('📌 [WorkflowBuilder] Changing node:', changingNodeId, 'to:', nodeData.type)
    }
    // If replacing placeholder, use its position
    else if (replacingPlaceholder) {
      position = replacingPlaceholder.position
      console.log('📌 [WorkflowBuilder] Replacing placeholder:', selectedNodeId, 'with:', nodeData.type)
    }
    // If adding after a specific node (from plus button), calculate position after that node
    else if (selectedNodeId) {
      const afterNode = currentNodes.find((n: any) => n.id === selectedNodeId)
      if (afterNode) {
        position = {
          x: afterNode.position.x, // Use same X as the node we're adding after (maintains alignment)
          y: afterNode.position.y + 180 // Add 180px vertical spacing after the node
        }
        console.log('📌 [WorkflowBuilder] Adding node after:', selectedNodeId, 'at position:', position)
      }
    }

    const nodeComponent = nodeComponentMap.get(nodeData.type)
    const providerId = nodeComponent?.providerId ?? nodeData.providerId

    // Generate a temporary ID for the config modal
    const tempId = `temp-${Date.now()}`

    // Create optimistic node for config modal only
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
        _optimistic: true,
      },
    }

    // Close panel immediately for better UX
    setIsIntegrationsPanelOpen(false)

    // Check if this node needs configuration (has configSchema fields)
    console.log('🔧 [WorkflowBuilder] Config check:', {
      nodeType: nodeData.type,
      nodeComponentFound: !!nodeComponent,
      configSchema: nodeComponent?.configSchema,
      configSchemaLength: nodeComponent?.configSchema?.length,
    })
    const needsConfiguration = nodeComponent?.configSchema && nodeComponent.configSchema.length > 0
    console.log('🔧 [WorkflowBuilder] needsConfiguration:', needsConfiguration)

    // Add optimistic node to canvas immediately for instant feedback
    builder.setNodes((nodes: any[]) => {
      let newNodes = [...nodes]

      // If changing an existing node, remove it first (we'll replace with new type)
      if (nodeBeingChanged) {
        newNodes = newNodes.filter(n => n.id !== changingNodeId)
        // No shifting needed - just replace in place
        newNodes.push(optimisticNode)
        return newNodes
      }

      // If replacing a placeholder, remove it first
      if (replacingPlaceholder) {
        newNodes = newNodes.filter(n => n.id !== selectedNodeId)
      }

      const insertIndex = newNodes.findIndex(n => n.position.y > position.y)
      if (insertIndex === -1) {
        // Adding at the end - no shift needed
        newNodes.push(optimisticNode)
      } else {
        // Inserting between nodes - shift all nodes below down to make room
        const verticalShift = 180 // Same as vertical spacing constant
        newNodes = newNodes.map((node, idx) => {
          if (node.position && node.position.y >= position.y) {
            return {
              ...node,
              position: {
                ...node.position,
                y: node.position.y + verticalShift
              }
            }
          }
          return node
        })
        // Now insert the new node
        const newInsertIndex = newNodes.findIndex(n => n.position.y > position.y)
        if (newInsertIndex === -1) {
          newNodes.push(optimisticNode)
        } else {
          newNodes.splice(newInsertIndex, 0, optimisticNode)
        }
      }
      return newNodes
    })

    // Add optimistic edges immediately
    if (nodeBeingChanged) {
      // When changing an existing node, update edges to reference the new temp ID
      builder.setEdges((edges: any[]) => {
        return edges.map(edge => {
          // Update edges pointing TO the changed node
          if (edge.target === changingNodeId) {
            return { ...edge, target: tempId }
          }
          // Update edges FROM the changed node
          if (edge.source === changingNodeId) {
            return { ...edge, source: tempId }
          }
          return edge
        })
      })
    } else if (replacingPlaceholder) {
      // When replacing a placeholder, update edges that reference the placeholder
      builder.setEdges((edges: any[]) => {
        return edges.map(edge => {
          // Update edges pointing TO the placeholder
          if (edge.target === selectedNodeId) {
            return { ...edge, target: tempId }
          }
          // Update edges FROM the placeholder
          if (edge.source === selectedNodeId) {
            return { ...edge, source: tempId }
          }
          return edge
        })
      })
    } else if (selectedNodeId) {
      builder.setEdges((edges: any[]) => {
        const oldEdge = edges.find((e: any) => e.source === selectedNodeId)
        if (oldEdge) {
          // Inserting between two nodes
          const nextNodeId = oldEdge.target
          return [
            ...edges.filter(e => e.id !== oldEdge.id),
            {
              id: `${selectedNodeId}-${tempId}`,
              source: selectedNodeId,
              target: tempId,
              sourceHandle: oldEdge.sourceHandle || 'source',
              type: 'custom'
            },
            {
              id: `${tempId}-${nextNodeId}`,
              source: tempId,
              target: nextNodeId,
              sourceHandle: 'source',
              targetHandle: oldEdge.targetHandle,
              type: 'custom'
            }
          ]
        } else {
          // Adding at the end
          return [
            ...edges,
            {
              id: `${selectedNodeId}-${tempId}`,
              source: selectedNodeId,
              target: tempId,
              sourceHandle: 'source',
              type: 'custom'
            }
          ]
        }
      })
    }

    // Open config modal immediately (only if node needs configuration)
    if (needsConfiguration) {
      setConfiguringNode(optimisticNode)
    }

    // Save state before clearing (needed for edge creation and node replacement later)
    const previousNodeId = selectedNodeId
    const isReplacingPlaceholder = !!replacingPlaceholder
    const nodeIdBeingChanged = changingNodeId
    const isChangingNode = !!nodeBeingChanged

    // Get edges connected to the node being changed before we modify anything
    const edgesConnectedToChangedNode = isChangingNode ? builder.edges.filter((e: any) =>
      e.source === nodeIdBeingChanged || e.target === nodeIdBeingChanged
    ) : []

    // Clear selected/changing node IDs
    setSelectedNodeId(null)
    setChangingNodeId(null)

    try {
      // If changing an existing node, delete the old one first
      if (isChangingNode && nodeIdBeingChanged) {
        console.log('📌 [WorkflowBuilder] Deleting old node before adding replacement:', nodeIdBeingChanged)
        await actions.deleteNode(nodeIdBeingChanged)
      }

      // Save node to database - updateReactFlowGraph will handle UI updates including action placeholder
      console.log('📌 [WorkflowBuilder] Saving node:', nodeData.type, 'at position:', position)
      const newNode = await actions.addNode(nodeData.type, position)

      console.log('📌 [WorkflowBuilder] Node saved successfully, updateReactFlowGraph will handle placeholder')

      // Update the configuring node with the real node ID from DB
      // Note: actions.addNode returns a string (the node ID), not an object
      const newNodeId = newNode
      if (newNodeId) {
        // Only update configuring node if we opened the config modal
        if (needsConfiguration) {
          setConfiguringNode((current: any) => {
            if (current && current.id === tempId) {
              return { ...current, id: newNodeId, data: { ...current.data, _optimistic: false } }
            }
            return current
          })
        }

        // If changing a node, reconnect the edges that were connected to the old node
        if (isChangingNode && edgesConnectedToChangedNode.length > 0) {
          console.log('🔗 [WorkflowBuilder] Reconnecting edges for changed node:', edgesConnectedToChangedNode)

          for (const edge of edgesConnectedToChangedNode) {
            if (edge.source === nodeIdBeingChanged) {
              // Edge was FROM the old node - create edge FROM new node TO the target
              await actions.connectEdge({
                sourceId: newNodeId,
                targetId: edge.target,
                sourceHandle: edge.sourceHandle || 'source',
                targetHandle: edge.targetHandle
              })
            } else if (edge.target === nodeIdBeingChanged) {
              // Edge was TO the old node - create edge FROM source TO new node
              await actions.connectEdge({
                sourceId: edge.source,
                targetId: newNodeId,
                sourceHandle: edge.sourceHandle || 'source',
                targetHandle: edge.targetHandle
              })
            }
          }
          console.log('🔗 [WorkflowBuilder] Edges reconnected for changed node')
        }
        // If adding after a node (not replacing placeholder or changing), create edge and handle insertion
        // Note: Using previousNodeId which was saved before setSelectedNodeId(null) was called
        else if (previousNodeId && !isReplacingPlaceholder) {
          console.log('🔗 [WorkflowBuilder] Inserting node after:', previousNodeId)

          // Find what was connected after the selected node
          const afterNode = currentNodes.find((n: any) => n.id === previousNodeId)
          const oldEdge = builder.edges.find((e: any) => e.source === previousNodeId)

          if (oldEdge) {
            // We're inserting between two nodes
            const nextNodeId = oldEdge.target

            // Create edge from previous node to new node
            await actions.connectEdge({
              sourceId: previousNodeId,
              targetId: newNodeId,
              sourceHandle: oldEdge.sourceHandle || 'source'
            })

            // Create edge from new node to next node
            await actions.connectEdge({
              sourceId: newNodeId,
              targetId: nextNodeId,
              sourceHandle: 'source',
              targetHandle: oldEdge.targetHandle
            })

            console.log('🔗 [WorkflowBuilder] Inserted between', previousNodeId, 'and', nextNodeId)
          } else {
            // We're adding at the end
            await actions.connectEdge({
              sourceId: previousNodeId,
              targetId: newNodeId,
              sourceHandle: 'source'
            })
            console.log('🔗 [WorkflowBuilder] Added at end after', previousNodeId)
          }
        }
      }
    } catch (error: any) {
      if (needsConfiguration) {
        setConfiguringNode(null)
      }
      toast({
        title: "Failed to add node",
        description: error?.message ?? "Unable to add node",
        variant: "destructive",
      })
      openIntegrationsPanel()
    }
  }, [actions, builder, nodeComponentMap, toast, selectedNodeId, changingNodeId, openIntegrationsPanel])

  // Node deletion with optimistic update for instant feedback
  const handleDeleteNodes = useCallback(async (nodeIds: string[]) => {
    if (!actions || !builder || nodeIds.length === 0) return

    const nodeIdSet = new Set(nodeIds)

    // Store current nodes/edges for rollback if delete fails
    const currentNodes = builder.nodes
    const currentEdges = builder.edges

    // Record history snapshot for undo
    builder.pushHistorySnapshot?.(currentNodes, currentEdges)

    // Find the Y position of the deleted node(s) - use the highest (smallest Y) deleted node
    let deletedNodeY: number | null = null
    nodeIds.forEach(nodeId => {
      const node = currentNodes.find((n: any) => n.id === nodeId)
      if (node && node.position) {
        if (deletedNodeY === null || node.position.y < deletedNodeY) {
          deletedNodeY = node.position.y
        }
      }
    })

    // Optimistically remove nodes from UI immediately
    let updatedNodes = currentNodes.filter((node: any) => !nodeIdSet.has(node.id))

    // Shift nodes up if we have a deleted position
    if (deletedNodeY !== null) {
      // Calculate the vertical gap (node height + spacing)
      // Typical node height is ~100-200px, gap between nodes is ~180px
      const verticalShift = LINEAR_NODE_VERTICAL_GAP

      // Shift all nodes that were below the deleted node(s)
      updatedNodes = updatedNodes.map((node: any) => {
        if (node.position && node.position.y > deletedNodeY!) {
          return {
            ...node,
            position: {
              ...node.position,
              y: node.position.y - verticalShift
            }
          }
        }
        return node
      })
    }

    // For each deleted node, find incoming and outgoing edges and reconnect them
    const newEdges: any[] = []
    nodeIds.forEach(nodeId => {
      const incomingEdge = currentEdges.find((e: any) => e.target === nodeId)
      const outgoingEdge = currentEdges.find((e: any) => e.source === nodeId)

      // If the deleted node was in the middle of a chain, reconnect the edges
      if (incomingEdge && outgoingEdge) {
        newEdges.push({
          id: `${incomingEdge.source}-${outgoingEdge.target}`,
          source: incomingEdge.source,
          target: outgoingEdge.target,
          sourceHandle: incomingEdge.sourceHandle || 'source',
          targetHandle: outgoingEdge.targetHandle || 'target',
          type: 'custom',
        })
      }
    })

    // Remove edges connected to deleted nodes and add reconnection edges
    const updatedEdges = [
      ...currentEdges.filter(
        (edge: any) => !nodeIdSet.has(edge.source) && !nodeIdSet.has(edge.target)
      ),
      ...newEdges
    ]

    // Check if all real (non-placeholder) nodes are being deleted
    const realNodes = updatedNodes.filter((n: any) => !n.data?.isPlaceholder)
    const shouldResetToPlaceholders = realNodes.length === 0

    // Calculate center position based on viewport and agent panel
    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080
    const panelWidth = agentOpen ? agentPanelWidth : 0
    const availableWidth = viewportWidth - panelWidth
    const centerX = panelWidth + (availableWidth / 2) - 180 // 180 = half of 360px node width
    const centerY = (viewportHeight / 2) - 150

    if (shouldResetToPlaceholders) {
      console.log('🔄 [WorkflowBuilder] All nodes deleted, resetting to placeholder state')

      // Reset to placeholder state (Zapier-style, centered)
      const placeholderNodes = [
        {
          id: 'trigger-placeholder',
          type: 'trigger_placeholder',
          position: { x: centerX, y: centerY },
          data: {
            type: 'trigger_placeholder',
            isPlaceholder: true,
            title: 'Trigger',
          },
        },
        {
          id: 'action-placeholder',
          type: 'action_placeholder',
          position: { x: centerX, y: centerY + 180 },
          data: {
            type: 'action_placeholder',
            isPlaceholder: true,
            title: 'Action',
          },
        },
      ]

      const placeholderEdge = {
        id: 'placeholder-edge',
        source: 'trigger-placeholder',
        target: 'action-placeholder',
        type: 'default',
        style: {
          strokeDasharray: '5,5',
          stroke: '#9CA3AF',
        },
      }

      builder.setNodes(placeholderNodes as any)
      builder.setEdges([placeholderEdge] as any)

      // Center view on placeholders after a brief delay
      setTimeout(() => {
        if (reactFlowInstanceRef.current) {
          reactFlowInstanceRef.current.fitView({
            padding: 0.2,
            duration: 400,
            maxZoom: 1,
          })
        }
      }, 100)
    } else {
      // Simple check: is there a real trigger node (isTrigger=true AND NOT a placeholder)?
      const hasRealTrigger = updatedNodes.some((n: any) => {
        const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === n.data?.type)
        const isTrigger = n.data?.isTrigger || nodeComponent?.isTrigger
        return isTrigger && !n.data?.isPlaceholder
      })

      // If no real trigger, add a trigger placeholder (unless one already exists)
      const hasTriggerPlaceholder = updatedNodes.some((n: any) =>
        n.type === 'trigger_placeholder' || n.id === 'trigger-placeholder'
      )

      if (!hasRealTrigger && !hasTriggerPlaceholder && updatedNodes.length > 0) {
        console.log('🔄 [WorkflowBuilder] No trigger found, adding trigger placeholder')

        // Find the topmost node to place trigger placeholder above it
        const sortedNodes = [...updatedNodes].sort((a: any, b: any) => a.position.y - b.position.y)
        const topNode = sortedNodes[0]

        if (topNode) {
          const triggerPlaceholder = {
            id: 'trigger-placeholder',
            type: 'trigger_placeholder',
            position: {
              x: topNode.position.x,
              y: topNode.position.y - LINEAR_NODE_VERTICAL_GAP
            },
            data: {
              type: 'trigger_placeholder',
              isPlaceholder: true,
              title: 'Trigger',
            },
          }

          updatedNodes = [triggerPlaceholder, ...updatedNodes]

          updatedEdges.push({
            id: `trigger-placeholder-${topNode.id}`,
            source: 'trigger-placeholder',
            target: topNode.id,
            sourceHandle: 'source',
            targetHandle: 'target',
            type: 'custom',
            style: { stroke: '#d0d6e0' },
          })
        }
      }

      builder.setNodes(updatedNodes)
      builder.setEdges(updatedEdges)
    }

    // Clear selection when deleting current node(s)
    setSelectedNodeId(prev => (prev && nodeIdSet.has(prev) ? null : prev))

    // Close config modal if the deleted node is currently being configured
    if (configuringNode && nodeIdSet.has(configuringNode.id)) {
      setConfiguringNode(null)
    }

    // Persist to backend without waiting for response
    // The UI is already updated optimistically above - don't let backend response overwrite it
    const deleteEdits = nodeIds.map(nodeId => ({ op: "deleteNode", nodeId }))
    actions.applyEdits(deleteEdits).catch((error: any) => {
      // Rollback on error
      builder.setNodes(currentNodes)
      builder.setEdges(currentEdges)

      toast({
        title: "Failed to delete node",
        description: error?.message ?? "Unable to delete node(s)",
        variant: "destructive",
      })
    })
  }, [actions, builder, toast, agentOpen, agentPanelWidth, configuringNode])

  const handleNodeDelete = useCallback(async (nodeId: string) => {
    await handleDeleteNodes([nodeId])
  }, [handleDeleteNodes])

  // Handle node rename
  const handleNodeRename = useCallback(async (nodeId: string, newTitle: string) => {
    if (!actions || !builder) return

    const currentNodes = builder.nodes
    const updatedNodes = currentNodes.map((node: any) =>
      node.id === nodeId
        ? { ...node, data: { ...node.data, title: newTitle } }
        : node
    )

    // Optimistically update UI
    builder.setNodes(updatedNodes)

    try {
      // Persist the rename to backend
      await actions.applyEdits([{
        op: "updateNode",
        nodeId,
        updates: { title: newTitle }
      }])
    } catch (error: any) {
      // Rollback on error
      builder.setNodes(currentNodes)
      toast({
        title: "Failed to rename node",
        description: error?.message ?? "Unable to rename node",
        variant: "destructive",
      })
    }
  }, [actions, builder, toast])

  // Handle changing a node's type (opens integrations panel to select new type)
  const handleChangeNode = useCallback((nodeId: string) => {
    if (!builder?.nodes) return

    const node = builder.nodes.find((n: any) => n.id === nodeId)
    if (!node) return

    // Determine if this is a trigger or action
    const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === node.data?.type)
    const isTrigger = node.data?.isTrigger || nodeComponent?.isTrigger

    // Store the node ID we're changing (so when user selects from panel, we know to replace)
    setChangingNodeId(nodeId)
    setSelectedNodeId(null)
    setAddingAfterNodeId(null)

    // Open integrations panel with correct mode
    openIntegrationsPanel(isTrigger ? 'trigger' : 'action')

    console.log(`[WorkflowBuilder] Opening integrations panel to change ${isTrigger ? 'trigger' : 'action'} node:`, nodeId)
  }, [builder?.nodes, openIntegrationsPanel])

  // Handle node duplication
  const handleNodeDuplicate = useCallback(async (nodeId: string) => {
    if (!actions || !builder) return

    const currentNodes = builder.nodes
    const currentEdges = builder.edges

    // Find the node to duplicate
    const nodeToDuplicate = currentNodes.find((n: any) => n.id === nodeId)
    if (!nodeToDuplicate) {
      toast({
        title: "Cannot duplicate node",
        description: "Node not found",
        variant: "destructive",
      })
      return
    }

    // Generate a temporary ID for the duplicate
    const tempId = `node-${Date.now()}`

    // Use same X position as the original node to maintain alignment
    const newPosition = {
      x: nodeToDuplicate.position.x,
      y: nodeToDuplicate.position.y + 180,
    }

    // Create duplicate with "(Copy)" suffix
    const originalTitle = nodeToDuplicate.data?.title || 'Node'
    const duplicateTitle = `${originalTitle} (Copy)`

    // Create optimistic duplicate node
    const duplicateNode = {
      ...nodeToDuplicate,
      id: tempId,
      position: newPosition,
      data: {
        ...nodeToDuplicate.data,
        title: duplicateTitle,
        _optimistic: true,
      },
    }

    // Update UI optimistically
    const updatedNodes = [...currentNodes, duplicateNode]
    builder.setNodes(updatedNodes)

    try {
      // Add the node to backend
      // Note: actions.addNode returns a string (the node ID), not an object
      const newNodeId = await actions.addNode(nodeToDuplicate.data?.type, newPosition)

      if (newNodeId) {
        // Update with real ID from backend
        const finalNodes = builder.nodes.map((n: any) =>
          n.id === tempId
            ? { ...n, id: newNodeId, data: { ...n.data, _optimistic: false } }
            : n
        )
        builder.setNodes(finalNodes)

        // Apply configuration if the original node had config
        if (nodeToDuplicate.data?.config && Object.keys(nodeToDuplicate.data.config).length > 0) {
          await actions.updateConfig(newNodeId, nodeToDuplicate.data.config)
        }

        // Apply the title
        await actions.applyEdits([{
          op: "updateNode",
          nodeId: newNodeId,
          updates: { title: duplicateTitle }
        }])

        toast({
          title: "Node duplicated",
          description: `Created duplicate: ${duplicateTitle}`,
        })
      }
    } catch (error: any) {
      // Rollback on error
      builder.setNodes(currentNodes)
      builder.setEdges(currentEdges)
      toast({
        title: "Failed to duplicate node",
        description: error?.message ?? "Unable to duplicate node",
        variant: "destructive",
      })
    }
  }, [actions, builder, toast])

  // Handle add note to node
  const handleAddNote = useCallback(async (nodeId: string) => {
    if (!actions || !builder) return

    const currentNodes = builder.nodes
    const node = currentNodes.find((n: any) => n.id === nodeId)

    if (!node) {
      toast({
        title: "Cannot add note",
        description: "Node not found",
        variant: "destructive",
      })
      return
    }

    // Prompt for note text
    const currentNote = node.data?.note || ''
    const noteText = prompt(
      currentNote ? 'Edit note:' : 'Add a note to this node:',
      currentNote
    )

    // If user cancelled or entered empty string, don't update
    if (noteText === null) return

    // Update node with note
    const updatedNodes = currentNodes.map((n: any) =>
      n.id === nodeId
        ? { ...n, data: { ...n.data, note: noteText.trim() || undefined } }
        : n
    )

    // Optimistically update UI
    builder.setNodes(updatedNodes)

    try {
      // Persist the note to backend
      await actions.applyEdits([{
        op: "updateNode",
        nodeId,
        updates: { note: noteText.trim() || null }
      }])

      if (noteText.trim()) {
        toast({
          title: "Note added",
          description: "Node note has been saved",
        })
      } else {
        toast({
          title: "Note removed",
          description: "Node note has been cleared",
        })
      }
    } catch (error: any) {
      // Rollback on error
      builder.setNodes(currentNodes)
      toast({
        title: "Failed to save note",
        description: error?.message ?? "Unable to save node note",
        variant: "destructive",
      })
    }
  }, [actions, builder, toast])

  // Handle node configuration (click or manual trigger)
  const handleNodeConfigure = useCallback(async (nodeId: string) => {
    const node = reactFlowProps?.nodes?.find((n: any) => n.id === nodeId)
    if (node) {
      console.log('🔧 [WorkflowBuilder] Opening configuration for node:', nodeId, node)

      // Check if this is a placeholder node
      if (node.data?.isPlaceholder) {
        console.log('📌 [WorkflowBuilder] Placeholder node clicked, opening integrations panel')

        // Check if this is the first node in the workflow (trigger position)
        // First node has no incoming edges
        const isFirstNode = !reactFlowProps?.edges?.some((edge: any) => edge.target === nodeId)

        // First node always opens trigger menu, all others open action menu
        const mode = isFirstNode ? 'trigger' : 'action'

        // Open integrations panel with the correct mode
        openIntegrationsPanel(mode)
        // Store which placeholder we're replacing
        setSelectedNodeId(nodeId)
        return
      }

      // For regular (configured) nodes, open their configuration modal
      // Prefetch config data before opening modal for instant UX
      // Note: node type can be in node.data.type, node.data.nodeType, or extracted from node id
      const nodeType = node.data?.type || node.data?.nodeType || nodeId.split('-')[0]
      const nodeInfo = getNodeByType(nodeType)

      console.log('🔧 [WorkflowBuilder] Looking up node info:', { nodeType, found: !!nodeInfo, configSchemaLength: nodeInfo?.configSchema?.length })

      // Check if this node has any configuration fields
      const hasConfigFields = nodeInfo?.configSchema && nodeInfo.configSchema.length > 0

      // Skip config modal for nodes with no configuration (like Manual Trigger)
      if (!hasConfigFields) {
        console.log('🔧 [WorkflowBuilder] Node has no config fields, skipping config modal:', nodeType)
        return
      }

      if (nodeInfo && nodeInfo.configSchema) {
        console.log('🚀 [WorkflowBuilder] Prefetching config data for:', nodeType)
        // Don't await - let it load in parallel with modal opening
        prefetchNodeConfig(
          nodeType,
          nodeInfo.providerId || '',
          nodeInfo.configSchema
        ).catch(err => {
          console.warn('⚠️ [WorkflowBuilder] Prefetch failed (non-critical):', err)
        })
      }

      // Close integrations panel when opening configuration modal
      setIsIntegrationsPanelOpen(false)

      setConfiguringNode(node)
    } else {
      console.warn('🔧 [WorkflowBuilder] Node not found for configuration:', nodeId)
    }
  }, [reactFlowProps?.nodes, reactFlowProps?.edges, prefetchNodeConfig, openIntegrationsPanel, setSelectedNodeId])

  // Handle saving node configuration
  const handleSaveNodeConfig = useCallback(async (nodeId: string, config: Record<string, any>) => {
    console.log('💾 [WorkflowBuilder] Saving configuration for node:', nodeId, config)
    console.log('💾 [WorkflowBuilder] __validationState in config:', config.__validationState)

    if (!actions || !builder) {
      console.warn('💾 [WorkflowBuilder] No actions or builder available to save config')
      return
    }

    try {
      // INSTANT UPDATE: Update the config in localStorage immediately for instant reopen
      if (typeof window !== 'undefined' && flowId) {
        const cacheKey = `workflow_${flowId}_node_${nodeId}_config`;
        const stored = safeLocalStorageSet(cacheKey, {
          config: config,
          timestamp: Date.now()
        });
        if (stored) {
          console.log('💾 [WorkflowBuilder] Cached config locally for instant reopen');
        }
      }

      // INSTANT VALIDATION UPDATE: Update node data immediately with validation state
      // This ensures the incomplete badge is removed instantly before the debounced API call
      const currentNodes = builder.nodes || []
      const updatedNodes = currentNodes.map((node: any) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              config,
              validationState: config.__validationState,
              // Clear needsSetup if validation is now complete
              needsSetup: config.__validationState?.isValid === false || (config.__validationState?.missingRequired?.length ?? 0) > 0
            }
          }
        }
        return node
      })
      builder.setNodes(updatedNodes)
      console.log('✅ [WorkflowBuilder] Updated node validation state instantly')

      // Update the node with the new config (debounced 600ms for API persistence)
      actions.updateConfig(nodeId, config)
    } catch (error: any) {
      console.error('💾 [WorkflowBuilder] Error saving config:', error)
      toast({
        title: "Failed to save configuration",
        description: error?.message ?? "Unable to save node configuration",
        variant: "destructive",
      })
    }
  }, [actions, builder, toast, flowId])

  // Validation: Check if workflow has placeholders
  const hasPlaceholders = useCallback(() => {
    if (!builder?.nodes) return false
    return builder.nodes.some((n: any) => n.data?.isPlaceholder)
  }, [builder?.nodes])

  // Handle workflow activation with placeholder validation
  const handleToggleLiveWithValidation = useCallback(() => {
    // Check for placeholders - button should be disabled, but just in case
    if (hasPlaceholders()) {
      return
    }

    // If no placeholders, show coming soon (activation not implemented yet for Flow V2)
    toast({
      title: "Coming soon",
      description: "This action is not yet wired to the Flow v2 backend.",
    })
  }, [hasPlaceholders, toast])

  // Get test store actions
  const {
    testFlowStatus,
    listeningTimeRemaining,
    interceptedActions,
    startListening,
    updateListeningTime,
    startExecution,
    setNodeCompleted,
    setNodeFailed,
    addInterceptedAction,
    finishTestFlow,
    cancelTestFlow,
    resetTestFlow,
    // NEW: Enhanced node execution methods
    setNodeRunning,
    setNodePaused,
    setNodeCompletedWithDetails,
    setNodeFailedWithDetails,
  } = useWorkflowTestStore()

  // Stop execution polling
  const stopExecutionPolling = useCallback(() => {
    if (executionPollIntervalRef.current) {
      clearInterval(executionPollIntervalRef.current)
      executionPollIntervalRef.current = null
    }
    pausedExecutionIdRef.current = null
    lastSyncedProgressRef.current = { currentNodeId: null, completedNodes: [] }
  }, [])

  // Start polling for execution status (after HITL pause resumes via external webhook)
  const startExecutionPolling = useCallback((executionId: string) => {
    if (executionPollIntervalRef.current) return // Already polling

    console.log('[POLL] Starting execution polling for:', executionId)

    const pollExecution = async () => {
      try {
        const response = await fetch(`/api/workflows/${flowId}/execution-status/${executionId}`)
        if (!response.ok) {
          console.log('[POLL] Response not ok:', response.status)
          return
        }

        const data = await response.json()
        const progress = data.progress
        console.log('[POLL] Got progress:', progress)

        if (!progress) return

        // Sync with workflow test store for node visual states
        const lastSynced = lastSyncedProgressRef.current

        // Sync current running/paused node
        if (progress.currentNodeId && progress.currentNodeId !== lastSynced.currentNodeId) {
          if (progress.status === 'paused') {
            console.log('[POLL] Setting node paused:', progress.currentNodeId)
            setNodePaused(progress.currentNodeId, undefined, progress.currentNodeName)
          } else {
            console.log('[POLL] Setting node running:', progress.currentNodeId)
            setNodeRunning(progress.currentNodeId, undefined, progress.currentNodeName)
          }
          lastSyncedProgressRef.current.currentNodeId = progress.currentNodeId
        } else if (progress.status === 'paused' && progress.currentNodeId) {
          // If status changed to paused for the same node, update it
          setNodePaused(progress.currentNodeId, undefined, progress.currentNodeName)
        }

        // Sync completed nodes
        if (progress.completedNodes) {
          const newlyCompleted = progress.completedNodes.filter(
            (nodeId: string) => !lastSynced.completedNodes.includes(nodeId)
          )
          const nodeOutputs = progress.nodeOutputs || {}
          newlyCompleted.forEach((nodeId: string) => {
            const nodeOutput = nodeOutputs[nodeId] || {}
            // Get execution time from output - could be 'duration' (HITL) or 'executionTime' or from metadata
            const executionTimeMs = nodeOutput.metadata?.executionTime ||
                                    (nodeOutput.duration ? nodeOutput.duration * 1000 : 0) ||
                                    nodeOutput.executionTime ||
                                    0
            const preview = nodeOutput.conversationSummary ||
                           nodeOutput.message ||
                           nodeOutput.preview ||
                           'Completed'
            console.log('[POLL] Setting node completed:', nodeId, { executionTimeMs, preview })
            setNodeCompletedWithDetails(nodeId, nodeOutput, preview, executionTimeMs)
          })
          lastSyncedProgressRef.current.completedNodes = [...progress.completedNodes]
        }

        // Sync failed nodes
        if (progress.failedNodes) {
          const nodeOutputs = progress.nodeOutputs || {}
          progress.failedNodes.forEach((failed: { nodeId: string; error: string }) => {
            const nodeOutput = nodeOutputs[failed.nodeId] || {}
            const executionTimeMs = nodeOutput.metadata?.executionTime || 0
            console.log('[POLL] Setting node failed:', failed.nodeId)
            setNodeFailedWithDetails(failed.nodeId, failed.error, executionTimeMs)
          })
        }

        // Check if execution completed or failed
        if (progress.status === 'completed' || progress.status === 'failed') {
          console.log('[POLL] Execution finished:', progress.status)
          stopExecutionPolling()
          finishTestFlow(progress.status === 'completed' ? 'completed' : 'error', progress.errorMessage)
          toast({
            title: progress.status === 'completed' ? 'Workflow completed' : 'Workflow failed',
            description: progress.errorMessage || (progress.status === 'completed' ? 'All steps executed successfully' : 'An error occurred'),
            variant: progress.status === 'completed' ? 'default' : 'destructive'
          })
        }
        // Note: Don't stop polling when paused - we want to detect when it resumes
      } catch (error) {
        console.error('[POLL] Error polling execution status:', error)
      }
    }

    // Poll immediately and then every 1 second
    pollExecution()
    executionPollIntervalRef.current = setInterval(pollExecution, 1000)
  }, [flowId, setNodeRunning, setNodePaused, setNodeCompletedWithDetails, setNodeFailedWithDetails, finishTestFlow, toast])

  // Get trigger type for the TestModeDialog
  const triggerNode = builder?.nodes?.find((n: any) => n.data?.isTrigger && !n.data?.isPlaceholder)
  const triggerType = triggerNode?.data?.type

  // Handler to open the Test Mode Dialog
  const handleOpenTestDialog = useCallback(() => {
    if (!builder?.nodes || hasPlaceholders()) {
      toast({
        title: "Cannot test",
        description: "Please configure all nodes before testing.",
        variant: "destructive",
      })
      return
    }
    setIsTestModeDialogOpen(true)
  }, [builder?.nodes, hasPlaceholders, toast])

  // Check if workflow has a published revision (required for API key generation)
  const hasPublishedRevision = Boolean(flowState?.revisionId)

  // Handler to generate API key for published workflow
  const handleGenerateApiKey = useCallback(() => {
    toast({
      title: "API Key",
      description: "API key generation coming soon!",
    })
  }, [toast])

  // Handler for when user starts a test from the dialog
  const handleRunTestFromDialog = useCallback(async (config: TestModeConfig, mockVariation?: string) => {
    console.log('[TEST] handleRunTestFromDialog called', { config, mockVariation })
    setIsTestModeDialogOpen(false)

    if (!builder?.nodes) {
      console.log('[TEST] No builder nodes, returning early')
      return
    }

    // Create an abort controller for this test run
    if (testAbortControllerRef.current) {
      testAbortControllerRef.current.abort()
    }
    const abortController = new AbortController()
    testAbortControllerRef.current = abortController

    const nodes = builder.nodes
    const edges = builder.edges || []
    const triggerNode = nodes.find((n: any) => n.data?.isTrigger && !n.data?.isPlaceholder)

    const isLiveMode = config.actionMode === ActionTestMode.EXECUTE_ALL
    const waitForTrigger = config.triggerMode === TriggerTestMode.WAIT_FOR_REAL

    // Store trigger data when received
    let triggerEventData: any = null
    let timerInterval: NodeJS.Timeout | null = null

    try {
      console.log('[TEST] Starting test execution', { waitForTrigger, hasTriggerNode: !!triggerNode })

      // If waiting for real trigger, start listening
      if (waitForTrigger && triggerNode) {
        console.log('[TEST] Waiting for real trigger')
        startListening(config)

        toast({
          title: isLiveMode ? "Live Mode" : "Test Mode",
          description: "Listening for trigger event... Perform the action to trigger your workflow.",
        })

        // Start countdown timer
        const startTime = Date.now()
        const timeout = config.triggerTimeout || 60000

        timerInterval = setInterval(() => {
          if (abortController.signal.aborted) {
            if (timerInterval) clearInterval(timerInterval)
            return
          }
          const elapsed = Date.now() - startTime
          const remaining = Math.max(0, Math.ceil((timeout - elapsed) / 1000))
          updateListeningTime(remaining)

          if (remaining <= 0) {
            if (timerInterval) clearInterval(timerInterval)
          }
        }, 1000)

        // Call the test-trigger API with abort signal
        const triggerResponse = await fetch('/api/workflows/test-trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflowId: flowId,
            nodeId: triggerNode.id,
            nodes: builder?.nodes,
            connections: builder?.edges,
          }),
          signal: abortController.signal,
        })

        if (timerInterval) clearInterval(timerInterval)

        // Check if aborted
        if (abortController.signal.aborted) {
          console.log('[TEST] Test was aborted')
          return
        }

        console.log('[TEST] Trigger API response status:', triggerResponse.status)

        if (!triggerResponse.ok) {
          throw new Error('Failed to activate trigger')
        }

        const triggerResult = await triggerResponse.json()
        console.log('[TEST] Trigger result:', triggerResult)

        if (!triggerResult.testSessionId) {
          throw new Error('Missing test session ID')
        }

        testSessionIdRef.current = triggerResult.testSessionId

        const streamUrl = `/api/workflows/test-trigger/stream?sessionId=${encodeURIComponent(triggerResult.testSessionId)}&workflowId=${encodeURIComponent(flowId)}&timeoutMs=${timeout}`
        const streamResponse = await fetch(streamUrl, { signal: abortController.signal })

        if (!streamResponse.ok) {
          throw new Error('Failed to open trigger stream')
        }

        const reader = streamResponse.body?.getReader()
        const decoder = new TextDecoder()

        if (!reader) {
          throw new Error('No trigger stream available')
        }

        let buffer = ''
        let triggerReceived = false

        while (true) {
          if (abortController.signal.aborted) {
            reader.cancel()
            break
          }

          const { done, value } = await reader.read()
          if (done) {
            break
          }

          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const event = JSON.parse(line.slice(6))
              console.log('[TEST] Trigger stream event:', event)

              if (event.type === 'trigger_received') {
                triggerEventData = event.data
                triggerReceived = true
                break
              }

              if (event.type === 'timeout') {
                if (isMountedRef.current) {
                  finishTestFlow('cancelled', 'No event received within timeout')
                  cleanupTestTrigger()
                  toast({
                    title: "Timeout",
                    description: "No trigger event received. Try again or use mock data.",
                    variant: "destructive",
                  })
                }
                return
              }

              if (event.type === 'error') {
                throw new Error(event.message || 'Trigger stream error')
              }
            } catch (parseError) {
              console.log('[TEST] Trigger stream parse error:', parseError, 'Line:', line)
            }
          }

          if (triggerReceived) {
            break
          }
        }

        if (!triggerReceived) {
          return
        }

        console.log('[SSE] Trigger event received:', { triggerEventData, testSessionId: triggerResult.testSessionId })

        if (isMountedRef.current) {
          toast({
            title: "Trigger received!",
            description: "Executing workflow...",
          })
        }
      }

      // Check if aborted before continuing
      if (abortController.signal.aborted) {
        console.log('[TEST] Test was aborted before SSE execution')
        return
      }

      console.log('[SSE] Starting workflow execution phase')

      // Execute the workflow with SSE streaming for real-time updates
      setIsFlowTesting(true)

      // Reset test flow state for execution phase
      resetTestFlow()

      console.log('[SSE] Starting SSE execution stream', {
        workflowId: flowId,
        hasTriggerData: !!triggerEventData,
        skipTrigger: !waitForTrigger
      })

      const response = await fetch('/api/workflows/execute-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: flowId,
          nodes: builder?.nodes,
          connections: builder?.edges,
          inputData: {
            trigger: triggerEventData,
            ...(triggerEventData || {})
          },
          options: {
            testMode: !isLiveMode,
            skipTrigger: !waitForTrigger,
            mockVariation,
          }
        }),
        signal: abortController.signal,
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.log('[SSE] Response not OK:', response.status, errorText)
        throw new Error(`Workflow execution failed: ${response.status}`)
      }

      console.log('[SSE] Response received, status:', response.status)

      // Read SSE stream for real-time node updates
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        console.log('[SSE] No reader available')
        throw new Error('No response stream available')
      }

      console.log('[SSE] Starting to read stream...')
      let buffer = ''

      while (true) {
        // Check if aborted
        if (abortController.signal.aborted) {
          console.log('[SSE] Stream reading aborted')
          reader.cancel()
          break
        }

        const { done, value } = await reader.read()

        if (done) {
          console.log('[SSE] Stream done')
          break
        }

        const chunk = decoder.decode(value, { stream: true })
        console.log('[SSE] Received chunk:', chunk.length, 'chars')
        buffer += chunk

        // Parse SSE events from buffer
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))
              console.log('[SSE] Event received:', event)

              switch (event.type) {
                case 'workflow_started':
                  console.log('[SSE] Workflow started, executionId:', event.executionId)
                  // Store executionId for potential polling after HITL pause
                  pausedExecutionIdRef.current = event.executionId
                  break

                case 'node_started':
                  console.log('[SSE] Setting node running:', event.nodeId)
                  setNodeRunning(
                    event.nodeId,
                    event.nodeType,
                    event.nodeTitle,
                    event.preview
                  )
                  break

                case 'node_completed':
                  console.log('[SSE] Setting node completed:', event.nodeId)
                  setNodeCompletedWithDetails(
                    event.nodeId,
                    event.output,
                    event.preview || 'Completed',
                    event.executionTime || 0,
                    event.nodeType,
                    event.nodeTitle
                  )
                  break

                case 'node_failed':
                  console.log('[SSE] Setting node failed:', event.nodeId, event.error)
                  setNodeFailedWithDetails(
                    event.nodeId,
                    event.error || 'Unknown error',
                    event.executionTime || 0,
                    event.nodeType,
                    event.nodeTitle
                  )
                  break

                case 'node_paused':
                  console.log('[SSE] Setting node paused:', event.nodeId)
                  setNodePaused(
                    event.nodeId,
                    event.nodeType,
                    event.nodeTitle,
                    event.preview || 'Waiting for human input...'
                  )
                  break

                case 'workflow_paused':
                  console.log('[SSE] Workflow paused at:', event.pausedAt)
                  // Note: setNodePaused already sets testFlowStatus to 'paused'
                  // Show toast notification
                  toast({
                    title: "Workflow paused",
                    description: event.reason || "Waiting for human input...",
                  })
                  // Start polling for execution status to detect when workflow resumes
                  if (pausedExecutionIdRef.current) {
                    console.log('[SSE] Starting polling for resumed execution:', pausedExecutionIdRef.current)
                    startExecutionPolling(pausedExecutionIdRef.current)
                  }
                  break

                case 'workflow_completed':
                  console.log('[SSE] Workflow completed')
                  stopExecutionPolling() // Stop polling if it was running
                  finishTestFlow('completed')
                  // Deactivate the test webhook now that workflow is complete
                  cleanupTestTrigger()
                  toast({
                    title: isLiveMode ? "Workflow executed" : "Test completed",
                    description: "Workflow executed successfully.",
                  })
                  break

                case 'workflow_failed':
                  console.log('[SSE] Workflow failed:', event.error)
                  stopExecutionPolling() // Stop polling if it was running
                  finishTestFlow('error', event.error)
                  // Deactivate the test webhook even on failure
                  cleanupTestTrigger()
                  toast({
                    title: "Execution failed",
                    description: event.error || "Workflow execution failed",
                    variant: "destructive",
                  })
                  break

                default:
                  console.log('[SSE] Unknown event type:', event.type)
              }
            } catch (parseError) {
              console.log('[SSE] Parse error:', parseError, 'Line:', line)
            }
          }
        }
      }

    } catch (error: any) {
      // Don't show error for aborted requests
      if (error.name === 'AbortError' || abortController.signal.aborted) {
        console.log('[TEST] Test was aborted')
        return
      }
      console.log('[TEST] Error in test execution:', error)
      if (isMountedRef.current) {
        finishTestFlow('error', error.message)
        toast({
          title: "Execution failed",
          description: error.message || "Failed to execute workflow",
          variant: "destructive",
        })
      }
    } finally {
      // Clean up timer if it's still running
      if (timerInterval) {
        clearInterval(timerInterval)
      }
      if (isMountedRef.current) {
        setIsFlowTesting(false)
      }
    }
  }, [builder?.nodes, builder?.edges, flowId, toast, startListening, updateListeningTime, finishTestFlow, resetTestFlow, setNodeRunning, setNodeCompletedWithDetails, setNodeFailedWithDetails, cleanupTestTrigger])

  // Handle test workflow - run from start to finish
  const handleTestWorkflow = useCallback(async () => {
    if (!builder?.nodes || hasPlaceholders()) {
      return
    }

    const nodes = builder.nodes
    const triggerNode = nodes.find((n: any) => n.data?.isTrigger && !n.data?.isPlaceholder)
    const hasTrigger = Boolean(triggerNode)

    // If there's a trigger, ask user if they want to include it
    let includeTrigger = false
    if (hasTrigger) {
      const userChoice = window.confirm(
        "Do you want to test the trigger?\n\n" +
        "• Yes: Wait for trigger event (webhook/scheduled)\n" +
        "• No: Skip trigger and test actions only"
      )
      includeTrigger = userChoice
    }

    try {
      // Find the first action node if we're skipping trigger
      let startNodeId: string | undefined
      if (!includeTrigger && hasTrigger) {
        const firstActionNode = nodes.find((n: any) =>
          !n.data?.isPlaceholder && n.data?.nodeType && !n.data?.isTrigger
        )

        if (!firstActionNode) {
          toast({
            title: "No action nodes",
            description: "Add at least one action node to test the workflow.",
            variant: "destructive",
          })
          return
        }
        startNodeId = firstActionNode.id
      }

      // Set all nodes to running state
      const updatedNodes = nodes.map((n: any) => ({
        ...n,
        data: {
          ...n.data,
          state: 'running',
        }
      }))
      builder.setNodes(updatedNodes)

      const testingMessage = includeTrigger
        ? "Waiting for trigger event..."
        : "Testing workflow actions..."

      toast({
        title: "Testing workflow",
        description: testingMessage,
      })

      // If testing with trigger, we need to register webhook/wait for event
      let triggerData = {}
      if (includeTrigger && triggerNode) {
        try {
          // Call test-trigger API to activate trigger and wait for event
          const triggerResponse = await fetch('/api/workflows/test-trigger', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              workflowId: flowId,
              nodeId: triggerNode.id,
              nodes: builder?.nodes, // Pass nodes for unsaved workflows
              connections: builder?.edges, // Pass edges/connections for unsaved workflows
            }),
          })

          if (!triggerResponse.ok) {
            throw new Error(`Trigger test failed: ${triggerResponse.statusText}`)
          }

          const triggerResult = await triggerResponse.json()

          if (!triggerResult.testSessionId) {
            throw new Error('Missing test session ID')
          }

          testSessionIdRef.current = triggerResult.testSessionId

          const streamUrl = `/api/workflows/test-trigger/stream?sessionId=${encodeURIComponent(triggerResult.testSessionId)}&workflowId=${encodeURIComponent(flowId)}&timeoutMs=60000`
          const streamResponse = await fetch(streamUrl)

          if (!streamResponse.ok) {
            throw new Error('Failed to open trigger stream')
          }

          const reader = streamResponse.body?.getReader()
          const decoder = new TextDecoder()

          if (!reader) {
            throw new Error('No trigger stream available')
          }

          let buffer = ''
          let triggerReceived = false

          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              try {
                const event = JSON.parse(line.slice(6))
                console.log('[TEST] Trigger stream event:', event)

                if (event.type === 'trigger_received') {
                  triggerData = event.data
                  triggerReceived = true
                  break
                }

                if (event.type === 'timeout') {
                  break
                }

                if (event.type === 'error') {
                  throw new Error(event.message || 'Trigger stream error')
                }
              } catch (parseError) {
                console.log('[TEST] Trigger stream parse error:', parseError, 'Line:', line)
              }
            }

            if (triggerReceived) {
              break
            }
          }

          if (triggerReceived) {
            toast({
              title: "Trigger event received",
              description: "Now executing workflow with trigger data...",
            })
          } else {
            // Timeout - show webhook URL and give option to continue
            const shouldContinue = window.confirm(
              `No trigger event received within 60 seconds.\n\n` +
              `Webhook URL: ${triggerResult.webhookUrl || 'N/A'}\n\n` +
              `Do you want to continue testing without trigger data?`
            )

            cleanupTestTrigger()

            if (!shouldContinue) {
              // User cancelled - clear running states
              const clearedNodes = nodes.map((n: any) => ({
                ...n,
                data: {
                  ...n.data,
                  state: undefined,
                }
              }))
              builder.setNodes(clearedNodes)
              return
            }

            // User wants to continue - skip trigger
            const firstActionNode = nodes.find((n: any) =>
              !n.data?.isPlaceholder && n.data?.nodeType && !n.data?.isTrigger
            )
            if (firstActionNode) {
              startNodeId = firstActionNode.id
            }
          }
        } catch (error: any) {
          logger.error('Trigger test failed:', error)
          toast({
            title: "Trigger test failed",
            description: error.message || "Unable to test trigger. Testing actions only...",
            variant: "destructive",
          })

          // Fall back to testing without trigger
          const firstActionNode = nodes.find((n: any) =>
            !n.data?.isPlaceholder && n.data?.nodeType && !n.data?.isTrigger
          )
          if (firstActionNode) {
            startNodeId = firstActionNode.id
          }
        }
      }

      // Call the execute-advanced API
      const response = await fetch('/api/workflows/execute-advanced', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workflowId: flowId,
          inputData: triggerData, // Use trigger data if available, empty object otherwise
          options: {
            mode: 'test', // Test mode
            startNodeId, // undefined = start from trigger, nodeId = start from that node
          }
        }),
      })

      if (!response.ok) {
        throw new Error(`Test failed: ${response.statusText}`)
      }

      const result = await response.json()

      // Result structure: { success: true, sessionId, result: { mainResult: { nodeId: data, ... } } }
      const nodeResults = result.result?.mainResult || {}

      // Update nodes based on test results
      const finalNodes = nodes.map((n: any) => {
        // Find result for this node in the mainResult
        const nodeOutput = nodeResults[n.id]

        if (!nodeOutput) {
          return {
            ...n,
            data: {
              ...n.data,
              state: undefined, // Clear running state for nodes that didn't execute
            }
          }
        }

        // Node executed successfully if it has output
        const hasError = nodeOutput?.error || nodeOutput?.success === false

        return {
          ...n,
          data: {
            ...n.data,
            state: hasError ? 'failed' : 'passed',
            testResult: nodeOutput,
          }
        }
      })

      builder.setNodes(finalNodes)

      // Check if any nodes failed
      const failedNodes = finalNodes.filter((n: any) => n.data?.state === 'failed')

      if (failedNodes.length > 0) {
        toast({
          title: "Test completed with errors",
          description: `${failedNodes.length} node(s) failed during execution.`,
          variant: "destructive",
        })
      } else {
        toast({
          title: "Test completed",
          description: "Workflow executed successfully!",
        })
      }

    } catch (error: any) {
      console.error('❌ [WorkflowBuilder] Test workflow error:', error)

      // Clear running states
      const clearedNodes = builder.nodes.map((n: any) => ({
        ...n,
        data: {
          ...n.data,
          state: undefined,
        }
      }))
      builder.setNodes(clearedNodes)

      toast({
        title: "Test failed",
        description: error?.message ?? "Unable to test workflow",
        variant: "destructive",
      })
    }
  }, [builder, cleanupTestTrigger, flowId, hasPlaceholders, toast])

  // Handler to stop flow testing
  const handleStopFlowTest = useCallback(() => {
    setIsFlowTesting(false)
    setFlowTestStatus(null)
    setIsFlowTestPaused(false)
    cancelTestFlow()
    // Deactivate the test webhook when user clicks stop
    cleanupTestTrigger()
    toast({
      title: "Test stopped",
      description: "Flow test has been stopped.",
    })
  }, [cancelTestFlow, cleanupTestTrigger, toast])

  // Handler to stop single node testing
  const handleStopNodeTest = useCallback(() => {
    setIsNodeTesting(false)
    setNodeTestingName(null)
    toast({
      title: "Test stopped",
      description: "Node test has been stopped.",
    })
  }, [toast])

  // Handler to pause flow testing
  const handlePauseFlowTest = useCallback(() => {
    setIsFlowTestPaused(true)
    toast({
      title: "Test paused",
      description: "Flow test has been paused.",
    })
  }, [toast])

  // Handler to resume flow testing
  const handleResumeFlowTest = useCallback(() => {
    setIsFlowTestPaused(false)
    toast({
      title: "Test resumed",
      description: "Flow test has been resumed.",
    })
  }, [toast])

  // Handler to stop live execution (placeholder - falls back to cancelTestFlow)
  const stopLiveExecutionHandler = undefined

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

    // STEP 0: Check if user mentioned specific apps (e.g., "Gmail", "Outlook", "Slack")
    // If they did, we should NOT ask which provider to use for that category
    const specificApps = detectSpecificApps(userPrompt)
    console.log('[Provider Disambiguation] Detected specific apps:', specificApps.map(a => a.displayName))

    // STEP 1: Check for ALL vague provider terms
    const allVagueTerms = detectAllVagueTerms(userPrompt)
    console.log('[Provider Disambiguation] Detected all vague terms:', allVagueTerms.map(t => t.category?.vagueTerm))

    let finalPrompt = userPrompt
    let providerMetadata: { category: any; provider: any; allProviders: any[] } | undefined

    // Filter out vague terms where user already specified a specific app
    const vagueTermsNeedingSelection: VagueTermDetection[] = []
    for (const vagueTermResult of allVagueTerms) {
      if (!vagueTermResult.category) continue

      // Check if user already specified an app for this category
      const matchingSpecificApp = specificApps.find(app => {
        const categoryMatch = app.category === vagueTermResult.category!.vagueTerm
        // Also check notification/chat categories which share providers
        const notificationCategories = ['notification', 'message', 'alert', 'chat']
        const isNotificationCategory = notificationCategories.includes(vagueTermResult.category!.vagueTerm)
        const appIsNotification = notificationCategories.includes(app.category)
        return categoryMatch || (isNotificationCategory && appIsNotification)
      })

      if (matchingSpecificApp) {
        // User mentioned a specific app - use it directly
        console.log('[Provider Disambiguation] User specified:', matchingSpecificApp.displayName, 'for', vagueTermResult.category.vagueTerm)

        finalPrompt = replaceVagueTermWithProvider(
          finalPrompt,
          vagueTermResult.category.vagueTerm,
          matchingSpecificApp.provider
        )

        // Store metadata for first matched category
        if (!providerMetadata) {
          const freshIntegrations = useIntegrationStore.getState().integrations
          const providerOptions = getProviderOptions(
            vagueTermResult.category,
            freshIntegrations.map(i => ({ provider: i.provider, id: i.id, status: i.status }))
          )
          const selectedProvider = providerOptions.find(p => p.id === matchingSpecificApp.provider)

          providerMetadata = selectedProvider ? {
            category: vagueTermResult.category,
            provider: selectedProvider,
            allProviders: providerOptions
          } : undefined
        }
      } else {
        // This term needs user selection
        vagueTermsNeedingSelection.push(vagueTermResult)
      }
    }

    console.log('[Provider Disambiguation] Terms needing selection:', vagueTermsNeedingSelection.map(t => t.category?.vagueTerm))

    // If there are vague terms that need selection, show provider dropdown
    if (vagueTermsNeedingSelection.length > 0) {
      const [firstTerm, ...remainingTerms] = vagueTermsNeedingSelection
      console.log('[Provider Disambiguation] Showing dropdown for:', firstTerm.category?.vagueTerm)
      console.log('[Provider Disambiguation] Remaining terms to ask:', remainingTerms.length)

      const freshIntegrations = useIntegrationStore.getState().integrations
      const providerOptions = getProviderOptions(
        firstTerm.category!,
        freshIntegrations.map(i => ({ provider: i.provider, id: i.id, status: i.status }))
      )
      const connectedProviders = providerOptions.filter(p => p.isConnected)

      // Set up multi-term disambiguation state
      setAwaitingProviderSelection(true)
      setPendingPrompt(finalPrompt) // Use modified prompt with any auto-resolved terms
      setProviderCategory(firstTerm.category)
      setPendingVagueTerms(remainingTerms) // Store remaining terms for later
      setProviderSelections(new Map()) // Reset selections
      setIsAgentLoading(false)

      // Add assistant message with provider dropdown
      const preSelectedProvider = connectedProviders.length > 0 ? connectedProviders[0] : null
      const dropdownMessage: ChatMessage = {
        id: generateLocalId(),
        flowId,
        role: 'assistant',
        text: '',
        meta: {
          providerDropdown: {
            category: firstTerm.category,
            providers: providerOptions,
            preSelectedProviderId: preSelectedProvider?.id,
          }
        },
        createdAt: new Date().toISOString(),
      }
      setAgentMessages(prev => [...prev, dropdownMessage])
      return
    }

    // No vague terms needing selection - proceed with workflow generation
    // (finalPrompt may have auto-resolved specific apps like "Gmail" or "Slack")
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
      // Use finalPrompt which may have auto-resolved terms (e.g., "Gmail" replacing "email")
      const { result, usedTemplate, promptId } = await planWorkflowWithTemplates(
        actions, finalPrompt, providerMetadata?.provider?.id, user?.id, flowId
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

        // Clear canvas (including any placeholder nodes if present)
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

        // STEP 7: Fit view to show ALL nodes, accounting for agent panel
        console.log('[handleBuild] Starting fitView animation to show all nodes')
        if (reactFlowInstanceRef.current) {
          const instance = reactFlowInstanceRef.current

          // Calculate the bounding box of all nodes
          const minX = Math.min(...allNodes.map(n => n.position.x))
          const maxX = Math.max(...allNodes.map(n => n.position.x)) + 360 // Add node width
          const minY = Math.min(...allNodes.map(n => n.position.y))
          const maxY = Math.max(...allNodes.map(n => n.position.y)) + 100 // Add node height
          const centerX = (minX + maxX) / 2
          const centerY = (minY + maxY) / 2

          console.log('[handleBuild] Fitting view to show all nodes:', {
            nodeCount: allNodes.length,
            nodePositions: allNodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y })),
            boundingBox: { minX, maxX, minY, maxY },
            center: { x: centerX, y: centerY }
          })

          // Calculate zoom to fit all nodes with padding
          // Account for agent panel by shifting center to the right
          const panelOffset = agentPanelWidth / 2 // Offset to account for panel
          const adjustedCenterX = centerX - panelOffset // Shift left in flow coords = shift right in view

          // Use setCenter to position view, accounting for panel
          instance.setCenter(adjustedCenterX, centerY, {
            zoom: 0.85, // Zoom out slightly to ensure both nodes are visible
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

        // Add preferences save message if we collected any preferences during the build
        if (collectedPreferences.length > 0) {
          setAgentMessages(prev => [...prev, {
            id: generateLocalId(),
            flowId,
            role: 'assistant',
            text: 'Your workflow is ready! Would you like to save these preferences for future workflows?',
            meta: {
              preferencesSave: {
                selections: collectedPreferences
              }
            },
            createdAt: new Date().toISOString(),
          }])
        }
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
  }, [buildMachine, builder?.nodes, builder?.setNodes, collectedPreferences, flowId, generateLocalId, nodeConfigs, toast, transitionTo, setBuildMachine])

  const handleSkipNode = useCallback(() => {
    const nextIndex = buildMachine.progress.currentIndex + 1
    if (nextIndex >= buildMachine.plan.length) {
      setBuildMachine(prev => ({
        ...prev,
        progress: { ...prev.progress, currentIndex: nextIndex, done: nextIndex },
      }))
      transitionTo(BuildState.COMPLETE)

      // Add preferences save message if we collected any preferences during the build
      if (collectedPreferences.length > 0) {
        setAgentMessages(prev => [...prev, {
          id: generateLocalId(),
          flowId,
          role: 'assistant',
          text: 'Your workflow is ready! Would you like to save these preferences for future workflows?',
          meta: {
            preferencesSave: {
              selections: collectedPreferences
            }
          },
          createdAt: new Date().toISOString(),
        }])
      }
    } else {
      setBuildMachine(prev => ({
        ...prev,
        progress: { ...prev.progress, currentIndex: nextIndex },
      }))
      transitionTo(BuildState.WAITING_USER)
    }
  }, [buildMachine.plan.length, buildMachine.progress.currentIndex, collectedPreferences, flowId, generateLocalId, transitionTo])

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

  // NOTE: Auto-position useEffect removed - was already disabled via ENABLE_AUTO_STACK = false
  // Nodes now use positions from metadata or stable fallback calculated in flowToReactFlowNodes

  // CONSOLIDATED: Apply node styling AND clear selection during build
  // These were previously 2 separate effects that both called setNodes() on the same
  // state change, causing race conditions where one would overwrite the other.
  useEffect(() => {
    // CRITICAL: Wait for initial load to complete before modifying nodes
    // This prevents race conditions where this effect calls setNodes while
    // the initial load is still populating nodes, causing nodes to disappear
    if (!builder?.isInitialLoadCompleteRef?.current) {
      return
    }
    if (!builder?.nodes || !builder.setNodes) {
      return
    }

    const { state, progress } = buildMachine

    // Determine if we're in an active build state (for selection clearing)
    const isBuildActive =
      state === BuildState.BUILDING_SKELETON ||
      state === BuildState.WAITING_USER ||
      state === BuildState.PREPARING_NODE ||
      state === BuildState.CONFIGURING_NODE ||
      state === BuildState.TESTING_NODE

    // Track if any changes are needed
    let hasChanges = false

    // Apply CSS classes AND clear selection in a SINGLE pass
    const updatedNodes = builder.nodes.map((node, index) => {
      let nodeUpdates: Record<string, any> = {}

      // 1. Apply CSS classes based on build state
      if (state !== BuildState.IDLE) {
        const nodeState = node.data?.state || 'ready'
        let className = ''

        if (state === BuildState.BUILDING_SKELETON) {
          className = 'node-skeleton node-grey'
        } else {
          if (nodeState === 'skeleton') {
            className = 'node-skeleton node-grey'
          } else if (nodeState === 'ready') {
            className = 'node-ready'
          } else if (nodeState === 'running') {
            className = 'node-active'
          } else if (nodeState === 'passed' || nodeState === 'failed') {
            className = 'node-done'
          }
        }

        if (node.className !== className) {
          nodeUpdates.className = className
          hasChanges = true
        }
      }

      // 2. Clear selection during active build states
      if (isBuildActive && node.selected === true) {
        nodeUpdates.selected = false
        hasChanges = true
      }

      // Return updated node if changes, otherwise return original
      if (Object.keys(nodeUpdates).length > 0) {
        return { ...node, ...nodeUpdates }
      }
      return node
    })

    // Only call setNodes if something actually changed
    if (hasChanges) {
      builder.setNodes(updatedNodes)
    }
  }, [buildMachine.state, buildMachine.progress, builder])

  // Get cost breakdown for CostDisplay
  const costBreakdown = useMemo(() => {
    return costTrackerRef.current?.getCostBreakdown?.() ?? []
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
    handleToggleLive: handleToggleLiveWithValidation,
    isUpdatingStatus: false,
    hasPlaceholders: hasPlaceholders(),
    currentWorkflow: null,
    workflowId: flowId,
    editTemplateId: null,
    isTemplateEditing: false,
    onOpenTemplateSettings: undefined,
    templateSettingsLabel: undefined,
    handleTestSandbox: handleOpenTestDialog,
    handleExecuteLive: handleOpenTestDialog,
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
    onSelectHistoryRun: actions?.refreshRun
      ? (runId: string) => actions.refreshRun(runId)
      : undefined,
    activeRunId: flowState?.lastRunId,
    onGenerateApiKey: hasPublishedRevision ? handleGenerateApiKey : undefined,
    canGenerateApiKey: hasPublishedRevision,
  }), [actions, builder, comingSoon, flowId, flowState?.hasUnsavedChanges, flowState?.isSaving, flowState?.lastRunId, flowState?.revisionId, handleGenerateApiKey, handleNameChange, handleOpenTestDialog, handleToggleLiveWithValidation, hasPlaceholders, hasPublishedRevision, nameDirty, persistName, workflowName])

  // Derive active execution node name from flow test status
  const activeExecutionNodeName = flowTestStatus?.currentNodeLabel ?? null

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
            onNodeRename={handleNodeRename}
            onNodeDuplicate={handleNodeDuplicate}
            onAddNote={handleAddNote}
            onInit={(instance) => {
              reactFlowInstanceRef.current = instance
              // Center view accounting for agent panel - single calculation, no animation
              // This eliminates the "adjust then adjust again" visual glitch
              requestAnimationFrame(() => {
                if (instance && builder?.nodes && builder.nodes.length > 0) {
                  const nodes = builder.nodes

                  // Calculate bounds of all nodes
                  let minX = Infinity, minY = Infinity
                  let maxX = -Infinity, maxY = -Infinity

                  nodes.forEach((node: any) => {
                    const x = node.position?.x ?? 0
                    const y = node.position?.y ?? 0
                    const width = 360
                    const height = 140

                    minX = Math.min(minX, x)
                    minY = Math.min(minY, y)
                    maxX = Math.max(maxX, x + width)
                    maxY = Math.max(maxY, y + height)
                  })

                  // Calculate center of all nodes
                  const nodesCenterX = (minX + maxX) / 2
                  const nodesCenterY = (minY + maxY) / 2

                  // Calculate available viewport (excluding agent panel)
                  const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
                  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080
                  const availableWidth = viewportWidth - agentPanelWidth

                  // Calculate the center of the available canvas area (right of agent panel)
                  const availableCenterX = agentPanelWidth + (availableWidth / 2)
                  const availableCenterY = viewportHeight / 2

                  // Calculate viewport position to center nodes in available space
                  // viewport.x = screenX - (nodeX * zoom), so to put nodesCenterX at availableCenterX:
                  const zoom = 1
                  const viewportX = availableCenterX - (nodesCenterX * zoom)
                  const viewportY = availableCenterY - (nodesCenterY * zoom)

                  // Set viewport directly - no animation, instant positioning
                  instance.setViewport({ x: viewportX, y: viewportY, zoom }, { duration: 0 })
                }
              })
            }}
            agentPanelWidth={agentPanelWidth}
            isAgentPanelOpen={agentOpen}
            buildState={buildMachine.state}
            badge={buildMachine.badge}
            isIntegrationsPanelOpen={isIntegrationsPanelOpen}
            setIsIntegrationsPanelOpen={setIsIntegrationsPanelOpen}
            integrationsPanelMode={integrationsPanelMode}
            onNodeSelect={handleNodeSelectFromPanel}
            onNodeConfigure={handleNodeConfigure}
            onChangeNode={handleChangeNode}
            onUndoToPreviousStage={handleUndoToPreviousStage}
            onCancelBuild={handleCancelBuild}
            onAddNodeAfter={handleAddNodeAfterClick}
            disablePhantomOverlay={Boolean(activeReorderDrag)}
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

          <WorkflowStatusBar
            isFlowTesting={isFlowTesting}
            flowTestStatus={flowTestStatus}
            onStopFlowTest={handleStopFlowTest}
            isExecuting={Boolean(builder?.isExecuting)}
            isPaused={Boolean(builder?.isPaused)}
            isListeningForWebhook={Boolean(builder?.isListeningForWebhook) || testFlowStatus === 'listening'}
            listeningTimeRemaining={listeningTimeRemaining}
            activeExecutionNodeName={activeExecutionNodeName}
            onStopExecution={stopLiveExecutionHandler || cancelTestFlow}
            isNodeTesting={isNodeTesting}
            nodeTestingName={nodeTestingName}
            onStopNodeTest={handleStopNodeTest}
            isFlowTestPaused={isFlowTestPaused}
            onPauseFlowTest={handlePauseFlowTest}
            onResumeFlowTest={handleResumeFlowTest}
          />

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
              // Enhanced chat flow handlers
              onProviderDropdownSelect: handleProviderDropdownSelect,
              onConnectionComplete: handleConnectionComplete,
              onConnectionSkip: handleConnectionSkip,
              onNodeConfigComplete: handleNodeConfigComplete,
              onNodeConfigSkip: handleNodeConfigSkip,
              onPreferencesSave: handlePreferencesSave,
              onPreferencesSkip: handlePreferencesSkip,
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

      {/* Test Mode Dialog */}
      <TestModeDialog
        open={isTestModeDialogOpen}
        onOpenChange={setIsTestModeDialogOpen}
        workflowId={flowId}
        triggerType={triggerType}
        onRunTest={handleRunTestFromDialog}
        isExecuting={isFlowTesting}
        isListening={testFlowStatus === 'listening'}
        listeningTimeRemaining={listeningTimeRemaining ?? undefined}
      />

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

        // INSTANT REOPEN: Calculate initial data with stable reference
        // NOTE: We rely on ConfigurationModal's internal effectiveInitialData useMemo
        // to maintain stable reference, not on this calculation
        let initialData: Record<string, any> = { ...(configuringNode?.data?.config || {}) }

        // If we don't have config from the node, try localStorage cache
        if (Object.keys(initialData).length === 0) {
          if (typeof window !== 'undefined' && flowId && configuringNode?.id) {
            try {
              const cacheKey = `workflow_${flowId}_node_${configuringNode.id}_config`;
              const cached = localStorage.getItem(cacheKey);
              if (cached) {
                const { config, timestamp } = JSON.parse(cached);
                const age = Date.now() - timestamp;
                // Use cache if less than 5 minutes old
                if (age < 5 * 60 * 1000) {
                  console.log('⚡ [WorkflowBuilder] Loaded config from cache for instant reopen');
                  initialData = { ...config };
                }
              }
            } catch (e) {
              console.warn('Failed to load cached config:', e);
            }
          }
        }

        if (configuringNode?.id) {
          const cachedTest = nodeTestCache[configuringNode.id];
          if (cachedTest) {
            initialData.__testData = cachedTest.data;
            initialData.__testResult = cachedTest.result;
          }
        }

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
            initialData={initialData}
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
