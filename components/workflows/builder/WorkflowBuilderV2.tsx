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
import { useAuthStore } from "@/stores/authStore"
import { useIntegrationSelection } from "@/hooks/workflows/useIntegrationSelection"
import { swapProviderInPlan, canSwapProviders } from "@/lib/workflows/ai-agent/providerSwapping"
import { matchTemplate, logTemplateMatch, logTemplateMiss } from "@/lib/workflows/ai-agent/templateMatching"
import { logPrompt, updatePrompt } from "@/lib/workflows/ai-agent/promptAnalytics"
import { logger } from '@/lib/utils/logger'
import { useAppContext } from "@/lib/contexts/AppContext"
import { generateId } from "@/src/lib/workflows/compat/v2Adapter"

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
const ENABLE_AUTO_STACK = false
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
  const [isFlowTesting, setIsFlowTesting] = useState(false) // True while testing flow from a node
  const [flowTestStatus, setFlowTestStatus] = useState<{ total: number; currentIndex: number; currentNodeLabel?: string } | null>(null)
  const [isFlowTestPaused, setIsFlowTestPaused] = useState(false) // True when flow test is paused
  const [isNodeTesting, setIsNodeTesting] = useState(false) // True while testing a single node
  const [nodeTestingName, setNodeTestingName] = useState<string | null>(null) // Name of node being tested
  const [isIntegrationsPanelOpen, setIsIntegrationsPanelOpen] = useState(false)
  const pendingInsertionRef = useRef<{
    sourceId: string | null
    targetId: string | null
    sourceHandle: string | null
    targetHandle: string | null
  } | null>(null)
  const [isStructureTransitioning, setIsStructureTransitioning] = useState(false)
  const endStructureTransitionRef = useRef<number | null>(null)
  const flowTestAbortRef = useRef(false)
  const flowTestPausedRef = useRef(false) // Ref for checking pause state in async loop
  const flowTestResumeResolverRef = useRef<(() => void) | null>(null) // Resolver to resume paused test
  const nodeTestAbortControllerRef = useRef<AbortController | null>(null) // For stopping single node tests
  const flowTestPendingNodesRef = useRef<Set<string>>(new Set())

  const endStructureTransition = useCallback(() => {
    if (typeof window === 'undefined') {
      setIsStructureTransitioning(false)
      return
    }
    if (endStructureTransitionRef.current) {
      cancelAnimationFrame(endStructureTransitionRef.current)
      endStructureTransitionRef.current = null
    }
    const schedule = () => requestAnimationFrame(() => {
      endStructureTransitionRef.current = null
      setIsStructureTransitioning(false)
    })
    endStructureTransitionRef.current = requestAnimationFrame(() => {
      endStructureTransitionRef.current = schedule()
    })
  }, [])

  useEffect(() => {
    return () => {
      if (endStructureTransitionRef.current) {
        cancelAnimationFrame(endStructureTransitionRef.current)
      }
    }
  }, [])

  const resetPendingFlowNodes = useCallback(() => {
    const pendingIds = Array.from(flowTestPendingNodesRef.current)
    if (pendingIds.length === 0) return
    const pendingSet = new Set(pendingIds)

    if (reactFlowInstanceRef.current) {
      pendingIds.forEach(nodeId => {
        setNodeState(reactFlowInstanceRef.current, nodeId, 'ready')
      })
    }

    builder?.setNodes?.((nodes: any[]) =>
      nodes.map((node: any) => {
        if (!pendingSet.has(node.id)) {
          return node
        }

        if (node.data?.executionStatus !== 'running' && !node.data?.isActiveExecution) {
          return node
        }

        return {
          ...node,
          data: {
            ...node.data,
            executionStatus: null,
            isActiveExecution: false,
          },
        }
      })
    )

    flowTestPendingNodesRef.current.clear()
    setFlowTestStatus(null)
  }, [builder?.setNodes])

  const handleStopFlowTest = useCallback((nodeId?: string) => {
    if (!isFlowTesting && flowTestPendingNodesRef.current.size === 0) {
      return
    }
    console.log('[WorkflowBuilder] Stop requested', { nodeId })
    flowTestAbortRef.current = true
    flowTestPausedRef.current = false
    // Resume if paused so the loop can exit
    if (flowTestResumeResolverRef.current) {
      flowTestResumeResolverRef.current()
      flowTestResumeResolverRef.current = null
    }
    resetPendingFlowNodes()
    setIsFlowTesting(false)
    setIsFlowTestPaused(false)
    setFlowTestStatus(null)
    toast({
      title: "Testing stopped",
      description: "Flow test cancelled.",
    })
  }, [isFlowTesting, resetPendingFlowNodes, toast])

  const handlePauseFlowTest = useCallback(() => {
    if (!isFlowTesting || isFlowTestPaused) return
    console.log('[WorkflowBuilder] Pausing flow test')
    flowTestPausedRef.current = true
    setIsFlowTestPaused(true)
    toast({
      title: "Test paused",
      description: "Click play to resume testing.",
    })
  }, [isFlowTesting, isFlowTestPaused, toast])

  const handleResumeFlowTest = useCallback(() => {
    if (!isFlowTesting || !isFlowTestPaused) return
    console.log('[WorkflowBuilder] Resuming flow test')
    flowTestPausedRef.current = false
    setIsFlowTestPaused(false)
    // Resolve the pause promise to continue the loop
    if (flowTestResumeResolverRef.current) {
      flowTestResumeResolverRef.current()
      flowTestResumeResolverRef.current = null
    }
    toast({
      title: "Test resumed",
      description: "Continuing workflow test.",
    })
  }, [isFlowTesting, isFlowTestPaused, toast])

  const handleStopNodeTest = useCallback(() => {
    if (!isNodeTesting) return
    console.log('[WorkflowBuilder] Stopping single node test')
    if (nodeTestAbortControllerRef.current) {
      nodeTestAbortControllerRef.current.abort()
      nodeTestAbortControllerRef.current = null
    }
    setIsNodeTesting(false)
    setNodeTestingName(null)
    toast({
      title: "Test stopped",
      description: "Node test cancelled.",
    })
  }, [isNodeTesting, toast])

  const setInsertionContext = useCallback((
    sourceId: string | null,
    targetId: string | null,
    options?: { sourceHandle?: string | null; targetHandle?: string | null }
  ) => {
    pendingInsertionRef.current = {
      sourceId,
      targetId,
      sourceHandle: options?.sourceHandle ?? null,
      targetHandle: options?.targetHandle ?? null,
    }
  }, [])

  const clearInsertionContext = useCallback(() => {
    pendingInsertionRef.current = null
    setAddingAfterNodeId(null)
  }, [])

  const prepareInsertionContext = useCallback((afterNodeId: string | null) => {
    if (!afterNodeId || !builder) {
      setInsertionContext(afterNodeId, null)
      return
    }

    const nodes = Array.isArray(builder.nodes) ? builder.nodes : []
    const edges = Array.isArray(builder.edges) ? builder.edges : []

    let nextNodeId: string | null = null
    if (nodes.length > 0) {
      const sortedNodes = [...nodes].sort(
        (a: any, b: any) => (a.position?.y ?? 0) - (b.position?.y ?? 0)
      )
      const currentIndex = sortedNodes.findIndex((node: any) => node.id === afterNodeId)
      if (currentIndex >= 0) {
        const candidate = sortedNodes
          .slice(currentIndex + 1)
          .find(node => !node.data?.isPlaceholder)
        if (candidate) {
          nextNodeId = candidate.id
        }
      }
    }

    let matchingEdge: any = null
    if (edges.length > 0) {
      if (nextNodeId) {
        matchingEdge = edges.find(
          (edge: any) => edge.source === afterNodeId && edge.target === nextNodeId
        )
      }
      if (!matchingEdge) {
        matchingEdge = edges.find((edge: any) => edge.source === afterNodeId) ?? null
      }
    }

    if (matchingEdge) {
      setInsertionContext(afterNodeId, matchingEdge.target ?? nextNodeId ?? null, {
        sourceHandle: matchingEdge.sourceHandle || 'source',
        targetHandle: matchingEdge.targetHandle || 'target',
      })
    } else {
      setInsertionContext(afterNodeId, nextNodeId)
    }
  }, [builder, setInsertionContext])
  const [integrationsPanelMode, setIntegrationsPanelMode] = useState<'trigger' | 'action'>('action')
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

  // Keyboard paste handler for importing workflow JSON
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      // Don't intercept paste if user is typing in an input/textarea
      const activeElement = document.activeElement
      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement ||
        activeElement?.getAttribute('contenteditable') === 'true'
      ) {
        return
      }

      const pastedText = e.clipboardData?.getData('text')
      if (!pastedText) return

      // Try to parse as JSON
      try {
        const data = JSON.parse(pastedText)

        // Check if it looks like workflow JSON (has nodes array)
        if (!data.nodes || !Array.isArray(data.nodes)) {
          return // Not workflow JSON, let default paste behavior happen
        }

        e.preventDefault() // Prevent default paste behavior

        // Convert nodes to edit operations
        const edits: any[] = []

        // Add nodes
        for (const node of data.nodes) {
          edits.push({
            op: 'addNode',
            node: {
              id: node.id,
              type: node.type || node.data?.type,
              position: node.position,
              data: {
                ...node.data,
                title: node.data?.title || node.data?.label,
                type: node.data?.type || node.type,
                providerId: node.data?.providerId,
                config: node.data?.config || {},
              },
            },
          })
        }

        // Add edges/connections
        const connections = data.edges || data.connections || []
        for (const edge of connections) {
          edits.push({
            op: 'connectEdge',
            edge: {
              id: edge.id,
              source: edge.source,
              target: edge.target,
              sourceHandle: edge.sourceHandle || 'source',
              targetHandle: edge.targetHandle || 'target',
            },
          })
        }

        if (edits.length > 0 && actions?.applyEdits) {
          toast({
            title: "Importing workflow...",
            description: `Adding ${data.nodes.length} nodes`,
          })

          try {
            await actions.applyEdits(edits)
            toast({
              title: "Workflow imported",
              description: `Successfully added ${data.nodes.length} nodes`,
            })
          } catch (error: any) {
            toast({
              title: "Import failed",
              description: error?.message || "Failed to import workflow",
              variant: "destructive",
            })
          }
        }
      } catch {
        // Not valid JSON, ignore and let default paste happen
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [actions, toast])

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

  // Batch initial loads when app context is ready (only once)
  const hasInitializedRef = useRef(false)

  useEffect(() => {
    if (!appReady) {
      return
    }

    // Only run once when appReady becomes true
    if (hasInitializedRef.current) {
      return
    }
    hasInitializedRef.current = true

    console.log('[WorkflowBuilder] App context ready, batching initial loads')

    // Fetch integrations on mount to ensure connection status is accurate
    // CustomNode components need this data to show connected/disconnected state
    fetchIntegrations(false).catch(error => {
      logger.error('[WorkflowBuilder] Failed to fetch integrations on mount:', error)
    })

    console.log('[WorkflowBuilder] Initial mount complete - integrations loading')
  }, [appReady, fetchIntegrations])

  // Sync workspace context to integration store when builder loads
  useEffect(() => {
    if (!workspaceContext) {
      return
    }

    logger.debug('[WorkflowBuilder] Syncing workspace context to integration store:', {
      type: workspaceContext.type,
      id: workspaceContext.id
    })

    // Set the integration store's workspace context to match the current workflow's workspace
    setIntegrationWorkspaceContext(workspaceContext.type, workspaceContext.id)
  }, [workspaceContext, setIntegrationWorkspaceContext])

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

  // Load cached node outputs from Supabase on page refresh
  // This enables variable resolution from previously tested upstream nodes
  const hasFetchedCachedOutputsRef = useRef(false)

  useEffect(() => {
    if (!flowId || !authInitialized || hasFetchedCachedOutputsRef.current) {
      return
    }

    const loadCachedOutputs = async () => {
      try {
        logger.info('[WorkflowBuilder] Loading cached node outputs for workflow:', flowId)
        hasFetchedCachedOutputsRef.current = true

        const response = await fetch(`/api/workflows/cached-outputs?workflowId=${flowId}`)

        if (!response.ok) {
          logger.debug('[WorkflowBuilder] No cached outputs found or error fetching')
          return
        }

        const data = await response.json()

        if (!data.success || !data.cachedOutputs) {
          logger.debug('[WorkflowBuilder] No cached outputs in response')
          return
        }

        const cachedOutputs = data.cachedOutputs as Record<string, any>
        const nodeCount = Object.keys(cachedOutputs).length

        if (nodeCount === 0) {
          logger.debug('[WorkflowBuilder] No cached outputs to load')
          return
        }

        logger.info(`[WorkflowBuilder] Loaded ${nodeCount} cached node outputs:`, {
          nodeIds: Object.keys(cachedOutputs)
        })

        // Populate nodeTestCache with cached outputs
        const newCacheEntries: Record<string, NodeTestCacheEntry> = {}

        for (const [nodeId, cachedData] of Object.entries(cachedOutputs)) {
          // cachedData structure from API: { nodeId, nodeType, output: { field1, field2, __success, __message }, executedAt }
          const outputData = cachedData.output || cachedData
          newCacheEntries[nodeId] = {
            data: outputData,
            result: {
              success: outputData?.__success !== false,
              timestamp: cachedData.executedAt,
              message: outputData?.__message || 'Loaded from cache',
              rawResponse: cachedData
            }
          }
        }

        setNodeTestCache(prev => ({
          ...prev,
          ...newCacheEntries
        }))

        logger.info(`[WorkflowBuilder] Populated nodeTestCache with ${nodeCount} cached entries`)

      } catch (error: any) {
        logger.error('[WorkflowBuilder] Error loading cached outputs:', error.message)
      }
    }

    loadCachedOutputs()
  }, [flowId, authInitialized])

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

    // Position will be auto-corrected by the vertical stacking effect
    // Just use a placeholder position for now
    const position = {
      x: 400,
      y: afterNode.position.y + 180
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
    // Close config modal and suppress it from opening when testing
    setConfiguringNode(null)
    suppressNodeClickRef.current = nodeId
    if (suppressNodeClickTimeoutRef.current) {
      clearTimeout(suppressNodeClickTimeoutRef.current)
    }
    suppressNodeClickTimeoutRef.current = setTimeout(() => {
      if (suppressNodeClickRef.current === nodeId) {
        suppressNodeClickRef.current = null
      }
    }, 500)

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

    // Get the node name for the status bar
    const nodeName = node.data?.title || node.data?.label || node.data?.type || 'Node'
    setIsNodeTesting(true)
    setNodeTestingName(nodeName)

    // Set up AbortController for stopping the test
    const abortController = new AbortController()
    nodeTestAbortControllerRef.current = abortController

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
      console.log('🔍 [WorkflowBuilder] Sending test request:', {
        nodeType: node.data?.type,
        workflowId: flowId,
        workflowIdType: typeof flowId,
        workflowIdIsUUID: flowId ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(flowId) : false,
        nodeId: nodeId,
        configKeys: Object.keys(cleanConfig),
        testDataKeys: Object.keys(testData)
      })

      const response = await fetch('/api/workflows/test-node', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nodeType: node.data?.type,
          config: cleanConfig,
          testData: testData,
          workflowId: flowId, // Pass workflow ID for caching
          nodeId: nodeId, // Pass node ID for caching
          useCachedData: true, // Enable cached data from previous runs
          workflowNodes: builder?.nodes // Pass nodes for friendly name lookup
        }),
        signal: abortController.signal, // Allow aborting the request
      })

      console.log('🔍 [WorkflowBuilder] Response status:', response.status, response.statusText)

      const result = await response.json()
      console.log('🔍 [WorkflowBuilder] Parsed result:', result)

      if (!response.ok) {
        // Check if this is a "missing upstream node data" error
        if (result.debug?.missingNodeNames?.length > 0) {
          const missingNodes = result.debug.missingNodeNames.join(', ')
          throw new Error(`Missing data from upstream nodes. Please test these nodes first: ${missingNodes}`)
        } else if (result.debug?.missingNodes?.length > 0) {
          const missingNodes = result.debug.missingNodes.join(', ')
          throw new Error(`Missing data from upstream nodes. Please test these nodes first: ${missingNodes}`)
        }

        // Use the message from testResult if available
        const errorMessage = result.testResult?.message || result.error || 'Failed to test node'
        throw new Error(errorMessage)
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
      // Check if the request was aborted (user clicked stop)
      if (error.name === 'AbortError') {
        logger.debug('[WorkflowBuilder] Node test was aborted by user')
        setNodeState(reactFlowInstanceRef.current, nodeId, 'idle')
        return
      }

      // Better error logging
      console.error('🔴 [WorkflowBuilder] Test failed - Full error:', error)
      console.error('🔴 [WorkflowBuilder] Error message:', error?.message)
      console.error('🔴 [WorkflowBuilder] Error stringified:', JSON.stringify(error, Object.getOwnPropertyNames(error || {})))

      logger.error('[WorkflowBuilder] Test failed:', error?.message || error)
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
    } finally {
      // Clear single node testing state and abort controller ref
      nodeTestAbortControllerRef.current = null
      setIsNodeTesting(false)
      setNodeTestingName(null)
    }
    async function persistNodeTestResult(
      status: 'success' | 'error',
      payload: { __testData: Record<string, any>; __testResult: any },
      nodeData: any,
      errorMessage?: string
    ) {
      // Note: This function tries to persist to a legacy API endpoint.
      // Main test result caching is now handled by nodeOutputCache in the test-node API.
      // This is kept for backwards compatibility but failures are logged at debug level only.
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
          // Legacy endpoint may not exist - this is expected, log at debug level only
          logger.debug('[WorkflowBuilder] Legacy persist endpoint not available (this is OK)')
          return
        }

        const responseBody = await response.json()
        if (responseBody?.runId && actions?.refreshRun) {
          await actions.refreshRun(responseBody.runId)
        }
      } catch (persistError) {
        // Legacy endpoint may not exist - this is expected, log at debug level only
        logger.debug('[WorkflowBuilder] Legacy persist endpoint error (this is OK)')
      }
    }
  }, [builder?.nodes, builder?.setNodes, actions, flowId, toast])

  const handleTestFlowFromHere = useCallback(async (nodeId: string) => {
    // Close config modal and integrations panel, disable interactions during testing
    setConfiguringNode(null)
    setIsIntegrationsPanelOpen(false)
    setAddingAfterNodeId(null)
    setIsFlowTesting(true)
    setIsFlowTestPaused(false)
    setFlowTestStatus(null)
    flowTestAbortRef.current = false
    flowTestPausedRef.current = false
    flowTestResumeResolverRef.current = null
    flowTestPendingNodesRef.current = new Set()

    // Suppress config modal from opening when this is triggered
    suppressNodeClickRef.current = nodeId
    if (suppressNodeClickTimeoutRef.current) {
      clearTimeout(suppressNodeClickTimeoutRef.current)
    }
    suppressNodeClickTimeoutRef.current = setTimeout(() => {
      if (suppressNodeClickRef.current === nodeId) {
        suppressNodeClickRef.current = null
      }
    }, 500)

    if (!builder?.nodes || !builder?.edges || !reactFlowInstanceRef.current) {
      logger.error('[WorkflowBuilder] Cannot test flow - builder not ready')
      setIsFlowTesting(false)
      setFlowTestStatus(null)
      return
    }

    const startNode = builder.nodes.find((n: any) => n.id === nodeId)
    if (!startNode) {
      logger.error('[WorkflowBuilder] Start node not found:', nodeId)
      setIsFlowTesting(false)
      setFlowTestStatus(null)
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
    flowTestPendingNodesRef.current = new Set(nodesToTest)
    logger.debug('[WorkflowBuilder] Testing flow from node:', nodeId, 'Total nodes:', nodesToTest.length)
    setFlowTestStatus({
      total: nodesToTest.length,
      currentIndex: 0,
      currentNodeLabel: undefined
    })

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

    for (let index = 0; index < sortedNodeIds.length; index++) {
      // Check for abort
      if (flowTestAbortRef.current) {
        resetPendingFlowNodes()
        flowTestAbortRef.current = false
        setFlowTestStatus(null)
        return
      }

      // Check for pause - wait until resumed or aborted
      if (flowTestPausedRef.current) {
        await new Promise<void>((resolve) => {
          flowTestResumeResolverRef.current = resolve
        })
        // After resume, check if we should abort
        if (flowTestAbortRef.current) {
          resetPendingFlowNodes()
          flowTestAbortRef.current = false
          setFlowTestStatus(null)
          return
        }
      }

      const nId = sortedNodeIds[index]
      const node = builder.nodes.find((n: any) => n.id === nId)
      if (!node) continue

      const nodeLabel = node.data?.title || node.data?.label || node.data?.type || `Node ${index + 1}`
      logger.debug('[WorkflowBuilder] Testing node in flow:', nodeLabel)

      setFlowTestStatus(prev => prev ? {
        ...prev,
        currentIndex: Math.min(index + 1, prev.total),
        currentNodeLabel: nodeLabel
      } : prev)

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

        if (flowTestAbortRef.current) {
          resetPendingFlowNodes()
          flowTestAbortRef.current = false
          setFlowTestStatus(null)
          return
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
        flowTestPendingNodesRef.current.delete(nId)

      } catch (error: any) {
        logger.error('[WorkflowBuilder] Flow test failed at node:', node.data?.title, error)

        // Set node to failed state
        setNodeState(reactFlowInstanceRef.current, nId, 'failed')
        flowTestPendingNodesRef.current.delete(nId)

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
        setIsFlowTesting(false)
        setFlowTestStatus(null)
        flowTestPendingNodesRef.current.clear()
        return
      }
    }

    if (flowTestAbortRef.current) {
      flowTestAbortRef.current = false
      return
    }

    setIsFlowTesting(false)
    toast({
      title: "Flow test completed",
      description: `Successfully tested ${sortedNodeIds.length} node(s)`,
    })
    flowTestPendingNodesRef.current.clear()
  }, [builder?.nodes, builder?.edges, actions, toast, resetPendingFlowNodes])

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
          onStop: handleStopFlowTest,
          isBeingConfigured: configuringNode?.id === node.id,
          isBeingReordered: activeReorderDrag?.nodeId === node.id,
          isFlowTesting, // Disable interactions during flow testing
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

      // Store insertion context for precise edge splitting
      setInsertionContext(edge.source, edge.target ?? null, {
        sourceHandle: edge.sourceHandle || 'source',
        targetHandle: edge.targetHandle || 'target'
      })

      // Store the source node ID and open integrations panel
      setAddingAfterNodeId(edge.source)
      setSelectedNodeId(edge.source)
      openIntegrationsPanel('action')
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
  }, [builder, handleAddNodeAfter, handleTestNode, handleTestFlowFromHere, handleStopFlowTest, handleReorderPointerDown, configuringNode, activeReorderDrag, getReorderableData, reorderDragOffset, reorderPreviewIndex, isFlowTesting])

  const activeExecutionNodeName = useMemo(() => {
    if (!builder?.activeExecutionNodeId) return null
    const nodes = reactFlowProps?.nodes
    if (!nodes) return null
    const match = nodes.find((node: any) => node.id === builder.activeExecutionNodeId)
    return match?.data?.title || match?.data?.label || match?.data?.type || null
  }, [builder?.activeExecutionNodeId, reactFlowProps?.nodes])

  const stopLiveExecutionHandler = useMemo(() => {
    if (typeof builder?.stopLiveExecution === 'function') {
      return builder.stopLiveExecution
    }
    if (builder?.isListeningForWebhook && typeof builder?.stopWebhookListening === 'function') {
      return builder.stopWebhookListening
    }
    if (builder?.isStepMode && typeof builder?.stopStepExecution === 'function') {
      return builder.stopStepExecution
    }
    return undefined
  }, [builder?.stopLiveExecution, builder?.isListeningForWebhook, builder?.stopWebhookListening, builder?.isStepMode, builder?.stopStepExecution])

  // Compute the name of the node we're adding after (for integrations panel context)
  // Uses addingAfterNodeId which persists while panel is open (not selectedNodeId which changes with React Flow selection)
  const addingAfterNodeName = useMemo(() => {
    if (!addingAfterNodeId || !reactFlowProps?.nodes) return null
    const targetNode = reactFlowProps.nodes.find((n: any) => n.id === addingAfterNodeId)
    if (!targetNode) return null
    // Get the title from node data, falling back to type if no title
    return targetNode.data?.title || targetNode.data?.label || targetNode.data?.type || null
  }, [addingAfterNodeId, reactFlowProps?.nodes])

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

  // Handler for when integrations panel closes (clears related state)
  const handleIntegrationsPanelClose = useCallback(() => {
    clearInsertionContext()
  }, [clearInsertionContext])

  // Selection handler
  const handleSelectionChange = useCallback((params: any) => {
    const first = params?.nodes?.[0]
    const selectedId = first?.id ?? null

    console.log('🔄 [WorkflowBuilder] Selection changed:', { selectedId, nodeType: first?.type, isPlaceholder: first?.data?.isPlaceholder })

    setSelectedNodeId(selectedId)

    // Only open integrations panel for action_placeholder if we're not already configuring a node
    // This prevents the panel from re-opening after selecting a node and closing the config modal
    if (first?.type === 'action_placeholder') {
      // Check if config modal is open or integrations panel is already open
      // If so, don't interrupt the user's flow
      if (!configuringNode && !isIntegrationsPanelOpen) {
        console.log('🔄 [WorkflowBuilder] action_placeholder selected, opening integrations panel')
        openIntegrationsPanel('action')
      }
    }
  }, [openIntegrationsPanel, configuringNode, isIntegrationsPanelOpen])

  // Handler for adding node after another (from plus button)
  const handleAddNodeAfterClick = useCallback((afterNodeId: string | null) => {
    // Close config modal if open
    if (configuringNode) {
      setConfiguringNode(null)
    }

    prepareInsertionContext(afterNodeId)

    // If panel is already open and user clicked a different plus button,
    // briefly close and reopen to show a visual cue that the target changed
    if (isIntegrationsPanelOpen && addingAfterNodeId !== afterNodeId) {
      setIsIntegrationsPanelOpen(false)
      // Update the target node (use addingAfterNodeId which persists while panel is open)
      setAddingAfterNodeId(afterNodeId)
      if (afterNodeId) {
        setSelectedNodeId(afterNodeId)
      }
      // Reopen after a brief delay for visual feedback
      setTimeout(() => {
        openIntegrationsPanel('action')
      }, 150) // Short delay for visual "flash" effect
      return
    }

    // Store the node to add after (use addingAfterNodeId which persists while panel is open)
    setAddingAfterNodeId(afterNodeId)
    if (afterNodeId) {
      setSelectedNodeId(afterNodeId)
    }
    // Open integrations panel in action mode
    openIntegrationsPanel('action')
  }, [configuringNode, openIntegrationsPanel, isIntegrationsPanelOpen, addingAfterNodeId, prepareInsertionContext])

  // Node selection from panel
  const handleNodeSelectFromPanel = useCallback(async (nodeData: any) => {
    console.log('🎯 [WorkflowBuilder] handleNodeSelectFromPanel called:', {
      nodeData: nodeData?.type || nodeData,
      selectedNodeId,
      addingAfterNodeId,
      hasActions: !!actions,
      hasBuilder: !!builder
    })

    if (!actions || !builder) return

    setIsStructureTransitioning(true)

    const currentNodes = builder.nodes ?? []
    const insertionContext = pendingInsertionRef.current
    const anchorNodeId = insertionContext?.sourceId ?? addingAfterNodeId ?? selectedNodeId

    // Check if we're replacing a placeholder node
    const replacingPlaceholder = anchorNodeId
      ? currentNodes.find((n: any) => n.id === anchorNodeId && n.data?.isPlaceholder)
      : null

    let position = nodeData.position || { x: 400, y: 300 }

    // If replacing placeholder, use its position
    if (replacingPlaceholder) {
      position = replacingPlaceholder.position
      console.log('📌 [WorkflowBuilder] Replacing placeholder:', anchorNodeId, 'with:', nodeData.type)
    }
    // If adding after a specific node (from plus button), calculate position after that node
    else if (anchorNodeId) {
      const afterNode = currentNodes.find((n: any) => n.id === anchorNodeId)
      if (afterNode) {
        position = {
          x: 400,
          y: afterNode.position.y + 180 // Add 180px vertical spacing after the node
        }
        console.log('📌 [WorkflowBuilder] Adding node after:', anchorNodeId, 'at position:', position)
      }
    }

    const nodeComponent = nodeComponentMap.get(nodeData.type)
    const providerId = nodeComponent?.providerId ?? nodeData.providerId

    // Generate the REAL node ID upfront so we can use it for both optimistic updates
    // and the backend call. This ensures edges and positions are consistent.
    const newNodeId = generateId(nodeData.type.replace(/\W+/g, "-") || "node")

    // Create optimistic node for config modal and canvas
    const optimisticNode = {
      id: newNodeId,
      type: "custom",
      position,
      positionAbsolute: { ...position },
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

    // Prepare reordered node ID list for persisting backend edge order
    const reorderableIds = currentNodes
      .filter((node: any) => isReorderableNode(node))
      .sort((a: any, b: any) => (a.position?.y ?? 0) - (b.position?.y ?? 0))
      .map((node: any) => node.id)

    // Remove placeholder anchor if present
    const linearNodeIds = reorderableIds.filter(id => id !== newNodeId)
    let orderedNodeIds: string[] = linearNodeIds
    if (anchorNodeId && orderedNodeIds.includes(anchorNodeId)) {
      const anchorIndex = orderedNodeIds.indexOf(anchorNodeId)
      orderedNodeIds = [
        ...orderedNodeIds.slice(0, anchorIndex + 1),
        newNodeId,
        ...orderedNodeIds.slice(anchorIndex + 1)
      ]
    } else {
      orderedNodeIds = [...orderedNodeIds, newNodeId]
    }
    orderedNodeIds = Array.from(new Set(orderedNodeIds))

    // Close panel immediately for better UX
    setIsIntegrationsPanelOpen(false)
    clearInsertionContext()

    // Debug: Log current state before calculating insertion plan
    console.log('🔍 [WorkflowBuilder] Insert calculation state:', {
      anchorNodeId,
      selectedNodeId,
      replacingPlaceholder: !!replacingPlaceholder,
      currentNodesCount: currentNodes.length,
      edgesCount: builder.edges?.length ?? 0,
      edges: builder.edges?.map((e: any) => ({ source: e.source, target: e.target }))
    })

    const nodesById = new Map(currentNodes.map((node: any) => [node.id, node]))
    const outgoingEdges =
      anchorNodeId && !replacingPlaceholder && Array.isArray(builder.edges)
        ? builder.edges.filter((e: any) => e.source === anchorNodeId)
        : []

    let originalEdge: any = null
    let originalTargetNodeId = insertionContext?.targetId ?? null
    let originalSourceHandle = insertionContext?.sourceHandle || 'source'
    let originalTargetHandle = insertionContext?.targetHandle || 'target'

    if (anchorNodeId && outgoingEdges.length > 0) {
      if (originalTargetNodeId) {
        originalEdge = outgoingEdges.find(edge => edge.target === originalTargetNodeId) ?? null
      }
      if (!originalEdge) {
        const anchorY = nodesById.get(anchorNodeId)?.position?.y ?? Number.NEGATIVE_INFINITY
        const sortedEdges = outgoingEdges
          .map(edge => ({
            edge,
            targetY: nodesById.get(edge.target)?.position?.y ?? Number.POSITIVE_INFINITY
          }))
          .sort((a, b) => a.targetY - b.targetY)
        originalEdge = sortedEdges.find(item => item.targetY > anchorY)?.edge ?? sortedEdges[0]?.edge ?? null
      }

      if (originalEdge) {
        originalTargetNodeId = originalEdge.target
        originalSourceHandle = originalEdge.sourceHandle || originalSourceHandle || 'source'
        originalTargetHandle = originalEdge.targetHandle || originalTargetHandle || 'target'
      }
    }

    const isInsertingBetween = Boolean(originalTargetNodeId && !replacingPlaceholder)

    console.log('🔍 [WorkflowBuilder] Insertion between check:', {
      originalEdge: originalEdge ? { source: originalEdge.source, target: originalEdge.target } : null,
      originalTargetNodeId,
      isInsertingBetween
    })

    // Calculate which nodes need to be shifted BEFORE optimistic update
    // so we can persist them to the backend after addNode
    const nodesToShift: Array<{ nodeId: string; position: { x: number; y: number } }> = []

    if (isInsertingBetween && anchorNodeId) {
      const verticalShift = LINEAR_NODE_VERTICAL_GAP // 180px
      const selectedNode = currentNodes.find((n: any) => n.id === anchorNodeId)
      const thresholdY = selectedNode?.position?.y ?? position.y

      currentNodes.forEach((node: any) => {
        // Shift nodes that are AFTER the selected node (Y position greater than selected node)
        // Don't shift the selected node itself, and don't shift placeholders
        if (node.position && node.position.y > thresholdY && node.id !== anchorNodeId && !node.data?.isPlaceholder) {
          const newY = node.position.y + verticalShift
          nodesToShift.push({
            nodeId: node.id,
            position: {
              x: node.position.x,
              y: newY
            }
          })
        }
      })

      console.log('🔄 [WorkflowBuilder] Nodes to shift:', nodesToShift)
    }

    // Add optimistic node to canvas immediately for instant feedback
    builder.setNodes((nodes: any[]) => {
      let newNodes = [...nodes]

      // If replacing a placeholder, remove it first
      if (replacingPlaceholder && anchorNodeId) {
        newNodes = newNodes.filter(n => n.id !== anchorNodeId)
      }

      // If inserting between nodes, shift all downstream nodes down
      if (isInsertingBetween && anchorNodeId) {
        const verticalShift = LINEAR_NODE_VERTICAL_GAP // 180px

        console.log('🔄 [WorkflowBuilder] Shifting nodes down:', {
          isInsertingBetween,
          anchorNodeId,
          originalTargetNodeId,
          insertPosition: position,
          verticalShift
        })

        // Find all nodes that are below the insertion point and shift them down
        // Use the anchorNode's Y position as the threshold since we're inserting AFTER it
        const selectedNode = newNodes.find(n => n.id === anchorNodeId)
        const thresholdY = selectedNode?.position?.y ?? position.y

        newNodes = newNodes.map(node => {
          // Shift nodes that are AFTER the selected node (Y position greater than selected node)
          // Don't shift the selected node itself
          if (node.position && node.position.y > thresholdY && node.id !== anchorNodeId) {
            const newY = node.position.y + verticalShift
            console.log(`🔄 [WorkflowBuilder] Shifting node ${node.id} from Y=${node.position.y} to Y=${newY}`)
            const nextPosition = {
              ...node.position,
              y: newY
            }
            const nextAbsolute = node.positionAbsolute
              ? { ...node.positionAbsolute, y: newY }
              : nextPosition
            return {
              ...node,
              position: nextPosition,
              positionAbsolute: nextAbsolute
            }
          }
          return node
        })
      }

      const insertIndex = newNodes.findIndex(n => n.position.y > position.y)
      if (insertIndex === -1) {
        newNodes.push(optimisticNode)
      } else {
        newNodes.splice(insertIndex, 0, optimisticNode)
      }
      return newNodes
    })

    // Add optimistic edges immediately
    if (replacingPlaceholder && anchorNodeId) {
      // When replacing a placeholder, update edges that reference the placeholder
      builder.setEdges((edges: any[]) => {
        return edges.map(edge => {
          // Update edges pointing TO the placeholder
          if (edge.target === anchorNodeId) {
            return { ...edge, target: newNodeId }
          }
          // Update edges FROM the placeholder
          if (edge.source === anchorNodeId) {
            return { ...edge, source: newNodeId }
          }
          return edge
        })
      })
    } else if (anchorNodeId) {
      builder.setEdges((edges: any[]) => {
        if (isInsertingBetween && originalTargetNodeId) {
          // Inserting between two nodes - use captured edge info
          return [
            ...edges.filter(e => !(e.source === anchorNodeId && e.target === originalTargetNodeId)),
            {
              id: `${anchorNodeId}-${newNodeId}`,
              source: anchorNodeId,
              target: newNodeId,
              sourceHandle: originalSourceHandle,
              type: 'custom'
            },
            {
              id: `${newNodeId}-${originalTargetNodeId}`,
              source: newNodeId,
              target: originalTargetNodeId,
              sourceHandle: 'source',
              targetHandle: originalTargetHandle,
              type: 'custom'
            }
          ]
        } else {
          // Adding at the end
          return [
            ...edges,
            {
              id: `${anchorNodeId}-${newNodeId}`,
              source: anchorNodeId,
              target: newNodeId,
              sourceHandle: 'source',
              type: 'custom'
            }
          ]
        }
      })
    }

    endStructureTransition()

    // Open config modal immediately after panel closes
    console.log('🚀 [WorkflowBuilder] Opening config modal for new node:', optimisticNode.id, optimisticNode.data?.type)
    setConfiguringNode(optimisticNode)

    // Clear selected node ID
    setSelectedNodeId(null)

    try {
      // Save node to database using the pre-generated ID
      // This ensures the optimistic node ID matches the backend node ID
      console.log('📌 [WorkflowBuilder] Saving node:', nodeData.type, 'at position:', position, 'with ID:', newNodeId)
      await actions.addNode(nodeData.type, position, newNodeId)

      console.log('📌 [WorkflowBuilder] Node saved successfully')

      // Now create the edges in the backend
      if (anchorNodeId && !replacingPlaceholder) {
        if (isInsertingBetween && originalTargetNodeId) {
          // We're inserting between two nodes - create both edges
          console.log('🔗 [WorkflowBuilder] Creating edges for insertion between', anchorNodeId, 'and', originalTargetNodeId)
          await actions.connectEdge({
            sourceId: anchorNodeId,
            targetId: newNodeId,
            sourceHandle: originalSourceHandle
          })
          await actions.connectEdge({
            sourceId: newNodeId,
            targetId: originalTargetNodeId,
            sourceHandle: 'source',
            targetHandle: originalTargetHandle
          })
        } else {
          // We're adding at the end - create single edge
          console.log('🔗 [WorkflowBuilder] Creating edge from', anchorNodeId, 'to', newNodeId)
          await actions.connectEdge({
            sourceId: anchorNodeId,
            targetId: newNodeId,
            sourceHandle: 'source'
          })
        }
      }

      // Persist the position shifts to the backend AFTER addNode and edges complete
      // This ensures the shifted positions are saved and won't be overwritten by updateReactFlowGraph
      if (nodesToShift.length > 0) {
        console.log('📌 [WorkflowBuilder] Persisting shifted positions:', nodesToShift)
        await actions.moveNodes(nodesToShift)
        console.log('📌 [WorkflowBuilder] Shifted positions persisted')
      }
      if (orderedNodeIds.length >= 2 && actions?.applyEdits) {
        console.log('📌 [WorkflowBuilder] Persisting linear order:', orderedNodeIds)
        try {
          await actions.applyEdits([{ op: "reorderNodes", nodeIds: orderedNodeIds }])
        } catch (error) {
          console.error('[WorkflowBuilder] Failed to persist linear order', error)
        }
      }

    } catch (error: any) {
      setConfiguringNode(null)
      toast({
        title: "Failed to add node",
        description: error?.message ?? "Unable to add node",
        variant: "destructive",
      })
      openIntegrationsPanel()
    }
  }, [actions, builder, nodeComponentMap, toast, selectedNodeId, addingAfterNodeId, openIntegrationsPanel, clearInsertionContext])

  // Node deletion with optimistic update for instant feedback
  const handleDeleteNodes = useCallback(async (nodeIds: string[]) => {
    if (!actions || !builder || nodeIds.length === 0) return

    setIsStructureTransitioning(true)

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
    const nodesToShift: Array<{ nodeId: string; position: { x: number; y: number } }> = []

    // Shift nodes up if we have a deleted position
    if (deletedNodeY !== null) {
      // Calculate the vertical gap (node height + spacing)
      // Typical node height is ~100-200px, gap between nodes is ~180px
      const verticalShift = LINEAR_NODE_VERTICAL_GAP

      // Shift all nodes that were below the deleted node(s)
      updatedNodes = updatedNodes.map((node: any) => {
        if (node.position && node.position.y > deletedNodeY!) {
          const newY = node.position.y - verticalShift
          nodesToShift.push({
            nodeId: node.id,
            position: {
              x: node.position.x ?? LINEAR_STACK_X,
              y: newY,
            }
          })
          return {
            ...node,
            position: {
              ...node.position,
              y: newY
            },
            positionAbsolute: node.positionAbsolute
              ? { ...node.positionAbsolute, y: newY }
              : { ...(node.position ?? { x: LINEAR_STACK_X, y: newY }), y: newY }
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
    const shouldResetToPlaceholders = realNodes.length === 0 && updatedNodes.length === 0

    if (shouldResetToPlaceholders) {
      console.log('🔄 [WorkflowBuilder] All nodes deleted, resetting to placeholder state')

      // Calculate center position based on viewport and agent panel
      const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1920
      const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 1080
      const panelWidth = agentOpen ? agentPanelWidth : 0
      const availableWidth = viewportWidth - panelWidth
      const centerX = panelWidth + (availableWidth / 2) - 180 // 180 = half of 360px node width
      const centerY = (viewportHeight / 2) - 150

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
      builder.setNodes(updatedNodes)
      builder.setEdges(updatedEdges)
      if (nodesToShift.length > 0) {
        actions.moveNodes(nodesToShift).catch((error: any) => {
          console.error('[WorkflowBuilder] Failed to persist node positions after delete', error)
        })
      }
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
    // Re-enable overlays immediately so the phantom edge reflects new layout
    endStructureTransition()

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

    // Position will be auto-corrected by the vertical stacking effect
    // Place it just below the original for now
    const newPosition = {
      x: 400,
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
      const newNode = await actions.addNode(nodeToDuplicate.data?.type, newPosition)

      if (newNode) {
        // Update with real ID from backend
        const finalNodes = builder.nodes.map((n: any) =>
          n.id === tempId
            ? { ...n, id: newNode.id, data: { ...n.data, _optimistic: false } }
            : n
        )
        builder.setNodes(finalNodes)

        // Apply configuration if the original node had config
        if (nodeToDuplicate.data?.config && Object.keys(nodeToDuplicate.data.config).length > 0) {
          await actions.updateConfig(newNode.id, nodeToDuplicate.data.config)
        }

        // Apply the title
        await actions.applyEdits([{
          op: "updateNode",
          nodeId: newNode.id,
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
    // Don't allow opening config modal during flow testing
    if (isFlowTesting) {
      console.log('🔧 [WorkflowBuilder] Ignoring configure request during flow testing')
      return
    }

    const node = reactFlowProps?.nodes?.find((n: any) => n.id === nodeId)
    if (node) {
      console.log('🔧 [WorkflowBuilder] Opening configuration for node:', nodeId, node)

      // Check if this is a placeholder node
      if (node.data?.isPlaceholder) {
        console.log('📌 [WorkflowBuilder] Placeholder node clicked, opening integrations panel')
        setConfiguringNode(null)

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

      // Close integrations panel when opening configuration modal
      setIsIntegrationsPanelOpen(false)
      clearInsertionContext() // Clear the "adding after" context

      setConfiguringNode(node)
    } else {
      console.warn('🔧 [WorkflowBuilder] Node not found for configuration:', nodeId)
    }
  }, [reactFlowProps?.nodes, reactFlowProps?.edges, prefetchNodeConfig, openIntegrationsPanel, setSelectedNodeId, clearInsertionContext, isFlowTesting])

  // Auto-open configuration modal whenever a non-placeholder node becomes selected
  // BUT NOT when the integrations panel is open (user is adding a new node, not configuring existing)
  // AND NOT when flow testing is in progress
  useEffect(() => {
    if (!selectedNodeId) return
    if (configuringNode?.id === selectedNodeId) return

    // Don't auto-open config modal when integrations panel is open
    // This happens when user clicks the plus button to add a new node
    if (isIntegrationsPanelOpen) return

    // Don't auto-open config modal during flow testing
    if (isFlowTesting) return

    const selectedNode = reactFlowProps?.nodes?.find((n: any) => n.id === selectedNodeId)
    if (!selectedNode) return

    const type = selectedNode.type
    const isPlaceholder =
      selectedNode.data?.isPlaceholder ||
      type === 'trigger_placeholder' ||
      type === 'action_placeholder' ||
      type === 'addAction' ||
      type === 'insertAction' ||
      type === 'chainPlaceholder'

    if (isPlaceholder) return

    // Ensure integrations panel is closed so it doesn't overlap the config modal
    setIsIntegrationsPanelOpen(false)
    clearInsertionContext() // Clear the "adding after" context

    handleNodeConfigure(selectedNodeId)
  }, [selectedNodeId, configuringNode?.id, reactFlowProps?.nodes, handleNodeConfigure, isIntegrationsPanelOpen, clearInsertionContext, isFlowTesting])

  // Handle saving node configuration
  const handleSaveNodeConfig = useCallback(async (nodeId: string, config: Record<string, any>) => {
    console.log('💾 [WorkflowBuilder] Saving configuration for node:', nodeId, config)

    if (!actions || !builder) {
      console.warn('💾 [WorkflowBuilder] No actions or builder available to save config')
      return
    }

    try {
      // INSTANT UPDATE: Update the config in localStorage immediately for instant reopen
      if (typeof window !== 'undefined' && flowId) {
        const cacheKey = `workflow_${flowId}_node_${nodeId}_config`;
        try {
          localStorage.setItem(cacheKey, JSON.stringify({
            config: config,
            timestamp: Date.now()
          }));
          console.log('💾 [WorkflowBuilder] Cached config locally for instant reopen');
        } catch (e) {
          console.warn('Could not cache configuration locally:', e);
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
            }),
          })

          if (!triggerResponse.ok) {
            throw new Error(`Trigger test failed: ${triggerResponse.statusText}`)
          }

          const triggerResult = await triggerResponse.json()

          if (triggerResult.eventReceived) {
            // Event received! Use this data for workflow execution
            triggerData = triggerResult.data
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

      // Result structure: { success: true, sessionId, result: { mainResult: { nodeId: data, ... } }, paused?, pausedNodeId?, pausedNodeName? }
      const nodeResults = result.result?.mainResult || {}
      const isPaused = result.paused
      const pausedNodeId = result.pausedNodeId
      const pausedNodeName = result.pausedNodeName

      // Update nodes based on test results
      const finalNodes = nodes.map((n: any) => {
        // Find result for this node in the mainResult
        const nodeOutput = nodeResults[n.id]

        // Check if this is the paused node
        if (isPaused && n.id === pausedNodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              state: 'paused',
              testResult: nodeOutput,
            }
          }
        }

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

      // Check if workflow was paused (HITL)
      if (isPaused) {
        setIsFlowTestPaused(true)
        flowTestPausedRef.current = true
        // Note: Status bar already shows paused state, no toast needed
        return
      }

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
  }, [builder, flowId, hasPlaceholders, toast])

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

  // Auto-center Path Router nodes - DISABLED for linear Zapier-style stacking
  // Nodes are now always positioned vertically at x=400
  // useEffect(() => {
  //   ... router centering logic disabled ...
  // }, [builder?.nodes, builder?.edges, builder?.setNodes])

  // Auto-position nodes vertically in a linear stack (Zapier-style)
  useEffect(() => {
    if (!builder?.nodes || !builder?.setNodes) {
      return
    }

    if (!ENABLE_AUTO_STACK) {
      return
    }

    const VERTICAL_SPACING = 180 // Match initial placeholder spacing
    const CENTER_X = 400 // Consistent horizontal center

    // Build a map of connections to understand node order
    const edges = builder.edges || []
    const nodeOrder: string[] = []
    const visited = new Set<string>()

    // Find the first node (trigger or node with no incoming edges)
    const incomingEdges = new Map<string, number>()
    edges.forEach((edge: any) => {
      incomingEdges.set(edge.target, (incomingEdges.get(edge.target) || 0) + 1)
    })

    const firstNode = builder.nodes.find((n: any) => {
      const hasNoIncoming = !incomingEdges.has(n.id)
      const isTrigger = n.data?.isTrigger
      return hasNoIncoming || isTrigger
    })

    // Traverse from first node to build linear order
    const traverse = (nodeId: string) => {
      if (visited.has(nodeId)) return
      visited.add(nodeId)
      nodeOrder.push(nodeId)

      // Find nodes connected from this one
      const outgoingEdges = edges.filter((e: any) => e.source === nodeId)
      outgoingEdges.forEach((edge: any) => {
        traverse(edge.target)
      })
    }

    if (firstNode) {
      traverse(firstNode.id)
    }

    // Add any orphaned nodes at the end
    builder.nodes.forEach((n: any) => {
      if (!visited.has(n.id)) {
        nodeOrder.push(n.id)
      }
    })

    // Calculate positions based on order
    const updatedNodes = builder.nodes.map((node: any) => {
      const orderIndex = nodeOrder.indexOf(node.id)
      const newY = orderIndex * VERTICAL_SPACING

      // Only update if position changed to avoid unnecessary re-renders
      if (node.position.x !== CENTER_X || node.position.y !== newY) {
        return {
          ...node,
          position: {
            x: CENTER_X,
            y: newY,
          },
        }
      }

      return node
    })

    // Check if any positions changed
    const hasChanges = updatedNodes.some((node: any, i: number) =>
      node.position.x !== builder.nodes[i].position.x ||
      node.position.y !== builder.nodes[i].position.y
    )

    if (hasChanges) {
      builder.setNodes(updatedNodes)
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
    handleTestSandbox: comingSoon,
    handleExecuteLive: handleTestWorkflow,
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
  }), [actions, builder, comingSoon, flowId, flowState?.hasUnsavedChanges, flowState?.isSaving, flowState?.lastRunId, handleNameChange, handleTestWorkflow, handleToggleLiveWithValidation, hasPlaceholders, nameDirty, persistName, workflowName])

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
              // Center view accounting for agent panel (Zapier-style)
              setTimeout(() => {
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

                  // Position nodes in center of available space (to the right of panel)
                  const viewportCenterX = agentPanelWidth + (availableWidth / 2)
                  const viewportCenterY = viewportHeight / 2

                  instance.setCenter(nodesCenterX, nodesCenterY, {
                    zoom: 1,
                    duration: 400
                  })

                  // Shift viewport to account for agent panel
                  setTimeout(() => {
                    const viewport = instance.getViewport()
                    const shiftAmount = agentPanelWidth / 2

                    instance.setViewport({
                      x: viewport.x + shiftAmount,
                      y: viewport.y,
                      zoom: viewport.zoom
                    }, { duration: 200 })
                  }, 450)
                }
              }, 600)
            }}
            agentPanelWidth={agentPanelWidth}
            isAgentPanelOpen={agentOpen}
            buildState={buildMachine.state}
            badge={buildMachine.badge}
            isIntegrationsPanelOpen={isIntegrationsPanelOpen}
            setIsIntegrationsPanelOpen={setIsIntegrationsPanelOpen}
            onIntegrationsPanelClose={handleIntegrationsPanelClose}
            integrationsPanelMode={integrationsPanelMode}
            onNodeSelect={handleNodeSelectFromPanel}
            addingAfterNodeName={addingAfterNodeName}
            onNodeConfigure={handleNodeConfigure}
            onUndoToPreviousStage={handleUndoToPreviousStage}
            onCancelBuild={handleCancelBuild}
            onAddNodeAfter={handleAddNodeAfterClick}
            disablePhantomOverlay={Boolean(activeReorderDrag || isStructureTransitioning || isFlowTesting)}
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
            isListeningForWebhook={Boolean(builder?.isListeningForWebhook)}
            activeExecutionNodeName={activeExecutionNodeName}
            onStopExecution={stopLiveExecutionHandler}
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

        // INSTANT REOPEN: Calculate initial data with stable reference
        // NOTE: We rely on ConfigurationModal's internal effectiveInitialData useMemo
        // to maintain stable reference, not on this calculation
        let initialData: Record<string, any> = { ...(configuringNode?.data?.config || {}) }
        const savedDynamicOptions = configuringNode?.data?.savedDynamicOptions

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

        if (savedDynamicOptions && Object.keys(savedDynamicOptions).length > 0) {
          initialData = {
            ...initialData,
            __dynamicOptions: savedDynamicOptions
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
            initialDynamicOptions={savedDynamicOptions}
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
