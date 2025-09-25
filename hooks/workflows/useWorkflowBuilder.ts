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

  // Custom hooks
  const executionHook = useWorkflowExecution()
  const dialogsHook = useWorkflowDialogs()
  const integrationHook = useIntegrationSelection()
  const configHook = useNodeConfiguration(
    currentWorkflow?.id,
    nodes,
    setNodes,
    setHasUnsavedChanges
  )

  // Memoized node and edge types
  const nodeTypes = useMemo(() => ({
    custom: CustomNode,
    addAction: AddActionNode,
    insertAction: InsertActionNode as any,
  }), [])
  
  const edgeTypes = useMemo(() => ({
    custom: CustomEdgeWithButton,
  }), [])

  // Load initial data
  useEffect(() => {
    fetchWorkflows()
  }, [fetchWorkflows])

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
          
          // Add AddActionNodes after each leaf node (nodes with no outgoing edges)
          allNodes = [...flowNodes]
          
          // Find leaf nodes - nodes that are not sources for any connection
          const leafNodes = flowNodes.filter((node: any) => {
            // Skip AI agent nodes and existing addAction nodes
            if (node.data?.type === 'ai_agent' || node.type === 'addAction') {
              return false
            }
            
            // Check if this node is a source for any connection
            const isSource = workflow.connections?.some((conn: WorkflowConnection) => 
              conn.source === node.id
            )
            
            // If it's not a source for any connection, it's a leaf node
            return !isSource
          })
          
          // If no leaf nodes found but we have nodes, use all non-AI-agent nodes
          const nodesToAddAfter = leafNodes.length > 0 ? leafNodes : 
            flowNodes.filter((n: any) => n.data?.type !== 'ai_agent' && n.type !== 'addAction')
          
          // Add AddActionNode after each leaf node
          const addActionNodes: Node[] = []
          const addActionEdges: any[] = []
          
          nodesToAddAfter.forEach((node: any, index: number) => {
            const addActionId = `add-action-${node.id}`
            console.log('Creating AddActionNode:', addActionId, 'handleAddActionClick available:', !!handleAddActionClick)
            
            // Store the handler in ref
            const clickHandler = () => handleAddActionClick(addActionId, node.id)
            addActionHandlersRef.current[addActionId] = clickHandler
            
            const addActionNode: Node = {
              id: addActionId,
              type: 'addAction',
              position: { 
                x: node.position.x, 
                y: node.position.y + 160 
              },
              data: {
                parentId: node.id,
                onClick: clickHandler
              }
            }
            addActionNodes.push(addActionNode)
            // Ensure unique edge IDs by adding index if needed
            const edgeId = `e-${node.id}-add-${Date.now()}-${index}`
            addActionEdges.push({
              id: edgeId,
              source: node.id,
              target: addActionId,
              parentId: node.id
            })
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
            })
          }
          
          setEdges(flowEdges)
        }
        
        // Join collaboration
        joinCollaboration(workflowId)
        
        // Set workflow for error tracking
        setErrorStoreWorkflow(workflow)
        
        // Fit view after loading
        setTimeout(() => fitView({ padding: 0.2 }), 100)
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
      
      // Remove UI-only placeholder nodes (AddAction) before saving
      const placeholderNodeIds = new Set(
        nodes
          .filter(n => n.type === 'addAction' || (typeof n.id === 'string' && n.id.startsWith('add-action-')))
          .map(n => n.id)
      )

      const persistedNodes = nodes.filter(n => !placeholderNodeIds.has(n.id))
      const persistedEdges = edges.filter(e => !placeholderNodeIds.has(e.source) && !placeholderNodeIds.has(e.target))

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
  }, [currentWorkflow, nodes, edges, workflowName, workflowDescription, updateWorkflow, toast])

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
            onAddNode: (sourceId: string, targetId: string, position: { x: number; y: number }) => {
              // Implementation for adding node between edges
              console.log('Add node between', sourceId, 'and', targetId)
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

  // Determine loading state
  const shouldShowLoading = () => {
    if (workflowId && !currentWorkflow) return true
    if (integrationsLoading && workflows.length === 0) return true
    if (workflowLoading && !currentWorkflow) return true
    return false
  }

  const isLoading = shouldShowLoading()
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
      // Store the pending action info and open configuration
      configHook.setPendingNode({ 
        type: 'action', 
        integration, 
        nodeComponent: action,
        sourceNodeInfo: dialogsHook.sourceAddNode 
      })
      configHook.setConfiguringNode({ 
        id: 'pending-action', 
        integration, 
        nodeComponent: action, 
        config: {} 
      })
    } else {
      // Add action without configuration
      // Implementation would go here
    }
    dialogsHook.setShowActionDialog(false)
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
    const parentId = sourceNodeInfo?.parentId || sourceNodeInfo?.id
    if (!parentId) return undefined
    
    const newNodeId = `action-${Date.now()}`
    const parentNode = nodes.find(n => n.id === parentId)
    if (!parentNode) return undefined
    
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
        onConfigure: handleNodeConfigure,
        onDelete: handleNodeDelete,
        onAddChain: nodeComponent.type === 'ai_agent' ? handleNodeAddChain : undefined
      }
    }
    
    // Remove old AddActionNode and add new nodes
    setNodes(nds => {
      const filteredNodes = nds.filter(n => n.id !== sourceNodeInfo.id)
      const updatedNodes = [...filteredNodes, newNode]
      
      // Add new AddActionNode after the new action
      const addActionId = `add-action-${newNodeId}`
      
      // Store the handler in ref
      const clickHandler = () => handleAddActionClick(addActionId, newNodeId)
      addActionHandlersRef.current[addActionId] = clickHandler
      
      const addActionNode: Node = {
        id: addActionId,
        type: 'addAction',
        position: { 
          x: newNode.position.x, 
          y: newNode.position.y + 160 
        },
        data: {
          parentId: newNodeId,
          onClick: clickHandler
        }
      }
      
      return [...updatedNodes, addActionNode]
    })
    
    // Update edges
    setEdges(eds => {
      // Remove edge to old AddActionNode
      const filteredEdges = eds.filter(e => e.target !== sourceNodeInfo.id)
      
      // Add edge from parent to new node
      const newEdges = [...filteredEdges, {
        id: `e-${parentId}-${newNodeId}`,
        source: parentId,
        target: newNodeId,
        type: 'custom',
        animated: false,
        style: { stroke: "#d1d5db", strokeWidth: 1 }
      }, {
        id: `e-${newNodeId}-add-action-${newNodeId}`,
        source: newNodeId,
        target: `add-action-${newNodeId}`,
        type: 'custom',
        animated: false,
        style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "5 5" }
      }]
      
      return newEdges
    })
    
    setHasUnsavedChanges(true)
    return newNodeId
  }, [nodes, setNodes, setEdges, handleNodeConfigure, handleNodeDelete, handleNodeAddChain, handleAddActionClick])

  return {
    // React Flow state
    nodes,
    edges: processedEdges,
    setNodes,
    setEdges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    nodeTypes,
    edgeTypes,
    fitView,
    
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
    integrationsLoading: integrationsLoading || integrationsCacheLoading,
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
    
    // From custom hooks
    ...executionHook,
    ...dialogsHook,
    ...integrationHook,
    ...configHook,
  }
}