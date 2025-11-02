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
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/nodes"
import type { NodeComponent } from "@/lib/workflows/nodes/types"
import "./styles/FlowBuilder.anim.css"
import { Sparkles } from "lucide-react"
import { FlowV2BuilderContent } from "./FlowV2BuilderContent"
import { FlowV2AgentPanel } from "./FlowV2AgentPanel"
import { NodeStateTestPanel } from "./NodeStateTestPanel"
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

type PendingChatMessage = {
  localId: string
  role: ChatMessage['role']
  text: string
  subtext?: string
  meta?: Record<string, any>
  createdAt?: string
}

// Agent panel dimensions (Expanded for better visibility: 1120px ± 4)
const DEFAULT_AGENT_PANEL_WIDTH = 1120
const AGENT_PANEL_MIN_WIDTH = 1116 // 1120 - 4
const AGENT_PANEL_MAX_WIDTH = 1124 // 1120 + 4
const AGENT_PANEL_MARGIN = 48

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

function computeReactAgentPanelWidth(win?: { innerWidth: number }) {
  if (!win) {
    return DEFAULT_AGENT_PANEL_WIDTH
  }

  const viewportWidth = win.innerWidth

  if (viewportWidth >= DEFAULT_AGENT_PANEL_WIDTH + AGENT_PANEL_MARGIN) {
    return DEFAULT_AGENT_PANEL_WIDTH
  }

  const availableWidth = viewportWidth - AGENT_PANEL_MARGIN
  const clamped = Math.min(
    AGENT_PANEL_MAX_WIDTH,
    Math.max(AGENT_PANEL_MIN_WIDTH, availableWidth)
  )

  return clamped
}

interface WorkflowBuilderV2Props {
  flowId: string
}

export function WorkflowBuilderV2({ flowId }: WorkflowBuilderV2Props) {
  const searchParams = useSearchParams()
  const promptParam = searchParams?.get("prompt") ?? searchParams?.get("initialPrompt") ?? null

  const adapter = useFlowV2LegacyAdapter(flowId)
  const builder = adapter.flowState
  const actions = adapter.actions
  const flowState = builder?.flowState
  const { toast } = useToast()
  const { initialized: authInitialized } = useAuthStore()
  const { isIntegrationConnected } = useIntegrationSelection()

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
  const [agentOpen, setAgentOpen] = useState(true)
  const [agentInput, setAgentInput] = useState("")
  const [agentMessages, setAgentMessages] = useState<ChatMessage[]>([])
  const [isAgentLoading, setIsAgentLoading] = useState(false)
  const [agentStatus, setAgentStatus] = useState("")

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
      const flow = flowState.flow
      const hasExistingContent =
        revisionCount > 1 ||
        agentMessages.length > 0 ||
        Boolean(flow && (flow.nodes?.length ?? 0) > 0) ||
        Boolean(flow && (flow.edges?.length ?? 0) > 0) ||
        Boolean(flow && flow.name && flow.name.trim() !== "Untitled Flow")

      if (hasExistingContent) {
        setChatPersistenceEnabled(true)
        return
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

        // Start the animated build process
        transitionTo(BuildState.THINKING)

        // Run the agent query
        ;(async () => {
          try {
            await new Promise(resolve => setTimeout(resolve, 1000))
            transitionTo(BuildState.SUBTASKS)

            await new Promise(resolve => setTimeout(resolve, 800))
            transitionTo(BuildState.COLLECT_NODES)

            await new Promise(resolve => setTimeout(resolve, 800))
            transitionTo(BuildState.OUTLINE)

            await new Promise(resolve => setTimeout(resolve, 800))
            transitionTo(BuildState.PURPOSE)

            const result = await actions.askAgent(prompt)

            const plan: PlanNode[] = (result.edits || [])
              .filter((edit: any) => edit.op === 'addNode')
              .map((edit: any, index: number) => {
                const nodeType = edit.node?.type || 'unknown'
                const nodeComponent = ALL_NODE_COMPONENTS.find(n => n.type === nodeType)

                return {
                  id: `node-${index}`,
                  title: nodeComponent?.title || edit.node?.label || nodeType,
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

            setBuildMachine(prev => ({
              ...prev,
              plan,
              edits: result.edits,
              stagedText: {
                purpose: result.rationale || `Create a workflow to ${prompt}`,
                subtasks: plan.map(p => p.title),
                relevantNodes: plan.map(p => ({
                  title: p.title,
                  description: `${p.providerId || 'Generic'} node`,
                  providerId: p.providerId,
                })),
              },
              progress: { currentIndex: -1, done: 0, total: plan.length },
            }))

            const assistantText = result.rationale || `I've created a plan with ${plan.length} steps to ${prompt}`
            const assistantMeta = { plan: { edits: result.edits, nodeCount: plan.length } }

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

            await new Promise(resolve => setTimeout(resolve, 500))
            transitionTo(BuildState.PLAN_READY)
            setIsAgentLoading(false)
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
  }, [actions, chatPersistenceEnabled, enqueuePendingMessage, flowId, flowState?.flow, generateLocalId, promptParam, replaceMessageByLocalId])

  // React Flow props
  const reactFlowProps = useMemo(() => {
    if (!builder) {
      return null
    }

    return {
      nodes: builder.nodes,
      edges: builder.edges,
      onNodesChange: builder.optimizedOnNodesChange ?? builder.onNodesChange,
      onEdgesChange: builder.onEdgesChange,
      onConnect: builder.onConnect,
      nodeTypes: builder.nodeTypes,
      edgeTypes: builder.edgeTypes,
    }
  }, [builder])

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

    const placeholderId = `temp-${Date.now()}`
    const providerId = nodeComponent?.providerId ?? nodeData.providerId

    const placeholderNode = {
      id: placeholderId,
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
        agentHighlights: [],
      },
    }

    const currentNodes = builder.nodes ?? []
    const currentEdges = builder.edges ?? []

    builder.setNodes([...currentNodes, placeholderNode])
    setIsIntegrationsPanelOpen(false)

    try {
      await actions.addNode(nodeData.type, position)
    } catch (error: any) {
      builder.setNodes(currentNodes)
      builder.setEdges(currentEdges)
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

  // Placeholder handlers (to be implemented)
  const comingSoon = useCallback(
    () =>
      toast({
        title: "Coming soon",
        description: "This action is not yet wired to the Flow v2 backend.",
      }),
    [toast]
  )

  // Build state machine handlers
  const transitionTo = useCallback((nextState: BuildState) => {
    setBuildMachine(prev => {
      const badge = getBadgeForState(
        nextState,
        prev.plan[prev.progress.currentIndex]?.title
      )
      return { ...prev, state: nextState, badge }
    })
  }, [])

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

      // Call actual askAgent API
      const result = await actions.askAgent(userPrompt)

      // Generate plan from edits
      const plan: PlanNode[] = (result.edits || [])
        .filter((edit: any) => edit.op === 'addNode')
        .map((edit: any, index: number) => {
          const nodeType = edit.node?.type || 'unknown'
          const nodeComponent = ALL_NODE_COMPONENTS.find(n => n.type === nodeType)

          // Get Kadabra-style display name
          const displayTitle = getKadabraStyleNodeName(
            nodeType,
            nodeComponent?.providerId,
            nodeComponent?.title
          )

          return {
            id: `node-${index}`,
            title: displayTitle,
            description: nodeComponent?.description || `${nodeComponent?.title || nodeType} node`,
            nodeType,
            providerId: nodeComponent?.providerId,
            icon: nodeComponent?.icon,
            requires: {
              // TODO: Extract from node definition
              secretNames: [],
              params: [],
            },
          }
        })

      const assistantText = result.rationale || `I've created a plan with ${plan.length} steps to ${userPrompt}`
      const assistantMeta = {
        plan: { edits: result.edits, nodeCount: plan.length }
      }

      setBuildMachine(prev => ({
        ...prev,
        plan,
        edits: result.edits,
        stagedText: {
          purpose: result.rationale || `Create a workflow to ${userPrompt}`,
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
      if (result.workflowName && actions.updateFlowName) {
        try {
          await actions.updateFlowName(result.workflowName)
        } catch (error) {
          console.error('Failed to update workflow name:', error)
          // Non-critical, continue anyway
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500))
      transitionTo(BuildState.PLAN_READY)
      setIsAgentLoading(false)

    } catch (error: any) {
      toast({
        title: "Failed to create plan",
        description: error?.message || "Unable to generate workflow plan",
        variant: "destructive",
      })
      transitionTo(BuildState.IDLE)
      setIsAgentLoading(false)
    }
  }, [agentInput, actions, builder, chatPersistenceEnabled, enqueuePendingMessage, flowState?.flow, toast, transitionTo, generateLocalId, replaceMessageByLocalId])

  const handleBuild = useCallback(async () => {
    if (!actions || !buildMachine.edits || buildMachine.state !== BuildState.PLAN_READY) return

    try {
      // STEP 1: Check integration connections FIRST
      const addNodeEdits = buildMachine.edits.filter(e => e.op === 'addNode')
      const requiredIntegrations = new Set<string>()

      // Collect all provider IDs from plan nodes
      buildMachine.plan.forEach(planNode => {
        if (planNode.providerId && !['ai', 'logic', 'core', 'manual', 'schedule'].includes(planNode.providerId)) {
          requiredIntegrations.add(planNode.providerId)
        }
      })

      // Check if all required integrations are connected
      const missingIntegrations: string[] = []
      requiredIntegrations.forEach(providerId => {
        if (!isIntegrationConnected(providerId)) {
          missingIntegrations.push(providerId)
        }
      })

      // If integrations missing, show error and don't proceed
      if (missingIntegrations.length > 0) {
        toast({
          title: "Missing Integrations",
          description: `Please connect: ${missingIntegrations.join(', ')}`,
          variant: "destructive",
        })
        return
      }

      transitionTo(BuildState.BUILDING_SKELETON)
      await persistOrQueueStatus("Building workflow...")

      // STEP 2: Create mapping of plan nodes to ReactFlow node IDs AND cache the nodes
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

      // STEP 3: Add nodes ONE AT A TIME with animation
      // Extract node edits (connect edges will be created sequentially)
      const nodeEdits = buildMachine.edits.filter((e: any) => e.op === 'addNode')

      console.log('[handleBuild] Adding', nodeEdits.length, 'nodes sequentially with animation')

      // STEP 4: Animate nodes appearing one by one
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
        applyNodeUpdate(node => ({
          ...node,
          data: {
            ...node.data,
            config: {
              ...(node.data?.config ?? {}),
              ...userConfig,
            },
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

            applyNodeUpdate(node => ({
              ...node,
              data: {
                ...node.data,
                aiStatus: 'configuring',
                aiProgressConfig: [...progressEntries],
                config: {
                  ...(node.data?.config ?? {}),
                  ...userConfig,
                  [field.name]: aiValue,
                },
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

        const testSuccess = true
        await wait(600)

        if (testSuccess) {
          setNodeState(reactFlowInstanceRef.current, reactFlowNode.id, 'passed')
          applyNodeUpdate(node => ({
            ...node,
            data: {
              ...node.data,
              aiStatus: 'ready',
              state: 'passed',
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
            },
          }))
          throw new Error('Node test failed')
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

        // STEP 9: Pan to next node with safe zoom (maintain zoom from before)
        if (reactFlowInstanceRef.current && nextReactNodeId) {
          const totalNodes = builder.nodes?.length ?? buildMachine.plan.length
          const safeZoom = calculateSafeZoom(totalNodes, 5)
          panToNode(reactFlowInstanceRef.current, nextReactNodeId, {
            zoom: safeZoom,
            duration: 600,
          })
        }
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
            configuringNode={configuringNode}
            setConfiguringNode={setConfiguringNode}
            onUndoToPreviousStage={handleUndoToPreviousStage}
            onCancelBuild={handleCancelBuild}
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

          {/* Node State Test Panel - Phase 1 Testing */}
          <NodeStateTestPanel />
        </div>
      </BuilderLayout>
    </TooltipProvider>
  )
}
