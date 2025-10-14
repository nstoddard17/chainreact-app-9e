import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useNodesState, useEdgesState, useReactFlow, type Node, type Edge, type Connection } from '@xyflow/react'
import { useToast } from '@/hooks/use-toast'

// Store imports
import { useWorkflowStore, type Workflow, type WorkflowNode, type WorkflowConnection } from '@/stores/workflowStore'
import { useCollaborationStore } from '@/stores/collaborationStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useWorkflowErrorStore } from '@/stores/workflowErrorStore'

// Custom hooks
import { useWorkflowExecution } from './useWorkflowExecution'
import { useWorkflowDialogs } from './useWorkflowDialogs'
import { useIntegrationSelection } from './useIntegrationSelection'
import { useNodeConfiguration } from './useNodeConfiguration'
import { useWorkflowHistory } from './useWorkflowHistory'

// Utils
import { supabase } from '@/utils/supabaseClient'
import CustomNode from '@/components/workflows/CustomNode'
import { AddActionNode } from '@/components/workflows/AddActionNode'
import { ChainPlaceholderNode } from '@/components/workflows/ChainPlaceholderNode'
import InsertActionNode from '@/components/workflows/InsertActionNode'
import { CustomEdgeWithButton } from '@/components/workflows/builder/CustomEdgeWithButton'
import { SimpleStraightEdge } from '@/components/workflows/builder/SimpleStraightEdge'
import { RoundedEdge } from '@/components/workflows/builder/RoundedEdge'
import { ALL_NODE_COMPONENTS, type NodeComponent } from '@/lib/workflows/nodes'
import { validateWorkflowNodes } from '@/lib/workflows/validation/workflow'
import { getCenteredAddActionX } from '@/lib/workflows/addActionLayout'
import { INTEGRATION_CONFIGS } from '@/lib/integrations/availableIntegrations'

interface IntegrationInfo {
  id: string
  name: string
  description: string
  category: string
  color: string
  triggers: NodeComponent[]
  actions: NodeComponent[]
}

type PreflightIssueType = 'integration' | 'configuration' | 'ai'

interface PreflightIssue {
  type: PreflightIssueType
  message: string
  nodeId?: string
  providerId?: string
  missingFields?: string[]
}

interface PreflightResult {
  issues: PreflightIssue[]
  warnings: PreflightIssue[]
  checkedAt: string
}

interface RunPreflightOptions {
  openOnSuccess?: boolean
  openOnFailure?: boolean
}

export function useWorkflowBuilder() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const workflowId = searchParams.get("id")
  const editTemplateId = searchParams.get("editTemplate")
  const isTemplateEditing = Boolean(editTemplateId && !workflowId)
  const { toast } = useToast()

  // Store hooks
  const { workflows, currentWorkflow, setCurrentWorkflow, updateWorkflow, removeNode, loading: workflowLoading, fetchWorkflows } = useWorkflowStore()
  const { joinCollaboration, leaveCollaboration, collaborators } = useCollaborationStore()
  const { getConnectedProviders, loading: integrationsLoading } = useIntegrationStore()
  const { addError, setCurrentWorkflow: setErrorStoreWorkflow, getLatestErrorForNode } = useWorkflowErrorStore()
  
  // Store onClick handlers for AddActionNodes - needs to be before setNodes
  const addActionHandlersRef = useRef<Record<string, () => void>>({})
  const deletedTriggerBackupRef = useRef<{ node: Node; edges: Edge[] } | null>(null)

  // React Flow state
  const [nodes, setNodesInternal, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const { fitView, getNodes, getEdges } = useReactFlow()

  // Edge selection state for deletion
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)

  // Additional states needed by the main component
  const [cachedIntegrationStatus, setCachedIntegrationStatus] = useState<Map<string, boolean>>(new Map())
  const [preflightResult, setPreflightResult] = useState<PreflightResult | null>(null)
  const [isPreflightDialogOpen, setIsPreflightDialogOpen] = useState(false)
  const [isRunningPreflight, setIsRunningPreflight] = useState(false)
  
  // Custom setNodes that preserves onClick handlers for AddActionNodes
  const setNodes = useCallback((updater: Node[] | ((nodes: Node[]) => Node[])) => {
    setNodesInternal(currentNodes => {
      const incoming = typeof updater === 'function' ? updater(currentNodes) : updater

      // Sanitize nodes: drop malformed, fix missing titles, and restore AddAction handlers
      const sanitized: Node[] = []
      for (const node of incoming) {
        // Always allow UI addAction nodes
        if (node.type === 'addAction') {
          const withHandler = addActionHandlersRef.current[node.id]
            ? { ...node, data: { ...(node.data || {}), onClick: addActionHandlersRef.current[node.id] } }
            : node
          sanitized.push(withHandler)
          continue
        }

        const nodeType = (node as any)?.data?.type
        const isTrigger = Boolean((node as any)?.data?.isTrigger)
        if (!nodeType && !isTrigger) {
          console.warn('[WorkflowBuilder] Dropping malformed node without data.type', { id: node.id, type: node.type })
          continue
        }

        // Ensure a stable, human-readable title
        const existingTitle = (node as any)?.data?.title
        if (!existingTitle || (typeof existingTitle === 'string' && existingTitle.trim().length === 0) || existingTitle === 'Unnamed Action') {
          const component = ALL_NODE_COMPONENTS.find(c => c.type === nodeType)
          const safeTitle = component?.title || nodeType || (isTrigger ? 'Trigger' : 'Action')
          sanitized.push({
            ...node,
            data: { ...(node.data as any), title: safeTitle }
          })
        } else {
          sanitized.push(node)
        }
      }

      return sanitized
    })
  }, [])

  // Workflow metadata
  const [workflowName, setWorkflowName] = useState("")
  const [workflowDescription, setWorkflowDescription] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [isTemplateLoading, setIsTemplateLoading] = useState(false)
  const [listeningMode, setListeningMode] = useState(false)
  const [hasShownLoading, setHasShownLoading] = useState(false)
  const isProcessingChainsRef = useRef(false)
  const justSavedRef = useRef(false)
  const isCleaningAddActionsRef = useRef(false)
  const templateLoadStateRef = useRef<{ id: string; status: "pending" | "fulfilled" | "rejected" } | null>(null)

  // Wrapper to safely set unsaved changes (ignores changes right after save)
  const markAsUnsaved = useCallback(() => {
    if (!justSavedRef.current) {
      setHasUnsavedChanges(true)
    }
  }, [])

  // Custom hooks
  const executionHook = useWorkflowExecution()
  const dialogsHook = useWorkflowDialogs()
  const integrationHook = useIntegrationSelection()
  const historyHook = useWorkflowHistory()
  const configHook = useNodeConfiguration(
    currentWorkflow?.id,
    nodes,
    setNodes,
    setHasUnsavedChanges,
    edges,
    setEdges
  )

  // Memoized node and edge types
  const nodeTypes = useMemo(() => ({
    custom: CustomNode,
    addAction: AddActionNode,
    insertAction: InsertActionNode as any,
    chainPlaceholder: ChainPlaceholderNode,
  }), [])
  
  const edgeTypes = useMemo(() => ({
    custom: CustomEdgeWithButton,
    straight: SimpleStraightEdge,
    rounded: RoundedEdge,
  }), [])

  // Load initial data in parallel with proper error handling
  useEffect(() => {
    const loadInitialData = async () => {
      // Set a global timeout for all initial loading
      const loadingTimeout = setTimeout(() => {
        console.warn('[WorkflowBuilder] Initial load timeout - resetting loading states')
        // Force clear any stuck loading states
        if (workflowLoading) {
          useWorkflowStore.setState({ loading: false })
        }
        if (integrationsLoading) {
          useIntegrationStore.setState({ loading: false })
        }
      }, 10000) // 10 second timeout for initial load

      try {
        // Fetch workflows and integrations in parallel
        const workflowPromise = isTemplateEditing
          ? Promise.resolve()
          : fetchWorkflows().catch(err => {
              console.error('[WorkflowBuilder] Failed to fetch workflows:', err)
              return [] // Continue even if workflows fail
            })

        const integrationPromise = !getConnectedProviders()?.length
          ? useIntegrationStore.getState().fetchIntegrations().catch(err => {
              console.error('[WorkflowBuilder] Failed to fetch integrations:', err)
              return [] // Continue even if integrations fail
            })
          : Promise.resolve()

        await Promise.all([workflowPromise, integrationPromise])
      } finally {
        clearTimeout(loadingTimeout)
      }
    }

    loadInitialData()
  }, [])

  // Track last validated node IDs to prevent infinite loops
  const lastValidatedNodesRef = useRef<string>('')

  // Update nodes with execution status for live highlighting
  useEffect(() => {
    setNodesInternal(currentNodes => {
      return currentNodes.map(node => {
        // If not executing and not listening, clear all execution status
        if (!executionHook.isExecuting && !executionHook.isListeningForWebhook) {
          // Only update if the node has execution status to clear
          if (node.data?.executionStatus || node.data?.isActiveExecution) {
            return {
              ...node,
              data: {
                ...node.data,
                executionStatus: undefined,
                isActiveExecution: false,
              }
            }
          }
          return node
        }

        // Otherwise, apply execution status
        const status = executionHook.nodeStatuses[node.id]
        const isActive = executionHook.activeExecutionNodeId === node.id

        // Highlight trigger node when listening for webhook
        const isTriggerListening = executionHook.isListeningForWebhook && node.data?.isTrigger
        const listeningStatus = isTriggerListening ? 'running' : null

        return {
          ...node,
          data: {
            ...node.data,
            executionStatus: status || listeningStatus,
            isActiveExecution: isActive || isTriggerListening,
          }
        }
      })
    })
  }, [executionHook.nodeStatuses, executionHook.activeExecutionNodeId, executionHook.isExecuting, executionHook.isListeningForWebhook])

  // Validate nodes when they change and an AI Agent is present
  useEffect(() => {
    const hasAIAgent = nodes.some((node: Node) => node.data?.type === 'ai_agent')
    if (!hasAIAgent || nodes.length === 0) {
      return
    }

    // Create a hash of node IDs and their config to detect actual changes
    const nodeHash = nodes.map(n => `${n.id}:${JSON.stringify(n.data?.config)}`).join('|')

    // Skip if we already validated this exact set of nodes
    if (lastValidatedNodesRef.current === nodeHash) {
      return
    }

    console.log('🔍 [Validation] Running validation on nodes...')

    const workflow = {
      id: currentWorkflow?.id || '',
      name: workflowName,
      nodes: nodes as WorkflowNode[],
      edges: edges as WorkflowConnection[],
    } as Workflow

    const validationResult = validateWorkflowNodes(workflow, ALL_NODE_COMPONENTS)

    console.log('🔍 [Validation] Invalid node IDs:', validationResult.invalidNodeIds)

    // Build a map of validation states
    const validationMap = new Map<string, any>()
    validationResult.nodes.forEach(node => {
      if (node.data?.validationState) {
        validationMap.set(node.id, node.data.validationState)
      }
    })

    // Update nodes with validation state
    setNodesInternal(currentNodes => {
      return currentNodes.map(node => {
        const newValidationState = validationMap.get(node.id)
        if (newValidationState) {
          return {
            ...node,
            data: {
              ...node.data,
              validationState: newValidationState
            }
          }
        }
        return node
      })
    })

    // Store the hash to prevent re-validation
    lastValidatedNodesRef.current = nodeHash
  }, [nodes, edges, currentWorkflow?.id, workflowName])

  // Stable callback refs - don't depend on nodes to avoid loops
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  // Handle add action button click - moved up before other callbacks to ensure it's available
  const handleAddActionClick = useCallback((nodeId: string, parentId: string) => {
    // console.log('handleAddActionClick called with nodeId:', nodeId, 'parentId:', parentId)

    // Check if the parent node is part of an AI Agent chain OR is an AI Agent itself
    const parentNode = nodesRef.current.find(n => n.id === parentId)
    const sourceNode = nodesRef.current.find(n => n.id === nodeId)
    const aiAgentId = parentNode?.data?.parentAIAgentId || (parentNode?.data?.type === 'ai_agent' ? parentNode.id : null)

    // Get chain index from the source node (chain placeholder or add action button) if available,
    // otherwise from parent node
    const parentChainIndex = sourceNode?.data?.parentChainIndex ?? parentNode?.data?.parentChainIndex ?? 0

    if (aiAgentId) {
      // This is an AI Agent chain - open action dialog with AI Agent context
      console.log('🤖 Add Action clicked for AI Agent chain - opening action selection with AI context')
      console.log('🔵 Chain index for new action:', parentChainIndex)

      // Store AI Agent context for when action is selected
      dialogsHook.setSourceAddNode({
        id: nodeId,
        parentId,
        aiAgentId, // Store AI Agent ID
        parentChainIndex, // Store chain index from source node
        isAIAgentAction: true // Flag indicating this is for an AI Agent
      })
      dialogsHook.setSelectedIntegration(null)
      dialogsHook.setSelectedAction(null)
      dialogsHook.setSearchQuery("")
      dialogsHook.setShowActionDialog(true)

      console.log('Called setShowActionDialog(true) for AI Agent chain')
      return
    }

    // Regular action node - proceed with action dialog
    dialogsHook.setSourceAddNode({ id: nodeId, parentId })
    dialogsHook.setSelectedIntegration(null)
    dialogsHook.setSelectedAction(null)
    dialogsHook.setSearchQuery("")
    dialogsHook.setShowActionDialog(true)

    console.log('Called setShowActionDialog(true)')
    // Force a check after a small delay to see if state updated
    setTimeout(() => {
      console.log('showActionDialog state after 100ms:', dialogsHook.showActionDialog)
    }, 100)
  }, [dialogsHook])

  const handleNodeConfigure = useCallback((id: string) => {
    const nodeToConfig = nodesRef.current.find(n => n.id === id)
    if (nodeToConfig) {
      // Manual triggers should open the trigger selection dialog instead of config modal
      if (nodeToConfig.data?.type === 'manual') {
        dialogsHook.setShowTriggerDialog(true)
        return
      }

      configHook.setConfiguringNode({
        id: nodeToConfig.id,
        nodeComponent: ALL_NODE_COMPONENTS.find(c => c.type === nodeToConfig.data?.type),
        integration: null,
        config: nodeToConfig.data?.config || {}
      })
    }
  }, [configHook, dialogsHook])

  const handleNodeDelete = useCallback((id: string) => {
    const node = nodesRef.current.find(n => n.id === id)
    dialogsHook.setDeletingNode({ id, name: node?.data?.title || 'this node' })
  }, [dialogsHook])

  const handleNodeEditingStateChange = useCallback((id: string, isEditing: boolean) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === id) {
          return {
            ...n,
            draggable: !isEditing
          }
        }
        return n
      })
    )
  }, [setNodes])

  const handleNodeRename = useCallback((id: string, newTitle: string) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === id) {
          return {
            ...n,
            data: {
              ...n.data,
              title: newTitle
            }
          }
        }
        return n
      })
    )
  }, [setNodes])

  const runPreflightCheck = useCallback((options: RunPreflightOptions = {}) => {
    const { openOnSuccess = false, openOnFailure = true } = options
    const currentNodes = getNodes()
    const currentEdges = getEdges()

    if (!currentNodes || currentNodes.length === 0) {
      const emptyResult: PreflightResult = {
        issues: [{
          type: 'configuration',
          message: 'Add a trigger and at least one action before running.',
        }],
        warnings: [],
        checkedAt: new Date().toISOString(),
      }
      setPreflightResult(emptyResult)
      if (openOnFailure) {
        setIsPreflightDialogOpen(true)
      }
      return {
        ok: false,
        issues: emptyResult.issues,
        warnings: emptyResult.warnings,
      }
    }

    const workflowSnapshot = {
      id: currentWorkflow?.id || 'temp-workflow',
      name: workflowName || currentWorkflow?.name || 'Untitled Workflow',
      description: currentWorkflow?.description || null,
      user_id: currentWorkflow?.user_id || '',
      organization_id: currentWorkflow?.organization_id ?? null,
      nodes: currentNodes.map((node) => ({
        id: node.id,
        type: node.type || 'custom',
        position: {
          x: node.position?.x ?? 0,
          y: node.position?.y ?? 0,
        },
        data: {
          label: (node.data as any)?.label ?? (node.data as any)?.title ?? node.id,
          type: (node.data as any)?.type,
          config: (node.data as any)?.config ?? {},
          savedDynamicOptions: (node.data as any)?.savedDynamicOptions,
          providerId: (node.data as any)?.providerId,
          isTrigger: (node.data as any)?.isTrigger ?? false,
          title: (node.data as any)?.title,
          description: (node.data as any)?.description,
          isAIAgentChild: (node.data as any)?.isAIAgentChild,
          parentAIAgentId: (node.data as any)?.parentAIAgentId,
          parentChainIndex: (node.data as any)?.parentChainIndex,
          emptiedChains: (node.data as any)?.emptiedChains,
          validationState: (node.data as any)?.validationState,
        },
      })),
      connections: currentEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      })),
      status: currentWorkflow?.status || 'draft',
      created_at: currentWorkflow?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      visibility: currentWorkflow?.visibility,
      executions_count: currentWorkflow?.executions_count,
      created_by: currentWorkflow?.created_by,
      validationState: currentWorkflow?.validationState,
    } as Workflow

    const validationResult = validateWorkflowNodes(workflowSnapshot, ALL_NODE_COMPONENTS)

    const validationMap = new Map<string, any>()
    validationResult.nodes.forEach(node => {
      if (node.data?.validationState) {
        validationMap.set(node.id, node.data.validationState)
      }
    })

    setNodesInternal(existingNodes =>
      existingNodes.map(node => {
        const validationState = validationMap.get(node.id)
        if (!validationState) return node
        return {
          ...node,
          data: {
            ...(node.data as any),
            validationState,
          },
        }
      })
    )

    const configurationIssues: PreflightIssue[] = validationResult.nodes
      .filter(node => node.data?.validationState?.missingRequired?.length)
      .map(node => {
        const missing = node.data?.validationState?.missingRequired ?? []
        const title = node.data?.title || node.data?.label || node.data?.type || node.id
        return {
          type: 'configuration',
          nodeId: node.id,
          missingFields: missing,
          message: `${title} is missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
        }
      })

    const integrationIssues: PreflightIssue[] = []
    const providerNameMap = integrationHook.availableIntegrations?.reduce<Record<string, string>>((acc, integration) => {
      acc[integration.id] = integration.name
      return acc
    }, {}) ?? {}

    validationResult.nodes.forEach(node => {
      const component = ALL_NODE_COMPONENTS.find(c => c.type === node.data?.type)
      const providerId = node.data?.providerId || component?.providerId
      if (!providerId || ['core', 'logic', 'ai', 'manual', 'schedule'].includes(providerId)) {
        return
      }

      if (integrationHook.isIntegrationConnected && integrationHook.isIntegrationConnected(providerId)) {
        return
      }

      const providerName = providerNameMap[providerId] || INTEGRATION_CONFIGS[providerId]?.name || providerId
      const title = node.data?.title || component?.title || node.data?.type || node.id
      integrationIssues.push({
        type: 'integration',
        nodeId: node.id,
        providerId,
        message: `${providerName} connection required for ${title}`,
      })
    })

    const warnings: PreflightIssue[] = []
    validationResult.nodes.forEach(node => {
      if (node.data?.type === 'ai_message') {
        const config = node.data?.config || {}
        const contextIds: string[] = Array.isArray(config.contextNodeIds)
          ? config.contextNodeIds
          : typeof config.contextNodeIds === 'string'
            ? [config.contextNodeIds]
            : []

        const missingContext = contextIds.filter(id => !workflowSnapshot.nodes.some(n => n.id === id))
        if (missingContext.length > 0) {
          warnings.push({
            type: 'ai',
            nodeId: node.id,
            message: `AI Message “${node.data?.title || node.id}” references steps that no longer exist (${missingContext.join(', ')}).`,
          })
        }
      }
    })

    const issues = [...integrationIssues, ...configurationIssues]
    const result: PreflightResult = {
      issues,
      warnings,
      checkedAt: new Date().toISOString(),
    }

    setPreflightResult(result)

    if ((issues.length === 0 && warnings.length === 0 && openOnSuccess) || (issues.length > 0 && openOnFailure) || (issues.length === 0 && warnings.length > 0 && openOnSuccess)) {
      setIsPreflightDialogOpen(true)
    } else if (issues.length === 0 && warnings.length === 0 && !openOnSuccess) {
      setIsPreflightDialogOpen(false)
    }

    return {
      ok: issues.length === 0,
      issues,
      warnings,
    }
  }, [
    getNodes,
    getEdges,
    currentWorkflow?.id,
    currentWorkflow?.description,
    currentWorkflow?.organization_id,
    currentWorkflow?.status,
    currentWorkflow?.created_at,
    currentWorkflow?.updated_at,
    currentWorkflow?.executions_count,
    currentWorkflow?.created_by,
    currentWorkflow?.visibility,
    currentWorkflow?.user_id,
    workflowName,
    integrationHook.availableIntegrations,
    integrationHook.isIntegrationConnected,
  ])

  const openPreflightChecklist = useCallback(() => {
    setIsRunningPreflight(true)
    const result = runPreflightCheck({ openOnSuccess: true, openOnFailure: true })
    setIsRunningPreflight(false)
    if (result.ok && result.warnings.length === 0) {
      toast({
        title: "Preflight check passed",
        description: "All checks completed successfully.",
      })
    }
  }, [runPreflightCheck, toast])

  const handleNodeAddChain = useCallback((nodeId: string) => {
    console.log('🔗 Add chain to AI Agent:', nodeId)

    const aiAgentNode = nodesRef.current.find(n => n.id === nodeId)
    if (!aiAgentNode) {
      console.error('AI Agent node not found:', nodeId)
      return
    }

    // Find all existing chains for this AI Agent
    const existingChains = nodesRef.current.filter(n => n.data?.parentAIAgentId === nodeId)

    // Get the highest chain index
    const maxChainIndex = existingChains.reduce((max, node) => {
      const chainIndex = node.data?.parentChainIndex ?? -1
      return Math.max(max, chainIndex)
    }, -1)

    const newChainIndex = maxChainIndex + 1
    console.log('🔗 Creating chain placeholder for chain index:', newChainIndex)

    // Create chain placeholder node
    const chainPlaceholderId = `chain-placeholder-${nodeId}-${newChainIndex}-${Date.now()}`
    const clickHandler = () => handleAddActionClick(chainPlaceholderId, nodeId)
    addActionHandlersRef.current[chainPlaceholderId] = clickHandler

    // Find the first node in the first chain (chain 0) to determine Y position
    const firstChainFirstNode = existingChains
      .filter(n => n.data?.parentChainIndex === 0 && n.type !== 'chainPlaceholder' && n.type !== 'addAction')
      .sort((a, b) => a.position.y - b.position.y)[0]

    let yPosition: number
    if (firstChainFirstNode) {
      // Use the Y position of the first node in the first chain
      yPosition = firstChainFirstNode.position.y
    } else {
      // If no nodes in chain 0, use default position below AI Agent (consistent with addAction spacing)
      yPosition = aiAgentNode.position.y + 160
    }

    // Find the first node in the highest numbered existing chain to calculate X position
    // maxChainIndex is the highest chain index currently in use
    const highestChainNodes = existingChains
      .filter(n => n.data?.parentChainIndex === maxChainIndex && n.type !== 'addAction')
      .sort((a, b) => a.position.y - b.position.y)

    const highestChainFirstNode = highestChainNodes[0]

    let xPosition: number
    if (highestChainFirstNode) {
      // Place to the right of the highest chain's first node with a gap
      const nodeWidth = 480
      const horizontalGap = 80 // Small gap between chains
      xPosition = highestChainFirstNode.position.x + nodeWidth + horizontalGap
      console.log('🔗 Positioning to the right of chain', maxChainIndex, 'first node at X:', highestChainFirstNode.position.x, 'new X:', xPosition)
    } else {
      // If no existing chains, use AI Agent's X position
      xPosition = aiAgentNode.position.x
      console.log('🔗 No existing chains found, using AI Agent X:', xPosition)
    }

    console.log('🔗 Chain placeholder position:', { x: xPosition, y: yPosition, chainIndex: newChainIndex })

    const chainPlaceholderNode: Node = {
      id: chainPlaceholderId,
      type: 'chainPlaceholder',
      position: {
        x: xPosition,
        y: yPosition
      },
      draggable: false,
      selectable: false,
      data: {
        type: 'chainPlaceholder',
        parentId: nodeId,
        parentAIAgentId: nodeId,
        parentChainIndex: newChainIndex,
        onClick: clickHandler
      }
    }

    // Add the chain placeholder node
    setNodes(nds => [...nds, chainPlaceholderNode])

    // Add edge connecting AI Agent to chain placeholder
    const edgeId = `e-${nodeId}-${chainPlaceholderId}`
    setEdges(edges => [
      ...edges,
      {
        id: edgeId,
        source: nodeId,
        target: chainPlaceholderId,
        type: 'smoothstep',
        animated: false
      }
    ])

    console.log('🔗 Chain placeholder created:', chainPlaceholderId, 'for chain index:', newChainIndex)
  }, [setNodes, setEdges, handleAddActionClick])

  // Helper function to ensure only one Add Action node per chain
  const ensureOneAddActionPerChain = useCallback(() => {
    // Prevent infinite loops by using a guard
    if (isCleaningAddActionsRef.current) {
      // console.log('Skipping Add Action cleanup - already in progress')
      return
    }

    isCleaningAddActionsRef.current = true
    // console.log('Starting Add Action cleanup')

    const currentNodes = getNodes()
    const currentEdges = getEdges()

    // Find all nodes with outgoing connections to real nodes
    const nodesWithOutgoingConnections = new Set<string>()
    currentEdges.forEach(edge => {
      // Check if the target is a real node (not an Add Action or Insert Action)
      const targetNode = currentNodes.find(n => n.id === edge.target)
      if (targetNode && targetNode.type !== 'addAction' && targetNode.type !== 'insertAction') {
        nodesWithOutgoingConnections.add(edge.source)
      }
    })

    // Find all leaf nodes (nodes without outgoing connections to real nodes)
    const leafNodes = currentNodes.filter(node => {
      // Skip UI nodes
      if (node.type === 'addAction' || node.type === 'insertAction' || node.type === 'chainPlaceholder') {
        return false
      }
      // Skip AI Agent nodes (they get chain placeholders, not add actions)
      if (node.data?.type === 'ai_agent') {
        return false
      }
      // Include triggers and actions that have no outgoing connections to real nodes
      // Check multiple properties for trigger detection to handle different trigger structures
      const isTrigger = Boolean(node.data?.isTrigger || node.data?.nodeComponent?.isTrigger)
      const hasType = Boolean(node.data?.type)

      // Only consider nodes that are actual workflow nodes (triggers or actions)
      if (!isTrigger && !hasType) {
        return false
      }

      // A leaf node has no outgoing connections to real nodes
      return !nodesWithOutgoingConnections.has(node.id)
    })

    console.log('Leaf nodes for cleanup:', leafNodes.map(n => ({
      id: n.id,
      type: n.data?.type,
      'data.isTrigger': n.data?.isTrigger,
      'nodeComponent.isTrigger': n.data?.nodeComponent?.isTrigger,
      nodeType: n.type
    })))

    // Get all existing Add Action nodes
    const existingAddActions = currentNodes.filter(node => node.type === 'addAction')

    let nodesToRemove: string[] = []
    let nodesToAdd: Node[] = []
    let nodesToUpdate: Record<string, { x: number; y: number }> = {}
    let edgesToRemove: string[] = []
    let edgesToAdd: Edge[] = []

    // Remove all existing Add Action nodes that aren't after leaf nodes
    existingAddActions.forEach(addAction => {
      const parentId = addAction.data?.parentId
      const isAfterLeafNode = leafNodes.some(leaf => leaf.id === parentId)

      if (!isAfterLeafNode) {
        nodesToRemove.push(addAction.id)
        // Remove edges to/from this Add Action
        currentEdges.forEach(edge => {
          if (edge.source === addAction.id || edge.target === addAction.id) {
            edgesToRemove.push(edge.id)
          }
        })
      }
    })

    // Ensure each leaf node has exactly one Add Action after it
    leafNodes.forEach(leafNode => {
      const addActionId = `add-action-${leafNode.id}`
      const existingAddAction = currentNodes.find(n => n.id === addActionId)

      // If the Add Action doesn't exist or has wrong parent
      if (!existingAddAction || existingAddAction.data?.parentId !== leafNode.id) {
        const clickHandler = () => handleAddActionClick(addActionId, leafNode.id)
        addActionHandlersRef.current[addActionId] = clickHandler

        if (existingAddAction) {
          // Just needs to be removed, will be recreated
          nodesToRemove.push(existingAddAction.id)
        }

        // Create new Add Action
        // Center Add Action node (400px wide) below parent node (480px wide)
        // Keep same X position for vertical alignment
        // Use tighter spacing for AI agent chains (120px) vs regular nodes (160px)
        const isChainNode = Boolean(leafNode.data?.parentAIAgentId)
        const spacing = isChainNode ? 120 : 160
        const desiredPosition = {
          x: getCenteredAddActionX(leafNode),
          y: leafNode.position.y + spacing
        }

        nodesToAdd.push({
          id: addActionId,
          type: 'addAction',
          position: desiredPosition,
          draggable: false,
          selectable: false,
          data: {
            parentId: leafNode.id,
            onClick: clickHandler,
            ...(leafNode.data?.parentAIAgentId && {
              parentAIAgentId: leafNode.data.parentAIAgentId,
              parentChainIndex: leafNode.data.parentChainIndex
            })
          }
        })

        // Ensure edge exists from leaf node to Add Action
        const edgeId = `e-${leafNode.id}-${addActionId}`
        const edgeExists = currentEdges.some(e => e.id === edgeId || (e.source === leafNode.id && e.target === addActionId))

        if (!edgeExists) {
          edgesToAdd.push({
            id: edgeId,
            source: leafNode.id,
            target: addActionId,
            type: 'straight',
            animated: false,
            style: { stroke: '#9ca3af', strokeWidth: 1.5, strokeDasharray: '5 5', strokeLinecap: 'round' }
          })
        }
      } else {
        // Update existing Add Action position if needed
        const isChainNode = Boolean(leafNode.data?.parentAIAgentId)
        const spacing = isChainNode ? 120 : 160
        const desiredPosition = {
          x: getCenteredAddActionX(leafNode),
          y: leafNode.position.y + spacing
        }

        if (
          existingAddAction.position?.x !== desiredPosition.x ||
          existingAddAction.position?.y !== desiredPosition.y
        ) {
          nodesToUpdate[existingAddAction.id] = desiredPosition
        }
      }
    })

    // Apply node changes
    if (nodesToRemove.length > 0 || nodesToAdd.length > 0) {
      // console.log(`Removing ${nodesToRemove.length} Add Actions, adding ${nodesToAdd.length}`)
      setNodes(nds => {
        let filtered = nds.filter(n => !nodesToRemove.includes(n.id))
        filtered = filtered.map(n => {
          const update = nodesToUpdate[n.id]
          return update ? { ...n, position: { ...n.position, ...update } } : n
        })
        return [...filtered, ...nodesToAdd]
      })
    } else if (Object.keys(nodesToUpdate).length > 0) {
      // Only updates to existing nodes required
      setNodes(nds => nds.map(n => {
        const update = nodesToUpdate[n.id]
        if (update) {
          return { ...n, position: { ...n.position, ...update } }
        }
        return n
      }))
    }

    // Apply edge changes
    if (edgesToRemove.length > 0) {
      setEdges(eds => eds.filter(e => !edgesToRemove.includes(e.id)))
    }
    if (edgesToAdd.length > 0) {
      setEdges(eds => [...eds, ...edgesToAdd])
    }

    // Reset the guard flag after a short delay
    setTimeout(() => {
      isCleaningAddActionsRef.current = false
      // console.log('Add Action cleanup complete')
    }, 300)
  }, [getNodes, getEdges, setNodes, setEdges, handleAddActionClick])

  // Now we can define the actual undo/redo implementation
  useEffect(() => {
    handleUndoRef.current = () => {
      const previousState = historyHook.undo()
      if (previousState) {
        // Restore nodes and edges from history
        setNodes(previousState.nodes)
        setEdges(previousState.edges)

        // Re-add UI nodes after restoring
        setTimeout(() => {
          ensureOneAddActionPerChain()
        }, 50)

        setHasUnsavedChanges(true)
        toast({
          title: "Undo",
          description: "Action undone",
        })
      }
    }

    handleRedoRef.current = () => {
      const nextState = historyHook.redo()
      if (nextState) {
        // Restore nodes and edges from history
        setNodes(nextState.nodes)
        setEdges(nextState.edges)

        // Re-add UI nodes after restoring
        setTimeout(() => {
          ensureOneAddActionPerChain()
        }, 50)

        setHasUnsavedChanges(true)
        toast({
          title: "Redo",
          description: "Action redone",
        })
      }
    }
  }, [historyHook, setNodes, setEdges, ensureOneAddActionPerChain, toast, setHasUnsavedChanges])

  // Track changes for undo/redo
  const trackChange = useCallback((newNodes?: Node[], newEdges?: Edge[]) => {
    const nodesToTrack = newNodes || nodes
    const edgesToTrack = newEdges || edges
    historyHook.pushState(nodesToTrack, edgesToTrack)
  }, [nodes, edges, historyHook])

  // Set trackChange ref
  useEffect(() => {
    trackChangeRef.current = trackChange
  }, [trackChange])

  // We'll define these handlers later after ensureOneAddActionPerChain is available
  // For now, just create placeholder functions that will be updated
  const handleUndo = useCallback(() => {
    if (!handleUndoRef.current) {
      console.log('Undo handler not yet initialized')
      return
    }
    handleUndoRef.current()
  }, [])

  const handleRedo = useCallback(() => {
    if (!handleRedoRef.current) {
      console.log('Redo handler not yet initialized')
      return
    }
    handleRedoRef.current()
  }, [])

  // Keyboard shortcuts for undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0
      const ctrlOrCmd = isMac ? e.metaKey : e.ctrlKey

      if (ctrlOrCmd && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        handleUndo()
      } else if ((ctrlOrCmd && e.key === 'y') || (ctrlOrCmd && e.shiftKey && e.key === 'z')) {
        e.preventDefault()
        handleRedo()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleUndo, handleRedo])

  // Load workflow when ID changes
  useEffect(() => {
    if (workflowId && workflows && workflows.length > 0) {
      const workflow = workflows.find(w => w.id === workflowId)
      if (workflow) {
        // Clear history when loading a new workflow
        historyHook.clearHistory()

        setCurrentWorkflow(workflow)
        setWorkflowName(workflow.name)
        setWorkflowDescription(workflow.description || "")
        
        // Convert workflow nodes and connections to React Flow format
        let allNodes: Node[] = []
        let addActionNodeData: { id: string, parentId: string } | null = null
        
        if (workflow.nodes) {
          // Sanitize: drop any UI-only or malformed nodes that can appear from older saves
          const sanitizedNodes = (workflow.nodes as WorkflowNode[]).filter((node: any) => {
            // Remove placeholder UI nodes by type or id pattern
            if (node?.type === 'addAction') return false
            if (typeof node?.id === 'string' && node.id.startsWith('add-action-')) return false
            // Remove nodes with no actionable type (but keep triggers explicitly marked)
            const hasType = Boolean(node?.data?.type)
            const isTrigger = Boolean(node?.data?.isTrigger)
            return hasType || isTrigger
          })

          const flowNodes = sanitizedNodes.map((node: WorkflowNode) => ({
            id: node.id,
            type: node.type || 'custom',
            position: node.position,
            data: {
              ...node.data,
              // Ensure providerId is set for proper logo display
              providerId: (() => {
                // First check if providerId is already set
                if (node.data?.providerId) return node.data.providerId
                
                // Try to extract from type
                const type = node.data?.type
                if (!type) return null
                
                // Handle different type formats
                if (type.includes('_trigger_')) {
                  return type.split('_')[0] // gmail_trigger_new_email -> gmail
                } else if (type.includes('_')) {
                  return type.split('_')[0] // gmail_send -> gmail
                } else if (type.includes(':')) {
                  return type.split(':')[0] // google-drive:upload -> google-drive
                }
                
                // Look up the component to get providerId
                const component = ALL_NODE_COMPONENTS.find(c => c.type === type)
                return component?.providerId || null
              })(),
              // Ensure a human-readable title exists for actions; fallback to component title or type
              title: (() => {
                const existing = (node.data as any)?.title
                if (existing && typeof existing === 'string' && existing.trim().length > 0) return existing
                const comp = ALL_NODE_COMPONENTS.find(c => c.type === (node.data as any)?.type)
                return comp?.title || (node.data as any)?.type || 'Unnamed Action'
              })(),
              onConfigure: handleNodeConfigure,
              onDelete: handleNodeDelete,
              onEditingStateChange: handleNodeEditingStateChange,
              onRename: handleNodeRename,
              onAddChain: node.data?.type === 'ai_agent' ? handleNodeAddChain : undefined
            }
          }))

          // Normalize spacing for AI agent chain nodes
          // This ensures consistent spacing even if workflow was saved with old spacing values
          const aiAgentIds = new Set(
            flowNodes.filter((n: any) => n.data?.type === 'ai_agent').map((n: any) => n.id)
          )

          // Group chain nodes by AI agent and chain index
          const chainNodesByAgent = new Map<string, Map<number, any[]>>()
          flowNodes.forEach((node: any) => {
            if (node.data?.parentAIAgentId && aiAgentIds.has(node.data.parentAIAgentId)) {
              const agentId = node.data.parentAIAgentId
              const chainIndex = node.data.parentChainIndex ?? 0

              if (!chainNodesByAgent.has(agentId)) {
                chainNodesByAgent.set(agentId, new Map())
              }
              const chainMap = chainNodesByAgent.get(agentId)!
              if (!chainMap.has(chainIndex)) {
                chainMap.set(chainIndex, [])
              }
              chainMap.get(chainIndex)!.push(node)
            }
          })

          // Recalculate positions for each chain
          chainNodesByAgent.forEach((chainMap, agentId) => {
            const aiAgentNode = flowNodes.find((n: any) => n.id === agentId)
            if (!aiAgentNode) return

            chainMap.forEach((chainNodes, chainIndex) => {
              // Sort by Y position
              chainNodes.sort((a, b) => a.position.y - b.position.y)

              // Recalculate Y positions with 120px spacing
              chainNodes.forEach((node, index) => {
                node.position.y = aiAgentNode.position.y + 160 + (index * 120)
              })
            })
          })

          // Add AddActionNodes only after TRUE leaf nodes (end of each chain)
          allNodes = [...flowNodes]

          // Find leaf nodes - nodes that don't have outgoing connections to other real nodes
          const edgesToCheck = workflow.connections || []
          const nodesWithOutgoingConnections = new Set<string>()

          edgesToCheck.forEach((conn: WorkflowConnection) => {
            // A node has an outgoing connection if:
            // 1. It's the source of a connection
            // 2. The target is NOT an Add Action node or Insert Action node
            // 3. The target actually exists in our nodes
            if (conn.source && conn.target) {
              const targetNode = flowNodes.find((n: any) => n.id === conn.target)
              // Only count it as an outgoing connection if the target is a real action/trigger node
              if (targetNode && targetNode.type !== 'addAction' && targetNode.type !== 'insertAction') {
                nodesWithOutgoingConnections.add(conn.source)
              }
            }
          })

          // Find all leaf nodes (nodes without outgoing connections to real nodes)
          const leafNodes = flowNodes.filter((node: any) => {
            // Skip existing addAction, insertAction, and chainPlaceholder nodes
            if (node.type === 'addAction' || node.type === 'insertAction' || node.type === 'chainPlaceholder') {
              return false
            }
            // Skip AI Agent nodes (they get chain placeholders, not add actions)
            if (node.data?.type === 'ai_agent') {
              return false
            }
            // Include triggers and actions that have no outgoing connections to real nodes
            const isTrigger = Boolean(node.data?.isTrigger)
            const hasType = Boolean(node.data?.type)

            // Only consider nodes that are actual workflow nodes (triggers or actions)
            if (!isTrigger && !hasType) {
              return false
            }

            // A leaf node is one that has no outgoing connections to real nodes
            return !nodesWithOutgoingConnections.has(node.id)
          })

          // console.log('Leaf nodes found:', leafNodes.map((n: any) => ({
          //   id: n.id,
          //   type: n.data?.type,
          //   isTrigger: n.data?.isTrigger,
          //   nodeType: n.type
          // })))

          // Add Add Action button after each leaf node
          const addActionNodes: Node[] = []
          const addActionEdges: any[] = []

          leafNodes.forEach((leafNode: any) => {
            const addActionId = `add-action-${leafNode.id}`
            // console.log('Creating AddActionNode for leaf:', addActionId, 'after node:', leafNode.id)

            // Store the handler in ref
            const clickHandler = () => handleAddActionClick(addActionId, leafNode.id)
            addActionHandlersRef.current[addActionId] = clickHandler

            // Use tighter spacing for AI agent chains (120px) vs regular nodes (160px)
            const isChainNode = Boolean(leafNode.data?.parentAIAgentId)
            const spacing = isChainNode ? 120 : 160

            const addActionNode: Node = {
              id: addActionId,
              type: 'addAction',
              position: {
                x: getCenteredAddActionX(leafNode),
                y: leafNode.position.y + spacing
              },
              draggable: false,
              selectable: false,
              data: {
                parentId: leafNode.id,
                onClick: clickHandler,
                // Preserve AI agent chain metadata if present
                ...(leafNode.data?.parentAIAgentId && {
                  parentAIAgentId: leafNode.data.parentAIAgentId,
                  parentChainIndex: leafNode.data.parentChainIndex
                })
              }
            }
            addActionNodes.push(addActionNode)

            // Add edge to connect leaf node to Add Action
            const edgeId = `e-${leafNode.id}-add-${Date.now()}`
            addActionEdges.push({
              id: edgeId,
              source: leafNode.id,
              target: addActionId,
              parentId: leafNode.id
            })
          })
          
          // Also add chain placeholders for AI Agent nodes that don't have chains
          const aiAgentNodes = flowNodes.filter((node: any) => node.data?.type === 'ai_agent')

          aiAgentNodes.forEach((aiAgentNode: any) => {
            // Check if this AI Agent already has child nodes (chains)
            const hasChains = flowNodes.some((n: any) => n.data?.parentAIAgentId === aiAgentNode.id)

            if (!hasChains) {
              const chainPlaceholderId = `chain-placeholder-${aiAgentNode.id}`
              // console.log('Creating ChainPlaceholder for AI Agent:', chainPlaceholderId)

              // Store the handler in ref
              const clickHandler = () => handleAddActionClick(chainPlaceholderId, aiAgentNode.id)
              addActionHandlersRef.current[chainPlaceholderId] = clickHandler

              const chainPlaceholderNode: Node = {
                id: chainPlaceholderId,
                type: 'chainPlaceholder',
                position: {
                  x: aiAgentNode.position.x, // Same width (480px) as AI Agent - no offset needed
                  y: aiAgentNode.position.y + 160
                },
                draggable: false,
                selectable: false,
                data: {
                  parentId: aiAgentNode.id,
                  parentAIAgentId: aiAgentNode.id,
                  onClick: clickHandler
                }
              }
              addActionNodes.push(chainPlaceholderNode)

              // Add edge to connect AI Agent to chain placeholder
              const edgeId = `e-${aiAgentNode.id}-${chainPlaceholderId}`
              addActionEdges.push({
                id: edgeId,
                source: aiAgentNode.id,
                target: chainPlaceholderId,
                parentId: aiAgentNode.id
              })
            }
          })

          allNodes.push(...addActionNodes)
          addActionNodeData = addActionEdges.length > 0 ? addActionEdges : null

          setNodes(allNodes)
        }
        
        if (workflow.connections) {
          // Filter out edges that reference nodes we filtered out above
          const validNodeIds = new Set(allNodes.map(n => n.id))
          const seenEdgeKey = new Set<string>()
          const seenIds = new Set<string>()
          const flowEdges = [] as any[]
          for (const conn of workflow.connections as WorkflowConnection[]) {
            if (!conn?.source || !conn?.target) continue
            // Skip edges to/from AddActionNodes (they should be created dynamically)
            if (conn.source.includes('add-action') || conn.target.includes('add-action')) {
              // console.log('Skipping saved AddActionNode edge:', conn.id)
              continue
            }
            if (!validNodeIds.has(conn.source) || !validNodeIds.has(conn.target)) continue
            const key = `${conn.source}->${conn.target}`
            if (seenEdgeKey.has(key)) continue
            seenEdgeKey.add(key)
            let id = conn.id || `e-${conn.source}-${conn.target}`
            if (seenIds.has(id)) {
              id = `e-${conn.source}-${conn.target}-${Date.now()}-${Math.random().toString(36).slice(2,6)}`
            }
            seenIds.add(id)
            flowEdges.push({
              id,
              source: conn.source,
              target: conn.target,
              type: (conn as any).type || 'custom',
              animated: (conn as any).animated ?? false,
              style: (conn as any).style || {
                stroke: "#9ca3af",
                strokeWidth: 2,
                strokeLinecap: "round",
                strokeLinejoin: "round"
              }
            })
          }
          
          // Add edges to AddActionNodes if we created them
          if (addActionNodeData && Array.isArray(addActionNodeData)) {
            addActionNodeData.forEach(edgeData => {
              // Check if edge already exists (avoid duplicates)
              const edgeKey = `${edgeData.source}->${edgeData.target}`
              if (!seenEdgeKey.has(edgeKey)) {
                seenEdgeKey.add(edgeKey)
                flowEdges.push({
                  id: edgeData.id,
                  source: edgeData.source,
                  target: edgeData.target,
                  type: 'straight',
                  animated: false,
                  style: {
                    stroke: "#9ca3af",
                    strokeWidth: 1.5,
                    strokeDasharray: "5 5", // Make it dotted
                    strokeLinecap: "round"
                  }
                })
              }
            })
          }
          
          setEdges(flowEdges)
        }

        // Push initial state to history after loading
        setTimeout(() => {
          const currentNodes = getNodes()
          const currentEdges = getEdges()
          if (currentNodes.length > 0) {
            historyHook.pushState(currentNodes, currentEdges)
          }
        }, 200)

        // Join collaboration
        joinCollaboration(workflowId)
        
        // Set workflow for error tracking
        setErrorStoreWorkflow(workflow)
        
        // Fit view after loading with offset to prevent nodes from going under top UI
        setTimeout(() => {
          fitView({
            padding: 0.2,
            includeHiddenNodes: false,
            minZoom: 0.5,
            maxZoom: 2,
            offset: { x: 0, y: 40 }
          })

          // Don't run cleanup automatically to avoid interfering with normal operations
          // The workflow loading already creates Add Actions correctly
        }, 100)
      }
    }
    
    return () => {
      if (workflowId) {
        leaveCollaboration(workflowId)
      }
    }
  }, [workflowId, workflows, setCurrentWorkflow, setNodes, setEdges, joinCollaboration, leaveCollaboration, setErrorStoreWorkflow, fitView, setWorkflowName, setWorkflowDescription])

  useEffect(() => {
    if (!isTemplateEditing || !editTemplateId) {
      templateLoadStateRef.current = null
      return
    }

    const currentState = templateLoadStateRef.current

    if (currentState?.id === editTemplateId) {
      if (currentState.status === "pending") {
        return
      }
      if (currentState.status === "fulfilled" || currentState.status === "rejected") {
        setIsTemplateLoading(false)
        return
      }
    }

    const abortController = new AbortController()
    let isCancelled = false

    templateLoadStateRef.current = { id: editTemplateId, status: "pending" }
    setIsTemplateLoading(true)

    const loadTemplateForEditing = async () => {
      try {
        historyHook.clearHistory()

        const response = await fetch(`/api/templates/${editTemplateId}`, {
          signal: abortController.signal
        })

        if (!response.ok) {
          const errorBody = await response.json().catch(() => ({}))
          throw new Error(errorBody.error || `Failed to load template (${response.status})`)
        }

        const payload = await response.json()
        if (isCancelled || abortController.signal.aborted) {
          return
        }

        const templateRecord = payload.template || {}
        const rawNodes: WorkflowNode[] = Array.isArray(payload.nodes)
          ? payload.nodes
          : Array.isArray(templateRecord.nodes)
            ? templateRecord.nodes
            : []
        const rawConnections: WorkflowConnection[] = Array.isArray(payload.connections)
          ? payload.connections
          : Array.isArray(templateRecord.connections)
            ? templateRecord.connections
            : []

        const sanitizedNodes = rawNodes.filter((node: any) => {
          if (!node) return false
          const nodeType = node?.data?.type || node?.type
          if (nodeType === 'addAction' || nodeType === 'insertAction' || nodeType === 'chain_placeholder') {
            return false
          }
          if (node?.type === 'addAction' || node?.type === 'insertAction' || node?.type === 'chainPlaceholder') {
            return false
          }
          if (typeof node?.id === 'string' && (node.id.startsWith('add-action-') || node.id.startsWith('chain-placeholder-'))) {
            return false
          }
          if (node?.data?.isPlaceholder) {
            return false
          }
          const hasType = Boolean(node?.data?.type)
          const isTrigger = Boolean(node?.data?.isTrigger)
          return hasType || isTrigger
        }) as WorkflowNode[]

        const flowNodes: Node[] = sanitizedNodes.map((node: WorkflowNode) => {
          const safeData = node.data || {}
          return {
            id: node.id,
            type: node.type || 'custom',
            position: node.position || { x: 0, y: 0 },
            data: {
              ...safeData,
              providerId: (() => {
                if (safeData.providerId) return safeData.providerId
                const type = safeData.type
                if (!type || typeof type !== 'string') return null
                if (type.includes('_trigger_')) {
                  return type.split('_')[0]
                }
                if (type.includes('_')) {
                  return type.split('_')[0]
                }
                if (type.includes(':')) {
                  return type.split(':')[0]
                }
                const component = ALL_NODE_COMPONENTS.find(c => c.type === type)
                return component?.providerId || null
              })(),
              title: (() => {
                const existing = safeData.title
                if (existing && typeof existing === 'string' && existing.trim().length > 0) {
                  return existing
                }
                const comp = ALL_NODE_COMPONENTS.find(c => c.type === safeData.type)
                return comp?.title || safeData.type || (safeData.isTrigger ? 'Trigger' : 'Unnamed Action')
              })(),
              onConfigure: handleNodeConfigure,
              onDelete: handleNodeDelete,
              onEditingStateChange: handleNodeEditingStateChange,
              onRename: handleNodeRename,
              onAddChain: safeData.type === 'ai_agent' ? handleNodeAddChain : undefined
            }
          }
        })

        setNodes(flowNodes)

        const validNodeIds = new Set(flowNodes.map(node => node.id))
        const seenEdgeKey = new Set<string>()
        const seenIds = new Set<string>()
        const flowEdges: Edge[] = []

        rawConnections.forEach((conn: WorkflowConnection) => {
          if (!conn?.source || !conn?.target) return
          if (conn.source.includes('add-action') || conn.target.includes('add-action')) return
          if (!validNodeIds.has(conn.source) || !validNodeIds.has(conn.target)) return

          const edgeKey = `${conn.source}->${conn.target}`
          if (seenEdgeKey.has(edgeKey)) return
          seenEdgeKey.add(edgeKey)

          let id = conn.id || `e-${conn.source}-${conn.target}`
          if (seenIds.has(id)) {
            id = `e-${conn.source}-${conn.target}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
          }
          seenIds.add(id)

          flowEdges.push({
            id,
            source: conn.source,
            target: conn.target,
            type: (conn as any)?.type || 'custom',
            animated: (conn as any)?.animated ?? false,
            style: (conn as any)?.style || {
              stroke: "#9ca3af",
              strokeWidth: 2,
              strokeLinecap: "round",
              strokeLinejoin: "round"
            }
          })
        })

        setEdges(flowEdges)

        setWorkflowName(templateRecord.name || "Untitled Template")
        setWorkflowDescription(templateRecord.description || "")
        setHasUnsavedChanges(false)

        const templateWorkflow: Workflow = {
          id: templateRecord.id || editTemplateId,
          name: templateRecord.name || "Untitled Template",
          description: templateRecord.description || "",
          user_id: templateRecord.created_by || templateRecord.user_id || templateRecord.author_id || "",
          nodes: sanitizedNodes,
          connections: rawConnections,
          status: 'template_draft',
          created_at: templateRecord.created_at || new Date().toISOString(),
          updated_at: templateRecord.updated_at || new Date().toISOString(),
        }

        setCurrentWorkflow(templateWorkflow)
        setErrorStoreWorkflow(templateWorkflow)
        templateLoadStateRef.current = { id: editTemplateId, status: "fulfilled" }

        const safeRun = (fn: () => void, delay: number) => {
          setTimeout(() => {
            if (isCancelled || abortController.signal.aborted) return
            fn()
          }, delay)
        }

        safeRun(() => {
          ensureOneAddActionPerChain()
        }, 50)

        safeRun(() => {
          const currentNodesSnapshot = getNodes()
          const currentEdgesSnapshot = getEdges()
          if (currentNodesSnapshot.length > 0) {
            historyHook.pushState(currentNodesSnapshot, currentEdgesSnapshot)
          }
        }, 200)

        safeRun(() => {
          fitView({
            padding: 0.2,
            includeHiddenNodes: false,
            minZoom: 0.5,
            maxZoom: 2,
            offset: { x: 0, y: 40 }
          })
        }, 150)
      } catch (error: any) {
        if (isCancelled || abortController.signal.aborted) {
          return
        }
        templateLoadStateRef.current = { id: editTemplateId, status: "rejected" }
        console.error('Failed to load template for editing:', error)
        toast({
          title: "Error",
          description: error?.message || "Failed to load template",
          variant: "destructive",
        })
      } finally {
        if (!isCancelled && !abortController.signal.aborted) {
          setIsTemplateLoading(false)
        }
      }
    }

    void loadTemplateForEditing()

    return () => {
      isCancelled = true
      abortController.abort()
      const state = templateLoadStateRef.current
      if (state?.id === editTemplateId && state.status === "pending") {
        templateLoadStateRef.current = null
      }
    }
    // We intentionally limit dependencies to avoid effect loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTemplateEditing, editTemplateId])

  useEffect(() => {
    if (!currentWorkflow?.id) return
    if (currentWorkflow.name === workflowName) return

    const updatedWorkflow = { ...currentWorkflow, name: workflowName }
    setCurrentWorkflow(updatedWorkflow)
    useWorkflowStore.setState((state) => ({
      workflows: state.workflows.map((workflow) =>
        workflow.id === updatedWorkflow.id ? { ...workflow, name: workflowName } : workflow
      )
    }))
  }, [currentWorkflow?.id, currentWorkflow?.name, workflowName, setCurrentWorkflow])

  // Handle save
  const handleSave = useCallback(async () => {
    const currentNodes = getNodes()
    const currentEdges = getEdges()

    const placeholderNodeIds = new Set(
      currentNodes
        .filter(n =>
          n.type === 'addAction' ||
          n.type === 'chainPlaceholder' ||
          (typeof n.id === 'string' && (n.id.startsWith('add-action-') || n.id.startsWith('chain-placeholder-')))
        )
        .map(n => n.id)
    )

    const persistedNodes = currentNodes.filter(n => !placeholderNodeIds.has(n.id))
    const persistedEdges = currentEdges.filter(e =>
      !placeholderNodeIds.has(e.source) &&
      !placeholderNodeIds.has(e.target) &&
      !e.target.includes('add-action') &&
      !e.source.includes('add-action')
    )

    const workflowNodes: WorkflowNode[] = persistedNodes.map(node => ({
      id: node.id,
      type: node.type || 'custom',
      position: node.position,
      data: node.data,
    }))

    const workflowConnections: WorkflowConnection[] = persistedEdges.map(edge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
    }))

    if (isTemplateEditing) {
      if (!editTemplateId) {
        toast({
          title: "Error",
          description: "Missing template identifier",
          variant: "destructive",
        })
        return
      }

      try {
        setIsSaving(true)

        const response = await fetch(`/api/templates/${editTemplateId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            nodes: workflowNodes,
            connections: workflowConnections,
            name: workflowName,
            description: workflowDescription,
          }),
        })

        const body = await response.json().catch(() => ({}))
        if (!response.ok) {
          throw new Error(body.error || 'Failed to update template')
        }

        const updatedTemplate = body?.template || {}
        const updatedNodes = Array.isArray(updatedTemplate.nodes) ? (updatedTemplate.nodes as WorkflowNode[]) : workflowNodes
        const updatedConnections = Array.isArray(updatedTemplate.connections) ? (updatedTemplate.connections as WorkflowConnection[]) : workflowConnections

        if (currentWorkflow) {
          setCurrentWorkflow({
            ...currentWorkflow,
            name: workflowName,
            description: workflowDescription,
            nodes: updatedNodes,
            connections: updatedConnections,
            updated_at: new Date().toISOString(),
          })
        }

        templateLoadStateRef.current = { id: editTemplateId, status: "fulfilled" }

        justSavedRef.current = true
        setHasUnsavedChanges(false)
        setTimeout(() => {
          justSavedRef.current = false
        }, 500)

        toast({
          title: "Template saved",
          description: "Template updated successfully",
        })
      } catch (error: any) {
        console.error('Error updating template:', error)
        setHasUnsavedChanges(true)
        toast({
          title: "Error",
          description: error?.message || "Failed to update template",
          variant: "destructive",
        })
      } finally {
        setIsSaving(false)
      }

      return
    }

    if (!currentWorkflow?.id) {
      toast({
        title: "Error",
        description: "No workflow to save",
        variant: "destructive",
      })
      return
    }

    try {
      setIsSaving(true)

      await updateWorkflow(currentWorkflow.id, {
        name: workflowName,
        description: workflowDescription,
        nodes: workflowNodes,
        connections: workflowConnections,
      })

      justSavedRef.current = true
      setHasUnsavedChanges(false)

      setTimeout(() => {
        justSavedRef.current = false
      }, 500)

      if (editTemplateId) {
        try {
          const response = await fetch(`/api/templates/${editTemplateId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              nodes: workflowNodes,
              connections: workflowConnections,
            }),
          })

          const errorBody = !response.ok ? await response.json().catch(() => ({})) : null
          if (!response.ok) {
            throw new Error(errorBody?.error || 'Failed to update template')
          }

          toast({
            title: "Success",
            description: "Workflow and template saved successfully",
          })
        } catch (templateError) {
          console.error('Error updating template:', templateError)
          toast({
            title: "Warning",
            description: "Workflow saved, but failed to update template",
            variant: "destructive",
          })
        }
      } else {
        toast({
          title: "Success",
          description: "Workflow saved successfully",
        })
      }
    } catch (error) {
      console.error('Error saving workflow:', error)
      toast({
        title: "Error",
        description: "Failed to save workflow",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }, [currentWorkflow, getNodes, getEdges, workflowName, workflowDescription, updateWorkflow, toast, editTemplateId, setCurrentWorkflow, setHasUnsavedChanges, isTemplateEditing])

  // Handle toggling workflow live status
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  
  const handleToggleLive = useCallback(async () => {
    if (isTemplateEditing) {
      toast({
        title: "Unavailable",
        description: "Templates cannot be activated",
        variant: "destructive",
      })
      return
    }

    if (!currentWorkflow?.id) {
      toast({
        title: "Error",
        description: "No workflow to activate",
        variant: "destructive",
      })
      return
    }

    if (hasUnsavedChanges) {
      toast({
        title: "Save Required",
        description: "Please save your changes before activating the workflow",
        variant: "destructive",
      })
      return
    }

    // Check for nodes with missing required fields (only when activating, not deactivating)
    if (currentWorkflow.status !== 'active') {
      const nodesWithErrors = nodes.filter(node => {
        const validationState = node.data?.validationState
        if (!validationState || validationState.isValid) return false

        // Check if there are missing required fields
        const missingFields = validationState.missingRequired || []
        const allRequiredFields = validationState.allRequiredFields || []

        return missingFields.length > 0 || allRequiredFields.length > 0
      })

      if (nodesWithErrors.length > 0) {
        const nodeNames = nodesWithErrors
          .map(n => n.data?.title || n.data?.type || 'Unknown')
          .join(', ')

        toast({
          title: "Missing Required Fields",
          description: `Cannot activate workflow. The following nodes have missing required fields: ${nodeNames}. Please configure all required fields before activating.`,
          variant: "destructive",
        })
        return
      }
    }

    try {
      setIsUpdatingStatus(true)

      const newStatus = currentWorkflow.status === 'active' ? 'paused' : 'active'

      console.log('Updating workflow status:', {
        workflowId: currentWorkflow.id,
        currentStatus: currentWorkflow.status,
        newStatus: newStatus
      })

      // Use the API endpoint instead of direct Supabase update
      // This ensures webhook registration happens when activating
      const response = await fetch(`/api/workflows/${currentWorkflow.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: newStatus,
          nodes: currentWorkflow.nodes || nodes,
          connections: currentWorkflow.connections || edges
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update workflow status')
      }

      const data = await response.json()
      console.log('Update result:', data)

      // Check if there was a trigger activation error (API returns 200 but rolls back status)
      if (data.triggerActivationError) {
        console.error('Trigger activation failed:', data.triggerActivationError)

        // Update with the actual status from the response (rolled back to paused)
        setCurrentWorkflow({
          ...currentWorkflow,
          ...data
        })

        toast({
          title: "Activation Failed",
          description: data.triggerActivationError.message || "Failed to activate workflow triggers",
          variant: "destructive",
        })
        return
      }

      // Update the local state with the actual status from response
      setCurrentWorkflow({
        ...currentWorkflow,
        ...data
      })

      toast({
        title: "Success",
        description: `Workflow ${data.status === 'active' ? 'is now live' : 'has been paused'}`,
        variant: data.status === 'active' ? 'default' : 'secondary',
      })
    } catch (error: any) {
      console.error('Error updating workflow status:', error)
      console.error('Error type:', typeof error)
      console.error('Error keys:', error ? Object.keys(error) : 'null')
      toast({
        title: "Error",
        description: error?.message || "Failed to update workflow status",
        variant: "destructive",
      })
    } finally {
      setIsUpdatingStatus(false)
    }
  }, [currentWorkflow, hasUnsavedChanges, setCurrentWorkflow, toast, nodes, edges, isTemplateEditing])

  // Use refs for undo/redo handlers to avoid initialization issues
  const handleUndoRef = useRef<(() => void) | null>(null)
  const handleRedoRef = useRef<(() => void) | null>(null)
  const trackChangeRef = useRef<((newNodes?: Node[], newEdges?: Edge[]) => void) | null>(null)

  // Handle node connection
  const onConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target) return

    const newEdge: Edge = {
      id: `${params.source}-${params.target}`,
      source: params.source,
      target: params.target,
      type: 'custom',
      animated: false,
      style: { stroke: "#9ca3af", strokeWidth: 2, strokeLinecap: "round" }
    }

    setEdges((eds) => {
      const newEdges = [...eds, newEdge]
      // Track change after edge is added
      setTimeout(() => trackChangeRef.current?.(nodes, newEdges), 100)
      return newEdges
    })
    markAsUnsaved()
  }, [setEdges, nodes, trackChange, markAsUnsaved])

  // Process edges to add handleAddNodeBetween and selection styling
  const processedEdges = useMemo(() => {
    return edges.map(edge => {
      // Add selected styling
      const isSelected = edge.id === selectedEdgeId
      const edgeStyle = {
        ...edge.style,
        stroke: isSelected ? '#3b82f6' : edge.style?.stroke || '#9ca3af',
        strokeWidth: isSelected ? 3 : edge.style?.strokeWidth || 2,
        strokeLinecap: 'round' as const,
        strokeLinejoin: 'round' as const,
      }

      if (edge.type === 'custom') {
        // Don't add insert button if target is an Add Action node
        const targetNode = nodes.find(n => n.id === edge.target)
        const isTargetAddAction = targetNode?.type === 'addAction'

        return {
          ...edge,
          style: edgeStyle,
          data: {
            ...edge.data,
            // Only add onAddNode handler if target is not an Add Action node
            ...(isTargetAddAction ? {} : {
              onAddNode: () => {
                // Use the edge's source and target directly
                const sourceId = edge.source
                const targetId = edge.target

                // console.log('🔶 [Edge Button] Add node between', sourceId, 'and', targetId)

                // This would open the action dialog with the appropriate context
                dialogsHook.setSourceAddNode({
                  id: `insert-${Date.now()}`,
                  parentId: sourceId,
                  insertBefore: targetId
                })
                dialogsHook.setSelectedIntegration(null)
                dialogsHook.setSelectedAction(null)
                dialogsHook.setSearchQuery("")
                dialogsHook.setShowActionDialog(true)

                // console.log('Dialog should now be open, showActionDialog:', dialogsHook.showActionDialog)
              }
            })
          }
        }
      }
      // Return edge with selected styling for non-custom edges
      return {
        ...edge,
        style: edgeStyle
      }
    })
  }, [edges, nodes, dialogsHook, selectedEdgeId])

  // Determine loading state with timeout protection
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null)
  const MAX_LOADING_TIME = 15000 // 15 seconds max loading time

  const shouldShowLoading = () => {
    if (isTemplateEditing && isTemplateLoading) {
      if (loadingStartTime && Date.now() - loadingStartTime > MAX_LOADING_TIME) {
        console.warn('[WorkflowBuilder] Template loading timeout reached, hiding loading screen')
        return false
      }
      return true
    }
    // If we have a workflow ID but no current workflow, we're loading
    if (workflowId && !currentWorkflow) {
      // But not if we've been loading for too long
      if (loadingStartTime && Date.now() - loadingStartTime > MAX_LOADING_TIME) {
        console.warn('[WorkflowBuilder] Loading timeout reached, hiding loading screen')
        return false
      }
      return true
    }
    // Only show loading for integrations if we have no workflows yet
    if (integrationsLoading && workflows.length === 0) {
      if (loadingStartTime && Date.now() - loadingStartTime > MAX_LOADING_TIME) {
        return false
      }
      return true
    }
    // Show loading if workflows are loading and we don't have a current workflow
    if (workflowLoading && !currentWorkflow) {
      if (loadingStartTime && Date.now() - loadingStartTime > MAX_LOADING_TIME) {
        return false
      }
      return true
    }
    return false
  }

  const isLoading = shouldShowLoading()

  // Track when loading starts
  useEffect(() => {
    if (isLoading && !loadingStartTime) {
      setLoadingStartTime(Date.now())
    } else if (!isLoading && loadingStartTime) {
      setLoadingStartTime(null)
    }
  }, [isLoading, loadingStartTime])
  // Failsafe: never let the Save spinner get stuck indefinitely
  useEffect(() => {
    if (!isSaving) return
    const timeoutId = setTimeout(() => {
      // If we are still saving after the timeout, force-clear and notify
      setIsSaving(false)
      console.warn('[Workflow Builder] Save operation took too long; clearing loading state')
    }, 20000)
    return () => clearTimeout(timeoutId)
  }, [isSaving])


  // Track loading state changes
  useEffect(() => {
    if (isLoading && !hasShownLoading) {
      setHasShownLoading(true)
    } else if (!isLoading && hasShownLoading) {
      setHasShownLoading(false)
    }
  }, [isLoading, hasShownLoading])

  // Handle trigger selection
  const handleTriggerSelect = useCallback((integration: IntegrationInfo, trigger: NodeComponent) => {
    if (configHook.nodeNeedsConfiguration(trigger)) {
      // Store the pending trigger info and open configuration
      configHook.setPendingNode({ type: 'trigger', integration, nodeComponent: trigger })
      configHook.setConfiguringNode({
        id: 'pending-trigger',
        integration,
        nodeComponent: trigger,
        config: {}
      })
    } else {
      // Add trigger without configuration (e.g., manual trigger)
      const newNodeId = `trigger-${Date.now()}`
      const newNode: Node = {
        id: newNodeId,
        type: 'custom',
        position: { x: 250, y: 100 },
        data: {
          title: trigger.title,
          description: trigger.description,
          type: trigger.type,
          isTrigger: true,
          config: {},
          providerId: trigger.providerId || integration.id,
          onConfigure: handleNodeConfigure,
          onDelete: handleNodeDelete,
          onEditingStateChange: handleNodeEditingStateChange,
          onRename: handleNodeRename
        }
      }

      // Check if we're replacing a deleted trigger
      const replacingTrigger = deletedTriggerBackupRef.current
      const firstActionEdge = replacingTrigger?.edges.find(e =>
        e.source === replacingTrigger.node.id &&
        !e.target.startsWith('add-action-')
      )

      // Add the trigger node
      setNodes(nds => {
        const updatedNodes = [...nds, newNode]

        // If we're replacing a trigger and there was a connected action, skip AddActionNode
        if (firstActionEdge) {
          return updatedNodes
        }

        // Otherwise, add AddActionNode after the trigger
        const addActionId = `add-action-${newNodeId}`

        // Store the handler in ref
        const clickHandler = () => handleAddActionClick(addActionId, newNodeId)
        addActionHandlersRef.current[addActionId] = clickHandler

        const addActionNode: Node = {
          id: addActionId,
          type: 'addAction',
          position: {
            x: getCenteredAddActionX(newNode),
            y: newNode.position.y + 160
          },
          draggable: false,
          selectable: false,
          data: {
            parentId: newNodeId,
            onClick: clickHandler
          }
        }

        return [...updatedNodes, addActionNode]
      })

      // Add edges
      setEdges(eds => {
        const newEdges = [...eds]

        // If we're replacing a trigger, reconnect to the first action node
        if (firstActionEdge) {
          const reconnectedEdge: Edge = {
            id: `e-${newNodeId}-${firstActionEdge.target}`,
            source: newNodeId,
            target: firstActionEdge.target,
            type: firstActionEdge.type,
            animated: firstActionEdge.animated,
            style: firstActionEdge.style
          }
          newEdges.push(reconnectedEdge)
        } else {
          // Otherwise, add edge between trigger and AddActionNode
          newEdges.push({
            id: `e-${newNodeId}-add-action-${newNodeId}`,
            source: newNodeId,
            target: `add-action-${newNodeId}`,
            type: 'custom',
            animated: false,
            style: { stroke: "#9ca3af", strokeWidth: 2, strokeLinecap: "round", strokeDasharray: "5 5" }
          })
        }

        return newEdges
      })

      // Auto-fit view after adding trigger to keep everything visible
      setTimeout(() => {
        if (fitView) {
          fitView({
            padding: 0.2,
            includeHiddenNodes: false,
            minZoom: 0.5,
            maxZoom: 2,
            duration: 400,
            offset: { x: 0, y: 40 }
          })
        }
      }, 100)

      setHasUnsavedChanges(true)
    }
    dialogsHook.setShowTriggerDialog(false)
    // Only clear the backup if this trigger doesn't need configuration
    // (if it needs config, backup will be cleared on successful save or restored on cancel)
    if (!configHook.nodeNeedsConfiguration(trigger)) {
      deletedTriggerBackupRef.current = null
    }
  }, [
    configHook,
    dialogsHook,
    handleNodeConfigure,
    handleNodeDelete,
    handleNodeEditingStateChange,
    handleNodeRename,
    setNodes,
    setEdges,
    addActionHandlersRef,
    handleAddActionClick,
    getCenteredAddActionX,
    fitView,
    setHasUnsavedChanges
  ])

  // Handle trigger dialog close (for restoration logic)
  const handleTriggerDialogClose = useCallback((open: boolean) => {
    // Always call the original setter first
    dialogsHook.setShowTriggerDialog(open)

    // Only handle restoration when dialog is actually closing and we have a backup
    if (!open && deletedTriggerBackupRef.current) {
      // Store backup in local variable to avoid null issues
      const backup = deletedTriggerBackupRef.current

      // Clear backup immediately to prevent re-processing
      deletedTriggerBackupRef.current = null

      // Small delay to let the dialog close and any pending trigger selection complete
      setTimeout(() => {
        // Check if a new trigger was selected or is being configured
        const hasNewTrigger = getNodes().some(n => {
          const comp = ALL_NODE_COMPONENTS.find(c => c.type === n.data?.type)
          return comp?.isTrigger === true
        })

        const isPendingTriggerConfig = configHook.pendingNode?.type === 'trigger'

        if (!hasNewTrigger && !isPendingTriggerConfig && backup) {
          // No new trigger selected and no pending configuration - restore the old one
          setNodes((prevNodes) => [...prevNodes, backup.node])
          setEdges((prevEdges) => [...prevEdges, ...backup.edges])
        }
      }, 100)
    }
  }, [getNodes, setNodes, setEdges, dialogsHook, configHook])

  // Handle action selection
  const handleActionSelect = useCallback((integration: IntegrationInfo, action: NodeComponent) => {
    // console.log('🟣 [handleActionSelect] Called with:', {
    //   integration: integration?.name,
    //   action: action?.type,
    //   sourceAddNode: dialogsHook.sourceAddNode,
    //   hasSourceAddNode: !!dialogsHook.sourceAddNode
    // })

    // Check if trying to add an AI Agent when one already exists
    if (action.type === 'ai_agent') {
      const existingAIAgent = nodes.find(n => n.data?.type === 'ai_agent')
      if (existingAIAgent) {
        toast({
          title: "AI Agent Already Exists",
          description: "You can only have one AI Agent node per workflow.",
          variant: "destructive"
        })
        return
      }
    }

    if (configHook.nodeNeedsConfiguration(action)) {
      const sourceInfo = dialogsHook.sourceAddNode

      // Check if this is for an AI Agent chain - if so, auto-create config with AI fields
      if (sourceInfo?.isAIAgentAction) {
        console.log('🤖 [handleActionSelect] AI Agent action - creating auto config with AI fields', {
          actionType: action.type,
          actionTitle: action.title,
          sourceInfo
        })

        // Create config with _allFieldsAI flag to indicate all fields should use AI
        // Except for certain fields that are needed for configuration (selectors)
        const aiConfig: Record<string, any> = {
          _allFieldsAI: true,  // Flag to indicate all fields should be AI-generated
        }

        console.log('🤖 [handleActionSelect] Created aiConfig:', aiConfig)

        // Add the action directly with AI config and chain metadata
        handleAddAction(integration, action, aiConfig, sourceInfo)

        // Close the dialog
        dialogsHook.setShowActionDialog(false)
        return
      }

      // Make a deep copy of sourceInfo to preserve it
      const preservedSourceInfo = sourceInfo ? { ...sourceInfo } : undefined

      // Store the pending action info and open configuration
      configHook.setPendingNode({
        type: 'action',
        integration,
        nodeComponent: action,
        sourceNodeInfo: preservedSourceInfo  // Use the preserved copy
      })
      configHook.setConfiguringNode({
        id: 'pending-action',
        integration,
        nodeComponent: action,
        config: {}
      })

      // Close dialog AFTER setting pending node to ensure state is saved
      setTimeout(() => {
        dialogsHook.setShowActionDialog(false)
      }, 0)
    } else {
      // Add action without configuration
      const sourceInfo = dialogsHook.sourceAddNode
      console.log('🟣 [handleActionSelect] Node does NOT need configuration, adding directly with sourceNodeInfo:', sourceInfo)

      if (sourceInfo) {
        // TODO: Add the action directly without configuration
        // This needs to be handled differently since handleAddAction is defined later
        console.log('🟣 [handleActionSelect] Would add action directly, but implementation needed')
      } else {
        console.warn('🟣 [handleActionSelect] No sourceNodeInfo available for direct add')
      }

      dialogsHook.setShowActionDialog(false)
    }
  }, [nodes, configHook, dialogsHook, toast])

  // Handle adding a trigger node
  const handleAddTrigger = useCallback((integration: any, nodeComponent: any, config: Record<string, any>) => {
    // Check if we're replacing a deleted trigger before clearing the backup
    const replacingTrigger = deletedTriggerBackupRef.current
    const firstActionEdge = replacingTrigger?.edges.find(e =>
      e.source === replacingTrigger.node.id &&
      !e.target.startsWith('add-action-')
    )

    // Clear the backup since we're successfully adding a new trigger
    deletedTriggerBackupRef.current = null

    const newNodeId = `trigger-${Date.now()}`
    const newNode: Node = {
      id: newNodeId,
      type: 'custom',
      position: { x: 250, y: 100 },
      data: {
        title: nodeComponent.title,
        description: nodeComponent.description,
        type: nodeComponent.type,
        isTrigger: true,
        config,
        providerId: nodeComponent.providerId || integration.id,
        onConfigure: handleNodeConfigure,
        onDelete: handleNodeDelete,
        onEditingStateChange: handleNodeEditingStateChange,
        onRename: handleNodeRename
      }
    }

    // Add the trigger node
    setNodes(nds => {
      const updatedNodes = [...nds, newNode]

      // If we're replacing a trigger and there was a connected action, skip AddActionNode
      if (firstActionEdge) {
        return updatedNodes
      }

      // Otherwise, add AddActionNode after the trigger
      const addActionId = `add-action-${newNodeId}`

      // Store the handler in ref
      const clickHandler = () => handleAddActionClick(addActionId, newNodeId)
      addActionHandlersRef.current[addActionId] = clickHandler

      const addActionNode: Node = {
        id: addActionId,
        type: 'addAction',
        position: {
          x: getCenteredAddActionX(newNode),
          y: newNode.position.y + 160
        },
        draggable: false,
        selectable: false,
        data: {
          parentId: newNodeId,
          onClick: clickHandler
        }
      }

      return [...updatedNodes, addActionNode]
    })

    // Add edges
    setEdges(eds => {
      const newEdges = [...eds]

      // If we're replacing a trigger, reconnect to the first action node
      if (firstActionEdge) {
        const reconnectedEdge: Edge = {
          id: `e-${newNodeId}-${firstActionEdge.target}`,
          source: newNodeId,
          target: firstActionEdge.target,
          type: firstActionEdge.type,
          animated: firstActionEdge.animated,
          style: firstActionEdge.style
        }
        newEdges.push(reconnectedEdge)
      } else {
        // Otherwise, add edge between trigger and AddActionNode
        newEdges.push({
          id: `e-${newNodeId}-add-action-${newNodeId}`,
          source: newNodeId,
          target: `add-action-${newNodeId}`,
          type: 'custom',
          animated: false,
          style: { stroke: "#9ca3af", strokeWidth: 2, strokeLinecap: "round", strokeDasharray: "5 5" }
        })
      }

      return newEdges
    })

    // Auto-fit view after adding trigger to keep everything visible
    setTimeout(() => {
      if (fitView) {
        fitView({
          padding: 0.2,
          includeHiddenNodes: false,
          minZoom: 0.5,
          maxZoom: 2,
          duration: 400,
          offset: { x: 0, y: 40 }
        })
      }
    }, 150)

    setHasUnsavedChanges(true)
  }, [setNodes, setEdges, handleNodeConfigure, handleNodeDelete, handleAddActionClick, fitView])

  // Handle adding an action node
  const handleAddAction = useCallback((integration: any, nodeComponent: any, config: Record<string, any>, sourceNodeInfo: any) => {
    // console.log('🟢 [handleAddAction] START - called with:', {
    //   integration: integration?.name,
    //   nodeComponent: nodeComponent?.type,
    //   sourceNodeInfo,
    //   insertBefore: sourceNodeInfo?.insertBefore
    // })

    // Check if sourceNodeInfo is valid
    if (!sourceNodeInfo) {
      console.warn('handleAddAction called without sourceNodeInfo - this should only be used for adding new actions')
      return undefined
    }

    // Check if sourceNodeInfo is an empty object (which shouldn't happen)
    if (Object.keys(sourceNodeInfo).length === 0) {
      console.error('handleAddAction called with empty sourceNodeInfo object - this indicates sourceAddNode was null when action was selected')
      return undefined
    }

    // For insertions, parentId is the source node, insertBefore is the target
    // For regular additions, parentId is the parent node, id is the AddAction node to replace
    const parentId = sourceNodeInfo?.parentId
    if (!parentId) {
      console.error('No parentId found in sourceNodeInfo:', sourceNodeInfo)
      return undefined
    }

    const parentNode = nodes.find(n => n.id === parentId)
    if (!parentNode) {
      console.error('Parent node not found:', parentId)
      return undefined
    }

    // console.log('Found parent node:', parentNode.id, 'insertBefore:', sourceNodeInfo.insertBefore)

    // Check if the parent node is part of an AI agent chain
    let parentAIAgentId = parentNode?.data?.parentAIAgentId
    let parentChainIndex = parentNode?.data?.parentChainIndex

    // For regular additions (not insertions), also check the AddAction node being replaced
    if (!sourceNodeInfo.insertBefore && sourceNodeInfo.id) {
      const sourceAddActionNode = nodes.find(n => n.id === sourceNodeInfo.id)
      if (sourceAddActionNode?.data?.parentAIAgentId) {
        parentAIAgentId = sourceAddActionNode.data.parentAIAgentId
        parentChainIndex = sourceAddActionNode.data.parentChainIndex
      }
    }

    // Also check if AI Agent metadata was passed directly in sourceNodeInfo (for Chain Placeholder)
    if (sourceNodeInfo.aiAgentId) {
      parentAIAgentId = sourceNodeInfo.aiAgentId
      parentChainIndex = sourceNodeInfo.parentChainIndex ?? 0
    }

    // console.log('AI Agent metadata:', { parentAIAgentId, parentChainIndex })

    // Generate proper node ID for AI agent chains
    const timestamp = Date.now()
    const newNodeId = parentAIAgentId
      ? `${parentAIAgentId}-node-${timestamp}-${timestamp}`  // AI agent chain node format
      : `action-${timestamp}`  // Regular action node format

    // console.log('Generated newNodeId:', newNodeId, 'isAIAgentChain:', !!parentAIAgentId)

    // Determine position: if adding from a chain placeholder, use its exact position
    const sourceNode = nodes.find(n => n.id === sourceNodeInfo.id)
    const isChainPlaceholder = sourceNode?.type === 'chainPlaceholder'

    let nodePosition: { x: number; y: number }
    if (isChainPlaceholder && sourceNode) {
      // Use the exact position of the chain placeholder
      nodePosition = {
        x: sourceNode.position.x,
        y: sourceNode.position.y
      }
      console.log('🔵 Using chain placeholder position:', nodePosition)
    } else {
      // Default positioning below parent
      nodePosition = {
        x: parentNode.position.x,
        y: parentNode.position.y + 220
      }
    }

    const newNode: Node = {
      id: newNodeId,
      type: 'custom',
      position: nodePosition,
      data: {
        title: nodeComponent.title,
        description: nodeComponent.description,
        type: nodeComponent.type,
        config,
        providerId: nodeComponent.providerId || integration.id,
        // Store the nodeComponent and integration for proper reconstruction after save
        nodeComponent: nodeComponent,
        integration: integration,
        onConfigure: handleNodeConfigure,
        onDelete: handleNodeDelete,
        onEditingStateChange: handleNodeEditingStateChange,
        onRename: handleNodeRename,
        onAddChain: nodeComponent.type === 'ai_agent' ? handleNodeAddChain : undefined,
        // Preserve AI agent chain metadata if this is part of a chain
        ...(parentAIAgentId && {
          isAIAgentChild: true,
          parentAIAgentId,
          parentChainIndex
        })
      }
    }
    
    // Remove old AddActionNode and add new nodes
    setNodes(nds => {
      // Check if we're inserting between nodes
      if (sourceNodeInfo.insertBefore) {
        // console.log('Inserting between nodes. Target:', sourceNodeInfo.insertBefore)

        const targetNode = nds.find(n => n.id === sourceNodeInfo.insertBefore)
        if (targetNode) {
          // Calculate spacing for inserted node
          const nodeSpacing = parentAIAgentId ? 120 : 160 // Tighter spacing for AI agent chains
          const halfSpacing = nodeSpacing / 2

          // Position the new node between parent and target with proper spacing
          const xPosition = targetNode.position.x || parentNode.position.x
          const yPosition = parentNode.position.y + nodeSpacing // Place it one full spacing below parent

          newNode.position = {
            x: xPosition,
            y: yPosition
          }

          // Move the target node and all nodes below it down to make room
          const updatedNodes = nds.map(node => {
            if (node.id === sourceNodeInfo.insertBefore ||
                (node.position.y >= targetNode.position.y &&
                 Math.abs(node.position.x - xPosition) < 50)) { // Only move nodes in the same vertical chain
              return {
                ...node,
                position: {
                  ...node.position,
                  y: node.position.y + nodeSpacing // Move down by one spacing unit
                }
              }
            }
            return node
          })

          console.log('Positioned new node at:', newNode.position)
          console.log('Moved target and downstream nodes down by:', nodeSpacing)

          const result = [...updatedNodes, newNode]
          console.log('Total nodes after insertion:', result.length)
          return result
        } else {
          console.error('Target node not found for insertion:', sourceNodeInfo.insertBefore)
          return [...nds, newNode]
        }
      } else {
        // Regular add action - remove the old AddActionNode and add new one
        const filteredNodes = nds.filter(n => n.id !== sourceNodeInfo.id)
        const updatedNodes = [...filteredNodes, newNode]

        // Check if this is an AI Agent node
        const isAIAgent = nodeComponent.type === 'ai_agent'

        let placeholderNode: Node

        if (isAIAgent) {
          // For AI Agent nodes, create a chain placeholder
          const placeholderId = `chain-placeholder-${newNodeId}`
          console.log('🟣 Creating chain placeholder for AI Agent:', newNodeId, 'with ID:', placeholderId)

          // Store the handler to open action selection modal
          const clickHandler = () => {
            console.log('Chain placeholder clicked for AI Agent:', newNodeId)
            // Open the action selection dialog with AI Agent as source
            handleAddActionClick(placeholderId, newNodeId)
          }
          addActionHandlersRef.current[placeholderId] = clickHandler

          placeholderNode = {
            id: placeholderId,
            type: 'chainPlaceholder',
            position: {
              x: newNode.position.x, // Same width (480px) as AI Agent - no offset needed
              y: newNode.position.y + 160
            },
            draggable: false,
            selectable: false,
            data: {
              type: 'chainPlaceholder',
              parentId: newNodeId,
              parentAIAgentId: newNodeId,
              parentChainIndex: 0,
              onClick: clickHandler
            }
          }
          // console.log('🟣 Chain placeholder node created:', placeholderNode)
        } else {
          // For regular nodes, add an action button
          const addActionId = `add-action-${newNodeId}`

          // Store the handler in ref
          const clickHandler = () => handleAddActionClick(addActionId, newNodeId)
          addActionHandlersRef.current[addActionId] = clickHandler

          // Use tighter spacing for AI agent chains (120px) vs regular nodes (160px)
          const isChainNode = Boolean(parentAIAgentId)
          const spacing = isChainNode ? 120 : 160

          placeholderNode = {
            id: addActionId,
            type: 'addAction',
            position: {
              x: getCenteredAddActionX(newNode),
              y: newNode.position.y + spacing
            },
            draggable: false,
            selectable: false,
            data: {
              parentId: newNodeId,
              onClick: clickHandler,
              // Preserve AI agent chain metadata if this is part of a chain
              ...(parentAIAgentId && {
                parentAIAgentId,
                parentChainIndex
              })
            }
          }
        }

        // console.log('🟣 Returning nodes:', [...updatedNodes, placeholderNode].map(n => ({ id: n.id, type: n.type })))
        return [...updatedNodes, placeholderNode]
      }
    })
    
    // Track change after adding action
    setTimeout(() => {
      const currentNodes = getNodes()
      const currentEdges = getEdges()
      trackChangeRef.current?.(currentNodes, currentEdges)
    }, 100)

    // Update edges
    setEdges(eds => {
      // Check if we're inserting between nodes
      if (sourceNodeInfo.insertBefore) {
        // console.log('Updating edges for insertion. Removing edge:', parentId, '->', sourceNodeInfo.insertBefore)
        // Remove the edge between parentId and insertBefore
        const filteredEdges = eds.filter(e =>
          !(e.source === parentId && e.target === sourceNodeInfo.insertBefore)
        )

        // console.log('Edges before:', eds.length, 'Edges after filter:', filteredEdges.length)

        // Add edges: parent -> newNode -> insertBefore
        const newEdges = [...filteredEdges,
          {
            id: `e-${parentId}-${newNodeId}`,
            source: parentId,
            target: newNodeId,
            type: 'custom',
            animated: false,
            style: { stroke: "#9ca3af", strokeWidth: 1 },
            data: {} // Ensure data object exists
          },
          {
            id: `e-${newNodeId}-${sourceNodeInfo.insertBefore}`,
            source: newNodeId,
            target: sourceNodeInfo.insertBefore,
            type: 'custom',
            animated: false,
            style: { stroke: "#9ca3af", strokeWidth: 1 },
            data: {} // Ensure data object exists
          }
          // Don't add edge to AddAction when inserting between nodes
        ]

        // console.log('Added new edges:', `${parentId} -> ${newNodeId}`, `${newNodeId} -> ${sourceNodeInfo.insertBefore}`)
        // console.log('Total edges after insertion:', newEdges.length)
        return newEdges
      } else {
        // Regular add action (at the end of chain)
        const filteredEdges = eds.filter(e => e.target !== sourceNodeInfo.id)

        const newEdges = [...filteredEdges, {
          id: `e-${parentId}-${newNodeId}`,
          source: parentId,
          target: newNodeId,
          type: 'custom',
          animated: false,
          style: { stroke: "#9ca3af", strokeWidth: 1 }
        }, {
          id: `e-${newNodeId}-${nodeComponent.type === 'ai_agent' ? `chain-placeholder-${newNodeId}` : `add-action-${newNodeId}`}`,
          source: newNodeId,
          target: nodeComponent.type === 'ai_agent' ? `chain-placeholder-${newNodeId}` : `add-action-${newNodeId}`,
          type: 'custom',
          animated: false,
          style: { stroke: "#9ca3af", strokeWidth: 2, strokeLinecap: "round", strokeDasharray: "5 5" }
        }]

        return newEdges
      }
    })

    // Auto-fit view after adding action to keep everything visible
    setTimeout(() => {
      if (fitView) {
        fitView({
          padding: 0.2,
          includeHiddenNodes: false,
          minZoom: 0.5,
          maxZoom: 2,
          duration: 400,
          offset: { x: 0, y: 40 }
        })
      }
    }, 150)

    setHasUnsavedChanges(true)
    return newNodeId
  }, [nodes, setNodes, setEdges, handleNodeConfigure, handleNodeDelete, handleNodeAddChain, handleAddActionClick, fitView])

  // Additional handlers needed
  const optimizedOnNodesChange = useCallback((changes: any) => {
    // Handle parent-child movement for add action nodes
    const positionChanges = changes.filter((change: any) => change.type === 'position')

    if (positionChanges.length > 0) {
      // Find add action nodes that need to move with their parent
      const additionalChanges: any[] = []
      const currentNodes = getNodes()

      // Check if any node has finished being dragged (dragging === false)
      const hasFinishedDragging = positionChanges.some((change: any) => change.dragging === false)

      positionChanges.forEach((change: any) => {
        if (change.dragging !== false && !change.id.startsWith('add-action-')) {
          // This is a parent node being dragged, find its add action node
          const addActionId = `add-action-${change.id}`
          const addActionNode = currentNodes.find(n => n.id === addActionId)
          const parentNode = currentNodes.find(n => n.id === change.id)

          if (addActionNode && change.position) {
            // Use tighter spacing for AI agent chains (120px) vs regular nodes (160px)
            const isChainNode = Boolean(addActionNode.data?.parentAIAgentId)
            const spacing = isChainNode ? 120 : 160

            const centeredX = getCenteredAddActionX({
              position: change.position,
              data: parentNode?.data ?? addActionNode.data
            })

            // Move the add action node with the parent
            additionalChanges.push({
              id: addActionId,
              type: 'position',
              position: {
                x: centeredX,
                y: change.position.y + spacing
              }
            })
          }
        }
      })

      // Apply all changes including parent and child movements
      onNodesChange([...changes, ...additionalChanges])

      // Track change for undo/redo when dragging ends
      if (hasFinishedDragging) {
        setTimeout(() => {
          const updatedNodes = getNodes()
          const updatedEdges = getEdges()
          trackChangeRef.current?.(updatedNodes, updatedEdges)
        }, 100)
      }
    } else {
      // No position changes, apply normally
      onNodesChange(changes)
    }
  }, [onNodesChange, getNodes, getEdges])

  const handleConfigureNode = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId)
    if (node && configHook.setConfiguringNode) {
      // Try to find nodeComponent if not already set
      let nodeComponent = node.data?.nodeComponent
      if (!nodeComponent && node.data?.type) {
        // Import ALL_NODE_COMPONENTS if needed
        const { ALL_NODE_COMPONENTS } = require('@/lib/workflows/nodes')
        nodeComponent = ALL_NODE_COMPONENTS.find(nc => nc.type === node.data.type)
      }

      configHook.setConfiguringNode({
        id: nodeId,
        nodeComponent: nodeComponent,
        integration: node.data?.integration,
        config: node.data?.config || {}
      })
    }
  }, [nodes, configHook])

  const handleDeleteNodeWithConfirmation = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId)
    if (node) {
      dialogsHook.setDeletingNode({
        id: nodeId,
        name: node.data?.title || 'Node'
      })
    }
  }, [nodes, dialogsHook])

  const handleAddNodeBetween = useCallback((sourceId: string, targetId: string, position?: { x: number; y: number }) => {
    // Open the action dialog to add a node between two existing nodes
    const insertNodeInfo = {
      id: `insert-${Date.now()}`,
      parentId: sourceId,
      insertBefore: targetId
    }

    // console.log('🔶 [handleAddNodeBetween] Setting sourceAddNode for insertion:', insertNodeInfo)

    dialogsHook.setSourceAddNode(insertNodeInfo)
    dialogsHook.setSelectedIntegration(null)
    dialogsHook.setSelectedAction(null)
    dialogsHook.setSearchQuery("")
    dialogsHook.setShowActionDialog(true)
  }, [dialogsHook])

  const openTriggerDialog = useCallback(() => {
    dialogsHook.setShowTriggerDialog(true)
  }, [dialogsHook])

  const getWorkflowStatus = useCallback(() => {
    if (executionHook.isExecuting) return { text: "Executing", variant: "default" as const }
    if (isSaving) return { text: "Saving", variant: "secondary" as const }
    if (hasUnsavedChanges) return { text: "Draft", variant: "outline" as const }
    return { text: "Saved", variant: "secondary" as const }
  }, [executionHook.isExecuting, isSaving, hasUnsavedChanges])

  const nodeNeedsConfiguration = useCallback((nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId)
    if (!node || !node.data?.nodeComponent) return false
    const config = node.data?.config || {}
    const fields = node.data?.nodeComponent?.fields || []
    return fields.some((field: any) => field.required && !config[field.name])
  }, [nodes])

  // Edge click handler for selection
  const handleEdgeClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    event.stopPropagation()
    setSelectedEdgeId(edge.id)
    setHasUnsavedChanges(true)
  }, [])

  // Delete selected edge
  const deleteSelectedEdge = useCallback(() => {
    if (selectedEdgeId) {
      setEdges((eds) => eds.filter((e) => e.id !== selectedEdgeId))
      setSelectedEdgeId(null)
      setHasUnsavedChanges(true)
      toast({
        title: "Connection deleted",
        description: "The connection between nodes has been removed.",
      })
    }
  }, [selectedEdgeId, setEdges, toast])

  // Keyboard handler for edge deletion
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if Delete or Backspace is pressed
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedEdgeId) {
        // Prevent default behavior if we're not in an input field
        const target = event.target as HTMLElement
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
          event.preventDefault()
          deleteSelectedEdge()
        }
      }
      // Deselect edge on Escape
      if (event.key === 'Escape' && selectedEdgeId) {
        setSelectedEdgeId(null)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedEdgeId, deleteSelectedEdge])

  // Click outside to deselect edge
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Check if click is outside of edges
      const target = event.target as HTMLElement
      if (!target.closest('.react-flow__edge')) {
        setSelectedEdgeId(null)
      }
    }

    if (selectedEdgeId) {
      document.addEventListener('click', handleClickOutside)
      return () => document.removeEventListener('click', handleClickOutside)
    }
  }, [selectedEdgeId])

  const confirmDeleteNode = useCallback((nodeId: string) => {
    const nodeToDelete = nodesRef.current.find((n) => n.id === nodeId)
    if (!nodeToDelete) {
      dialogsHook.setDeletingNode(null)
      return
    }

    const currentEdges = getEdges()
    const currentNodes = getNodes()

    // Check if this is a trigger node
    const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === nodeToDelete.data?.type)
    const isTriggerNode = nodeComponent?.isTrigger === true

    // If deleting a trigger, show trigger selection dialog instead
    if (isTriggerNode) {
      // Store the deleted trigger info for potential restoration
      deletedTriggerBackupRef.current = {
        node: { ...nodeToDelete },
        edges: currentEdges.filter(e => e.source === nodeId || e.target === nodeId)
      }

      // Close the deletion modal
      dialogsHook.setDeletingNode(null)

      // First, actually delete the node
      setNodes((prevNodes) => prevNodes.filter(n => n.id !== nodeId))
      setEdges((prevEdges) => prevEdges.filter(e => e.source !== nodeId && e.target !== nodeId))
      setHasUnsavedChanges(true)

      // Small delay to ensure deletion is processed
      setTimeout(() => {
        // Now open the trigger selection dialog
        dialogsHook.setShowTriggerDialog(true)
      }, 100)

      return
    }

    // Check if this is an AI Agent node
    const isAIAgent = nodeToDelete.data?.type === 'ai_agent'

    // Build list of all nodes to delete
    let nodesToDelete = new Set([nodeId])
    let placeholdersToDelete = new Set([`add-action-${nodeId}`])

    if (isAIAgent) {
      // console.log('🗑️ Deleting AI Agent and all its chains')

      // Find all nodes that are children of this AI Agent
      currentNodes.forEach(n => {
        // Check various ways a node could be a child of this AI Agent
        if (n.data?.parentAIAgentId === nodeId ||
            n.data?.parentId === nodeId ||
            (typeof n.id === 'string' && n.id.startsWith(`${nodeId}-`))) {
          nodesToDelete.add(n.id)
          placeholdersToDelete.add(`add-action-${n.id}`)
        }

        // Also check for chain placeholders
        if (n.type === 'chainPlaceholder' &&
            (n.data?.parentAIAgentId === nodeId || n.data?.parentId === nodeId)) {
          nodesToDelete.add(n.id)
        }

        // Also check for add action nodes that belong to this AI Agent
        if (n.type === 'addAction' && n.data?.parentAIAgentId === nodeId) {
          nodesToDelete.add(n.id)
        }
      })

      console.log(`🗑️ Deleting AI Agent with ${nodesToDelete.size - 1} related nodes`)
    }

    // Convert sets to arrays for easier use
    const nodeIdsToDelete = Array.from(nodesToDelete)
    const placeholderIdsToDelete = Array.from(placeholdersToDelete)

    // Clear all handlers for deleted placeholders
    placeholderIdsToDelete.forEach(id => {
      delete addActionHandlersRef.current[id]
    })

    // Find edges for the main deleted node (not for AI Agent children)
    const incomingEdges = isAIAgent ? [] : currentEdges.filter((edge) => edge.target === nodeId)
    const outgoingEdges = isAIAgent ? [] : currentEdges.filter((edge) => edge.source === nodeId)

    // Get parent IDs (nodes that connect TO the deleted node)
    const parentIds = Array.from(new Set(incomingEdges.map((edge) => edge.source)))

    // Get the node spacing for positioning
    const parentAIAgentId = nodeToDelete.data?.parentAIAgentId
    const nodeSpacing = parentAIAgentId ? 120 : 160

    // Track nodes that need to move up after deletion
    const deletedNodeY = nodeToDelete.position.y
    const deletedNodeX = nodeToDelete.position.x

    setNodes((prevNodes) => {
      // Filter out all nodes and placeholders that need to be deleted
      let nextNodes = prevNodes.filter((node) =>
        !nodeIdsToDelete.includes(node.id) &&
        !placeholderIdsToDelete.includes(node.id)
      )

      // Move nodes that were below the deleted node up (only if not deleting an AI Agent)
      if (!isAIAgent) {
        nextNodes = nextNodes.map(node => {
          // Check if this node is in the same vertical chain and below the deleted node
          if (node.position.y > deletedNodeY && Math.abs(node.position.x - deletedNodeX) < 50) {
            return {
              ...node,
              position: {
                ...node.position,
                y: node.position.y - nodeSpacing
              }
            }
          }
          return node
        })
      }

      // After deleting a node, remove ALL Add Action nodes first
      // We'll add back the correct one after edges are updated
      nextNodes = nextNodes.filter(n => n.type !== 'addAction')

      return nextNodes
    })

    setEdges((prevEdges) => {
      let nextEdges = prevEdges.filter((edge) => {
        // Remove edges connected to any deleted node
        if (nodeIdsToDelete.includes(edge.source) || nodeIdsToDelete.includes(edge.target)) return false
        if (placeholderIdsToDelete.includes(edge.source) || placeholderIdsToDelete.includes(edge.target)) return false
        return true
      })

      // Reconnect nodes that were connected through the deleted node (skip for AI Agent deletion)
      if (!isAIAgent && incomingEdges.length > 0 && outgoingEdges.length > 0) {
        incomingEdges.forEach((incomingEdge) => {
          outgoingEdges.forEach((outgoingEdge) => {
            const targetNode = currentNodes.find(n => n.id === outgoingEdge.target)

            // Only reconnect if the target is NOT an Add Action button
            if (targetNode && targetNode.type !== 'addAction') {
              // Check if this edge already exists
              const edgeExists = nextEdges.some(e =>
                e.source === incomingEdge.source &&
                e.target === outgoingEdge.target
              )

              if (!edgeExists) {
                nextEdges = [
                  ...nextEdges,
                  {
                    id: `e-${incomingEdge.source}-${outgoingEdge.target}`,
                    source: incomingEdge.source,
                    target: outgoingEdge.target,
                    type: 'custom',
                    animated: false,
                    style: { stroke: '#d1d5db', strokeWidth: 1 },
                    data: {
                      onAddNode: () => {
                        // console.log('🔵 Edge button clicked - inserting between:', incomingEdge.source, 'and', outgoingEdge.target)
                        handleAddNodeBetween(incomingEdge.source, outgoingEdge.target)
                      }
                    }
                  } as Edge,
                ]
              }
            }
          })
        })
      }

      // Don't try to add edges to Add Action nodes here
      // The ensureOneAddActionPerChain function will handle that after edges are updated

      return nextEdges
    })

    removeNode(nodeId)
    setHasUnsavedChanges(true)

    // Track change after deletion
    setTimeout(() => {
      const currentNodes = getNodes()
      const currentEdges = getEdges()
      trackChangeRef.current?.(currentNodes, currentEdges)
    }, 100)

    // After edges are updated, ensure only one Add Action at the end of each chain
    // Always call this, even for AI Agent deletion, in case there are other nodes (like triggers) remaining
    setTimeout(() => {
      ensureOneAddActionPerChain()
    }, 50)

    // If we deleted a chain node, check if the AI Agent needs a Chain Placeholder restored
    if (!isAIAgent && parentAIAgentId) {
      setTimeout(() => {
        const currentNodes = getNodes()
        const aiAgentNode = currentNodes.find(n => n.id === parentAIAgentId)

        if (aiAgentNode) {
          // Find all remaining chain nodes for this AI Agent (excluding placeholders and Add Action buttons)
          const remainingChainNodes = currentNodes.filter(n =>
            n.data?.parentAIAgentId === parentAIAgentId &&
            n.type !== 'chainPlaceholder' &&
            n.type !== 'addAction'
          )

          console.log(`🔍 AI Agent ${parentAIAgentId} has ${remainingChainNodes.length} remaining chain nodes after deletion`)

          // If no chain nodes remain, restore the Chain Placeholder
          if (remainingChainNodes.length === 0) {
            console.log('🔄 Restoring Chain Placeholder for AI Agent with no chains')

            const chainPlaceholderId = `chain-placeholder-${parentAIAgentId}-0-${Date.now()}`
            const chainPlaceholderNode: Node = {
              id: chainPlaceholderId,
              type: 'chainPlaceholder',
              position: {
                x: aiAgentNode.position.x,
                y: aiAgentNode.position.y + 160
              },
              data: {
                type: 'chainPlaceholder',
                parentId: parentAIAgentId,
                parentAIAgentId: parentAIAgentId,
                parentChainIndex: 0,
                onClick: () => {
                  console.log('🔵 Chain placeholder onClick triggered')
                  handleAddActionClick(chainPlaceholderId, parentAIAgentId)
                }
              }
            }

            setNodes(nds => [...nds, chainPlaceholderNode])

            // Create edge from AI Agent to Chain Placeholder
            const edgeId = `e-${parentAIAgentId}-${chainPlaceholderId}`
            setEdges(edges => [
              ...edges,
              {
                id: edgeId,
                source: parentAIAgentId,
                target: chainPlaceholderId,
                type: 'custom',
                animated: false,
                style: { stroke: '#d1d5db', strokeWidth: 1 }
              }
            ])
          }
        }
      }, 100) // Run after ensureOneAddActionPerChain
    }

    if (configHook.configuringNode?.id === nodeId) {
      configHook.setConfiguringNode(null)
    }
    if (configHook.pendingNode?.sourceNodeInfo?.id === nodeId || configHook.pendingNode?.sourceNodeInfo?.parentId === nodeId) {
      configHook.setPendingNode(null)
    }
    if (dialogsHook.sourceAddNode?.id === nodeId || dialogsHook.sourceAddNode?.parentId === nodeId) {
      dialogsHook.setSourceAddNode(null)
    }

    dialogsHook.setDeletingNode(null)

    // Show success toast
    toast({
      title: "Node deleted",
      description: "The node has been removed from the workflow",
    })
  }, [setNodes, setEdges, getEdges, getNodes, handleAddActionClick, handleAddNodeBetween, removeNode, setHasUnsavedChanges, configHook, dialogsHook, toast, ensureOneAddActionPerChain])

  const forceUpdate = useCallback(() => {
    // Force a re-render
    setNodes(nodes => [...nodes])
  }, [setNodes])

  const [displayedTriggers, setDisplayedTriggers] = useState<any[]>([])
  const [filteredIntegrations, setFilteredIntegrations] = useState<any[]>([])

  const handleConfigurationClose = useCallback(() => {
    // Check if we're cancelling a pending trigger configuration after deleting an old trigger
    const wasPendingTrigger = configHook.pendingNode?.type === 'trigger' && deletedTriggerBackupRef.current

    configHook.setConfiguringNode(null)

    // If user was configuring a new trigger to replace a deleted one, and they cancelled, restore the old trigger
    if (wasPendingTrigger && deletedTriggerBackupRef.current) {
      const backup = deletedTriggerBackupRef.current
      deletedTriggerBackupRef.current = null

      // Small delay to let config modal close
      setTimeout(() => {
        const hasNewTrigger = getNodes().some(n => {
          const comp = ALL_NODE_COMPONENTS.find(c => c.type === n.data?.type)
          return comp?.isTrigger === true
        })

        if (!hasNewTrigger && backup) {
          setNodes((prevNodes) => [...prevNodes, backup.node])
          setEdges((prevEdges) => [...prevEdges, ...backup.edges])
        }
      }, 50)
    }
  }, [configHook, getNodes, setNodes, setEdges])

  const handleConfigurationSave = useCallback(async (config: any) => {
    if (configHook.configuringNode) {
      await configHook.handleSaveConfiguration(
        { id: configHook.configuringNode.id },
        config,
        handleAddTrigger,
        handleAddAction,
        handleSave
      )
    }
  }, [configHook, handleAddTrigger, handleAddAction, handleSave])

  const configuringNodeInfo = configHook.configuringNode?.nodeComponent
  const configuringIntegrationName = configHook.configuringNode?.integration?.name || ''
  const configuringInitialData = configHook.configuringNode?.config || {}

  // Wrap execution handlers to provide nodes and edges
  const handleTestSandbox = useCallback(() => {
    const currentNodes = getNodes()
    const currentEdges = getEdges()
    return executionHook.handleTestSandbox(currentNodes, currentEdges)
  }, [getNodes, getEdges, executionHook])

  const handleExecuteLive = useCallback(async () => {
    const currentNodes = getNodes()
    const currentEdges = getEdges()
    setIsRunningPreflight(true)
    const preflight = runPreflightCheck({ openOnSuccess: false, openOnFailure: true })
    setIsRunningPreflight(false)
    if (!preflight.ok) {
      toast({
        title: "Preflight check failed",
        description: "Resolve the issues in the checklist before running the workflow.",
        variant: "destructive",
      })
      return
    }
    return executionHook.handleExecuteLive(currentNodes, currentEdges)
  }, [getNodes, getEdges, executionHook, runPreflightCheck, toast])

  const handleExecuteLiveSequential = useCallback(async () => {
    const currentNodes = getNodes()
    const currentEdges = getEdges()
    setIsRunningPreflight(true)
    const preflight = runPreflightCheck({ openOnSuccess: false, openOnFailure: true })
    setIsRunningPreflight(false)
    if (!preflight.ok) {
      toast({
        title: "Preflight check failed",
        description: "Resolve the checklist issues before running sequential mode.",
        variant: "destructive",
      })
      return
    }
    return executionHook.handleExecuteLiveSequential(currentNodes, currentEdges)
  }, [getNodes, getEdges, executionHook, runPreflightCheck, toast])

  return {
    // React Flow state
    nodes,
    edges: processedEdges,
    setNodes,
    setEdges,
    onNodesChange,
    optimizedOnNodesChange,
    onEdgesChange,
    onConnect,
    nodeTypes,
    edgeTypes,
    fitView,
    getNodes,
    getEdges,
    
    // Workflow metadata
    workflowName,
    setWorkflowName,
    workflowDescription,
    setWorkflowDescription,
    currentWorkflow,
    workflowId,
    editTemplateId,
    isTemplateEditing,
    workflows,
    
    // Loading/saving states
    isSaving,
    isLoading,
    workflowLoading,
    integrationsLoading,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    listeningMode,
    setListeningMode,
    isProcessingChainsRef,
    
    // Handlers
    handleSave,
    handleToggleLive,
    isUpdatingStatus,
    handleTriggerSelect,
    handleTriggerDialogClose,
    handleActionSelect,
    handleAddActionClick,
    handleAddTrigger,
    handleAddAction,

    // Collaboration
    collaborators,

    // From custom hooks (spread but override certain handlers)
    ...executionHook,
    handleTestSandbox,  // Override with wrapped version
    handleExecuteLive,  // Override with wrapped version
    handleExecuteLiveSequential,  // Override with wrapped version
    ...dialogsHook,
    handleSaveAndNavigate: dialogsHook.handleSaveAndNavigate,
    handleNavigateWithoutSaving: dialogsHook.handleNavigateWithoutSaving,
    ...integrationHook,
    ...configHook,

    // Additional handlers and states
    runPreflightCheck,
    preflightResult,
    isPreflightDialogOpen,
    setIsPreflightDialogOpen,
    isRunningPreflight,
    openPreflightChecklist,
    handleConfigureNode,
    handleDeleteNodeWithConfirmation,
    handleAddNodeBetween,
    handleNodeConfigure,
    handleNodeDelete,
    handleNodeEditingStateChange,
    handleNodeRename,
    handleNodeAddChain,
    openTriggerDialog,
    getWorkflowStatus,
    nodeNeedsConfiguration,
    confirmDeleteNode,
    forceUpdate,
    displayedTriggers,
    filteredIntegrations,
    handleConfigurationClose,
    handleConfigurationSave,
    configuringNodeInfo,
    configuringIntegrationName,
    configuringInitialData,
    cachedIntegrationStatus,
    ensureOneAddActionPerChain,
    // Undo/redo functionality
    handleUndo,
    handleRedo,
    canUndo: historyHook.canUndo,
    canRedo: historyHook.canRedo,

    // Edge selection and deletion
    selectedEdgeId,
    handleEdgeClick,
    deleteSelectedEdge,
  }
}
