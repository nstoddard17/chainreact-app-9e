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
import {
  ReactFlow,
  Background,
  Controls,
  Panel,
  BackgroundVariant,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { WorkflowLoadingScreen } from "@/components/ui/loading-screen"
import { useToast } from "@/hooks/use-toast"
import { BuilderLayout } from "./BuilderLayout"
import { IntegrationsSidePanel } from "./IntegrationsSidePanel"
import { useFlowV2LegacyAdapter } from "@/src/lib/workflows/builder/useFlowV2LegacyAdapter"
import {
  BuildState,
  type BuildStateMachine,
  type PlanNode,
  type StagedText,
  getInitialState,
  getBadgeForState,
  getStateLabel,
} from "@/src/lib/workflows/builder/BuildState"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/availableNodes"
import Image from "next/image"
import "./styles/FlowBuilder.anim.css"
import {
  Sparkles,
  Wand2,
  Play,
  Timer,
  Calculator,
  Rocket,
  Loader2,
  Plus,
  ArrowRight,
  HelpCircle,
  ArrowLeft,
  AtSign,
  Pause,
} from "lucide-react"

const REACT_AGENT_PANEL_WIDTH = 1120

function computeReactAgentPanelWidth(win?: { innerWidth: number }) {
  return REACT_AGENT_PANEL_WIDTH
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

          return {
            id: `node-${index}`,
            title: nodeComponent?.title || edit.node?.label || nodeType,
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
      // Apply all edits at once
      await actions.applyEdits(buildMachine.edits)

      // Wait for nodes to appear
      await new Promise(resolve => setTimeout(resolve, 800))

      // Fit view to show all nodes
      if (reactFlowInstanceRef.current) {
        reactFlowInstanceRef.current.fitView({ padding: 0.2, duration: 800 })
      }

      await new Promise(resolve => setTimeout(resolve, 1000))

      // Transition to waiting for user to setup first node
      setBuildMachine(prev => ({
        ...prev,
        progress: { ...prev.progress, currentIndex: 0 },
      }))

      transitionTo(BuildState.WAITING_USER)

      // Pan camera to first node
      if (reactFlowInstanceRef.current && builder?.nodes?.[0]) {
        reactFlowInstanceRef.current.setCenter(
          builder.nodes[0].position.x + 100,
          builder.nodes[0].position.y + 50,
          { zoom: 1, duration: 800 }
        )
      }

    } catch (error: any) {
      toast({
        title: "Build failed",
        description: error?.message || "Unable to build workflow skeleton",
        variant: "destructive",
      })
      transitionTo(BuildState.PLAN_READY)
    }
  }, [actions, buildMachine, builder?.nodes, toast, transitionTo])

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
          reactFlowInstanceRef.current.setCenter(
            builder.nodes[nextIndex].position.x + 100,
            builder.nodes[nextIndex].position.y + 50,
            { zoom: 1, duration: 800 }
          )
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
          <ReactFlow
            {...reactFlowProps}
            onSelectionChange={handleSelectionChange}
            onInit={(instance) => { reactFlowInstanceRef.current = instance }}
            fitView
            fitViewOptions={{
              padding: 0.2,
              includeHiddenNodes: false,
              minZoom: 0.5,
              maxZoom: 2,
            }}
            className="bg-background"
            proOptions={{ hideAttribution: true }}
            defaultEdgeOptions={{
              type: 'custom',
              style: {
                strokeWidth: 2,
                stroke: '#9ca3af',
                strokeLinecap: 'round',
                strokeLinejoin: 'round'
              },
              animated: false
            }}
            defaultViewport={{ x: 0, y: 0, zoom: 0.75 }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={16}
              size={1.5}
              color="hsl(var(--muted-foreground))"
              style={{ opacity: 0.5 }}
            />
            <Controls
              style={{
                position: 'absolute',
                bottom: '60px',
                left: '4px',
                top: 'auto',
              }}
              fitViewOptions={{
                padding: 0.2,
                includeHiddenNodes: false,
                minZoom: 0.5,
                maxZoom: 2,
              }}
            />

            {/* Add Node Button - Matching legacy position */}
            <Panel position="top-right" style={{ marginTop: '24px', marginRight: '24px' }}>
              <Button
                onClick={() => setIsIntegrationsPanelOpen(true)}
                size="sm"
                className="shadow-lg"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Node
              </Button>
            </Panel>
          </ReactFlow>

          {/* Floating Badge - Show current build state */}
          {buildMachine.badge && (
            <div className="floating-badge">
              <div className={`chip ${buildMachine.badge.variant}`}>
                {buildMachine.badge.spinner && <div className="spinner" />}
                {buildMachine.badge.dots && (
                  <div className="bouncing-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                )}
                <div>
                  <div className="font-medium">{buildMachine.badge.text}</div>
                  {buildMachine.badge.subtext && (
                    <div className="text-xs opacity-75">{buildMachine.badge.subtext}</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Integrations Side Panel - Matching legacy */}
          <div
            className={`absolute top-0 right-0 h-full w-[600px] transition-all duration-300 ease-in-out ${
              isIntegrationsPanelOpen && !configuringNode
                ? 'translate-x-0 opacity-100'
                : 'translate-x-full opacity-0'
            }`}
          >
            <IntegrationsSidePanel
              isOpen={isIntegrationsPanelOpen && !configuringNode}
              onClose={() => setIsIntegrationsPanelOpen(false)}
              onNodeSelect={handleNodeSelectFromPanel}
            />
          </div>

          {/* Configuration Side Panel - To be implemented */}
          <div
            className={`absolute top-0 right-0 h-full w-[600px] transition-all duration-300 ease-in-out ${
              configuringNode
                ? 'translate-x-0 opacity-100'
                : 'translate-x-full opacity-0'
            }`}
          >
            {configuringNode && (
              <div className="h-full w-full bg-background border-l border-border shadow-lg z-50 flex flex-col overflow-hidden">
                {/* Configuration panel content will go here */}
                <div className="flex items-center gap-3 px-4 py-3 border-b">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setConfiguringNode(null)}
                    className="h-8 w-8 hover:bg-accent"
                  >
                    <ArrowRight className="w-4 h-4" />
                  </Button>
                  <span className="flex-1 text-base font-semibold">
                    Configure Node
                  </span>
                </div>
                <div className="flex-1 p-4">
                  <p className="text-sm text-muted-foreground">
                    Configuration panel coming soon...
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* React Agent Chat Panel - Matching legacy exactly */}
          <div
            className={`absolute top-0 left-0 h-full bg-background border-r border-border shadow-xl z-40 transition-transform duration-300 ease-in-out ${
              agentOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
            style={{ width: `${agentPanelWidth}px` }}
          >
            <div className="h-full flex flex-col">
              {/* Chat Header */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <Image
                    src="/logo_transparent.png"
                    alt="ChainReact"
                    width={24}
                    height={24}
                    className="w-6 h-6"
                  />
                  <h2 className="font-semibold text-sm text-foreground">React Agent</h2>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-3 text-[11px] text-foreground hover:bg-accent gap-1.5"
                  >
                    <Sparkles className="w-3 h-3" />
                    Agent Context
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-foreground hover:bg-accent"
                  >
                    <HelpCircle className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setAgentOpen(false)}
                    className="h-8 w-8 text-foreground hover:bg-accent"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              {/* Chat Content */}
              <div className="flex-1 overflow-hidden flex flex-col w-full">
                {/* Welcome message */}
                {buildMachine.state === BuildState.IDLE && (
                  <div className="text-sm text-foreground space-y-2 pt-2 pb-3 px-4 max-w-full">
                    <p>Hello, what would you like to craft?</p>
                    <p className="text-xs">Tell me about your goal or task, and include the tools you normally use (like your email, calendar, or CRM).</p>
                  </div>
                )}

                {/* Chat messages */}
                <div className="flex-1 overflow-y-auto w-full">
                  <div className="space-y-4 py-4 px-4">
                    {/* Animated Build UI */}
                    {buildMachine.state !== BuildState.IDLE && (
                      <div className="space-y-4 max-w-full">
                        {/* User message */}
                        {agentMessages.filter(m => m.role === 'user').map((msg, index) => (
                          <div key={index} className="flex justify-end">
                            <div
                              className="max-w-[80%] rounded-lg px-4 py-3 bg-primary text-primary-foreground"
                              style={{
                                wordBreak: "break-word",
                                overflowWrap: "break-word"
                              }}
                            >
                              <p className="text-sm whitespace-pre-wrap" style={{ wordBreak: "break-word" }}>
                                {msg.content}
                              </p>
                              <p className="text-xs opacity-70 mt-1">
                                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        ))}

                        {/* Staged chips */}
                        {buildMachine.state === BuildState.THINKING && (
                          <div className="w-full max-w-full">
                            <div className="chip blue chip-shimmer">
                              <div className="pulse-dot" />
                              <span>Agent is thinking...</span>
                            </div>
                          </div>
                        )}

                        {(buildMachine.state === BuildState.SUBTASKS || buildMachine.state === BuildState.COLLECT_NODES ||
                          buildMachine.state === BuildState.OUTLINE || buildMachine.state === BuildState.PURPOSE ||
                          buildMachine.state === BuildState.PLAN_READY || buildMachine.state === BuildState.BUILDING_SKELETON ||
                          buildMachine.state === BuildState.WAITING_USER || buildMachine.state === BuildState.PREPARING_NODE ||
                          buildMachine.state === BuildState.TESTING_NODE || buildMachine.state === BuildState.COMPLETE) && (
                          <>
                            {buildMachine.state === BuildState.SUBTASKS && (
                              <div className="w-full max-w-full">
                                <div className="chip blue staged-text-item">
                                  <span>{getStateLabel(BuildState.SUBTASKS)}</span>
                                </div>
                              </div>
                            )}

                            {buildMachine.state !== BuildState.SUBTASKS && buildMachine.stagedText.subtasks && buildMachine.stagedText.subtasks.length > 0 && (
                              <div className="w-full max-w-full">
                                <div className="space-y-2 staged-text-item">
                                  <div className="chip blue">
                                    {getStateLabel(BuildState.SUBTASKS)}
                                  </div>
                                  <div className="ml-4 text-sm text-foreground space-y-1">
                                    {buildMachine.stagedText.subtasks.map((task, i) => (
                                      <div key={i} className="flex items-start gap-2">
                                        <span className="text-muted-foreground shrink-0">{i + 1}.</span>
                                        <span className="break-words flex-1 min-w-0">{task}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}

                            {buildMachine.state === BuildState.COLLECT_NODES && (
                              <div className="w-full max-w-full">
                                <div className="chip blue chip-shimmer staged-text-item">
                                  <div className="pulse-dot" />
                                  <span>{getStateLabel(BuildState.COLLECT_NODES)}</span>
                                </div>
                              </div>
                            )}

                            {buildMachine.state !== BuildState.COLLECT_NODES && buildMachine.state !== BuildState.SUBTASKS &&
                             buildMachine.stagedText.relevantNodes && buildMachine.stagedText.relevantNodes.length > 0 && (
                              <div className="w-full max-w-full">
                                <div className="space-y-2 staged-text-item">
                                  <div className="chip blue">
                                    {getStateLabel(BuildState.COLLECT_NODES)}
                                  </div>
                                  <div className="ml-4 space-y-2">
                                    {buildMachine.stagedText.relevantNodes.map((node, i) => (
                                      <div key={i} className="flex items-start gap-3 p-2 rounded bg-accent/50">
                                        {node.providerId && (
                                          <Image
                                            src={`/integrations/${node.providerId}.svg`}
                                            alt={node.providerId}
                                            width={20}
                                            height={20}
                                            className="shrink-0"
                                          />
                                        )}
                                        <div className="flex-1 text-sm min-w-0">
                                          <div className="font-medium break-words">{node.title}</div>
                                          <div className="text-xs text-muted-foreground break-words">{node.description}</div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            )}

                            {(buildMachine.state === BuildState.OUTLINE || buildMachine.state === BuildState.PURPOSE) && (
                              <div className="w-full max-w-full">
                                <div className="chip blue chip-shimmer staged-text-item">
                                  <div className="pulse-dot" />
                                  <span>{getStateLabel(BuildState.OUTLINE)}</span>
                                </div>
                              </div>
                            )}

                            {buildMachine.state !== BuildState.OUTLINE && buildMachine.state !== BuildState.PURPOSE &&
                             buildMachine.state !== BuildState.SUBTASKS && buildMachine.state !== BuildState.COLLECT_NODES &&
                             buildMachine.stagedText.purpose && (
                              <div className="w-full max-w-full">
                                <div className="space-y-2 staged-text-item">
                                  <div className="chip blue">
                                    {getStateLabel(BuildState.OUTLINE)}
                                  </div>
                                  <div className="ml-4 p-3 rounded bg-accent/50 text-sm">
                                    <div className="font-medium mb-1">Purpose:</div>
                                    <p className="text-muted-foreground break-words">{buildMachine.stagedText.purpose}</p>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Plan Ready - Show plan list and Build button */}
                            {(buildMachine.state === BuildState.PLAN_READY || buildMachine.state === BuildState.BUILDING_SKELETON ||
                              buildMachine.state === BuildState.WAITING_USER || buildMachine.state === BuildState.PREPARING_NODE ||
                              buildMachine.state === BuildState.TESTING_NODE || buildMachine.state === BuildState.COMPLETE) && (
                              <div className="w-full max-w-full">
                                <div className="space-y-3 staged-text-item">
                                <div className="text-sm font-medium">{getStateLabel(BuildState.PLAN_READY)}</div>
                                <div className="text-xs font-semibold text-muted-foreground">Flow plan:</div>
                                <div className="space-y-1">
                                  {buildMachine.plan.map((planNode, index) => {
                                    const isDone = index < buildMachine.progress.done
                                    const isActive = index === buildMachine.progress.currentIndex
                                    const NodeIcon = planNode.icon

                                    return (
                                      <div key={planNode.id} className={`plan-item ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}>
                                        <div className="plan-item-bullet">{index + 1}</div>
                                        <div className="flex-1 flex items-start gap-2 min-w-0">
                                          {planNode.providerId ? (
                                            <Image
                                              src={`/integrations/${planNode.providerId}.svg`}
                                              alt={planNode.providerId}
                                              width={16}
                                              height={16}
                                              className="shrink-0 mt-0.5"
                                            />
                                          ) : NodeIcon ? (
                                            <NodeIcon className="w-4 h-4 shrink-0 mt-0.5" />
                                          ) : null}
                                          <span className="text-sm break-words">{planNode.title}</span>
                                        </div>
                                        {isActive && buildMachine.state === BuildState.PREPARING_NODE && (
                                          <div className="chip blue">
                                            <span className="text-xs">Preparing node</span>
                                            <div className="pulse-dot" />
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>

                                {buildMachine.state === BuildState.PLAN_READY && (
                                  <Button onClick={handleBuild} className="w-full" size="lg">
                                    Build
                                  </Button>
                                )}

                                {buildMachine.state === BuildState.BUILDING_SKELETON && (
                                  <div className="space-y-2">
                                    <div className="chip blue">
                                      <div className="bouncing-dots">
                                        <span />
                                        <span />
                                        <span />
                                      </div>
                                      <span>{getStateLabel(BuildState.BUILDING_SKELETON)}</span>
                                    </div>
                                    <div className="flex gap-2">
                                      <Button variant="ghost" size="sm" onClick={handleUndoToPreviousStage} className="flex-1">
                                        Undo to previous stage
                                      </Button>
                                      <Button variant="ghost" size="sm" onClick={handleCancelBuild} className="flex-1 text-destructive">
                                        Cancel build
                                      </Button>
                                    </div>
                                  </div>
                                )}

                                {buildMachine.state === BuildState.WAITING_USER && buildMachine.progress.currentIndex >= 0 && (
                                  <div className="space-y-3">
                                    <div className="chip green">
                                      {getStateLabel(BuildState.WAITING_USER)}
                                    </div>
                                    <div className="setup-card setup-card-warning">
                                      <div className="text-sm font-medium mb-3">
                                        Let's connect the service first — pick a saved connection or make a new one
                                      </div>
                                      <div className="text-xs text-muted-foreground mb-3">
                                        Your Monday connection
                                      </div>
                                      <Button variant="default" size="sm" className="mb-3">
                                        + Connect monday
                                      </Button>
                                      <Separator className="my-3" />
                                      <div className="text-xs text-muted-foreground mb-2">
                                        Board - Fill the parameter Board
                                      </div>
                                      <Input placeholder="loading options..." className="mb-3" />
                                      <div className="flex gap-2">
                                        <Button onClick={handleContinueNode} size="sm" className="flex-1">
                                          Continue
                                        </Button>
                                        <Button onClick={handleSkipNode} variant="ghost" size="sm" className="flex-1">
                                          Skip
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {buildMachine.state === BuildState.COMPLETE && (
                                  <div className="setup-card">
                                    <div className="text-center space-y-3">
                                      <div className="text-lg font-semibold text-green-600">
                                        {getStateLabel(BuildState.COMPLETE)}
                                      </div>
                                      <div className="text-sm text-muted-foreground">
                                        Your flow is configured and ready to use. You can now publish or test it.
                                      </div>
                                      <div className="flex gap-2">
                                        <Button variant="default" className="flex-1">
                                          Publish
                                        </Button>
                                        <Button variant="outline" className="flex-1">
                                          Test all
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Chat input - Fixed at bottom */}
                <div className="mt-auto mb-4 px-4 relative">
                  {/* Text Field Container */}
                  <div className="border border-border rounded-lg bg-background p-2">
                    {/* Add Context Button */}
                    <div className="mb-0.5 flex items-center justify-between">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs text-foreground hover:bg-accent gap-1"
                        disabled={isAgentLoading}
                      >
                        <AtSign className="w-3 h-3" />
                        add context
                      </Button>
                      {isAgentLoading && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 gap-1"
                        >
                          <Pause className="w-3 h-3" />
                          pause
                        </Button>
                      )}
                    </div>

                    {/* Input field */}
                    <div className="relative">
                      {agentInput === '' && (
                        <div className="absolute left-0 top-0 pointer-events-none px-3 py-2 text-sm text-muted-foreground leading-normal">
                          How can ChainReact help you today?
                        </div>
                      )}
                      <input
                        type="text"
                        value={agentInput}
                        onChange={(e) => setAgentInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && agentInput.trim()) {
                            handleAgentSubmit()
                          }
                        }}
                        disabled={isAgentLoading}
                        className="w-full border-0 shadow-none focus:outline-none focus:ring-0 text-sm text-foreground px-3 py-2 bg-transparent leading-normal"
                        style={{ caretColor: 'currentColor' }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

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
