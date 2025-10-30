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
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/availableNodes"
import "./styles/FlowBuilder.anim.css"
import { Sparkles } from "lucide-react"
import { FlowV2BuilderContent } from "./FlowV2BuilderContent"
import { FlowV2AgentPanel } from "./FlowV2AgentPanel"
import {
  applyDagreLayout,
  needsLayout,
  fitCanvasToFlow,
  panToNode,
  setAllNodesGrey,
  setNodeActive,
  setNodeDone,
} from "./layout"

// Agent panel dimensions
const DEFAULT_AGENT_PANEL_WIDTH = 1120
const AGENT_PANEL_MIN_WIDTH = 360
const AGENT_PANEL_MAX_WIDTH = 1120
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

interface AgentMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
}

export function WorkflowBuilderV2({ flowId }: WorkflowBuilderV2Props) {
  const searchParams = useSearchParams()
  const promptParam = searchParams?.get("prompt") ?? searchParams?.get("initialPrompt") ?? null

  const adapter = useFlowV2LegacyAdapter(flowId)
  const builder = adapter.flowState
  const actions = adapter.actions
  const flowState = builder?.flowState
  const { toast } = useToast()

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
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([])
  const [isAgentLoading, setIsAgentLoading] = useState(false)
  const [agentStatus, setAgentStatus] = useState("")

  // Build state machine (Kadabra-style animated build)
  const [buildMachine, setBuildMachine] = useState<BuildStateMachine>(getInitialState())

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
        // Trigger the agent submission
        const userMessage: AgentMessage = {
          id: crypto.randomUUID(),
          role: "user",
          content: prompt,
          timestamp: new Date(),
        }
        setAgentMessages([userMessage])
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
  }, [actions, promptParam])

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
    if (!actions) return

    try {
      await actions.addNode(nodeData.type, { x: 400, y: 300 })
      setIsIntegrationsPanelOpen(false)
      toast({
        title: "Node added",
        description: `Added ${nodeData.title} to your workflow`,
      })
    } catch (error: any) {
      toast({
        title: "Failed to add node",
        description: error?.message ?? "Unable to add node",
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

    const userMessage: AgentMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: agentInput.trim(),
      timestamp: new Date(),
    }

    setAgentMessages(prev => [...prev, userMessage])
    setAgentInput("")
    setIsAgentLoading(true)

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
      const result = await actions.askAgent(userMessage.content)

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

      setBuildMachine(prev => ({
        ...prev,
        plan,
        edits: result.edits,
        stagedText: {
          purpose: result.rationale || `Create a workflow to ${userMessage.content}`,
          subtasks: plan.map(p => p.title),
          relevantNodes: plan.map(p => ({
            title: p.title,
            description: `${p.providerId || 'Generic'} node`,
            providerId: p.providerId,
          })),
        },
        progress: { currentIndex: -1, done: 0, total: plan.length },
      }))

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
  }, [agentInput, actions, toast, transitionTo])

  const handleBuild = useCallback(async () => {
    if (!actions || !buildMachine.edits || buildMachine.state !== BuildState.PLAN_READY) return

    transitionTo(BuildState.BUILDING_SKELETON)

    try {
      // Separate edits by type
      const addNodeEdits = buildMachine.edits.filter(e => e.op === 'addNode')
      const connectEdits = buildMachine.edits.filter(e => e.op === 'connect')
      const otherEdits = buildMachine.edits.filter(e => e.op !== 'addNode' && e.op !== 'connect')

      // Apply non-node edits first (interface setup, etc.)
      if (otherEdits.length > 0) {
        await actions.applyEdits(otherEdits)
      }

      // Track added node IDs for connection mapping
      const addedNodeIds = new Set<string>()

      // Add nodes one at a time with animation delay
      for (let i = 0; i < addNodeEdits.length; i++) {
        const edit = addNodeEdits[i]

        // Update progress to show which node we're building
        setBuildMachine(prev => ({
          ...prev,
          progress: { ...prev.progress, currentIndex: i, done: i, total: addNodeEdits.length },
        }))

        // Add the node
        await actions.applyEdits([edit])
        if (edit.op === 'addNode') {
          addedNodeIds.add(edit.node.id)
        }

        // Wait for node to appear in DOM
        await new Promise(resolve => setTimeout(resolve, 100))

        // Apply grey filter to the newly added node
        if (reactFlowInstanceRef.current && edit.op === 'addNode') {
          const nodeElement = document.querySelector(`[data-id="${edit.node.id}"]`)
          if (nodeElement) {
            nodeElement.classList.add('node-grey')
          }
        }

        // Add connections for this node (edges where source or target is this node)
        if (edit.op === 'addNode') {
          const nodeConnections = connectEdits.filter(e =>
            e.op === 'connect' && (e.edge.source === edit.node.id || e.edge.target === edit.node.id)
          )

          // Only add connections where both nodes exist
          const validConnections = nodeConnections.filter(e =>
            e.op === 'connect' && addedNodeIds.has(e.edge.source) && addedNodeIds.has(e.edge.target)
          )

          if (validConnections.length > 0) {
            await actions.applyEdits(validConnections)
          }
        }

        // Pause before adding next node
        if (i < addNodeEdits.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 400))
        }
      }

      // Apply dagre auto-layout after all nodes are placed
      await new Promise(resolve => setTimeout(resolve, 300))

      if (reactFlowInstanceRef.current && builder?.nodes) {
        if (needsLayout(builder.nodes)) {
          const layoutedNodes = applyDagreLayout(builder.nodes, builder.edges || [])
          builder.setNodes?.(layoutedNodes)
        }
      }

      // Fit view to show all nodes (with skeleton zoom level)
      if (reactFlowInstanceRef.current) {
        fitCanvasToFlow(reactFlowInstanceRef.current, { skeleton: true })
      }

      await new Promise(resolve => setTimeout(resolve, 800))

      // Transition to waiting for user to setup first node
      setBuildMachine(prev => ({
        ...prev,
        progress: { ...prev.progress, currentIndex: 0 },
      }))

      transitionTo(BuildState.WAITING_USER)

      // Pan camera to first node
      if (reactFlowInstanceRef.current && builder?.nodes?.[0]) {
        panToNode(reactFlowInstanceRef.current, builder.nodes[0].id)
      }

    } catch (error: any) {
      toast({
        title: "Build failed",
        description: error?.message || "Unable to build workflow skeleton",
        variant: "destructive",
      })
      transitionTo(BuildState.PLAN_READY)
    }
  }, [actions, buildMachine, builder?.nodes, builder?.edges, builder?.setNodes, toast, transitionTo, setBuildMachine])

  const handleContinueNode = useCallback(async () => {
    const currentIndex = buildMachine.progress.currentIndex
    if (currentIndex < 0 || !buildMachine.plan[currentIndex]) return

    transitionTo(BuildState.PREPARING_NODE)

    // TODO: Implement node configuration based on setup card inputs
    await new Promise(resolve => setTimeout(resolve, 500))

    transitionTo(BuildState.TESTING_NODE)

    try {
      // TODO: Test node using runFromHere
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Move to next node
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

        // Pan to next node
        if (reactFlowInstanceRef.current && builder?.nodes?.[nextIndex]) {
          panToNode(reactFlowInstanceRef.current, builder.nodes[nextIndex].id)
        }
      }
    } catch (error: any) {
      toast({
        title: "Node test failed",
        description: error?.message || "Unable to test node",
        variant: "destructive",
      })
      transitionTo(BuildState.WAITING_USER)
    }
  }, [buildMachine, builder?.nodes, toast, transitionTo])

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

  const handleCancelBuild = useCallback(() => {
    transitionTo(BuildState.PLAN_READY)
  }, [transitionTo])

  const handleUndoToPreviousStage = useCallback(() => {
    transitionTo(BuildState.PLAN_READY)
  }, [transitionTo])

  // Apply node styling based on build state
  useEffect(() => {
    if (!builder?.nodes || buildMachine.state === BuildState.IDLE) {
      return
    }

    const { state, progress } = buildMachine

    // Apply CSS classes to nodes based on build state
    const updatedNodes = builder.nodes.map((node, index) => {
      let className = ''

      if (state === BuildState.BUILDING_SKELETON) {
        // All nodes are grey during skeleton building
        className = 'node-grey'
      } else if (
        state === BuildState.WAITING_USER ||
        state === BuildState.PREPARING_NODE ||
        state === BuildState.TESTING_NODE
      ) {
        // During node setup/testing
        if (index < progress.currentIndex) {
          className = 'node-done' // Completed nodes
        } else if (index === progress.currentIndex) {
          className = 'node-active' // Current node being configured
        } else {
          className = 'node-grey' // Future nodes
        }
      } else if (state === BuildState.COMPLETE) {
        // All nodes are done
        className = 'node-done'
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
    handleUndo: comingSoon,
    handleRedo: comingSoon,
    canUndo: false,
    canRedo: false,
    setShowExecutionHistory: () => {},
  }), [comingSoon, flowId, flowState?.hasUnsavedChanges, flowState?.isSaving, handleNameChange, nameDirty, persistName, workflowName])

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
          <FlowV2BuilderContent
            nodes={reactFlowProps?.nodes ?? []}
            edges={reactFlowProps?.edges ?? []}
            onNodesChange={reactFlowProps?.onNodesChange}
            onEdgesChange={reactFlowProps?.onEdgesChange}
            onConnect={reactFlowProps?.onConnect}
            nodeTypes={reactFlowProps?.nodeTypes}
            edgeTypes={reactFlowProps?.edgeTypes}
            onSelectionChange={handleSelectionChange}
            onInit={(instance) => { reactFlowInstanceRef.current = instance }}
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
            }}
            actions={{
              onInputChange: value => setAgentInput(value),
              onSubmit: handleAgentSubmit,
              onBuild: handleBuild,
              onContinueNode: handleContinueNode,
              onSkipNode: handleSkipNode,
              onUndoToPreviousStage: handleUndoToPreviousStage,
              onCancelBuild: handleCancelBuild,
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
        </div>
      </BuilderLayout>
    </TooltipProvider>
  )
}
