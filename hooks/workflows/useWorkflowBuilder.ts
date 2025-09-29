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

// Utils
import { supabase } from '@/utils/supabaseClient'
import CustomNode from '@/components/workflows/CustomNode'
import { AddActionNode } from '@/components/workflows/AddActionNode'
import { ChainPlaceholderNode } from '@/components/workflows/ChainPlaceholderNode'
import InsertActionNode from '@/components/workflows/InsertActionNode'
import { CustomEdgeWithButton } from '@/components/workflows/builder/CustomEdgeWithButton'
import { ALL_NODE_COMPONENTS, type NodeComponent } from '@/lib/workflows/nodes'

interface IntegrationInfo {
  id: string
  name: string
  description: string
  category: string
  color: string
  triggers: NodeComponent[]
  actions: NodeComponent[]
}

export function useWorkflowBuilder() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const workflowId = searchParams.get("id")
  const { toast } = useToast()

  // Store hooks
  const { workflows, currentWorkflow, setCurrentWorkflow, updateWorkflow, removeNode, loading: workflowLoading, fetchWorkflows } = useWorkflowStore()
  const { joinCollaboration, leaveCollaboration, collaborators } = useCollaborationStore()
  const { getConnectedProviders, loading: integrationsLoading } = useIntegrationStore()
  const { addError, setCurrentWorkflow: setErrorStoreWorkflow, getLatestErrorForNode } = useWorkflowErrorStore()
  
  // Store onClick handlers for AddActionNodes - needs to be before setNodes
  const addActionHandlersRef = useRef<Record<string, () => void>>({})

  // React Flow state
  const [nodes, setNodesInternal, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const { fitView, getNodes, getEdges } = useReactFlow()

  // Additional states needed by the main component
  const [cachedIntegrationStatus, setCachedIntegrationStatus] = useState<Map<string, boolean>>(new Map())
  
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
  const [listeningMode, setListeningMode] = useState(false)
  const [hasShownLoading, setHasShownLoading] = useState(false)
  const isProcessingChainsRef = useRef(false)
  const isCleaningAddActionsRef = useRef(false)

  // Custom hooks
  const executionHook = useWorkflowExecution()
  const dialogsHook = useWorkflowDialogs()
  const integrationHook = useIntegrationSelection()
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
        await Promise.all([
          fetchWorkflows().catch(err => {
            console.error('[WorkflowBuilder] Failed to fetch workflows:', err)
            return [] // Continue even if workflows fail
          }),
          // Only fetch integrations if not already loaded
          !getConnectedProviders()?.length ?
            useIntegrationStore.getState().fetchIntegrations().catch(err => {
              console.error('[WorkflowBuilder] Failed to fetch integrations:', err)
              return [] // Continue even if integrations fail
            }) : Promise.resolve()
        ])
      } finally {
        clearTimeout(loadingTimeout)
      }
    }

    loadInitialData()
  }, [])

  // Stable callback refs - don't depend on nodes to avoid loops
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  // Handle add action button click - moved up before other callbacks to ensure it's available
  const handleAddActionClick = useCallback((nodeId: string, parentId: string) => {
    console.log('handleAddActionClick called with nodeId:', nodeId, 'parentId:', parentId)
    console.log('dialogsHook available:', !!dialogsHook)
    console.log('Current showActionDialog state before:', dialogsHook.showActionDialog)
    
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
      configHook.setConfiguringNode({
        id: nodeToConfig.id,
        nodeComponent: ALL_NODE_COMPONENTS.find(c => c.type === nodeToConfig.data?.type),
        integration: null,
        config: nodeToConfig.data?.config || {}
      })
    }
  }, [configHook])

  const handleNodeDelete = useCallback((id: string) => {
    const node = nodesRef.current.find(n => n.id === id)
    dialogsHook.setDeletingNode({ id, name: node?.data?.title || 'this node' })
  }, [dialogsHook])

  const handleNodeAddChain = useCallback((nodeId: string) => {
    console.log('Add chain to AI Agent:', nodeId)
  }, [])

  // Helper function to ensure only one Add Action node per chain
  const ensureOneAddActionPerChain = useCallback(() => {
    // Prevent infinite loops by using a guard
    if (isCleaningAddActionsRef.current) {
      console.log('Skipping Add Action cleanup - already in progress')
      return
    }

    isCleaningAddActionsRef.current = true
    console.log('Starting Add Action cleanup')

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
      // A leaf node has no outgoing connections to real nodes
      return !nodesWithOutgoingConnections.has(node.id)
    })

    console.log('Leaf nodes for cleanup:', leafNodes.map(n => ({ id: n.id, type: n.data?.type })))

    // Get all existing Add Action nodes
    const existingAddActions = currentNodes.filter(node => node.type === 'addAction')

    let nodesToRemove: string[] = []
    let nodesToAdd: Node[] = []
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
        nodesToAdd.push({
          id: addActionId,
          type: 'addAction',
          position: {
            x: leafNode.position.x,
            y: leafNode.position.y + 160
          },
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
            type: 'custom',
            animated: false,
            style: { stroke: '#d1d5db', strokeWidth: 1, strokeDasharray: '5 5' }
          })
        }
      }
    })

    // Apply node changes
    if (nodesToRemove.length > 0 || nodesToAdd.length > 0) {
      console.log(`Removing ${nodesToRemove.length} Add Actions, adding ${nodesToAdd.length}`)
      setNodes(nds => {
        let filtered = nds.filter(n => !nodesToRemove.includes(n.id))
        return [...filtered, ...nodesToAdd]
      })
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
      console.log('Add Action cleanup complete')
    }, 300)
  }, [getNodes, getEdges, setNodes, setEdges, handleAddActionClick])

  // Load workflow when ID changes
  useEffect(() => {
    if (workflowId && workflows && workflows.length > 0) {
      const workflow = workflows.find(w => w.id === workflowId)
      if (workflow) {
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
              onAddChain: node.data?.type === 'ai_agent' ? handleNodeAddChain : undefined
            }
          }))
          
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
            // A leaf node is one that has no outgoing connections to real nodes
            return !nodesWithOutgoingConnections.has(node.id)
          })

          console.log('Leaf nodes found:', leafNodes.map((n: any) => ({ id: n.id, type: n.data?.type })))

          // Add Add Action button after each leaf node
          const addActionNodes: Node[] = []
          const addActionEdges: any[] = []

          leafNodes.forEach((leafNode: any) => {
            const addActionId = `add-action-${leafNode.id}`
            console.log('Creating AddActionNode for leaf:', addActionId, 'after node:', leafNode.id)

            // Store the handler in ref
            const clickHandler = () => handleAddActionClick(addActionId, leafNode.id)
            addActionHandlersRef.current[addActionId] = clickHandler

            const addActionNode: Node = {
              id: addActionId,
              type: 'addAction',
              position: {
                x: leafNode.position.x,
                y: leafNode.position.y + 160
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
              console.log('Creating ChainPlaceholder for AI Agent:', chainPlaceholderId)

              // Store the handler in ref
              const clickHandler = () => handleAddActionClick(chainPlaceholderId, aiAgentNode.id)
              addActionHandlersRef.current[chainPlaceholderId] = clickHandler

              const chainPlaceholderNode: Node = {
                id: chainPlaceholderId,
                type: 'chainPlaceholder',
                position: {
                  x: aiAgentNode.position.x,
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
              console.log('Skipping saved AddActionNode edge:', conn.id)
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
              type: 'custom',
              animated: false,
              style: { stroke: "#d1d5db", strokeWidth: 1 }
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
                  type: 'custom',
                  animated: false,
                  style: {
                    stroke: "#d1d5db",
                    strokeWidth: 1,
                    strokeDasharray: "5 5" // Make it dotted
                  }
                })
              }
            })
          }
          
          setEdges(flowEdges)
        }
        
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

  // Handle save
  const handleSave = useCallback(async () => {
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

      // Get the latest nodes and edges from React Flow to avoid stale closure issues
      const currentNodes = getNodes()
      const currentEdges = getEdges()

      // Remove UI-only placeholder nodes (AddAction and ChainPlaceholder) before saving
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
      // Filter out edges to/from placeholder nodes (including AddActionNodes)
      const persistedEdges = currentEdges.filter(e =>
        !placeholderNodeIds.has(e.source) &&
        !placeholderNodeIds.has(e.target) &&
        !e.target.includes('add-action') && // Explicitly filter out edges to AddActionNodes
        !e.source.includes('add-action')    // Explicitly filter out edges from AddActionNodes
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

      await updateWorkflow(currentWorkflow.id, {
        name: workflowName,
        description: workflowDescription,
        nodes: workflowNodes,
        connections: workflowConnections,
      })

      setHasUnsavedChanges(false)
      
      toast({
        title: "Success",
        description: "Workflow saved successfully",
      })
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
  }, [currentWorkflow, getNodes, getEdges, workflowName, workflowDescription, updateWorkflow, toast])

  // Handle toggling workflow live status
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  
  const handleToggleLive = useCallback(async () => {
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

    try {
      setIsUpdatingStatus(true)
      
      const newStatus = currentWorkflow.status === 'active' ? 'paused' : 'active'
      
      const { error } = await supabase
        .from('workflows')
        .update({ 
          status: newStatus,
          is_enabled: newStatus === 'active',
          updated_at: new Date().toISOString()
        })
        .eq('id', currentWorkflow.id)

      if (error) throw error

      // Update the local state
      setCurrentWorkflow({
        ...currentWorkflow,
        status: newStatus
      })

      toast({
        title: "Success",
        description: `Workflow ${newStatus === 'active' ? 'is now live' : 'has been paused'}`,
        variant: newStatus === 'active' ? 'default' : 'secondary',
      })
    } catch (error) {
      console.error('Error updating workflow status:', error)
      toast({
        title: "Error",
        description: "Failed to update workflow status",
        variant: "destructive",
      })
    } finally {
      setIsUpdatingStatus(false)
    }
  }, [currentWorkflow, hasUnsavedChanges, setCurrentWorkflow, toast])

  // Handle node connection
  const onConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target) return
    
    const newEdge: Edge = {
      id: `${params.source}-${params.target}`,
      source: params.source,
      target: params.target,
      type: 'custom',
      animated: false,
      style: { stroke: "#d1d5db", strokeWidth: 1 }
    }
    
    setEdges((eds) => [...eds, newEdge])
    setHasUnsavedChanges(true)
  }, [setEdges])

  // Process edges to add handleAddNodeBetween
  const processedEdges = useMemo(() => {
    return edges.map(edge => {
      if (edge.type === 'custom') {
        return {
          ...edge,
          data: {
            ...edge.data,
            onAddNode: () => {
              // Use the edge's source and target directly
              const sourceId = edge.source
              const targetId = edge.target

              console.log('🔶 [Edge Button] Add node between', sourceId, 'and', targetId)
              console.log('Current showActionDialog state:', dialogsHook.showActionDialog)
              console.log('Setting sourceAddNode and opening dialog...')

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

              console.log('Dialog should now be open, showActionDialog:', dialogsHook.showActionDialog)
            }
          }
        }
      }
      return edge
    })
  }, [edges, dialogsHook])

  // Determine loading state with timeout protection
  const [loadingStartTime, setLoadingStartTime] = useState<number | null>(null)
  const MAX_LOADING_TIME = 15000 // 15 seconds max loading time

  const shouldShowLoading = () => {
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
      // Add trigger without configuration
      // Implementation would go here
    }
    dialogsHook.setShowTriggerDialog(false)
  }, [configHook, dialogsHook])

  // Handle action selection
  const handleActionSelect = useCallback((integration: IntegrationInfo, action: NodeComponent) => {
    console.log('🟣 [handleActionSelect] Called with:', {
      integration: integration?.name,
      action: action?.type,
      sourceAddNode: dialogsHook.sourceAddNode,
      hasSourceAddNode: !!dialogsHook.sourceAddNode
    })

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
      console.log('🟣 [handleActionSelect] Node needs configuration, setting pending node with sourceNodeInfo:', {
        sourceAddNode: sourceInfo,
        sourceAddNodeType: typeof sourceInfo,
        sourceAddNodeKeys: sourceInfo ? Object.keys(sourceInfo) : [],
        sourceAddNodeValues: sourceInfo
      })

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
        onDelete: handleNodeDelete
      }
    }
    
    // Add the trigger node
    setNodes(nds => {
      const updatedNodes = [...nds, newNode]
      
      // Add AddActionNode after the trigger
      const addActionId = `add-action-${newNodeId}`
      
      // Store the handler in ref
      const clickHandler = () => handleAddActionClick(addActionId, newNodeId)
      addActionHandlersRef.current[addActionId] = clickHandler
      
      const addActionNode: Node = {
        id: addActionId,
        type: 'addAction',
        position: { x: 250, y: 260 },
        draggable: false,
        selectable: false,
        data: {
          parentId: newNodeId,
          onClick: clickHandler
        }
      }
      
      return [...updatedNodes, addActionNode]
    })
    
    // Add edge between trigger and AddActionNode
    setEdges(eds => [...eds, {
      id: `e-${newNodeId}-add-action-${newNodeId}`,
      source: newNodeId,
      target: `add-action-${newNodeId}`,
      type: 'custom',
      animated: false,
      style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "5 5" }
    }])
    
    setHasUnsavedChanges(true)
  }, [setNodes, setEdges, handleNodeConfigure, handleNodeDelete, handleAddActionClick])

  // Handle adding an action node
  const handleAddAction = useCallback((integration: any, nodeComponent: any, config: Record<string, any>, sourceNodeInfo: any) => {
    console.log('🟢 [handleAddAction] START - called with:', {
      integration: integration?.name,
      nodeComponent: nodeComponent?.type,
      sourceNodeInfo,
      insertBefore: sourceNodeInfo?.insertBefore
    })

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

    console.log('Found parent node:', parentNode.id, 'insertBefore:', sourceNodeInfo.insertBefore)

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

    console.log('AI Agent metadata:', { parentAIAgentId, parentChainIndex })

    // Generate proper node ID for AI agent chains
    const timestamp = Date.now()
    const newNodeId = parentAIAgentId
      ? `${parentAIAgentId}-node-${timestamp}-${timestamp}`  // AI agent chain node format
      : `action-${timestamp}`  // Regular action node format

    console.log('Generated newNodeId:', newNodeId, 'isAIAgentChain:', !!parentAIAgentId)

    const newNode: Node = {
      id: newNodeId,
      type: 'custom',
      position: {
        x: parentNode.position.x,
        y: parentNode.position.y + 160
      },
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
        console.log('Inserting between nodes. Target:', sourceNodeInfo.insertBefore)

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
              x: newNode.position.x,
              y: newNode.position.y + 160
            },
            draggable: false,
            selectable: false,
            data: {
              parentId: newNodeId,
              parentAIAgentId: newNodeId,
              onClick: clickHandler
            }
          }
          console.log('🟣 Chain placeholder node created:', placeholderNode)
        } else {
          // For regular nodes, add an action button
          const addActionId = `add-action-${newNodeId}`

          // Store the handler in ref
          const clickHandler = () => handleAddActionClick(addActionId, newNodeId)
          addActionHandlersRef.current[addActionId] = clickHandler

          placeholderNode = {
            id: addActionId,
            type: 'addAction',
            position: {
              x: newNode.position.x,
              y: newNode.position.y + 160
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

        console.log('🟣 Returning nodes:', [...updatedNodes, placeholderNode].map(n => ({ id: n.id, type: n.type })))
        return [...updatedNodes, placeholderNode]
      }
    })
    
    // Update edges
    setEdges(eds => {
      // Check if we're inserting between nodes
      if (sourceNodeInfo.insertBefore) {
        console.log('Updating edges for insertion. Removing edge:', parentId, '->', sourceNodeInfo.insertBefore)
        // Remove the edge between parentId and insertBefore
        const filteredEdges = eds.filter(e =>
          !(e.source === parentId && e.target === sourceNodeInfo.insertBefore)
        )

        console.log('Edges before:', eds.length, 'Edges after filter:', filteredEdges.length)

        // Add edges: parent -> newNode -> insertBefore
        const newEdges = [...filteredEdges,
          {
            id: `e-${parentId}-${newNodeId}`,
            source: parentId,
            target: newNodeId,
            type: 'custom',
            animated: false,
            style: { stroke: "#d1d5db", strokeWidth: 1 },
            data: {} // Ensure data object exists
          },
          {
            id: `e-${newNodeId}-${sourceNodeInfo.insertBefore}`,
            source: newNodeId,
            target: sourceNodeInfo.insertBefore,
            type: 'custom',
            animated: false,
            style: { stroke: "#d1d5db", strokeWidth: 1 },
            data: {} // Ensure data object exists
          }
          // Don't add edge to AddAction when inserting between nodes
        ]

        console.log('Added new edges:', `${parentId} -> ${newNodeId}`, `${newNodeId} -> ${sourceNodeInfo.insertBefore}`)
        console.log('Total edges after insertion:', newEdges.length)
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
          style: { stroke: "#d1d5db", strokeWidth: 1 }
        }, {
          id: `e-${newNodeId}-${nodeComponent.type === 'ai_agent' ? `chain-placeholder-${newNodeId}` : `add-action-${newNodeId}`}`,
          source: newNodeId,
          target: nodeComponent.type === 'ai_agent' ? `chain-placeholder-${newNodeId}` : `add-action-${newNodeId}`,
          type: 'custom',
          animated: false,
          style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "5 5" }
        }]

        return newEdges
      }
    })
    
    setHasUnsavedChanges(true)
    return newNodeId
  }, [nodes, setNodes, setEdges, handleNodeConfigure, handleNodeDelete, handleNodeAddChain, handleAddActionClick])

  // Additional handlers needed
  const optimizedOnNodesChange = useCallback((changes: any) => {
    // Handle parent-child movement for add action nodes
    const positionChanges = changes.filter((change: any) => change.type === 'position')

    if (positionChanges.length > 0) {
      // Find add action nodes that need to move with their parent
      const additionalChanges: any[] = []
      const currentNodes = getNodes()

      positionChanges.forEach((change: any) => {
        if (change.dragging !== false && !change.id.startsWith('add-action-')) {
          // This is a parent node being dragged, find its add action node
          const addActionId = `add-action-${change.id}`
          const addActionNode = currentNodes.find(n => n.id === addActionId)

          if (addActionNode && change.position) {
            // Move the add action node with the parent
            additionalChanges.push({
              id: addActionId,
              type: 'position',
              position: {
                x: change.position.x,
                y: change.position.y + 120 // Keep 120px below parent
              }
            })
          }
        }
      })

      // Apply all changes including parent and child movements
      onNodesChange([...changes, ...additionalChanges])
    } else {
      // No position changes, apply normally
      onNodesChange(changes)
    }
  }, [onNodesChange, getNodes])

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

    console.log('🔶 [handleAddNodeBetween] Setting sourceAddNode for insertion:', insertNodeInfo)

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

  const confirmDeleteNode = useCallback((nodeId: string) => {
    const nodeToDelete = nodesRef.current.find((n) => n.id === nodeId)
    if (!nodeToDelete) {
      dialogsHook.setDeletingNode(null)
      return
    }

    const placeholderId = `add-action-${nodeId}`
    const currentEdges = getEdges()
    const currentNodes = getNodes()

    // Find incoming and outgoing edges for the deleted node
    const incomingEdges = currentEdges.filter((edge) => edge.target === nodeId)
    const outgoingEdges = currentEdges.filter((edge) => edge.source === nodeId)

    // Get parent IDs (nodes that connect TO the deleted node)
    const parentIds = Array.from(new Set(incomingEdges.map((edge) => edge.source)))

    // Get the node spacing for positioning
    const parentAIAgentId = nodeToDelete.data?.parentAIAgentId
    const nodeSpacing = parentAIAgentId ? 120 : 160

    delete addActionHandlersRef.current[placeholderId]

    // Track nodes that need to move up after deletion
    const deletedNodeY = nodeToDelete.position.y
    const deletedNodeX = nodeToDelete.position.x

    setNodes((prevNodes) => {
      let nextNodes = prevNodes.filter((node) => node.id !== nodeId && node.id !== placeholderId)

      // Move nodes that were below the deleted node up
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

      // After deleting a node, remove ALL Add Action nodes first
      // We'll add back the correct one after edges are updated
      nextNodes = nextNodes.filter(n => n.type !== 'addAction')

      return nextNodes
    })

    setEdges((prevEdges) => {
      let nextEdges = prevEdges.filter((edge) => {
        if (edge.source === nodeId || edge.target === nodeId) return false
        if (edge.source === placeholderId || edge.target === placeholderId) return false
        return true
      })

      // Reconnect nodes that were connected through the deleted node
      if (incomingEdges.length > 0 && outgoingEdges.length > 0) {
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
                        console.log('🔵 Edge button clicked - inserting between:', incomingEdge.source, 'and', outgoingEdge.target)
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

    // After edges are updated, ensure only one Add Action at the end of each chain
    setTimeout(() => {
      ensureOneAddActionPerChain()
    }, 50)

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
    configHook.setConfiguringNode(null)
  }, [configHook])

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
    return executionHook.handleTestSandbox()
  }, [executionHook])

  const handleExecuteLive = useCallback(() => {
    const currentNodes = getNodes()
    const currentEdges = getEdges()
    return executionHook.handleExecute(currentNodes, currentEdges)
  }, [getNodes, getEdges, executionHook])

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
    ...dialogsHook,
    ...integrationHook,
    ...configHook,

    // Additional handlers and states
    handleConfigureNode,
    handleDeleteNodeWithConfirmation,
    handleAddNodeBetween,
    handleNodeConfigure,
    handleNodeDelete,
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
  }
}
