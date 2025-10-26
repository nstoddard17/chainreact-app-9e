"use client"

import React from "react"
import { useSearchParams } from "next/navigation"
import { ReactFlow, Background, Controls, Panel, BackgroundVariant } from "@xyflow/react"
import "@xyflow/react/dist/style.css"

// Custom hooks
import { useWorkflowBuilder } from "@/hooks/workflows/useWorkflowBuilder"

// Layout
import { BuilderLayout } from "./builder/BuilderLayout"

// Components
import { CollaboratorCursors } from "./CollaboratorCursors"
import { ConfigurationModal } from "./configuration"
import { AIAgentConfigModal } from "./AIAgentConfigModal"
import ErrorNotificationPopup from "./ErrorNotificationPopup"
import { ReAuthNotification } from "@/components/integrations/ReAuthNotification"
import { WorkflowLoadingScreen } from "@/components/ui/loading-screen"
import { UnsavedChangesModal } from "./builder/UnsavedChangesModal"
import { NodeDeletionModal } from "./builder/NodeDeletionModal"
import { ExecutionStatusPanel } from "./ExecutionStatusPanel"
import { TestModeDebugLog } from "./TestModeDebugLog"
import { PreflightCheckDialog } from "./PreflightCheckDialog"
import { TestModeDialog } from "./TestModeDialog"
import { StatusBadge } from "./ai-builder/StatusBadge"
import { WorkflowPlan } from "./ai-builder/WorkflowPlan"
import { ClarificationQuestion } from "./ai-builder/ClarificationQuestion"
import { PulsingPlaceholders } from "./ai-builder/PulsingPlaceholders"
import { MissingIntegrationsBadges } from "./ai-builder/MissingIntegrationsBadges"
import { WorkflowBuildProgress } from "./ai-builder/WorkflowBuildProgress"
import { NodeConfigurationStatus } from "./ai-builder/NodeConfigurationStatus"
import { Button } from "@/components/ui/button"
import { Plus, X, ArrowRight, Trash2, Database, Play, Zap, FastForward, Pause, ChevronDown, Info, MessageSquare, ChevronLeft, HelpCircle, AtSign, ArrowLeft, Sparkles, Loader2 } from "lucide-react"
import Image from "next/image"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ScrollArea } from "@/components/ui/scroll-area"
import { AirtableSetupPanel, type TemplateSetupData } from "@/components/templates/AirtableSetupPanel"
import { TemplateSetupDialog } from "@/components/templates/TemplateSetupDialog"
import { TemplateSettingsDrawer } from "./builder/TemplateSettingsDrawer"
import { IntegrationsSidePanel } from "./builder/IntegrationsSidePanel"
import { ALL_NODE_COMPONENTS } from "@/lib/workflows/availableNodes"
import { useIntegrationStore } from "@/stores/integrationStore"

import { logger } from '@/lib/utils/logger'

const REACT_AGENT_PANEL_WIDTH = 1000
const REACT_AGENT_VIEWPORT_MARGIN = 48
const REACT_AGENT_VERTICAL_MARGIN = 80
const MIN_VIEWPORT_ZOOM = 0.1
const MAX_VIEWPORT_ZOOM = 1.1

export function NewWorkflowBuilderContent() {
  // Get URL parameters for AI chat
  const searchParams = useSearchParams()
  const aiChatParam = searchParams?.get('aiChat')
  const initialPromptParam = searchParams?.get('initialPrompt')

  // Get connected integrations and loading state
  const { getConnectedProviders, integrations, fetchIntegrations, loading: integrationsLoading } = useIntegrationStore()

  logger.info('[NewWorkflowBuilderContent] URL params:', {
    aiChat: aiChatParam,
    hasInitialPrompt: !!initialPromptParam,
    initialPrompt: initialPromptParam
  })

  const {
    // React Flow state
    nodes,
    edges,
    onNodesChange,
    optimizedOnNodesChange,
    onEdgesChange,
    onConnect,
    nodeTypes,
    edgeTypes,
    getNodes,

    // Workflow metadata
    workflowName,
    setWorkflowName,
    currentWorkflow,
    editTemplateId,
    isTemplateEditing,

    // Loading/saving states
    isSaving,
    isLoading,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    listeningMode,

    // Handlers
    handleSave,
    handleToggleLive,
    isUpdatingStatus,
    handleTestSandbox,
    handleExecuteLive,
    handleExecuteLiveSequential,

    // Dialogs
    showTriggerDialog,
    setShowTriggerDialog,
    showActionDialog,
    setShowActionDialog,
    showUnsavedChangesModal,
    setShowUnsavedChangesModal,
    setShowExecutionHistory,
    deletingNode,
    setDeletingNode,
    handleOpenTriggerDialog,
    handleActionDialogClose,
    handleTriggerSelect,
    handleTriggerDialogClose,
    handleActionSelect,
    handleAddTrigger,
    handleAddAction,
    templateDraftMetadata,
    templatePublishedMetadata,
    updateTemplateDraftMetadata,
    saveTemplateDraft,
    isSavingTemplateDraft,
    templateAssets,
    uploadTemplateAsset,
    deleteTemplateAsset,
    templateSettingsLabel,

    // Execution state
    isExecuting,
    isStepMode,
    nodeStatuses,
    isListeningForWebhook,
    webhookTriggerType,
    usingTestData,
    testDataNodes,
    stopWebhookListening,
    skipToTestData,

    // Sandbox/Test mode
    testModeDialogOpen,
    setTestModeDialogOpen,
    isExecutingTest,
    handleRunTest,
    sandboxInterceptedActions,
    setSandboxInterceptedActions,
    showSandboxPreview,
    setShowSandboxPreview,

    // Configuration
    configuringNode,
    setConfiguringNode,
    pendingNode,
    handleSaveConfiguration,
    handleConfigurationClose,
    aiAgentActionCallback,

    // Integration selection
    selectedIntegration,
    setSelectedIntegration,
    selectedTrigger,
    setSelectedTrigger,
    selectedAction,
    setSelectedAction,
    searchQuery,
    setSearchQuery,
    filterCategory,
    setFilterCategory,
    showConnectedOnly,
    setShowConnectedOnly,
    availableIntegrations,
    renderLogo,
    categories,
    isIntegrationConnected,
    filterIntegrations,
    getDisplayedTriggers,
    getDisplayedActions,
    loadingIntegrations,
    refreshIntegrations,
    comingSoonIntegrations,
    confirmDeleteNode,

    // Node operations
    handleNodeConfigure,
    handleNodeDelete,
    handleNodeRename,
    handleNodeEditingStateChange,
    handleNodeAddChain,
    handleTestNode,
    handleTestFlowFromHere,
    handleFreezeNode,
    handleStopNode,
    preflightResult,
    isPreflightDialogOpen,
    setIsPreflightDialogOpen,
    isRunningPreflight,
    openPreflightChecklist,

    // Undo/Redo
    handleUndo,
    handleRedo,
    canUndo,
    canRedo,

    // Navigation handlers
    handleSaveAndNavigate,
    handleNavigateWithoutSaving,
    handleNavigation,

    // Edge selection
    handleEdgeClick,

    // Collaborators
    collaborators,
  } = useWorkflowBuilder()

  const [isTemplateSettingsOpen, setIsTemplateSettingsOpen] = React.useState(false)
  const [isIntegrationsPanelOpen, setIsIntegrationsPanelOpen] = React.useState(false)
  const [isResultsExpanded, setIsResultsExpanded] = React.useState(false)
  const [activeConfigTab, setActiveConfigTab] = React.useState('setup')
  const [isReactAgentOpen, setIsReactAgentOpen] = React.useState(() => {
    // Don't access URL params in initial state - causes hydration issues
    // Initialize from localStorage only
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('reactAgentPanelOpen')
      return saved === 'true'
    }
    return false
  })

  // Track if integrations are ready (not loading and have data or confirmed empty)
  const [integrationsReady, setIntegrationsReady] = React.useState(false)

  // Fetch integrations when component mounts and track readiness
  React.useEffect(() => {
    logger.info('[NewWorkflowBuilderContent] Fetching integrations on mount')

    // Set not ready while fetching
    setIntegrationsReady(false)

    fetchIntegrations(false)
      .then(() => {
        logger.info('[NewWorkflowBuilderContent] Integrations fetch completed')
        // Small delay to ensure state is updated
        setTimeout(() => {
          setIntegrationsReady(true)
          logger.info('[NewWorkflowBuilderContent] Integrations marked as ready')
        }, 100)
      })
      .catch(error => {
        logger.error('[NewWorkflowBuilderContent] Failed to fetch integrations:', error)
        // Even on error, mark as ready so user can proceed (will just show all as disconnected)
        setIntegrationsReady(true)
      })
  }, [fetchIntegrations])

  // Handle URL param to open React Agent in useEffect (client-side only)
  React.useEffect(() => {
    if (aiChatParam === 'true' && !isReactAgentOpen) {
      logger.info('[NewWorkflowBuilderContent] Opening React Agent from URL param')
      setIsReactAgentOpen(true)
    }
  }, [aiChatParam, isReactAgentOpen])
  const [isContextMenuOpen, setIsContextMenuOpen] = React.useState(false)
  const [reactAgentInput, setReactAgentInput] = React.useState('')
  const [reactAgentMessages, setReactAgentMessages] = React.useState<Array<{ role: 'user' | 'assistant', content: string, timestamp: Date }>>([])
  const [isReactAgentLoading, setIsReactAgentLoading] = React.useState(false)
  const [reactAgentStatus, setReactAgentStatus] = React.useState<string>('')
  const [selectedContextNodes, setSelectedContextNodes] = React.useState<string[]>([])
  const [configurationProgress, setConfigurationProgress] = React.useState<{
    currentNode: number
    totalNodes: number
    nodeName: string
    status: 'preparing' | 'configuring' | 'testing' | 'complete' | 'error'
  } | null>(null)
  const [workflowPlan, setWorkflowPlan] = React.useState<Array<{ title: string, description: string, type: 'trigger' | 'action', providerId?: string }> | null>(null)
  const [showPlanApproval, setShowPlanApproval] = React.useState(false)
  const [approvedPlanData, setApprovedPlanData] = React.useState<any>(null)
  const [isPlanBuilding, setIsPlanBuilding] = React.useState(false) // Track if building started
  const [isPlacingNodes, setIsPlacingNodes] = React.useState(false) // Track when placing nodes on canvas
  const [workflowCompletionMessage, setWorkflowCompletionMessage] = React.useState<string | null>(null) // Completion message to show after plan

  // Clarification system states
  const [clarificationQuestions, setClarificationQuestions] = React.useState<any[]>([])
  const [clarificationAnswers, setClarificationAnswers] = React.useState<Record<string, any>>({})
  const [inferredData, setInferredData] = React.useState<Record<string, any>>({})
  const [showClarifications, setShowClarifications] = React.useState(false)
  const [waitingForClarifications, setWaitingForClarifications] = React.useState(false)

  // Enhanced node configuration tracking
  const [nodeConfigStatus, setNodeConfigStatus] = React.useState<{
    nodeId: string | null
    nodeName: string
    status: 'idle' | 'preparing' | 'configuring' | 'testing' | 'fixing' | 'retesting' | 'complete' | 'error'
    fields: Array<{ key: string, value: any, status: 'pending' | 'configuring' | 'complete' | 'error', displayValue?: string }>
    testResult: { success: boolean, message: string } | null
    fixAttempt?: number
  }>({
    nodeId: null,
    nodeName: '',
    status: 'idle',
    fields: [],
    testResult: null,
    fixAttempt: undefined
  })
  const [missingIntegrations, setMissingIntegrations] = React.useState<Array<{ provider: string, name: string }>>([])
  const [showMissingApps, setShowMissingApps] = React.useState(false)

  // Save ReactAgent panel state to localStorage whenever it changes
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('reactAgentPanelOpen', String(isReactAgentOpen))
    }
  }, [isReactAgentOpen])

  // Track if we've processed the initial prompt (using ref to avoid double-call in StrictMode)
  const hasProcessedInitialPromptRef = React.useRef(false)
  const [hasProcessedInitialPrompt, setHasProcessedInitialPrompt] = React.useState(false)

  // Add keyboard support for deleting nodes
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if Delete or Backspace key is pressed
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't delete if user is typing in an input field
        const target = e.target as HTMLElement
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
          return
        }

        // Find selected nodes
        const selectedNodes = nodes.filter(node => node.selected)
        if (selectedNodes.length > 0) {
          e.preventDefault()
          // Delete the first selected node (or you could loop through all if you want multi-delete)
          confirmDeleteNode(selectedNodes[0].id)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [nodes, confirmDeleteNode])

  const sourceTemplateId = React.useMemo(
    () => currentWorkflow?.source_template_id || editTemplateId || null,
    [currentWorkflow?.source_template_id, editTemplateId]
  )

  const [templateSetupData, setTemplateSetupData] = React.useState<TemplateSetupData | null>(null)
  const [showTemplateSetupDialog, setShowTemplateSetupDialog] = React.useState(false)

  const templateSetupDialogKey = React.useMemo(() => {
    const keySource = currentWorkflow?.id || editTemplateId
    return keySource ? `template-setup-dialog-${keySource}` : null
  }, [currentWorkflow?.id, editTemplateId])

  const handleAirtableSetupLoaded = React.useCallback(
    (data: TemplateSetupData) => {
      setTemplateSetupData(data)
      if (typeof window === "undefined") return
      if (!templateSetupDialogKey) return

      const dismissed = localStorage.getItem(templateSetupDialogKey)
      if (!dismissed && data.requirements?.length) {
        setShowTemplateSetupDialog(true)
      }
    },
    [templateSetupDialogKey]
  )

  const handleTemplateSetupDialogChange = React.useCallback(
    (open: boolean) => {
      setShowTemplateSetupDialog(open)
      if (!open && templateSetupDialogKey && typeof window !== "undefined") {
        localStorage.setItem(templateSetupDialogKey, "dismissed")
      }
    },
    [templateSetupDialogKey]
  )

  const activeConfigNode = React.useMemo(() => {
    if (!configuringNode) return null
    return nodes.find((node) => node.id === configuringNode.id) || null
  }, [configuringNode, nodes])

  // Debug: Log configuringNode changes
  React.useEffect(() => {
    console.log('🔍 [NewWorkflowBuilderContent] configuringNode changed:', {
      hasConfiguringNode: !!configuringNode,
      nodeId: configuringNode?.id,
      nodeComponentType: configuringNode?.nodeComponent?.type,
      willShowModal: !!configuringNode
    })
  }, [configuringNode])

  const handleOpenTemplateSettings = React.useCallback(() => {
    setIsTemplateSettingsOpen(true)
  }, [])

  const handleNodeSelectFromPanel = React.useCallback((node: any) => {
    // Create a pending node at the center of the viewport
    const position = {
      x: 400,
      y: 200,
    }

    setConfiguringNode({
      id: `temp-${Date.now()}`,
      nodeComponent: node,
      integration: null,
      config: {},
      position,
      sourceNodeId: undefined,
    })
  }, [setConfiguringNode])

  // AbortController for canceling stream
  const streamControllerRef = React.useRef<AbortController | null>(null)

  // ReactAgent submit handler with SSE streaming
  const handleReactAgentSubmit = React.useCallback(async (overrideMessage?: string) => {
    const messageToSend = overrideMessage || reactAgentInput.trim()
    if (!messageToSend || isReactAgentLoading) return

    // CRITICAL: Wait for integrations to be ready before proceeding
    if (!integrationsReady) {
      logger.warn('[NewWorkflowBuilderContent] Integrations not ready yet, please wait...')

      // Show a temporary message
      setReactAgentMessages(prev => [...prev, {
        role: 'assistant',
        content: '⏳ Loading your integrations... Please try again in a moment.',
        timestamp: new Date()
      }])

      return
    }

    const userMessage = messageToSend
    setReactAgentInput('')
    setIsReactAgentLoading(true)

    // Add user message to chat
    const newUserMessage = {
      role: 'user' as const,
      content: userMessage,
      timestamp: new Date()
    }
    setReactAgentMessages(prev => [...prev, newUserMessage])

    // Create abort controller for this stream
    streamControllerRef.current = new AbortController()

    try {
      // Get context nodes if any are selected
      const contextNodes = selectedContextNodes.map(nodeId => {
        const node = nodes.find(n => n.id === nodeId)
        if (!node) return null
        return {
          id: node.id,
          type: node.data?.type,
          title: node.data?.title,
          config: node.data?.config
        }
      }).filter(Boolean)

      // Get connected integrations
      const connectedIntegrations = getConnectedProviders()

      // COMPREHENSIVE DEBUG LOGGING
      console.log('=== INTEGRATION DEBUG ===')
      console.log('[DEBUG] Integrations ready:', integrationsReady)
      console.log('[DEBUG] Integrations loading:', integrationsLoading)
      console.log('[DEBUG] Total integrations in store:', integrations.length)
      console.log('[DEBUG] Raw integrations from store:', integrations.map(i => ({
        provider: i.provider,
        status: i.status
      })))
      console.log('[DEBUG] getConnectedProviders() result:', connectedIntegrations)
      console.log('[DEBUG] Will send to API:', connectedIntegrations)
      console.log('========================')

      logger.info('[NewWorkflowBuilderContent] Connected integrations:', connectedIntegrations)

      // Calculate available viewport dimensions (accounting for chat panel)
      const chatPanelWidth = isReactAgentOpen ? REACT_AGENT_PANEL_WIDTH : 0
      const availableWidth = window.innerWidth - chatPanelWidth
      const availableHeight = window.innerHeight
      const defaultZoom = 0.75 // From ReactFlow defaultViewport - increased for better visibility

      console.log('[VIEWPORT DEBUG] Sending to API:', {
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        chatPanelWidth,
        availableWidth,
        availableHeight,
        defaultZoom,
        reactFlowInstance: !!reactFlowInstance
      })

      // STEP 1: Analyze request for clarifications FIRST
      logger.info('[CLARIFICATION] Analyzing request for required clarifications...')
      setReactAgentStatus('Analyzing your request...')

      const analysisResponse = await fetch('/api/ai/analyze-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: userMessage,
          connectedIntegrations
        })
      })

      if (!analysisResponse.ok) {
        throw new Error('Failed to analyze request')
      }

      const analysisResult = await analysisResponse.json()
      logger.info('[CLARIFICATION] Analysis result:', analysisResult)

      // STEP 2: If clarifications needed, show questions and STOP
      if (analysisResult.needsClarification && analysisResult.questions.length > 0) {
        logger.info('[CLARIFICATION] Showing clarification questions:', analysisResult.questions)

        setClarificationQuestions(analysisResult.questions)
        setInferredData(analysisResult.inferredData || {}) // Store inferred data like message templates
        setShowClarifications(true)
        setWaitingForClarifications(true)
        setIsReactAgentLoading(false)
        setReactAgentStatus('')

        // Add message to chat
        setReactAgentMessages(prev => [...prev, {
          role: 'assistant',
          content: 'I need a bit more information to build this workflow for you. Please answer the questions below.',
          timestamp: new Date()
        }])

        return // STOP HERE - wait for user to answer
      }

      // STEP 3: No clarifications needed, proceed with building
      logger.info('[CLARIFICATION] No clarifications needed, proceeding with workflow build')

      // Start streaming from SSE endpoint
      const response = await fetch('/api/ai/stream-workflow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: userMessage,
          workflowId: currentWorkflow?.id,
          connectedIntegrations,
          conversationHistory: reactAgentMessages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          contextNodes,
          testNodes: true, // Enable testing
          model: 'auto', // Auto-select model
          autoApprove: false, // Show plan and wait for user approval
          viewport: {
            width: availableWidth,
            height: availableHeight,
            chatPanelWidth,
            defaultZoom: 0.75
          }
        }),
        signal: streamControllerRef.current.signal
      })

      if (!response.ok) {
        throw new Error('Failed to start workflow building')
      }

      // Read SSE stream
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      let buffer = ''
      let currentAIMessage = ''

      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        // Decode chunk
        buffer += decoder.decode(value, { stream: true })

        // Process complete events (SSE format: "data: {...}\n\n")
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || '' // Keep incomplete event in buffer

        for (const line of lines) {
          if (!line.trim() || !line.startsWith('data: ')) continue

          try {
            const eventData = JSON.parse(line.substring(6)) // Remove "data: " prefix

            // Handle different event types
            switch (eventData.type) {
              case 'thinking':
                setReactAgentStatus('Analyzing request...')
                // Don't add message - status badge shows this
                break

              case 'checking_prerequisites':
                setReactAgentStatus('Checking prerequisites...')
                // Don't add message - status badge shows this
                break

              case 'missing_apps':
                setReactAgentStatus('')
                setIsReactAgentLoading(false)
                // Store missing integrations for badge display
                setMissingIntegrations(eventData.missingApps.map((app: string) => ({
                  provider: app.toLowerCase().replace(/\s+/g, '-'),
                  name: app
                })))
                setShowMissingApps(true)
                // Remove the last message (no text needed, badges will show)
                setReactAgentMessages(prev => {
                  if (prev.length > 0 && prev[prev.length - 1].role === 'assistant') {
                    return prev.slice(0, -1)
                  }
                  return prev
                })
                break

              case 'check_setup':
                setReactAgentStatus('')
                const setupMessage = eventData.message + '\n\n' +
                  eventData.setupItems.map((item: any) =>
                    `• ${item.description} (${item.app})`
                  ).join('\n')
                currentAIMessage = `${currentAIMessage}\n\n${setupMessage}`
                setReactAgentMessages(prev => {
                  const lastMsg = prev[prev.length - 1]
                  if (lastMsg && lastMsg.role === 'assistant') {
                    return [...prev.slice(0, -1), { ...lastMsg, content: currentAIMessage }]
                  }
                  return prev
                })
                break

              case 'planning':
                setReactAgentStatus('Planning workflow...')
                // Don't add message - status badge shows this
                break

              case 'building':
                setReactAgentStatus('Building workflow...')
                // Don't add message - status badge shows this
                break

              case 'show_plan':
                setReactAgentStatus('')
                console.log('[DEBUG show_plan] eventData:', eventData)
                console.log('[DEBUG show_plan] eventData.nodes:', eventData.nodes)
                const mappedNodes = eventData.nodes.map((n: any) => {
                  console.log('[DEBUG] Mapping node:', n.title, 'providerId:', n.providerId)
                  return {
                    title: n.title,
                    description: n.description,
                    type: n.isTrigger ? 'trigger' : 'action',
                    providerId: n.providerId
                  }
                })
                console.log('[DEBUG show_plan] mappedNodes:', mappedNodes)
                setWorkflowPlan(mappedNodes)
                setApprovedPlanData(eventData.plan) // Save full plan for building
                setShowPlanApproval(true)
                setIsPlanBuilding(false) // Reset building state for new plan
                setIsReactAgentLoading(false) // Stop loading - waiting for user
                // Don't add message - WorkflowPlan component has its own header
                break

              case 'node_creating': {
                const creatingNodeName = eventData.nodeName || 'node'
                console.log('[FRONTEND] node_creating event:', eventData)

                setNodeConfigStatus({
                  nodeId: eventData.nodeId,
                  nodeName: creatingNodeName,
                  status: 'preparing',
                  fields: [],
                  testResult: null
                })

                if (eventData.nodeId) {
                  console.log('[FRONTEND] Updating node to preparing:', eventData.nodeId)
                  optimizedOnNodesChange([
                    {
                      type: 'update',
                      id: eventData.nodeId,
                      item: (node: any) => ({
                        ...node,
                        data: {
                          ...node.data,
                          aiStatus: 'preparing',
                          aiBadgeText: 'Configuring',
                          aiBadgeVariant: 'info',
                          autoExpand: true,
                          aiFallbackFields: [],
                          testData: {},
                          aiProgressConfig: [],
                          config: node.data?.config ?? {},
                          executionStatus: eventData.executionStatus || 'pending'
                        }
                      })
                    }
                  ])
                }

                setReactAgentStatus(`Creating ${creatingNodeName}...`)

                if (eventData.message) {
                  setReactAgentMessages(prev => [...prev, {
                    role: 'assistant',
                    content: eventData.message,
                    timestamp: new Date()
                  }])
                }
                setIsReactAgentLoading(false)
                setShowPlanApproval(false)
                setIsPlanBuilding(true)
                break
              }

              case 'node_configuring':
                console.log('[FRONTEND] node_configuring event:', eventData)

                if (eventData.nodeId) {
                  setNodeConfigStatus(prev => ({
                    ...prev,
                    nodeId: eventData.nodeId,
                    status: 'configuring'
                  }))
                }

                if (eventData.message) {
                  setReactAgentMessages(prev => [...prev, {
                    role: 'assistant',
                    content: eventData.message,
                    timestamp: new Date()
                  }])
                }
                setConfigurationProgress(prev => {
                  if (!prev) return prev
                  return {
                    ...prev,
                    currentNode: eventData.nodeIndex !== undefined ? eventData.nodeIndex + 1 : prev.currentNode,
                    nodeName: eventData.nodeName || prev.nodeName,
                    status: 'configuring'
                  }
                })
                setReactAgentStatus(eventData.message || `Configuring ${eventData.nodeName || ''}...`)
                if (eventData.nodeId) {
                  console.log('[FRONTEND] Updating node to configuring:', eventData.nodeId)
                  optimizedOnNodesChange([
                    {
                      type: 'update',
                      id: eventData.nodeId,
                      item: (node: any) => ({
                        ...node,
                        data: {
                          ...node.data,
                          aiStatus: 'configuring',  // Fixed: force configuring status
                          aiBadgeText: 'Configuring',
                          aiBadgeVariant: 'info',
                          autoExpand: true,
                          testData: {},
                          aiProgressConfig: [],
                          executionStatus: eventData.executionStatus || 'running'
                        }
                      })
                    }
                  ])
                }
                break

              case 'node_testing':
                // Update node config status to testing
                setNodeConfigStatus(prev => ({
                  ...prev,
                  status: 'testing',
                  testResult: null
                }))

                // Add as NEW message
                if (eventData.message) {
                  setReactAgentMessages(prev => [...prev, {
                    role: 'assistant',
                    content: eventData.message,
                    timestamp: new Date()
                  }])
                }
                setConfigurationProgress(prev => {
                  if (!prev) return prev
                  return {
                    ...prev,
                    currentNode: eventData.nodeIndex !== undefined ? eventData.nodeIndex + 1 : prev.currentNode,
                    nodeName: eventData.nodeName || prev.nodeName,
                    status: 'testing'
                  }
                })
                if (eventData.nodeId) {
                  optimizedOnNodesChange([
                    {
                      type: 'update',
                      id: eventData.nodeId,
                      item: (node: any) => ({
                        ...node,
                        data: {
                          ...node.data,
                          aiStatus: 'testing',
                          aiBadgeText: 'Testing',
                          aiBadgeVariant: 'info',
                          autoExpand: true,
                          testData: {},
                          aiProgressConfig: node.data?.aiProgressConfig || [],
                          executionStatus: eventData.executionStatus || 'running'
                        }
                      })
                    }
                  ])
                }
                break

              case 'node_created':
                // Add node to canvas in real-time
                console.log('[NODE] Received node_created event:', eventData)
                if (eventData.node) {
                  console.log('[NODE CREATED] Adding node:', {
                    id: eventData.node.id,
                    position: eventData.node.position,
                    title: eventData.node.data?.title
                  })

                  optimizedOnNodesChange([
                    {
                      type: 'add',
                      item: eventData.node
                    }
                  ])

                  setTimeout(() => {
                    fitViewWithChatPanel()
                  }, 120)

                  // Log current viewport state after adding node
                  if (reactFlowInstance) {
                    const currentViewport = reactFlowInstance.getViewport()
                    const allNodes = reactFlowInstance.getNodes()
                    console.log('[NODE CREATED] Current state after add:', {
                      viewport: currentViewport,
                      totalNodes: allNodes.length,
                      windowWidth: window.innerWidth,
                      chatPanelWidth: isReactAgentOpen ? REACT_AGENT_PANEL_WIDTH : 0,
                      availableWidth: window.innerWidth - (isReactAgentOpen ? REACT_AGENT_PANEL_WIDTH : 0)
                    })
                  }

                  console.log('[NODE] Node added, current edges count:', edges.length)
                }
                break

              case 'field_configured':
                console.log('[FRONTEND] field_configured event:', eventData)

                // Update node config status with field being configured
                if (eventData.fieldKey) {
                  setNodeConfigStatus(prev => {
                    const existingFieldIndex = prev.fields.findIndex(f => f.key === eventData.fieldKey)
                    const updatedFields = [...prev.fields]

                    if (existingFieldIndex >= 0) {
                      // Update existing field to complete
                      updatedFields[existingFieldIndex] = {
                        ...updatedFields[existingFieldIndex],
                        value: eventData.fieldValue,
                        status: 'complete'
                      }
                    } else {
                      // Add new field as complete
                      updatedFields.push({
                        key: eventData.fieldKey,
                        value: eventData.fieldValue,
                        status: 'complete',
                        displayValue: eventData.displayValue
                      })
                    }

                    return {
                      ...prev,
                      fields: updatedFields
                    }
                  })
                }

                // Update node with this specific field in real-time
                if (eventData.nodeId) {
                  console.log('[FRONTEND] Adding field to node config:', eventData.fieldKey, '=', eventData.fieldValue)
                  optimizedOnNodesChange([
                    {
                      type: 'update',
                      id: eventData.nodeId,
                      item: (node: any) => ({
                        ...node,
                        data: {
                          ...node.data,
                          autoExpand: true,
                          aiStatus: eventData.status || node.data.aiStatus || 'configuring',
                          aiBadgeText: eventData.badgeText || node.data.aiBadgeText || 'Configuring',
                          aiBadgeVariant: eventData.badgeVariant || node.data.aiBadgeVariant || 'info',
                          aiFallbackFields: eventData.viaFallback
                            ? Array.from(new Set([...(node.data.aiFallbackFields || []), eventData.fieldKey]))
                            : node.data.aiFallbackFields,
                          aiProgressConfig: [
                            ...(Array.isArray(node.data.aiProgressConfig) ? node.data.aiProgressConfig.filter((field: any) => field.key !== eventData.fieldKey) : []),
                            {
                              key: eventData.fieldKey,
                              value: eventData.fieldValue,
                              displayValue: eventData.displayValue,
                              viaFallback: eventData.viaFallback
                            }
                          ],
                          config: {
                            ...node.data.config,
                            [eventData.fieldKey]: eventData.fieldValue
                          }
                        }
                      })
                    }
                  ])
                }
                break

              case 'test_data_field':
                // Show test data populating in the node
                if (eventData.nodeId) {
                  // Store test data in a separate field so it's visible but doesn't overwrite config
                  optimizedOnNodesChange([
                    {
                      type: 'update',
                      id: eventData.nodeId,
                      item: (node: any) => ({
                        ...node,
                        data: {
                          ...node.data,
                          autoExpand: true,
                          aiStatus: eventData.status || node.data.aiStatus,
                          aiBadgeText: eventData.badgeText || node.data.aiBadgeText,
                          aiBadgeVariant: eventData.badgeVariant || node.data.aiBadgeVariant,
                          aiProgressConfig: node.data?.aiProgressConfig || [],
                          testData: {
                            ...(node.data.testData || {}),
                            [eventData.fieldKey]: eventData.fieldValue
                          },
                          executionStatus: eventData.executionStatus || node.data.executionStatus
                        }
                      })
                    }
                  ])
                }
                break

              case 'edge_created':
                // Add edge to canvas
                console.log('[EDGE] Received edge_created event:', eventData)
                if (eventData.edge) {
                  console.log('[EDGE] Adding edge:', eventData.edge)
                  onEdgesChange([
                    {
                      type: 'add',
                      item: eventData.edge
                    }
                  ])
                  console.log('[EDGE] Edge added via onEdgesChange')
                } else {
                  console.log('[EDGE] No edge data in event!')
                }
                break

              case 'node_configured': {
                if (eventData.message) {
                  setReactAgentMessages(prev => [...prev, {
                    role: 'assistant',
                    content: eventData.message,
                    timestamp: new Date()
                  }])
                }
                if (eventData.nodeId) {
                  optimizedOnNodesChange([
                    {
                      type: 'update',
                      id: eventData.nodeId,
                      item: (node: any) => {
                        const alreadyReady = node.data?.aiStatus === 'ready'
                        const nextStatus = alreadyReady ? node.data.aiStatus : (eventData.status || 'configured')
                        const nextBadgeText = alreadyReady ? node.data.aiBadgeText : (eventData.badgeText || 'Configuring')
                        const nextBadgeVariant = alreadyReady ? node.data.aiBadgeVariant : (eventData.badgeVariant || 'info')
                        const nextExecutionStatus = alreadyReady ? node.data.executionStatus : (eventData.executionStatus || 'running')
                        const nextProgress = alreadyReady ? node.data.aiProgressConfig : []
                        const nextNeedsSetup = alreadyReady ? node.data.needsSetup : (eventData.badgeVariant === 'warning')

                        return {
                          ...node,
                          data: {
                            ...node.data,
                            description: eventData.description || node.data.description,
                            aiStatus: nextStatus,
                            aiBadgeText: nextBadgeText,
                            aiBadgeVariant: nextBadgeVariant,
                            autoExpand: true,
                            needsSetup: nextNeedsSetup,
                            aiFallbackFields: eventData.fallbackFields || node.data.aiFallbackFields,
                            aiProgressConfig: nextProgress,
                            config: eventData.config || node.data.config,
                            executionStatus: nextExecutionStatus
                          }
                        }
                      }
                    }
                  ])
                }
                break
              }

              case 'node_tested': {
                if (eventData.message) {
                  setReactAgentMessages(prev => [...prev, {
                    role: 'assistant',
                    content: eventData.message,
                    timestamp: new Date()
                  }])
                }
                setConfigurationProgress(prev => {
                  if (!prev) return prev
                  return {
                    ...prev,
                    currentNode: eventData.nodeIndex !== undefined ? eventData.nodeIndex + 1 : prev.currentNode,
                    nodeName: eventData.nodeName || prev.nodeName,
                    status: 'complete'
                  }
                })
                if (eventData.nodeId) {
                  const isTrigger = Boolean(eventData.skipTest)
                  const nextStatus = isTrigger ? (eventData.status || 'ready') : 'testing_successful'
                  const nextBadgeText = isTrigger ? (eventData.badgeText || 'Successful') : 'Testing is Successful'
                  const nextBadgeVariant = isTrigger ? (eventData.badgeVariant || 'success') : 'success'
                  const nextExecutionStatus = eventData.executionStatus || 'completed'

                  optimizedOnNodesChange([
                    {
                      type: 'update',
                      id: eventData.nodeId,
                      item: (node: any) => ({
                        ...node,
                        data: {
                          ...node.data,
                          aiStatus: nextStatus,
                          aiBadgeText: nextBadgeText,
                          aiBadgeVariant: nextBadgeVariant,
                          aiTestSummary: eventData.summary || node.data.aiTestSummary,
                          needsSetup: nextBadgeVariant === 'warning',
                          aiFallbackFields: node.data.aiFallbackFields,
                          autoExpand: true,
                          aiProgressConfig: [],
                          testData: eventData.preview || node.data.testData,
                          executionStatus: nextExecutionStatus
                        }
                      })
                    }
                  ])
                }
                break
              }

              case 'node_test_failed': {
                // Update status to show error state temporarily
                setNodeConfigStatus(prev => ({
                  ...prev,
                  status: 'error',
                  testResult: {
                    success: false,
                    message: eventData.error || 'Test failed'
                  }
                }))

                setConfigurationProgress(prev => {
                  if (!prev) return prev
                  return {
                    ...prev,
                    currentNode: eventData.nodeIndex !== undefined ? eventData.nodeIndex + 1 : prev.currentNode,
                    nodeName: eventData.nodeName || prev.nodeName,
                    status: 'error'
                  }
                })

                if (eventData.message) {
                  setReactAgentMessages(prev => [...prev, {
                    role: 'assistant',
                    content: eventData.message,
                    timestamp: new Date()
                  }])
                }
                if (eventData.nodeId) {
                  optimizedOnNodesChange([
                    {
                      type: 'update',
                      id: eventData.nodeId,
                      item: (node: any) => ({
                        ...node,
                        data: {
                          ...node.data,
                          aiStatus: eventData.status || 'error',
                          aiBadgeText: eventData.badgeText || 'Needs Attention',
                          aiBadgeVariant: eventData.badgeVariant || 'warning',
                          aiTestSummary: eventData.summary || eventData.error || node.data.aiTestSummary,
                          needsSetup: true,
                          aiFallbackFields: node.data.aiFallbackFields,
                          autoExpand: true,
                          executionStatus: eventData.executionStatus || 'error'
                        }
                      })
                    }
                  ])
                }
                break
              }

              case 'node_fixing': {
                // Update status to show fixing
                setNodeConfigStatus(prev => ({
                  ...prev,
                  status: 'fixing',
                  fixAttempt: eventData.attempt,
                  testResult: null
                }))

                if (eventData.message) {
                  setReactAgentMessages(prev => [...prev, {
                    role: 'assistant',
                    content: eventData.message,
                    timestamp: new Date()
                  }])
                }

                setConfigurationProgress(prev => {
                  if (!prev) return prev
                  return {
                    ...prev,
                    status: 'configuring'
                  }
                })
                break
              }

              case 'field_fixed': {
                // Update the specific field that was fixed
                if (eventData.fieldKey) {
                  setNodeConfigStatus(prev => {
                    const updatedFields = prev.fields.map(f =>
                      f.key === eventData.fieldKey
                        ? { ...f, value: eventData.newValue, status: 'complete' as const }
                        : f
                    )
                    return {
                      ...prev,
                      fields: updatedFields
                    }
                  })
                }

                if (eventData.message) {
                  setReactAgentMessages(prev => [...prev, {
                    role: 'assistant',
                    content: eventData.message,
                    timestamp: new Date()
                  }])
                }
                break
              }

              case 'node_retesting': {
                // Update status to show retesting
                setNodeConfigStatus(prev => ({
                  ...prev,
                  status: 'retesting',
                  testResult: null
                }))

                if (eventData.message) {
                  setReactAgentMessages(prev => [...prev, {
                    role: 'assistant',
                    content: eventData.message,
                    timestamp: new Date()
                  }])
                }

                setConfigurationProgress(prev => {
                  if (!prev) return prev
                  return {
                    ...prev,
                    status: 'testing'
                  }
                })
                break
              }

              case 'node_complete':
                console.log('[FRONTEND] node_complete event received:', eventData)
                // Update node config status to complete
                setNodeConfigStatus(prev => ({
                  ...prev,
                  status: 'complete',
                  testResult: eventData.testResult || { success: true, message: 'Configuration successful' }
                }))

                // Update node's aiStatus to ready/complete
                if (eventData.nodeId) {
                  optimizedOnNodesChange([
                    {
                      type: 'update',
                      id: eventData.nodeId,
                      item: (node: any) => ({
                        ...node,
                        data: {
                          ...node.data,
                          aiStatus: eventData.status || 'ready',
                          aiBadgeText: eventData.badgeText || 'Successful',
                          aiBadgeVariant: eventData.badgeVariant || 'success',
                          autoExpand: true,
                          executionStatus: eventData.executionStatus || 'completed'
                        }
                      })
                    }
                  ])
                }

                // After a short delay, reset for the next node
                setTimeout(() => {
                  setNodeConfigStatus({
                    nodeId: null,
                    nodeName: '',
                    status: 'idle',
                    fields: [],
                    testResult: null
                  })
                }, 2000)

                if (eventData.message) {
                  setReactAgentMessages(prev => [...prev, {
                    role: 'assistant',
                    content: eventData.message,
                    timestamp: new Date()
                  }])
                }
                break

              case 'workflow_complete':
                // Add completion message
                const completionMessage = "✅ Everything is set up! Your workflow is ready to use. You can test it, make changes, or activate it from the workflow settings."
                setReactAgentMessages(prev => [...prev, {
                  role: 'assistant',
                  content: completionMessage,
                  timestamp: new Date()
                }])

                // Final fitView to ensure everything is visible (nodes are already positioned correctly)
                setTimeout(() => {
                  fitViewWithChatPanel()
                }, 200)

                // Clear status on completion
                setReactAgentStatus('')
                setIsReactAgentLoading(false)
                // Hide plan approval after completion
                setShowPlanApproval(false)
                setIsPlanBuilding(false)
                break

              case 'error':
                // Show error as new message
                setReactAgentMessages(prev => [...prev, {
                  role: 'assistant',
                  content: `❌ Error: ${eventData.message}`,
                  timestamp: new Date()
                }])
                // Clear status on error
                setReactAgentStatus('')
                setIsReactAgentLoading(false)
                break
            }

          } catch (parseError) {
            logger.error('Failed to parse SSE event:', parseError)
          }
        }
      }

    } catch (error: any) {
      // Check if it was user-initiated abort
      if (error.name === 'AbortError') {
        logger.info('Workflow building paused by user')
        setReactAgentMessages(prev => [...prev, {
          role: 'assistant' as const,
          content: '⏸️ Building paused. Let me know when you want to continue!',
          timestamp: new Date()
        }])
      } else {
        logger.error('ReactAgent streaming error:', error)
        setReactAgentMessages(prev => [...prev, {
          role: 'assistant' as const,
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date()
        }])
      }
    } finally {
      setIsReactAgentLoading(false)
      setReactAgentStatus('')
      streamControllerRef.current = null
    }
  }, [reactAgentInput, isReactAgentLoading, reactAgentMessages, selectedContextNodes, nodes, currentWorkflow, optimizedOnNodesChange, onEdgesChange, integrationsReady, integrationsLoading, integrations, getConnectedProviders])

  // Pause building handler
  const handlePauseBuilding = React.useCallback(() => {
    if (streamControllerRef.current) {
      streamControllerRef.current.abort()
    }
  }, [])

  // Auto-send initial prompt from URL parameter
  React.useEffect(() => {
    // CRITICAL: Also wait for integrations to be ready
    if (!initialPromptParam || hasProcessedInitialPromptRef.current || hasProcessedInitialPrompt || isReactAgentLoading || !isReactAgentOpen || !integrationsReady) {
      logger.info('[NewWorkflowBuilderContent] Skipping initial prompt', {
        hasParam: !!initialPromptParam,
        hasProcessedRef: hasProcessedInitialPromptRef.current,
        hasProcessed: hasProcessedInitialPrompt,
        isLoading: isReactAgentLoading,
        isPanelOpen: isReactAgentOpen,
        integrationsReady
      })
      return
    }

    logger.info('[NewWorkflowBuilderContent] Processing initial prompt:', initialPromptParam)
    hasProcessedInitialPromptRef.current = true
    setHasProcessedInitialPrompt(true)

    // Decode the prompt
    const decodedPrompt = decodeURIComponent(initialPromptParam)

    // Set the input so it shows in the UI, then send
    setReactAgentInput(decodedPrompt)

    // Auto-send after a delay - we need to wait for the state to update
    setTimeout(() => {
      logger.info('[NewWorkflowBuilderContent] Auto-sending initial prompt')
      logger.info('[NewWorkflowBuilderContent] Current reactAgentInput:', reactAgentInput)

      // Since state updates are async, we need to manually trigger with the decoded prompt
      // Call handleReactAgentSubmit to ensure clarification flow is used
      if (isReactAgentLoading) {
        logger.warn('[NewWorkflowBuilderContent] Already loading, skipping')
        return
      }

      // Call handleReactAgentSubmit with the decoded prompt
      // This ensures the clarification flow is triggered
      logger.info('[NewWorkflowBuilderContent] Calling handleReactAgentSubmit with prompt:', decodedPrompt)
      handleReactAgentSubmit(decodedPrompt)
    }, 500)
  }, [initialPromptParam, hasProcessedInitialPrompt, isReactAgentLoading, isReactAgentOpen, currentWorkflow, optimizedOnNodesChange, onEdgesChange, reactAgentInput, integrationsReady, integrations, getConnectedProviders])

  const [reactFlowInstance, setReactFlowInstance] = React.useState<any>(null)

  // Debug: Log when reactFlowInstance is set
  React.useEffect(() => {
    if (reactFlowInstance) {
      console.log('[REACTFLOW] ReactFlow instance initialized:', reactFlowInstance)
    }
  }, [reactFlowInstance])

  const fitViewWithChatPanel = React.useCallback(() => {
    if (!reactFlowInstance) {
      return
    }

    const nodesInFlow = reactFlowInstance.getNodes()
    if (!nodesInFlow.length) {
      return
    }

    const bounds = reactFlowInstance.getNodesBounds(nodesInFlow)
    if (!bounds) {
      return
    }

    const panelWidth = isReactAgentOpen ? REACT_AGENT_PANEL_WIDTH : 0
    const horizontalMargin = REACT_AGENT_VIEWPORT_MARGIN
    const verticalMargin = REACT_AGENT_VERTICAL_MARGIN

    const visibleWidth = Math.max(window.innerWidth - panelWidth, 200)
    const visibleHeight = Math.max(window.innerHeight, 200)

    const availableWidth = Math.max(visibleWidth - horizontalMargin * 2, 200)
    const availableHeight = Math.max(visibleHeight - verticalMargin * 2, 200)

    const widthWithPadding = Math.max(bounds.width, 1) + horizontalMargin * 2
    const heightWithPadding = Math.max(bounds.height, 1) + verticalMargin * 2

    const zoomForWidth = availableWidth / widthWithPadding
    const zoomForHeight = availableHeight / heightWithPadding
    const computedZoom = Math.min(zoomForWidth, zoomForHeight, MAX_VIEWPORT_ZOOM)
    const zoom = Math.max(MIN_VIEWPORT_ZOOM, computedZoom)

    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2

    const screenCenterX = panelWidth + horizontalMargin + availableWidth / 2
    const screenCenterY = verticalMargin + availableHeight / 2

    const nextX = screenCenterX - centerX * zoom
    const nextY = screenCenterY - centerY * zoom

    reactFlowInstance.setViewport({
      x: nextX,
      y: nextY,
      zoom,
    })
  }, [isReactAgentOpen, reactFlowInstance])

  React.useEffect(() => {
    fitViewWithChatPanel()
  }, [fitViewWithChatPanel, isReactAgentOpen, nodes.length])

  const onDragOver = React.useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = React.useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      if (!reactFlowInstance) return

      const data = event.dataTransfer.getData('application/reactflow')
      if (!data) return

      const { nodeData } = JSON.parse(data)
      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })

      // Create a new node directly on the canvas without opening config
      const newNode = {
        id: `node-${Date.now()}`,
        type: 'custom',
        position,
        data: {
          title: nodeData.title,
          type: nodeData.type,
          providerId: nodeData.providerId,
          isTrigger: nodeData.isTrigger,
          config: {},
          needsSetup: true, // Mark as needing setup
          // Add all the necessary callbacks
          onConfigure: handleNodeConfigure,
          onDelete: handleNodeDelete,
          onRename: handleNodeRename,
          onEditingStateChange: handleNodeEditingStateChange,
          onAddChain: nodeData.type === 'ai_agent' ? handleNodeAddChain : undefined,
          onTestNode: handleTestNode,
          onTestFlowFromHere: handleTestFlowFromHere,
          onFreeze: handleFreezeNode,
          onStop: handleStopNode,
        },
      }

      // Add the node to the canvas
      const newNodes = [...nodes, newNode]
      onNodesChange([
        { type: 'add', item: newNode }
      ])

      setHasUnsavedChanges(true)
    },
    [reactFlowInstance, nodes, onNodesChange, setHasUnsavedChanges]
  )


  if (isLoading) {
    return <WorkflowLoadingScreen />
  }

  // Prepare header props
  const headerProps = {
    workflowName,
    setWorkflowName,
    hasUnsavedChanges,
    isSaving,
    isExecuting,
    handleSave,
    handleToggleLive,
    isUpdatingStatus,
    currentWorkflow,
    workflowId: currentWorkflow?.id,
    editTemplateId,
    isTemplateEditing,
    onOpenTemplateSettings: isTemplateEditing ? handleOpenTemplateSettings : undefined,
    templateSettingsLabel,
    handleTestSandbox,
    handleExecuteLive,
    handleExecuteLiveSequential,
    handleRunPreflight: openPreflightChecklist,
    isRunningPreflight,
    isStepMode,
    listeningMode,
    handleUndo,
    handleRedo,
    canUndo,
    canRedo,
    setShowExecutionHistory,
  }

  return (
    <BuilderLayout headerProps={headerProps} workflowId={currentWorkflow?.id || null}>
      {/* ReactFlow Canvas */}
      <div
        style={{ height: "100%", width: "100%", position: "relative" }}
        onDragOver={onDragOver}
        onDrop={onDrop}
      >
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={optimizedOnNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onEdgeClick={handleEdgeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodeDragStop={() => setHasUnsavedChanges(true)}
            onInit={setReactFlowInstance}
            fitView={nodes.length > 0}
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
            <Background variant={BackgroundVariant.Dots} gap={16} size={1.5} color="hsl(var(--muted-foreground))" style={{ opacity: 0.5 }} />
            <Controls
              style={{
                position: 'absolute',
                bottom: '60px',
                left: isReactAgentOpen ? `${REACT_AGENT_PANEL_WIDTH + 10}px` : '4px',
                top: 'auto',
                transition: 'left 300ms ease-in-out'
              }}
              fitViewOptions={{
                padding: 0.2,
                includeHiddenNodes: false,
                minZoom: 0.5,
                maxZoom: 2,
              }}
            />
            <CollaboratorCursors collaborators={collaborators || []} />

            {/* Add Node Button */}
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

            {/* Airtable Setup Panel */}
            {sourceTemplateId && (
              <Panel
                position="top-right"
                style={{ marginTop: '20px', marginRight: '10px' }}
                className="pointer-events-auto"
              >
                <div className="max-h-[70vh] w-[680px] min-w-[640px] overflow-y-auto overflow-x-hidden pr-6">
                  <AirtableSetupPanel
                    templateId={sourceTemplateId}
                    workflowId={currentWorkflow?.id}
                    onSetupLoaded={handleAirtableSetupLoaded}
                  />
                </div>
              </Panel>
            )}
          </ReactFlow>

        {/* Integrations Side Panel - Hide when configuring a node */}
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

        {/* Configuration Side Panel - Show when configuring a node */}
        <div
          className={`absolute top-0 right-0 h-full transition-all duration-300 ease-in-out ${
            activeConfigTab === 'results' ? 'w-[900px]' : 'w-[600px]'
          } ${
            configuringNode
              ? 'translate-x-0 opacity-100'
              : 'translate-x-full opacity-0'
          }`}
        >
          {configuringNode && (
            <div className="h-full w-full bg-background border-l border-border shadow-lg z-50 flex flex-col overflow-hidden">
              {/* Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleConfigurationClose}
                  className="h-8 w-8 hover:bg-accent"
                >
                  <ArrowRight className="w-4 h-4" />
                </Button>
                <input
                  type="text"
                  defaultValue={configuringNode.nodeComponent?.title || 'Configure Node'}
                  className="flex-1 text-base font-semibold bg-transparent hover:bg-accent/50 focus:bg-accent outline-none border-none ring-0 px-2 h-8 transition-colors"
                  style={{ boxShadow: 'none' }}
                  maxLength={50}
                  onBlur={(e) => {
                    // TODO: Update node title
                    console.log('Update node title to:', e.target.value)
                  }}
                />
              </div>

              {/* Tabs */}
              <Tabs defaultValue="setup" value={activeConfigTab} onValueChange={setActiveConfigTab} className="flex-1 flex flex-col overflow-hidden">
                <div className="border-b px-4">
                  <TabsList className="w-full justify-between h-10 bg-transparent p-0">
                    <TabsTrigger
                      value="setup"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent hover:bg-accent/50 transition-colors"
                    >
                      Setup
                    </TabsTrigger>
                    <TabsTrigger
                      value="output"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent hover:bg-accent/50 transition-colors"
                    >
                      Output fields
                    </TabsTrigger>
                    <TabsTrigger
                      value="advanced"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent hover:bg-accent/50 transition-colors"
                    >
                      Advanced
                    </TabsTrigger>
                    <TabsTrigger
                      value="results"
                      className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent hover:bg-accent/50 transition-colors"
                    >
                      Results
                    </TabsTrigger>
                  </TabsList>
                </div>

              {/* Setup Tab */}
              <TabsContent value="setup" className="flex-1 overflow-hidden m-0">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {configuringNode.nodeComponent?.description || 'Configure this node'}
                    </p>

                    {/* Regular parameters section */}
                    <div className="space-y-4">
                      <h3 className="text-sm font-medium text-muted-foreground">Regular parameters</h3>

                      {/* Model Field */}
                      <div className="space-y-2">
                        <Label htmlFor="model">Model</Label>
                        <Select defaultValue="gpt-4o-mini">
                          <SelectTrigger id="model" className="hover:border-primary/50 transition-colors">
                            <SelectValue placeholder="Select model" />
                          </SelectTrigger>
                          <SelectContent>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">OpenAI</div>
                            <SelectItem value="gpt-4o" className="hover:bg-accent cursor-pointer">GPT-4o</SelectItem>
                            <SelectItem value="gpt-4o-mini" className="hover:bg-accent cursor-pointer">GPT-4o Mini</SelectItem>
                            <SelectItem value="gpt-4-turbo" className="hover:bg-accent cursor-pointer">GPT-4 Turbo</SelectItem>
                            <SelectItem value="gpt-4" className="hover:bg-accent cursor-pointer">GPT-4</SelectItem>
                            <SelectItem value="gpt-3.5-turbo" className="hover:bg-accent cursor-pointer">GPT-3.5 Turbo</SelectItem>
                            <SelectItem value="gpt-3.5-turbo-16k" className="hover:bg-accent cursor-pointer">GPT-3.5 Turbo 16K</SelectItem>
                            <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground border-t mt-1">Google Gemini</div>
                            <SelectItem value="gemini-1.5-pro" className="hover:bg-accent cursor-pointer">Gemini 1.5 Pro</SelectItem>
                            <SelectItem value="gemini-1.5-flash" className="hover:bg-accent cursor-pointer">Gemini 1.5 Flash</SelectItem>
                            <SelectItem value="gemini-pro" className="hover:bg-accent cursor-pointer">Gemini Pro</SelectItem>
                            <SelectItem value="gemini-pro-vision" className="hover:bg-accent cursor-pointer">Gemini Pro Vision</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Instruction Field */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="instruction" className="flex items-center gap-1">
                            Instruction
                            <span className="text-red-500">*</span>
                          </Label>
                          <span className="text-xs text-red-500 font-medium">Required</span>
                        </div>
                        <Textarea
                          id="instruction"
                          placeholder="Enter text value"
                          className="min-h-[100px] resize-none hover:border-primary/50 transition-colors"
                        />
                      </div>

                      {/* Search the internet Field */}
                      <div className="space-y-2">
                        <Label htmlFor="search">Search The Internet</Label>
                        <Select>
                          <SelectTrigger id="search" className="hover:border-primary/50 transition-colors">
                            <SelectValue placeholder="Select an option..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="yes" className="hover:bg-accent cursor-pointer">Yes</SelectItem>
                            <SelectItem value="no" className="hover:bg-accent cursor-pointer">No</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* Connected nodes info */}
                    <div className="p-4 border rounded-lg bg-muted/50 text-center">
                      <p className="text-sm text-muted-foreground">
                        No connected nodes found. Connect nodes to include their outputs in Agent context.
                      </p>
                    </div>

                    {/* Tools configured */}
                    <div className="p-4 border rounded-lg bg-muted/50 text-center">
                      <p className="text-sm text-muted-foreground italic">
                        No tools configured
                      </p>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Output fields Tab */}
              <TabsContent value="output" className="flex-1 overflow-hidden m-0">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-4">
                    <div>
                      <h3 className="text-sm font-semibold mb-1">Configure Output Fields</h3>
                      <p className="text-xs text-muted-foreground">
                        Please define the output fields you need for this node:
                      </p>
                    </div>

                    {/* Output fields table */}
                    <div className="space-y-3">
                      {/* Field row */}
                      <div className="border rounded-lg p-3 hover:border-primary/50 transition-colors">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 space-y-2">
                            <Input
                              defaultValue="Model answer"
                              className="h-9 font-medium hover:border-primary/50 transition-colors"
                            />
                            <div className="grid grid-cols-2 gap-2">
                              <Select defaultValue="string">
                                <SelectTrigger className="h-9 hover:border-primary/50 transition-colors">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="string" className="hover:bg-accent cursor-pointer">string</SelectItem>
                                  <SelectItem value="number" className="hover:bg-accent cursor-pointer">number</SelectItem>
                                  <SelectItem value="boolean" className="hover:bg-accent cursor-pointer">boolean</SelectItem>
                                  <SelectItem value="array" className="hover:bg-accent cursor-pointer">array</SelectItem>
                                  <SelectItem value="object" className="hover:bg-accent cursor-pointer">object</SelectItem>
                                </SelectContent>
                              </Select>
                              <Select defaultValue="single">
                                <SelectTrigger className="h-9 hover:border-primary/50 transition-colors">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="single" className="hover:bg-accent cursor-pointer">single value</SelectItem>
                                  <SelectItem value="multi" className="hover:bg-accent cursor-pointer">multi-value</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10 flex-shrink-0"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Add buttons */}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add new field
                      </Button>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Database className="h-4 w-4" />
                        Add Table
                      </Button>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Advanced Tab */}
              <TabsContent value="advanced" className="flex-1 overflow-hidden m-0">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-6">
                    {/* Run Behavior Section */}
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-sm font-semibold">Run Behavior</h3>
                        <p className="text-xs text-muted-foreground">
                          Control how this node executes during flow runs
                        </p>
                      </div>

                      {/* Normal Execution Option */}
                      <div className="flex items-start gap-3 p-3 border rounded-lg bg-blue-50 border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-500 text-white flex-shrink-0">
                          <Play className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-blue-900">Normal Execution</h4>
                          <p className="text-xs text-blue-700 mt-0.5">
                            Execute this node normally and continue to connected nodes
                          </p>
                        </div>
                        <div className="flex-shrink-0">
                          <div className="w-4 h-4 rounded-full border-2 border-blue-500 bg-blue-500 flex items-center justify-center">
                            <div className="w-2 h-2 rounded-full bg-white" />
                          </div>
                        </div>
                      </div>

                      {/* Skip & Continue Option */}
                      <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted text-muted-foreground flex-shrink-0">
                          <FastForward className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium">Skip & Continue</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Skip execution but return empty values, allowing connected nodes to run
                          </p>
                        </div>
                        <div className="flex-shrink-0">
                          <div className="w-4 h-4 rounded-full border-2 border-muted-foreground" />
                        </div>
                      </div>

                      {/* Stop & Pause Option */}
                      <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent cursor-pointer transition-colors">
                        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-muted text-muted-foreground flex-shrink-0">
                          <Pause className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium">Stop & Pause</h4>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Pause execution at this node, preventing connected nodes from running
                          </p>
                        </div>
                        <div className="flex-shrink-0">
                          <div className="w-4 h-4 rounded-full border-2 border-muted-foreground" />
                        </div>
                      </div>
                    </div>

                    {/* Output Processing Section */}
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-sm font-semibold">Output Processing</h3>
                        <p className="text-xs text-muted-foreground">
                          Here, you can apply processing and transformation to the output, including filtering, transforming, sorting, and limiting the number of results.
                        </p>
                      </div>

                      {/* Output fields list */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between p-2 border rounded hover:bg-accent hover:border-primary/50 cursor-pointer transition-colors">
                          <span className="text-sm">Model answer</span>
                          <Zap className="w-4 h-4 text-muted-foreground" />
                        </div>
                        <div className="flex items-center justify-between p-2 border rounded hover:bg-accent hover:border-primary/50 cursor-pointer transition-colors">
                          <span className="text-sm">Tools calls</span>
                          <Zap className="w-4 h-4 text-muted-foreground" />
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>

              {/* Results Tab */}
              <TabsContent value="results" className="flex-1 overflow-hidden m-0">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-4">
                    {/* No Results Message */}
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                        <Info className="w-6 h-6 text-muted-foreground" />
                      </div>
                      <h3 className="text-base font-semibold mb-1">No Results Available</h3>
                      <p className="text-sm text-muted-foreground max-w-sm">
                        There are no results in this node yet. Run the node to see the results here.
                      </p>
                    </div>

                    {/* Expected Output Fields */}
                    <div className="border rounded-lg">
                      <button
                        className="w-full flex items-center justify-between p-4 hover:bg-accent transition-colors"
                        onClick={() => setIsResultsExpanded(!isResultsExpanded)}
                      >
                        <div className="flex items-center gap-2">
                          <Info className="w-4 h-4 text-blue-500" />
                          <span className="text-sm font-medium text-blue-600">
                            Expected Output Fields (2)
                          </span>
                        </div>
                        <ChevronDown className={`w-4 h-4 transition-transform ${isResultsExpanded ? 'rotate-180' : ''}`} />
                      </button>

                      {isResultsExpanded && (
                        <div className="p-4 pt-0 space-y-4">
                          <div className="bg-blue-50 rounded-lg p-3">
                            <p className="text-xs text-blue-700 mb-3">
                              These are the fields that will be available once the node runs successfully:
                            </p>

                            {/* Tables Section */}
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                <Database className="w-3 h-3" />
                                <span>Tables</span>
                              </div>

                              <div className="bg-white rounded-lg p-3 border border-blue-100">
                                <div className="flex items-center gap-2 mb-1">
                                  <Database className="w-4 h-4 text-blue-600" />
                                  <span className="text-sm font-medium">Tools calls</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <span className="text-xs text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">table</span>
                                  <span className="text-xs text-muted-foreground">4 columns</span>
                                </div>
                              </div>
                            </div>

                            {/* Single Values Section */}
                            <div className="space-y-3 mt-4">
                              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                <span>Single Values</span>
                              </div>

                              <div className="bg-white rounded-lg p-3 border border-blue-100">
                                <div className="flex items-center gap-2 mb-1">
                                  <div className="w-6 h-6 rounded bg-blue-100 flex items-center justify-center text-blue-600 font-semibold text-xs">
                                    A
                                  </div>
                                  <span className="text-sm font-medium">Model answer</span>
                                </div>
                                <span className="text-xs text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">string</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </div>

      {/* Template Setup Dialog */}
      <TemplateSetupDialog
        open={showTemplateSetupDialog}
        onOpenChange={handleTemplateSetupDialogChange}
        data={templateSetupData}
      />

      {/* Template Settings Drawer */}
      {isTemplateEditing && templateDraftMetadata && (
        <TemplateSettingsDrawer
          open={isTemplateSettingsOpen}
          onOpenChange={setIsTemplateSettingsOpen}
          metadata={templateDraftMetadata}
          publishedMetadata={templatePublishedMetadata}
          onMetadataChange={updateTemplateDraftMetadata}
          onSave={() => saveTemplateDraft()}
          isSaving={isSavingTemplateDraft || isSaving}
          assets={templateAssets}
          onAssetUpload={uploadTemplateAsset}
          onAssetDelete={deleteTemplateAsset}
        />
      )}

      {/* Selection Dialogs - Removed, now using IntegrationsSidePanel */}

      {/* Configuration Modals - DISABLED: Now using side panel above */}
      {false && configuringNode && (() => {
        console.log('🔍 [NewWorkflowBuilderContent] Rendering config modal:', {
          nodeType: configuringNode.nodeComponent.type,
          isAIAgent: configuringNode.nodeComponent.type === 'ai_agent'
        })
        return configuringNode.nodeComponent.type === 'ai_agent' ? (
          <AIAgentConfigModal
            isOpen={!!configuringNode}
            onClose={handleConfigurationClose}
            currentNodeId={configuringNode.id}
            initialData={configuringNode.config}
            onSave={(config, chains) => {
              handleSaveConfiguration(
                { id: configuringNode.id },
                config,
                handleAddTrigger,
                undefined,
                handleSave,
                chains
              )
            }}
            onActionSelect={aiAgentActionCallback ? (action) => aiAgentActionCallback(action.type, action.providerId, action.config) : undefined}
            showActionDialog={showActionDialog}
            setShowActionDialog={setShowActionDialog}
            selectedIntegration={selectedIntegration}
            setSelectedIntegration={setSelectedIntegration}
            selectedAction={selectedAction}
            setSelectedAction={setSelectedAction}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            filterCategory={filterCategory}
            setFilterCategory={setFilterCategory}
            showConnectedOnly={showConnectedOnly}
            setShowConnectedOnly={setShowConnectedOnly}
            availableIntegrations={availableIntegrations}
            categories={categories}
            renderLogo={renderLogo}
            isIntegrationConnected={isIntegrationConnected}
            comingSoonIntegrations={comingSoonIntegrations}
            handleActionSelect={handleActionSelect}
            filterIntegrations={filterIntegrations}
            getDisplayedActions={getDisplayedActions}
            handleActionDialogClose={handleActionDialogClose}
            loadingIntegrations={loadingIntegrations}
            refreshIntegrations={refreshIntegrations}
          />
        ) : (
          <ConfigurationModal
            isOpen={!!configuringNode}
            onClose={handleConfigurationClose}
            onBack={() => {
              const isPendingTrigger = configuringNode.id === 'pending-trigger'
              const isPendingAction = configuringNode.id === 'pending-action'
              setConfiguringNode(null)

              if (isPendingTrigger) {
                setShowTriggerDialog(true)
              } else if (isPendingAction) {
                setShowActionDialog(true)
              }
            }}
            nodeInfo={configuringNode.nodeComponent}
            integrationName={configuringNode.integration?.name || ''}
            initialData={configuringNode.config}
            workflowData={{ nodes, edges, id: currentWorkflow?.id, name: workflowName || currentWorkflow?.name }}
            nodeTitle={activeConfigNode?.data?.title || configuringNode.nodeComponent?.title || configuringNode.nodeComponent?.label}
            currentNodeId={configuringNode.id}
            isTemplateEditing={isTemplateEditing}
            templateDefaults={templateDraftMetadata?.defaultFieldValues}
            onSave={(config) => {
              const isPendingAction = configuringNode.id === 'pending-action' && pendingNode?.type === 'action'
              handleSaveConfiguration(
                { id: configuringNode.id },
                config,
                handleAddTrigger,
                isPendingAction ? handleAddAction : undefined,
                handleSave
              )
            }}
          />
        )
      })()}

      {/* Unsaved Changes Modal */}
      <UnsavedChangesModal
        open={showUnsavedChangesModal}
        onOpenChange={setShowUnsavedChangesModal}
        onSave={handleSaveAndNavigate(handleSave)}
        onDiscard={handleNavigateWithoutSaving}
        isSaving={isSaving}
      />

      {/* Node Deletion Modal */}
      {deletingNode && (
        <NodeDeletionModal
          open={!!deletingNode}
          onOpenChange={() => setDeletingNode(null)}
          nodeName={deletingNode.name}
          onConfirm={() => {
            if (confirmDeleteNode && deletingNode) {
              confirmDeleteNode(deletingNode.id)
            }
          }}
        />
      )}

      {/* Error and Auth Notifications */}
      <ErrorNotificationPopup workflowId={currentWorkflow?.id || ''} />
      <ReAuthNotification />

      {/* Execution Status Panel */}
      <ExecutionStatusPanel
        isListening={isListeningForWebhook || false}
        isExecuting={isExecuting}
        webhookTriggerType={webhookTriggerType || null}
        usingTestData={usingTestData || false}
        testDataNodes={testDataNodes || new Set()}
        nodeStatuses={nodeStatuses || {}}
        nodes={nodes}
        edges={edges}
        onSkip={(nodes, edges) => skipToTestData && skipToTestData(nodes, edges)}
        onStop={() => stopWebhookListening && stopWebhookListening()}
      />

      {/* Test Mode Debug Log */}
      <TestModeDebugLog
        isActive={isListeningForWebhook || isExecuting || false}
        onClear={() => {}}
      />

      {/* Preflight Check Dialog */}
      <PreflightCheckDialog
        open={isPreflightDialogOpen}
        onClose={() => setIsPreflightDialogOpen(false)}
        result={preflightResult}
        onRunAgain={() => openPreflightChecklist()}
        onFixNode={(nodeId) => {
          setIsPreflightDialogOpen(false)
          handleNodeConfigure(nodeId)
        }}
        onOpenIntegrations={() => handleNavigation(hasUnsavedChanges, "/integrations")}
        isRunning={isRunningPreflight}
      />

      {/* Test Mode Dialog */}
      <TestModeDialog
        open={testModeDialogOpen}
        onOpenChange={setTestModeDialogOpen}
        workflowId={currentWorkflow?.id || ''}
        triggerType={nodes.find(n => n.data?.isTrigger)?.data?.type}
        onRunTest={(config, mockVariation) => {
          handleRunTest(nodes, edges, config, mockVariation)
        }}
        interceptedActions={sandboxInterceptedActions}
        isExecuting={isExecuting || isExecutingTest}
      />

      {/* ReactAgent Chat Panel */}
      <div
        className={`absolute top-0 left-0 h-full bg-background border-r border-border shadow-xl z-40 transition-transform duration-300 ease-in-out ${
          isReactAgentOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        style={{ width: `${REACT_AGENT_PANEL_WIDTH}px` }}
      >
        <div className="h-full flex flex-col">
          {/* Chat Header - No bottom border */}
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
                onClick={() => setIsReactAgentOpen(false)}
                className="h-8 w-8 text-foreground hover:bg-accent"
              >
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Chat Content */}
          <div className="flex-1 overflow-hidden px-4 flex flex-col">
            {/* Always show welcome message */}
            <div className="text-sm text-foreground space-y-2 pt-2 pb-3">
              <p>Hello, what would you like to craft?</p>
              <p className="text-xs">Tell me about your goal or task, and include the tools you normally use (like your email, calendar, or CRM).</p>
            </div>

            {/* Chat messages */}
            <ScrollArea className="flex-1 pr-2">
              <div className="space-y-4 py-4">
                {reactAgentMessages.map((msg, index) => (
                  <div
                    key={index}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg px-4 py-3 ${
                        msg.role === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-accent text-foreground'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      <p className="text-xs opacity-70 mt-1">
                        {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                ))}

                {/* Show clarification questions BEFORE plan */}
                {showClarifications && clarificationQuestions.length > 0 && (
                  <div className="space-y-3">
                    {clarificationQuestions.map((question) => (
                      <ClarificationQuestion
                        key={question.id}
                        question={question}
                        answer={clarificationAnswers[question.id]}
                        onAnswer={(questionId, answer) => {
                          setClarificationAnswers(prev => ({
                            ...prev,
                            [questionId]: answer
                          }))
                        }}
                      />
                    ))}

                    {/* Submit clarifications button */}
                    {Object.keys(clarificationAnswers).length >= clarificationQuestions.filter(q => q.required).length && (
                      <Button
                        onClick={async () => {
                          logger.info('[CLARIFICATION] User submitted answers:', clarificationAnswers)

                          // Hide clarifications, proceed with workflow build
                          setShowClarifications(false)
                          setWaitingForClarifications(false)
                          setIsReactAgentLoading(true)
                          setReactAgentStatus('Building your workflow...')

                          try {
                            // Get the original user prompt from messages
                            const originalPrompt = reactAgentMessages.find(m => m.role === 'user')?.content || ''

                            // Get connected integrations
                            const connectedIntegrations = getConnectedProviders()

                            // Calculate viewport
                            const chatPanelWidth = isReactAgentOpen ? REACT_AGENT_PANEL_WIDTH : 0
                            const availableWidth = window.innerWidth - chatPanelWidth
                            const availableHeight = window.innerHeight

                            // Merge inferred data (like message templates) with user's clarification answers
                            const mergedClarifications = {
                              ...inferredData, // AI-inferred values like message_template
                              ...clarificationAnswers // User-provided answers (these take precedence)
                            }

                            // Call stream-workflow with clarifications
                            const response = await fetch('/api/ai/stream-workflow', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                prompt: originalPrompt,
                                workflowId: currentWorkflow?.id,
                                connectedIntegrations,
                                clarifications: mergedClarifications,
                                conversationHistory: reactAgentMessages.map(msg => ({
                                  role: msg.role,
                                  content: msg.content
                                })),
                                contextNodes: [],
                                testNodes: true,
                                model: 'auto',
                                autoApprove: false,
                                viewport: {
                                  width: availableWidth,
                                  height: availableHeight,
                                  chatPanelWidth,
                                  defaultZoom: 0.75
                                }
                              })
                            })

                            if (!response.ok) {
                              throw new Error('Failed to start workflow building')
                            }

                            // Process stream (same as initial handler)
                            const reader = response.body?.getReader()
                            const decoder = new TextDecoder()
                            if (!reader) throw new Error('No response body')

                            let buffer = ''

                            while (true) {
                              const { done, value } = await reader.read()
                              if (done) break

                              buffer += decoder.decode(value, { stream: true })
                              const lines = buffer.split('\n\n')
                              buffer = lines.pop() || ''

                              for (const line of lines) {
                                if (!line.trim() || !line.startsWith('data: ')) continue

                                const eventData = JSON.parse(line.substring(6))

                                // Handle show_plan event
                                if (eventData.type === 'show_plan') {
                                  console.log('[DEBUG CLARIFICATION show_plan] eventData:', eventData)
                                  console.log('[DEBUG CLARIFICATION show_plan] eventData.plan.nodes:', eventData.plan?.nodes)

                                  // Use eventData.nodes if available, otherwise eventData.plan.nodes
                                  const nodesToMap = eventData.nodes || eventData.plan?.nodes || []
                                  console.log('[DEBUG CLARIFICATION] nodesToMap:', nodesToMap)

                                  const mappedNodes = nodesToMap.map((n: any) => {
                                    console.log('[DEBUG CLARIFICATION] Mapping node:', n.title, 'providerId:', n.providerId)
                                    return {
                                      title: n.title,
                                      description: n.description,
                                      type: n.isTrigger ? 'trigger' : 'action',
                                      providerId: n.providerId
                                    }
                                  })
                                  console.log('[DEBUG CLARIFICATION] mappedNodes:', mappedNodes)

                                  setWorkflowPlan(mappedNodes)
                                  setApprovedPlanData(eventData.plan)
                                  setShowPlanApproval(true)
                                  setIsReactAgentLoading(false)
                                  setReactAgentStatus('')
                                }
                              }
                            }
                          } catch (error) {
                            logger.error('[CLARIFICATION] Error building workflow:', error)
                            setIsReactAgentLoading(false)
                            setReactAgentStatus('')
                            setReactAgentMessages(prev => [...prev, {
                              role: 'assistant',
                              content: 'Sorry, there was an error building your workflow. Please try again.',
                              timestamp: new Date()
                            }])
                          }
                        }}
                        className="w-full"
                      >
                        Continue Building Workflow
                      </Button>
                    )}
                  </div>
                )}

                {/* Show workflow plan (always keep visible once shown) */}
                {showPlanApproval && workflowPlan && (
                  <>
                    <WorkflowPlan
                      nodes={workflowPlan}
                      isBuilding={isPlanBuilding}
                      onContinue={async () => {
                        // CRITICAL: Ensure integrations are ready
                        if (!integrationsReady) {
                          logger.warn('[Continue Building] Integrations not ready yet')
                          return
                        }

                        // Keep plan visible but hide button permanently
                        setIsPlanBuilding(true)  // This will permanently hide the button
                        setIsReactAgentLoading(true)
                        setReactAgentStatus('Building workflow...')
                        setIsPlacingNodes(true)

                        // Call API with approved plan
                        try {
                          const connectedIntegrations = getConnectedProviders()

                          // DEBUG LOGGING
                          console.log('=== CONTINUE BUILDING DEBUG ===')
                          console.log('[DEBUG] Integrations ready:', integrationsReady)
                          console.log('[DEBUG] Connected integrations:', connectedIntegrations)
                          console.log('===============================')

                          // Calculate available viewport dimensions (accounting for chat panel)
                          const chatPanelWidth = isReactAgentOpen ? REACT_AGENT_PANEL_WIDTH : 0
                          const availableWidth = window.innerWidth - chatPanelWidth
                          const availableHeight = window.innerHeight

                          console.log('[CONTINUE VIEWPORT DEBUG] Sending to API:', {
                            windowWidth: window.innerWidth,
                            windowHeight: window.innerHeight,
                            chatPanelWidth,
                            availableWidth,
                            availableHeight
                          })

                          const response = await fetch('/api/ai/stream-workflow', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              prompt: 'Continue building',
                              workflowId: currentWorkflow?.id,
                              approvedPlan: approvedPlanData,
                              connectedIntegrations,
                              conversationHistory: [],
                              contextNodes: [],
                              testNodes: true,
                              model: 'auto',
                              viewport: {
                                width: availableWidth,
                                height: availableHeight,
                                chatPanelWidth,
                                defaultZoom: 0.75
                              }
                            })
                          })

                          if (!response.ok) {
                            throw new Error('Failed to build workflow')
                          }

                          // Process the stream (same logic as handleReactAgentSubmit)
                          const reader = response.body?.getReader()
                          const decoder = new TextDecoder()
                          if (!reader) throw new Error('No response body')

                          let buffer = ''
                          let currentAIMessage = ''

                          while (true) {
                            const { done, value } = await reader.read()
                            if (done) break

                            buffer += decoder.decode(value, { stream: true })
                            const lines = buffer.split('\n\n')
                            buffer = lines.pop() || ''

                            for (const line of lines) {
                              if (!line.trim() || !line.startsWith('data: ')) continue

                              const eventData = JSON.parse(line.substring(6))
                              console.log('[CONTINUE] Received event:', eventData.type, eventData)

                              switch (eventData.type) {
                                case 'configuration_progress':
                                  setIsPlacingNodes(false)
                                  setReactAgentStatus(eventData.message || `Configuring node ${eventData.currentNode} of ${eventData.totalNodes}`)
                                  setConfigurationProgress({
                                    currentNode: eventData.currentNode,
                                    totalNodes: eventData.totalNodes,
                                    nodeName: eventData.nodeName,
                                    status: 'configuring'
                                  })
                                  break

                                case 'node_preparing':
                                  setReactAgentStatus(eventData.message || 'Preparing node...')
                                  setConfigurationProgress(prev => {
                                    if (!prev) {
                                      return {
                                        currentNode: (eventData.nodeIndex ?? 0) + 1,
                                        totalNodes: eventData.totalNodes ?? workflowPlan?.length ?? 1,
                                        nodeName: eventData.nodeName || '',
                                        status: 'preparing'
                                      }
                                    }
                                    return {
                                      ...prev,
                                      currentNode: eventData.nodeIndex !== undefined ? eventData.nodeIndex + 1 : prev.currentNode,
                                      nodeName: eventData.nodeName || prev.nodeName,
                                      status: 'preparing'
                                    }
                                  })
                                  if (eventData.nodeId) {
                                    optimizedOnNodesChange([
                                      {
                                        type: 'update',
                                        id: eventData.nodeId,
                                        item: (node: any) => ({
                                          ...node,
                                          data: {
                                            ...node.data,
                                            aiStatus: 'preparing',
                                            aiBadgeText: 'Preparing',
                                            aiBadgeVariant: 'info',
                                            aiFallbackFields: [],
                                            aiProgressConfig: [],
                                            testData: {},
                                            autoExpand: true,
                                            executionStatus: eventData.executionStatus || 'pending'
                                          }
                                        })
                                      }
                                    ])
                                  }
                                  break

                                case 'node_created':
                                  if (eventData.node) {
                                    console.log('[CONTINUE NODE] Adding node:', {
                                      id: eventData.node.id,
                                      position: eventData.node.position,
                                      title: eventData.node.data?.title
                                    })

                                    // Add onConfigure and onDelete functions to the node data
                                    const enhancedNode = {
                                      ...eventData.node,
                                      data: {
                                        ...eventData.node.data,
                                        onConfigure: (nodeId: string) => {
                                          console.log('[NODE] Opening configuration for:', nodeId)
                                          const nodeToConfig = nodes.find(n => n.id === nodeId) || eventData.node
                                          setConfiguringNode(nodeToConfig)
                                        },
                                        onDelete: (nodeId: string) => {
                                          console.log('[NODE] Deleting node:', nodeId)
                                          optimizedOnNodesChange([{ type: 'remove', id: nodeId }])
                                        }
                                      }
                                    }

                                    optimizedOnNodesChange([{ type: 'add', item: enhancedNode }])

                                    setTimeout(() => {
                                      fitViewWithChatPanel()
                                    }, 120)

                                    if (reactFlowInstance) {
                                      const currentViewport = reactFlowInstance.getViewport()
                                      const allNodes = reactFlowInstance.getNodes()
                                      console.log('[CONTINUE NODE] Current state after add:', {
                                        viewport: currentViewport,
                                        totalNodes: allNodes.length,
                                        windowWidth: window.innerWidth,
                                        chatPanelWidth: isReactAgentOpen ? REACT_AGENT_PANEL_WIDTH : 0,
                                        availableWidth: window.innerWidth - (isReactAgentOpen ? REACT_AGENT_PANEL_WIDTH : 0),
                                        nodePosition: eventData.node.position
                                      })
                                    }
                                  }
                                  break

                                case 'node_configuring':
                                  console.log('[CONTINUE] node_configuring:', eventData)
                                  if (eventData.nodeId) {
                                    optimizedOnNodesChange([
                                      {
                                        type: 'update',
                                        id: eventData.nodeId,
                                        item: (node: any) => ({
                                          ...node,
                                          data: {
                                            ...node.data,
                                            aiStatus: 'configuring',
                                            aiBadgeText: 'Configuring',
                                            aiBadgeVariant: 'info',
                                            autoExpand: true
                                          }
                                        })
                                      }
                                    ])
                                  }
                                  break

                                case 'field_configured':
                                console.log('[CONTINUE] 🔵 field_configured event received:', {
                                  nodeId: eventData.nodeId,
                                  fieldKey: eventData.fieldKey,
                                  fieldValue: eventData.fieldValue,
                                  displayValue: eventData.displayValue,
                                  viaFallback: eventData.viaFallback,
                                  status: eventData.status,
                                  badgeText: eventData.badgeText,
                                  fullEventData: eventData
                                })
                                if (eventData.nodeId) {
                                  console.log('[CONTINUE] 🟢 Updating node config:', eventData.fieldKey, '=', eventData.fieldValue)

                                  // Get current node before update - use reactFlowInstance to get latest state
                                  const currentNodes = reactFlowInstance?.getNodes() || []
                                  const currentNode = currentNodes.find(n => n.id === eventData.nodeId)
                                  console.log('[CONTINUE] 🟡 Current node before update:', {
                                    nodeId: eventData.nodeId,
                                    exists: !!currentNode,
                                    totalNodesInFlow: currentNodes.length,
                                    currentConfig: currentNode?.data?.config,
                                    currentAiProgressConfig: currentNode?.data?.aiProgressConfig,
                                    currentAiStatus: currentNode?.data?.aiStatus,
                                    currentAutoExpand: currentNode?.data?.autoExpand
                                  })

                                  optimizedOnNodesChange([
                                    {
                                      type: 'update',
                                      id: eventData.nodeId,
                                      item: (node: any) => {
                                        const updatedNode = {
                                          ...node,
                                          data: {
                                            ...node.data,
                                            autoExpand: true,
                                            aiStatus: eventData.status || node.data.aiStatus || 'configuring',
                                            aiBadgeText: eventData.badgeText || node.data.aiBadgeText || 'Configuring',
                                            aiBadgeVariant: eventData.badgeVariant || node.data.aiBadgeVariant || 'info',
                                            aiFallbackFields: eventData.viaFallback
                                              ? Array.from(new Set([...(node.data.aiFallbackFields || []), eventData.fieldKey]))
                                              : node.data.aiFallbackFields,
                                            aiProgressConfig: [
                                            ...(Array.isArray(node.data.aiProgressConfig) ? node.data.aiProgressConfig.filter((field: any) => field.key !== eventData.fieldKey) : []),
                                            {
                                              key: eventData.fieldKey,
                                              value: eventData.fieldValue,
                                              displayValue: eventData.displayValue,
                                              viaFallback: eventData.viaFallback
                                            }
                                          ]
                                          // Don't update config here - only aiProgressConfig
                                          // config will be set when node_configured fires
                                        }
                                      }

                                      console.log('[CONTINUE] 🟣 Updated node:', {
                                        nodeId: eventData.nodeId,
                                        updatedConfig: updatedNode.data.config,
                                        updatedAiProgressConfig: updatedNode.data.aiProgressConfig,
                                        updatedAiStatus: updatedNode.data.aiStatus,
                                        updatedAutoExpand: updatedNode.data.autoExpand,
                                        fullUpdatedData: updatedNode.data
                                      })

                                      return updatedNode
                                    }
                                  }
                                ])

                                  // Log nodes after update - use reactFlowInstance
                                  setTimeout(() => {
                                    const allNodes = reactFlowInstance?.getNodes() || []
                                    const updatedNode = allNodes.find(n => n.id === eventData.nodeId)
                                    console.log('[CONTINUE] 🔴 Node after update in state:', {
                                      nodeId: eventData.nodeId,
                                      exists: !!updatedNode,
                                      totalNodesInFlow: allNodes.length,
                                      config: updatedNode?.data?.config,
                                      aiProgressConfig: updatedNode?.data?.aiProgressConfig,
                                      aiStatus: updatedNode?.data?.aiStatus,
                                      autoExpand: updatedNode?.data?.autoExpand
                                    })
                                  }, 50)
                                }
                                break

                              case 'node_configured':
                                setConfigurationProgress(prev => {
                                  if (!prev) return prev
                                  return {
                                    ...prev,
                                    currentNode: eventData.nodeIndex !== undefined ? eventData.nodeIndex + 1 : prev.currentNode,
                                    nodeName: eventData.nodeName || prev.nodeName,
                                    status: 'configuring'
                                  }
                                })
                                if (eventData.nodeId) {
                                  optimizedOnNodesChange([
                                    {
                                      type: 'update',
                                      id: eventData.nodeId,
                                        item: (node: any) => ({
                                          ...node,
                                          data: {
                                            ...node.data,
                                            description: eventData.description || node.data.description,
                                            aiStatus: eventData.status || 'configured',
                                            aiBadgeText: eventData.badgeText || 'Configuring',
                                            aiBadgeVariant: eventData.badgeVariant || 'info',
                                            autoExpand: true,
                                            needsSetup: eventData.badgeVariant === 'warning',
                                            aiFallbackFields: eventData.fallbackFields || node.data.aiFallbackFields,
                                          aiProgressConfig: [],
                                            config: eventData.config || node.data.config,
                                            executionStatus: eventData.executionStatus || 'running'
                                          }
                                        })
                                      }
                                    ])
                                  }
                                  break

                              case 'node_complete':
                                console.log('[CONTINUE] node_complete event received:', {
                                  nodeId: eventData.nodeId,
                                  status: eventData.status,
                                  badgeText: eventData.badgeText,
                                  badgeVariant: eventData.badgeVariant,
                                  skipTest: eventData.skipTest,
                                  executionStatus: eventData.executionStatus
                                })
                                setConfigurationProgress(prev => {
                                  if (!prev) return prev
                                  return {
                                    ...prev,
                                    currentNode: eventData.nodeIndex !== undefined ? eventData.nodeIndex + 1 : prev.currentNode,
                                    nodeName: eventData.nodeName || prev.nodeName,
                                    status: 'complete'
                                  }
                                })
                                setReactAgentStatus('')

                                if (eventData.nodeId) {
                                  optimizedOnNodesChange([
                                    {
                                      type: 'update',
                                      id: eventData.nodeId,
                                      item: (node: any) => {
                                        const isTrigger = Boolean(eventData.skipTest)
                                        const fallbackCandidates = eventData.fallbackFields ?? node.data?.aiFallbackFields ?? []
                                        const hasFallback = Array.isArray(fallbackCandidates) && fallbackCandidates.length > 0

                                        // For node_complete, use eventData values with proper defaults
                                        let nextBadgeVariant = eventData.badgeVariant || 'success'
                                        let nextBadgeText = eventData.badgeText || 'Successful'

                                        // Special handling for triggers with fallback fields
                                        if (isTrigger && hasFallback) {
                                          nextBadgeVariant = 'warning'
                                          nextBadgeText = 'Setup required'
                                        } else if (isTrigger) {
                                          nextBadgeVariant = 'success'
                                          nextBadgeText = 'Successful'
                                        }

                                        console.log('[CONTINUE] Applying node_complete update:', {
                                          nodeId: node.id,
                                          isTrigger,
                                          hasFallback,
                                          prevStatus: node.data.aiStatus,
                                          nextStatus: 'ready',
                                          nextBadgeText,
                                          nextBadgeVariant,
                                          executionStatus: eventData.executionStatus || 'completed'
                                        })

                                        return {
                                          ...node,
                                          data: {
                                            ...node.data,
                                            aiStatus: 'ready',
                                            aiBadgeText: nextBadgeText,
                                            aiBadgeVariant: nextBadgeVariant,
                                            autoExpand: true,
                                            needsSetup: nextBadgeVariant === 'warning',
                                            aiFallbackFields: fallbackCandidates,
                                            aiProgressConfig: [],
                                            config: eventData.config || node.data.config,
                                            testData: eventData.preview || node.data.testData,
                                            executionStatus: eventData.executionStatus || 'completed'
                                          }
                                        }
                                      }
                                    }
                                  ])
                                }
                                break

                              case 'node_testing':
                                setConfigurationProgress(prev => {
                                  if (!prev) return prev
                                  return {
                                    ...prev,
                                    currentNode: eventData.nodeIndex !== undefined ? eventData.nodeIndex + 1 : prev.currentNode,
                                    nodeName: eventData.nodeName || prev.nodeName,
                                    status: 'testing'
                                  }
                                })
                                if (eventData.nodeId) {
                                  optimizedOnNodesChange([
                                    {
                                      type: 'update',
                                      id: eventData.nodeId,
                                        item: (node: any) => ({
                                          ...node,
                                          data: {
                                            ...node.data,
                                            aiStatus: eventData.status || 'testing',
                                            aiBadgeText: eventData.badgeText || 'Testing',
                                            aiBadgeVariant: eventData.badgeVariant || 'info',
                                            autoExpand: true,
                                            aiProgressConfig: node.data?.aiProgressConfig || [],
                                            testData: {},
                                            executionStatus: eventData.executionStatus || 'running'
                                          }
                                        })
                                      }
                                    ])
                                  }
                                  break

                              case 'test_data_field':
                                if (eventData.nodeId) {
                                  optimizedOnNodesChange([
                                    {
                                      type: 'update',
                                      id: eventData.nodeId,
                                      item: (node: any) => ({
                                        ...node,
                                        data: {
                                          ...node.data,
                                          autoExpand: true,
                                          aiStatus: eventData.status || node.data.aiStatus,
                                          aiBadgeText: eventData.badgeText || node.data.aiBadgeText,
                                          aiBadgeVariant: eventData.badgeVariant || node.data.aiBadgeVariant,
                                          aiProgressConfig: node.data?.aiProgressConfig || [],
                                          testData: {
                                            ...(node.data.testData || {}),
                                            [eventData.fieldKey]: eventData.fieldValue
                                          }
                                        }
                                      })
                                    }
                                  ])
                                }
                                break

                              case 'node_tested':
                setConfigurationProgress(prev => {
                  if (!prev) return prev
                  return {
                    ...prev,
                    currentNode: eventData.nodeIndex !== undefined ? eventData.nodeIndex + 1 : prev.currentNode,
                    nodeName: eventData.nodeName || prev.nodeName,
                    status: 'complete'
                  }
                })
                setReactAgentStatus(eventData.message || `${eventData.nodeName || 'Node'} ready!`)
                                if (eventData.nodeId) {
                                  optimizedOnNodesChange([
                                    {
                                      type: 'update',
                                      id: eventData.nodeId,
                                        item: (node: any) => ({
                                          ...node,
                                          data: {
                                            ...node.data,
                                            aiStatus: eventData.status || 'ready',
                                            aiBadgeText: eventData.badgeText || 'Successful',
                                            aiBadgeVariant: eventData.badgeVariant || 'success',
                                            aiTestSummary: eventData.summary || node.data.aiTestSummary,
                                            needsSetup: eventData.badgeVariant === 'warning',
                                            aiFallbackFields: node.data.aiFallbackFields,
                                            autoExpand: true,
                                            aiProgressConfig: [],
                                            testData: eventData.preview || node.data.testData,
                                            executionStatus: 'completed'
                                          }
                                        })
                                      }
                                    ])
                                  }
                                  break

                              case 'node_test_failed':
                setConfigurationProgress(prev => {
                  if (!prev) return prev
                  return {
                    ...prev,
                    currentNode: eventData.nodeIndex !== undefined ? eventData.nodeIndex + 1 : prev.currentNode,
                    nodeName: eventData.nodeName || prev.nodeName,
                    status: 'error'
                  }
                })
                setReactAgentStatus(eventData.message || `Issue testing ${eventData.nodeName || 'node'}`)
                                if (eventData.nodeId) {
                                  optimizedOnNodesChange([
                                    {
                                      type: 'update',
                                      id: eventData.nodeId,
                                item: (node: any) => ({
                                  ...node,
                                  data: {
                                    ...node.data,
                                            aiStatus: eventData.status || 'error',
                                            aiBadgeText: eventData.badgeText || 'Needs Attention',
                                            aiBadgeVariant: eventData.badgeVariant || 'warning',
                                            aiTestSummary: eventData.summary || eventData.error || node.data.aiTestSummary,
                                            needsSetup: true,
                                            aiFallbackFields: node.data.aiFallbackFields,
                                            autoExpand: true,
                                            executionStatus: 'error'
                                          }
                                        })
                                      }
                                    ])
                                  }
                                  break

                                case 'edge_created':
                                  if (eventData.edge) {
                                    console.log('[CONTINUE EDGE] Adding edge:', eventData.edge)
                                    onEdgesChange([{ type: 'add', item: eventData.edge }])
                                  }
                                  break

                                case 'workflow_complete':
                                  console.log('[CONTINUE] Workflow complete!')
                                  // Set completion message to show AFTER the plan
                                  setWorkflowCompletionMessage('Workflow configuration complete. All nodes have been successfully configured and are ready for use. You can now test the workflow, make adjustments, or activate it in your workflow settings.')
                                  setTimeout(() => {
                                    fitViewWithChatPanel()
                                  }, 200)
                                  setIsReactAgentLoading(false)
                                  setReactAgentStatus('')
                                  setIsPlacingNodes(false)
                                  // Keep plan visible AND keep button hidden: don't reset isPlanBuilding
                                  // setIsPlanBuilding remains true to keep button hidden permanently
                                  setConfigurationProgress(null)
                                  break

                                default:
                                  break
                              }
                            }
                          }
                        } catch (error) {
                          logger.error('Error building approved plan:', error)
                          setIsReactAgentLoading(false)
                          setReactAgentStatus('')
                          setIsPlacingNodes(false)
                          // Don't reset isPlanBuilding - keep button hidden even on error
                          setConfigurationProgress(null)
                          setShowPlanApproval(true)
                        } finally {
                          setIsReactAgentLoading(false)
                          setReactAgentStatus('')
                          setIsPlacingNodes(false)
                          // Don't reset isPlanBuilding - keep button hidden permanently
                        }
                      }}
                    />

                    {/* Completion message - appears after the plan */}
                    {workflowCompletionMessage && (
                      <div className="flex justify-start">
                        <div className="max-w-[80%] rounded-lg px-4 py-3 bg-accent text-foreground">
                          <p className="text-sm whitespace-pre-wrap">{workflowCompletionMessage}</p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Status indicators always appear at the bottom after all messages and plan */}
                {/* Show pulsing placeholders when placing nodes */}
                {isPlacingNodes && !configurationProgress && (
                  <PulsingPlaceholders
                    count={workflowPlan?.length || 3}
                    message="Placing nodes on canvas..."
                  />
                )}

                {/* Status badge - appears at bottom during active work */}
                {reactAgentStatus && (
                  <div className="flex justify-start">
                    <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-accent/40 px-3 py-2 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin text-primary" />
                      <span>{reactAgentStatus}</span>
                    </div>
                  </div>
                )}

                {/* Missing integrations badges */}
                {showMissingApps && missingIntegrations.length > 0 && (
                  <MissingIntegrationsBadges
                    missingIntegrations={missingIntegrations}
                    onConnect={(provider) => {
                      // Navigate to integrations page
                      window.location.href = '/integrations'
                    }}
                  />
                )}
                </div>
              </ScrollArea>

            {/* Chat input - Fixed at bottom */}
            <div className="mt-auto mb-4 relative">
                {/* Context Menu Popover - Appears above text field */}
                {isContextMenuOpen && (
                  <div className="absolute bottom-full left-0 right-0 mb-2 border border-border rounded-t-lg bg-background shadow-xl z-50">
                    <div className="max-h-96 overflow-y-auto">
                      {/* Workflow Nodes Section */}
                      <div className="p-3">
                        <h3 className="text-xs font-semibold text-foreground mb-2">WORKFLOW NODES</h3>
                        <div className="space-y-1">
                          {nodes.filter(n => n.data?.title).map((node) => {
                            const component = ALL_NODE_COMPONENTS.find(c => c.type === node.data.type)
                            const NodeIcon = component?.icon
                            const isSelected = selectedContextNodes.includes(node.id)
                            return (
                              <button
                                key={node.id}
                                className={`w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent rounded transition-colors flex items-center gap-3 ${
                                  isSelected ? 'bg-accent' : ''
                                }`}
                                onClick={() => {
                                  // Toggle node selection
                                  setSelectedContextNodes(prev =>
                                    prev.includes(node.id)
                                      ? prev.filter(id => id !== node.id)
                                      : [...prev, node.id]
                                  )
                                  // Add to input text
                                  setReactAgentInput(prev => {
                                    const nodeTag = `@${node.data.title}`
                                    return prev ? `${prev} ${nodeTag}` : nodeTag
                                  })
                                  setIsContextMenuOpen(false)
                                }}
                              >
                                {NodeIcon && (
                                  <div className="shrink-0 w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center">
                                    <NodeIcon className="w-4 h-4 text-foreground" />
                                  </div>
                                )}
                                <span>{node.data.title}</span>
                              </button>
                            )
                          })}
                          {nodes.filter(n => n.data?.title).length === 0 && (
                            <p className="text-xs text-muted-foreground px-3 py-2">No nodes in workflow</p>
                          )}
                        </div>
                      </div>

                      <Separator />

                      {/* Nodes Catalog Section */}
                      <div className="p-3">
                        <h3 className="text-xs font-semibold text-foreground mb-2">NODES CATALOG</h3>
                        <div className="space-y-1">
                          {ALL_NODE_COMPONENTS.filter(n => n.providerId && n.providerId !== 'generic').map((node) => {
                            const NodeIcon = node.icon
                            // Format: Provider Name | Action Name
                            const providerName = node.providerId
                              ? node.providerId.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')
                              : ''
                            const actionName = node.title

                            return (
                              <button
                                key={node.type}
                                className="w-full text-left px-3 py-2 text-sm text-foreground hover:bg-accent rounded transition-colors flex items-center gap-3"
                                onClick={() => {
                                  // Add catalog node to input text
                                  const nodeDescription = `${providerName} ${actionName}`
                                  setReactAgentInput(prev => {
                                    const nodeTag = `@${nodeDescription}`
                                    return prev ? `${prev} ${nodeTag}` : nodeTag
                                  })
                                  setIsContextMenuOpen(false)
                                }}
                              >
                                <div className="shrink-0 w-8 h-8 rounded-lg bg-background border border-border flex items-center justify-center">
                                  {NodeIcon ? (
                                    <NodeIcon className="w-4 h-4 text-foreground" />
                                  ) : (
                                    <Image
                                      src={`/integrations/${node.providerId}.svg`}
                                      alt={providerName}
                                      width={16}
                                      height={16}
                                      className="w-4 h-4"
                                    />
                                  )}
                                </div>
                                <span className="flex-1">
                                  <span className="font-medium">{providerName}</span>
                                  <span className="text-muted-foreground"> | </span>
                                  <span>{actionName}</span>
                                </span>
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Text Field Container */}
                <div className="border border-border rounded-lg bg-background p-2">
                  {/* Add Context Button and Pause Button */}
                  <div className="mb-0.5 flex items-center justify-between">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsContextMenuOpen(!isContextMenuOpen)}
                      className="h-7 px-2 text-xs text-foreground hover:bg-accent gap-1"
                      disabled={isReactAgentLoading}
                    >
                      <AtSign className="w-3 h-3" />
                      add context
                    </Button>
                    {isReactAgentLoading && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handlePauseBuilding}
                        className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 gap-1"
                      >
                        <Pause className="w-3 h-3" />
                        pause
                      </Button>
                    )}
                  </div>

                  {/* Input field without send button - Custom placeholder behavior */}
                  <div className="relative">
                    {reactAgentInput === '' && (
                      <div className="absolute left-0 top-0 pointer-events-none px-3 py-2 text-sm text-muted-foreground leading-normal">
                        How can ChainReact help you today?
                      </div>
                    )}
                    <input
                      type="text"
                      value={reactAgentInput}
                      onChange={(e) => setReactAgentInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && reactAgentInput.trim()) {
                          handleReactAgentSubmit()
                        }
                      }}
                      className="w-full border-0 shadow-none focus:outline-none focus:ring-0 text-sm text-foreground px-3 py-2 bg-transparent leading-normal"
                      style={{ caretColor: 'currentColor' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
      </div>

      {/* ReactAgent Toggle Button (when closed) */}
      {!isReactAgentOpen && (
        <Button
          onClick={() => setIsReactAgentOpen(true)}
          className="fixed left-0 top-1/2 -translate-y-1/2 z-40 rounded-l-none rounded-r-lg shadow-lg px-3 py-2 flex-col gap-1 h-auto"
          variant="default"
          style={{ marginTop: '32px' }}
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-xs font-medium tracking-tight">Agent</span>
        </Button>
      )}
    </BuilderLayout>
  )
}
