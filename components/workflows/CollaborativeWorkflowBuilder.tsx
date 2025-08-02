"use client"

import React, { useEffect, useCallback, useState, useMemo, useRef, startTransition } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  Panel,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { useWorkflowStore, type Workflow, type WorkflowNode, type WorkflowConnection } from "@/stores/workflowStore"
import { useCollaborationStore } from "@/stores/collaborationStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import { useWorkflowTestStore } from "@/stores/workflowTestStore"
import { loadWorkflows, useWorkflowsListStore } from "@/stores/cachedWorkflowStore"
import { loadIntegrationsOnce, useIntegrationsStore } from "@/stores/integrationCacheStore"
import { supabase } from "@/utils/supabaseClient"
import ConfigurationModal from "./ConfigurationModal"
import AIAgentConfigModal from "./AIAgentConfigModal"
import CustomNode from "./CustomNode"
import { AddActionNode } from "./AddActionNode"
import { CollaboratorCursors } from "./CollaboratorCursors"
import { ExecutionMonitor, type ExecutionEvent } from "./ExecutionMonitor"
import { Button } from "@/components/ui/button"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Save, Loader2, Play, ArrowLeft, Plus, Search, ChevronRight, RefreshCw } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ALL_NODE_COMPONENTS, NodeComponent } from "@/lib/workflows/availableNodes"
import { INTEGRATION_CONFIGS } from "@/lib/integrations/availableIntegrations"
import { useToast } from "@/hooks/use-toast"
import { useWorkflowEmailTracking } from "@/hooks/use-email-cache"
import { Card } from "@/components/ui/card"
import { WorkflowLoadingScreen } from "@/components/ui/loading-screen"

type IntegrationInfo = {
  id: string
  name: string
  description: string
  category: string
  color: string
  triggers: NodeComponent[]
  actions: NodeComponent[]
}

const getIntegrationsFromNodes = (): IntegrationInfo[] => {
  const integrationMap: Record<string, IntegrationInfo> = {}
  
  // Add AI Agent as a separate integration first
  integrationMap['ai'] = {
    id: 'ai',
    name: 'AI Agent',
    description: 'Intelligent automation with AI-powered decision making and task execution',
    category: 'ai',
    color: '#8B5CF6',
    triggers: [],
    actions: [],
  }
  
  // Add other integrations from configs
  for (const integrationId in INTEGRATION_CONFIGS) {
    const config = INTEGRATION_CONFIGS[integrationId]
    if (config) {
      integrationMap[integrationId] = {
        id: config.id,
        name: config.name,
        description: config.description,
        category: config.category,
        color: config.color,
        triggers: [],
        actions: [],
      }
    }
  }
  
  ALL_NODE_COMPONENTS.forEach((node) => {
    if (node.providerId && integrationMap[node.providerId]) {
      if (node.isTrigger) {
        integrationMap[node.providerId].triggers.push(node)
      } else {
        integrationMap[node.providerId].actions.push(node)
      }
    }

  })
  const integrations = Object.values(integrationMap)
  
  // Sort integrations to put logic first, then AI Agent, then alphabetically
  return integrations.sort((a, b) => {
    if (a.id === 'logic') return -1
    if (b.id === 'logic') return 1
    if (a.id === 'ai') return -1
    if (b.id === 'ai') return 1
    return a.name.localeCompare(b.name)
  })
}

const nodeTypes: NodeTypes = {
  custom: CustomNode as React.ComponentType<NodeProps>,
  addAction: AddActionNode as React.ComponentType<NodeProps>,
}

// Add concurrent state updates for better UX
const useConcurrentStateUpdates = () => {
  const updateWithTransition = useCallback((updateFn: () => void) => {
    startTransition(() => {
      updateFn()
    })
  }, [])
  
  return { updateWithTransition }
}

const useWorkflowBuilderState = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const workflowId = searchParams.get("id")

  const { currentWorkflow, setCurrentWorkflow, updateWorkflow, loading: workflowLoading } = useWorkflowStore()
  const { joinCollaboration, leaveCollaboration, collaborators } = useCollaborationStore()
  const { getConnectedProviders, loading: integrationsLoading } = useIntegrationStore()
  
  // Use cached stores for workflows and integrations
  const { data: workflows, loading: workflowsCacheLoading } = useWorkflowsListStore()
  const { data: integrations, loading: integrationsCacheLoading } = useIntegrationsStore()
  
  // Helper to get current user ID for integrations
  const getCurrentUserId = useCallback(async (): Promise<string | null> => {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.id || null
  }, [])
  
  // Use cached data with fallbacks
  const workflowsData = workflows || []
  const integrationsData = integrations || []
  
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const { fitView, getNodes, getEdges } = useReactFlow()

  const [isSaving, setIsSaving] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionEvents, setExecutionEvents] = useState<ExecutionEvent[]>([])
  const [workflowName, setWorkflowName] = useState("")
  const [showTriggerDialog, setShowTriggerDialog] = useState(false)
  const [showActionDialog, setShowActionDialog] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationInfo | null>(null)
  const [selectedTrigger, setSelectedTrigger] = useState<NodeComponent | null>(null)
  const [selectedAction, setSelectedAction] = useState<NodeComponent | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [filterCategory, setFilterCategory] = useState("all")
  const [showConnectedOnly, setShowConnectedOnly] = useState(true)
  const [sourceAddNode, setSourceAddNode] = useState<{ id: string; parentId: string } | null>(null)
  const [configuringNode, setConfiguringNode] = useState<{ id: string; integration: any; nodeComponent: NodeComponent; config: Record<string, any> } | null>(null)
  const [pendingNode, setPendingNode] = useState<{ type: 'trigger' | 'action'; integration: IntegrationInfo; nodeComponent: NodeComponent; sourceNodeInfo?: { id: string; parentId: string } } | null>(null)
  const [deletingNode, setDeletingNode] = useState<{ id: string; name: string } | null>(null)
  const [testMode, setTestMode] = useState(false)
  const [hasShownLoading, setHasShownLoading] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [isRebuildingAfterSave, setIsRebuildingAfterSave] = useState(false)

  const { toast } = useToast()
  const { trackWorkflowEmails } = useWorkflowEmailTracking()
  const { updateWithTransition } = useConcurrentStateUpdates()
  
  const availableIntegrations = useMemo(() => {
    const integrations = getIntegrationsFromNodes()
    // Debug: Check if AI Agent integration has actions
    const aiIntegration = integrations.find(int => int.id === 'ai')
    if (aiIntegration) {
      console.log('AI Integration found:', aiIntegration)
      console.log('AI Integration actions:', aiIntegration.actions)
    } else {
      console.log('AI Integration not found in availableIntegrations')
    }
    return integrations
  }, [])

  const nodeNeedsConfiguration = (nodeComponent: NodeComponent): boolean => {
    // Check if the node has a configuration schema
    const hasConfigSchema = !!(nodeComponent.configSchema && nodeComponent.configSchema.length > 0);
    
    // Node needs configuration if it has a config schema
    return hasConfigSchema;
  }

  // Helper function to get the current workflow's trigger
  const getWorkflowTrigger = () => {
    const triggerNode = getNodes().find(node => node.data?.isTrigger)
    return triggerNode
  }

  // Helper function to check if action should be available based on trigger
  const isActionCompatibleWithTrigger = (action: NodeComponent): boolean => {
    const trigger = getWorkflowTrigger()
    
    // If no trigger yet, allow all actions
    if (!trigger) return true
    
    // Gmail actions should only be available with Gmail triggers
    if (action.providerId === 'gmail') {
      return trigger.data?.providerId === 'gmail'
    }
    
    // All other actions are available regardless of trigger
    return true
  }

  // Helper function to check if AI Agent can be used after a specific node
  const canUseAIAgentAfterNode = (parentNode: Node): boolean => {
    // Find the node component definition
    const nodeComponent = ALL_NODE_COMPONENTS.find((c) => c.type === parentNode.data.type)
    
    // AI Agent can only be used after nodes that produce outputs
    return nodeComponent?.producesOutput === true
  }

  // Helper function to filter actions based on compatibility
  const getCompatibleActions = (actions: NodeComponent[]): NodeComponent[] => {
    const trigger = getNodes().find(node => node.data?.isTrigger)
    
    return actions.filter(action => {
      // Gmail actions should only be available with Gmail triggers
      if (action.providerId === 'gmail' && trigger && trigger.data?.providerId !== 'gmail') {
        return false
      }
      
      // AI Agent can only be used after nodes that produce outputs
      if (action.type === 'ai_agent' && sourceAddNode) {
        const parentNode = getNodes().find(n => n.id === sourceAddNode.parentId)
        if (parentNode && !canUseAIAgentAfterNode(parentNode)) {
          return false
        }
      }
      
      return true
    })
  }

  const isIntegrationConnected = useCallback((integrationId: string): boolean => {
    // Logic integration is always "connected" since it doesn't require authentication
    if (integrationId === 'logic') return true;
    
    // AI Agent is always "connected" since it doesn't require external authentication
    if (integrationId === 'ai') return true;
    
    // Use the integration store to check if this integration is connected
    const connectedProviders = getConnectedProviders();
    const isConnected = connectedProviders.includes(integrationId);
    // console.log('🔍 Integration connection check:', { integrationId, connectedProviders, isConnected });
    return isConnected;
  }, [integrations])



  const handleChangeTrigger = useCallback(() => {
    // Store existing action nodes (non-trigger nodes) to preserve them
    const currentNodes = getNodes();
    const actionNodes = currentNodes.filter(node => 
      node.type === 'custom' && !node.data.isTrigger
    );
    
    // Store the action nodes temporarily in state so we can restore them after trigger selection
    // We'll use a ref or state to store these
    sessionStorage.setItem('preservedActionNodes', JSON.stringify(actionNodes));
    
    // Clear all configuration preferences when changing trigger
    const clearAllPreferences = async () => {
      try {
        console.log(`🗑️ Clearing all preferences due to trigger change`)
        
        // Clear all preferences for this user
        const response = await fetch(`/api/user/config-preferences`, {
          method: "DELETE"
        })
        
        if (response.ok) {
          console.log(`✅ Successfully cleared all preferences`)
        } else {
          console.warn(`⚠️ Failed to clear all preferences:`, response.status)
        }
      } catch (error) {
        console.error(`❌ Error clearing all preferences:`, error)
      }
    }
    
    clearAllPreferences();
    
    setSelectedIntegration(null);
    setSelectedTrigger(null);
    setSearchQuery("");
    setShowTriggerDialog(true);
  }, [getNodes, setSelectedIntegration, setSelectedTrigger, setSearchQuery, setShowTriggerDialog])

  const handleConfigureNode = useCallback((nodeId: string) => {
    const nodeToConfigure = getNodes().find((n) => n.id === nodeId)
    if (!nodeToConfigure) return
    const nodeComponent = ALL_NODE_COMPONENTS.find((c) => c.type === nodeToConfigure.data.type)
    if (!nodeComponent) return

    const providerId = nodeToConfigure.data.providerId as keyof typeof INTEGRATION_CONFIGS
    const integration = INTEGRATION_CONFIGS[providerId]
    if (integration && nodeComponent) {
      setConfiguringNode({ id: nodeId, integration, nodeComponent, config: nodeToConfigure.data.config || {} })
    }
  }, [getNodes])

  const handleAddActionClick = useCallback((nodeId: string, parentId: string) => {
    console.log('🔍 handleAddActionClick called:', { nodeId, parentId })
    setSourceAddNode({ id: nodeId, parentId })
    setSelectedIntegration(null)
    setSelectedAction(null)
    setSearchQuery("")
    setShowActionDialog(true)
    console.log('✅ Action dialog opened, sourceAddNode set')
  }, [])

  const handleActionDialogClose = useCallback((open: boolean) => {
    if (!open) {
      // Always clear sourceAddNode when dialog closes to prevent reopening
      setSourceAddNode(null)
      setSelectedIntegration(null)
      setSelectedAction(null)
      setSearchQuery("")
    }
    setShowActionDialog(open)
  }, [])



  // Memoize the recalculateLayout function to prevent unnecessary calls
  const recalculateLayout = useCallback(() => {
    const nodeList = getNodes()
      .filter((n: Node) => n.type === "custom" || n.type === "addAction")
      .sort((a: Node, b: Node) => a.position.y - b.position.y)
    if (nodeList.length === 0) return

    const triggerNode = nodeList.find((n: Node) => n.data?.isTrigger)
    const basePosition = triggerNode ? { x: triggerNode.position.x, y: triggerNode.position.y } : { x: 400, y: 100 }
    const verticalGap = 120
    let currentY = basePosition.y
    
    // Use requestAnimationFrame for smoother performance
    requestAnimationFrame(() => {
      const newNodes = getNodes()
        .map((n: Node) => {
          if (n.type === "custom" || n.type === "addAction") {
            const newY = currentY
            currentY += verticalGap
            return { ...n, position: { x: basePosition.x, y: newY } }
          }
          return n
        })
        .sort((a: Node, b: Node) => a.position.y - b.position.y)
        
      let runningNodes = newNodes
        .filter((n: Node) => n.type === "custom" || n.type === "addAction")
        .sort((a: Node, b: Node) => a.position.y - b.position.y)
        
      const newEdges: Edge[] = []
      for (let i = 0; i < runningNodes.length - 1; i++) {
        const source = runningNodes[i]
        const target = runningNodes[i + 1]
        newEdges.push({
          id: `${source.id}-${target.id}`,
          source: source.id,
          target: target.id,
          animated: false,
          style: { 
            stroke: "#d1d5db", 
            strokeWidth: 1, 
            strokeDasharray: target.type === "addAction" ? "5,5" : undefined 
          },
          type: "straight",
        })
      }
      
      setNodes(newNodes)
      setEdges(newEdges)
      
      // Delay fitView to ensure layout is complete
      setTimeout(() => fitView({ padding: 0.5 }), 100)
    })
  }, [getNodes, setNodes, setEdges, fitView])

  const handleDeleteNode = useCallback((nodeId: string) => {
    const allNodes = getNodes()
    const allEdges = getEdges()
    const nodeToRemove = allNodes.find((n) => n.id === nodeId)
    if (!nodeToRemove) return
    
    // Clear configuration preferences for the deleted node
    const clearNodePreferences = async () => {
      try {
        const nodeType = nodeToRemove.data.type
        const providerId = nodeToRemove.data.providerId
        const nodeId = nodeToRemove.id
        
        if (nodeType && providerId) {
          console.log(`🗑️ Clearing preferences for deleted node: ${nodeType} (${providerId}) - Node ID: ${nodeId}`)
          
          // Since we can't easily identify which preferences belong to which node,
          // we'll clear ALL preferences for this node type and provider
          // This is a temporary solution until we implement proper node isolation
          const response = await fetch(`/api/user/config-preferences?nodeType=${encodeURIComponent(nodeType)}&providerId=${encodeURIComponent(providerId)}`, {
            method: "DELETE"
          })
          
          if (response.ok) {
            console.log(`✅ Successfully cleared all preferences for ${nodeType} (${providerId})`)
          } else {
            console.warn(`⚠️ Failed to clear preferences for ${nodeType}:`, response.status)
          }
        }
      } catch (error) {
        console.error(`❌ Error clearing preferences for deleted node:`, error)
      }
    }
    
    // Clear preferences immediately
    clearNodePreferences()
    
    // If we're deleting the trigger or this is the last custom node, reset the workflow
    const customNodes = allNodes.filter((n: Node) => n.type === "custom")
    if (nodeToRemove.data.isTrigger || customNodes.length <= 1) {
      // Clear all configuration preferences when resetting the workflow
      const clearAllPreferences = async () => {
        try {
          console.log(`🗑️ Clearing all preferences due to workflow reset`)
          
          // Clear all preferences for this user
          const response = await fetch(`/api/user/config-preferences`, {
            method: "DELETE"
          })
          
          if (response.ok) {
            console.log(`✅ Successfully cleared all preferences`)
          } else {
            console.warn(`⚠️ Failed to clear all preferences:`, response.status)
          }
        } catch (error) {
          console.error(`❌ Error clearing all preferences:`, error)
        }
      }
      
      clearAllPreferences()
      setNodes([])
      setEdges([])
      return
    }
    
    // Find the node before the deleted node (by following edges)
    const incomingEdge = allEdges.find(e => e.target === nodeId)
    const previousNodeId = incomingEdge?.source
    
    // Find nodes that come after the deleted node
    const outgoingEdges = allEdges.filter(e => e.source === nodeId)
    
    // Remove the node and all related edges
    const nodesAfterRemoval = allNodes.filter((n: Node) => n.id !== nodeId)
    const edgesAfterRemoval = allEdges.filter((e: Edge) => e.source !== nodeId && e.target !== nodeId)
    
    // Remove any add action nodes that were connected to this node
    const cleanedNodes = nodesAfterRemoval.filter((n: Node) => 
      !(n.type === "addAction" && n.data.parentId === nodeId)
    )
    
    // If there was a previous node, reconnect it to the nodes that were after the deleted node
    let updatedEdges = edgesAfterRemoval
    if (previousNodeId && outgoingEdges.length > 0) {
      // Connect the previous node to the next nodes
      outgoingEdges.forEach(outgoingEdge => {
        updatedEdges.push({
          id: `${previousNodeId}-${outgoingEdge.target}`,
          source: previousNodeId,
          target: outgoingEdge.target,
          animated: false,
          style: { stroke: "#d1d5db", strokeWidth: 1 },
          type: "straight"
        })
      })
    }
    
    // Update the nodes and edges state
    setNodes(cleanedNodes)
    setEdges(updatedEdges)
    
    // Now rebuild the add action button logic
    setTimeout(() => {
      const currentNodes = getNodes()
      const currentEdges = getEdges()
      const remainingCustomNodes = currentNodes.filter((n: Node) => n.type === "custom")
      
      if (remainingCustomNodes.length === 0) {
        return
      }
      
      // Remove all existing add action nodes and their edges
      const nodesWithoutAddActions = currentNodes.filter((n: Node) => n.type !== "addAction")
      const edgesWithoutAddActions = currentEdges.filter((e: Edge) => {
        const targetNode = currentNodes.find((n: Node) => n.id === e.target)
        const sourceNode = currentNodes.find((n: Node) => n.id === e.source)
        return targetNode?.type !== "addAction" && sourceNode?.type !== "addAction"
      })
      
      // Sort remaining custom nodes by Y position to maintain proper order
      const sortedNodes = remainingCustomNodes.sort((a, b) => a.position.y - b.position.y)
      
      // Find the actual last node in the workflow chain
      const lastNode = sortedNodes.find(node => {
        // A node is the last node if no other custom node has it as a source
        return !edgesWithoutAddActions.some(edge => 
          edge.source === node.id && 
          sortedNodes.some(n => n.id === edge.target)
        )
      }) || sortedNodes[sortedNodes.length - 1] // fallback to position-based last node
      
      if (lastNode) {
        // Add new add action node after the actual last custom node
        const addActionId = `add-action-${Date.now()}`
        const addActionNode: Node = {
          id: addActionId,
          type: "addAction",
          position: { x: lastNode.position.x, y: lastNode.position.y + 160 },
          data: { 
            parentId: lastNode.id, 
            onClick: () => handleAddActionClick(addActionId, lastNode.id) 
          }
        }
        
        // Add edge from last node to add action button
        const addActionEdge: Edge = {
          id: `${lastNode.id}-${addActionId}`,
          source: lastNode.id,
          target: addActionId,
          animated: false,
          style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "5,5" },
          type: "straight"
        }
        
        setNodes([...nodesWithoutAddActions, addActionNode])
        setEdges([...edgesWithoutAddActions, addActionEdge])
      }
      
      // Fit view to show the updated workflow
      setTimeout(() => fitView({ padding: 0.5 }), 100)
    }, 50)
  }, [getNodes, getEdges, setNodes, setEdges, fitView, handleAddActionClick])

  const handleDeleteNodeWithConfirmation = useCallback((nodeId: string) => {
    const nodeToDelete = getNodes().find((n) => n.id === nodeId)
    if (!nodeToDelete) return
    
    if (nodeToDelete.data.isTrigger) {
      // For trigger nodes, we don't delete but change trigger instead
      handleChangeTrigger()
      return
    }
    
    // For non-trigger nodes, show confirmation dialog
    setDeletingNode({ id: nodeId, name: (nodeToDelete.data.name as string) || 'this node' })
  }, [getNodes, handleChangeTrigger])

  const confirmDeleteNode = useCallback(() => {
    if (!deletingNode) return
    handleDeleteNode(deletingNode.id)
    setDeletingNode(null)
  }, [deletingNode, handleDeleteNode])

  const onConnect = useCallback((params: Edge | Connection) => setEdges((eds: Edge[]) => addEdge(params, eds)), [setEdges])

  // Debug onNodesChange to see if it's being called
  const debugOnNodesChange = useCallback((changes: any) => {
    console.log('🔄 onNodesChange called with:', changes)
    onNodesChange(changes)
  }, [onNodesChange])

  useEffect(() => {
    if (workflowId) joinCollaboration(workflowId)
    return () => { 
      if (workflowId) leaveCollaboration() 
      // Reset loading states on cleanup
      setIsSaving(false)
      setIsExecuting(false)
      isSavingRef.current = false
    }
  }, [workflowId, joinCollaboration, leaveCollaboration])

  // Debug sourceAddNode changes (trimmed for performance)
  // useEffect(() => {
  //   console.log('🔍 sourceAddNode changed:', sourceAddNode)
  // }, [sourceAddNode])

  useEffect(() => {
    if (!workflowsData.length && !workflowsCacheLoading) {
      loadWorkflows()
    }
  }, [workflowsData.length, workflowsCacheLoading])

  useEffect(() => {
    // Only fetch integrations once when component mounts
    if (integrationsData.length === 0 && !integrationsCacheLoading) {
      getCurrentUserId().then(userId => {
        if (userId) {
          loadIntegrationsOnce(userId)
        }
      })
    }
  }, [integrationsData.length, integrationsCacheLoading, getCurrentUserId])

  useEffect(() => {
    if (workflowId) {
      // Clear any existing workflow data first to ensure fresh load
      setCurrentWorkflow(null);
      
      // Always fetch fresh data from the API instead of using cached data
      const loadFreshWorkflow = async () => {
        try {
          console.log('🔄 Loading fresh workflow from API...');
          const response = await fetch(`/api/workflows/${workflowId}`);
          if (response.ok) {
            const freshWorkflow = await response.json();
            setCurrentWorkflow(freshWorkflow);
            console.log('✅ Fresh workflow loaded:', {
              id: freshWorkflow.id,
              name: freshWorkflow.name,
              nodesCount: freshWorkflow.nodes?.length || 0,
              nodePositions: freshWorkflow.nodes?.map((n: WorkflowNode) => ({ 
                id: n.id, 
                position: n.position 
              }))
            });
          } else {
            console.error('Failed to load workflow:', response.statusText);
          }
        } catch (error) {
          console.error('Error loading fresh workflow:', error);
        }
      };
      
      loadFreshWorkflow();
    }
  }, [workflowId, setCurrentWorkflow])

  // Add a ref to track if we're in a save operation
  const isSavingRef = useRef(false)
  
  useEffect(() => {
    // Don't rebuild nodes if we're currently saving (to prevent visual disruption)
    if (isSavingRef.current) {
      return
    }
    
    if (currentWorkflow) {
      console.log('🔍 Loading workflow from database:', JSON.stringify({
        id: currentWorkflow.id,
        name: currentWorkflow.name,
        nodes: currentWorkflow.nodes,
        connections: currentWorkflow.connections
      }, null, 2))
      setWorkflowName(currentWorkflow.name)
      
      // Always rebuild nodes on initial load to ensure positions are loaded correctly
      const currentNodeIds = getNodes().filter(n => n.type === 'custom').map(n => n.id).sort()
      const workflowNodeIds = (currentWorkflow.nodes || []).map(n => n.id).sort()
      const nodesChanged = JSON.stringify(currentNodeIds) !== JSON.stringify(workflowNodeIds)
      
      console.log('🔍 Load check - nodesChanged:', nodesChanged)
      console.log('🔍 Load check - currentNodeIds:', currentNodeIds)
      console.log('🔍 Load check - workflowNodeIds:', workflowNodeIds)
      
      // Check positions even if node IDs haven't changed
      let positionsChanged = false
      if (getNodes().length > 0) {
        const allNodes = getNodes()
        console.log('🔍 Load check - allNodes from getNodes():', JSON.stringify(allNodes.map(n => ({ id: n.id, type: n.type, position: n.position })), null, 2))
        
        const currentPositions = allNodes.filter(n => n.type === 'custom').map(n => ({ id: n.id, position: n.position })).sort((a, b) => a.id.localeCompare(b.id))
        const savedPositions = (currentWorkflow.nodes || []).map(n => ({ id: n.id, position: n.position })).sort((a, b) => a.id.localeCompare(b.id))
        positionsChanged = JSON.stringify(currentPositions) !== JSON.stringify(savedPositions)
        
        console.log('🔍 Load check - positionsChanged:', positionsChanged)
        console.log('🔍 Load check - currentPositions:', JSON.stringify(currentPositions, null, 2))
        console.log('🔍 Load check - savedPositions:', JSON.stringify(savedPositions, null, 2))
      }
      
      // Always rebuild nodes on load to ensure positions are correct
      if (true) {
          // Log the nodes we're loading from the database to verify positions
          console.log('🔄 Loading nodes from database with positions:', 
            JSON.stringify(currentWorkflow.nodes?.map(n => ({ 
              id: n.id, 
              position: n.position,
              type: n.data?.type
            })), null, 2)
          );
          
          const customNodes: Node[] = (currentWorkflow.nodes || []).map((node: WorkflowNode) => {
            // Get the component definition to ensure we have the correct title
            const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === node.data.type);
            
            // Ensure position is a number
            const position = {
              x: typeof node.position.x === 'number' ? node.position.x : parseFloat(node.position.x as unknown as string),
              y: typeof node.position.y === 'number' ? node.position.y : parseFloat(node.position.y as unknown as string)
            };
            
            console.log(`Loading node ${node.id} with position:`, position);
            
            return {
              id: node.id, 
              type: "custom", 
              position: position,
              data: {
                ...node.data,
                // Use title from multiple sources in order of preference 
                title: node.data.title || (nodeComponent ? nodeComponent.title : undefined),
                // Set name for backwards compatibility (used by UI)
                name: node.data.title || (nodeComponent ? nodeComponent.title : node.data.label || 'Unnamed Action'),
                description: node.data.description || (nodeComponent ? nodeComponent.description : undefined),
                onConfigure: handleConfigureNode,
                onDelete: handleDeleteNodeWithConfirmation,
                onChangeTrigger: node.data.type?.includes('trigger') ? handleChangeTrigger : undefined,
                // Use the saved providerId directly, fallback to extracting from type if not available
                providerId: node.data.providerId || node.data.type?.split(/[-_]/)[0]
              },
            };
          })

        let allNodes: Node[] = [...customNodes]
        
        // Find the last action node (not the trigger) to position the add action node
        const actionNodes = customNodes.filter(n => n.id !== 'trigger');
        const lastActionNode = actionNodes.length > 0 
          ? actionNodes.sort((a, b) => b.position.y - a.position.y)[0] 
          : null;
        
        if (lastActionNode) {
          // Add the "add action" node after the last action node
          const addActionId = `add-action-${lastActionNode.id}`;
          const addActionNode: Node = {
            id: addActionId, 
            type: 'addAction', 
            position: { x: lastActionNode.position.x, y: lastActionNode.position.y + 160 },
            data: { parentId: lastActionNode.id, onClick: () => handleAddActionClick(addActionId, lastActionNode.id) }
          };
          allNodes.push(addActionNode);
        } else {
          // If there are no action nodes, add the "add action" node after the trigger
          const triggerNode = customNodes.find(n => n.id === 'trigger');
          if (triggerNode) {
            const addActionId = `add-action-${triggerNode.id}`;
            const addActionNode: Node = {
              id: addActionId, 
              type: 'addAction', 
              position: { x: triggerNode.position.x, y: triggerNode.position.y + 160 },
              data: { parentId: triggerNode.id, onClick: () => handleAddActionClick(addActionId, triggerNode.id) }
            };
            allNodes.push(addActionNode);
          }
        }
        
        const initialEdges: Edge[] = (currentWorkflow.connections || []).map((conn: WorkflowConnection) => ({
          id: conn.id, source: conn.source, target: conn.target,
        }))
        
        // Add edge from the last node (action or trigger) to the add action node
        const addActionNode = allNodes.find(n => n.type === 'addAction');
        if (addActionNode) {
          const sourceNode = lastActionNode || customNodes.find(n => n.id === 'trigger');
          if (sourceNode) {
            initialEdges.push({
              id: `${sourceNode.id}->${addActionNode.id}`, 
              source: sourceNode.id, 
              target: addActionNode.id, 
              animated: true,
              style: { stroke: '#b1b1b7', strokeWidth: 2, strokeDasharray: '5,5' }, 
              type: 'straight'
            });
          }
        }
        
        setNodes(allNodes)
        setEdges(initialEdges)
        setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100)
      }
    } else if (!workflowId) {
      setNodes([])
      setEdges([])
      // Don't automatically show the trigger dialog, let the user click the button
          }
    }, [currentWorkflow, fitView, handleAddActionClick, handleConfigureNode, handleDeleteNode, setCurrentWorkflow, setEdges, setNodes, workflowId, getNodes])

  const handleTriggerSelect = (integration: IntegrationInfo, trigger: NodeComponent) => {
    if (nodeNeedsConfiguration(trigger)) {
      // Store the pending trigger info and open configuration
      setPendingNode({ type: 'trigger', integration, nodeComponent: trigger });
      const integrationConfig = INTEGRATION_CONFIGS[integration.id as keyof typeof INTEGRATION_CONFIGS] || integration;
      
      setConfiguringNode({ 
        id: 'pending-trigger', 
        integration: integrationConfig, 
        nodeComponent: trigger, 
        config: {} 
      });
      setShowTriggerDialog(false);
    } else {
      // Add trigger directly if no configuration needed
      addTriggerToWorkflow(integration, trigger, {});
    }
  }

  const addTriggerToWorkflow = (integration: IntegrationInfo, trigger: NodeComponent, config: Record<string, any>) => {
    const triggerNode: Node = {
      id: "trigger",
      type: "custom",
      position: { x: 400, y: 100 },
      data: {
        ...trigger,
        title: trigger.title,
        name: trigger.title,
        description: trigger.description,
        isTrigger: true,
        onConfigure: handleConfigureNode,
        onDelete: handleDeleteNodeWithConfirmation,
        onChangeTrigger: handleChangeTrigger,
        providerId: integration.id,
        config
      }
    };
    
    // Check if we have preserved action nodes from a trigger change
    const preservedActionNodesJson = sessionStorage.getItem('preservedActionNodes');
    let allNodes: Node[] = [triggerNode];
    let allEdges: Edge[] = [];
    
    if (preservedActionNodesJson) {
      // Restore preserved action nodes
      const preservedActionNodes: Node[] = JSON.parse(preservedActionNodesJson);
      
      // Update the preserved nodes to have the correct handlers
      const restoredActionNodes = preservedActionNodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          onConfigure: handleConfigureNode,
          onDelete: handleDeleteNodeWithConfirmation
        }
      }));
      
      allNodes = [triggerNode, ...restoredActionNodes];
      
      // Create edges to connect trigger to first action node and between action nodes
      if (restoredActionNodes.length > 0) {
        // Connect trigger to first action node
        allEdges.push({
          id: `trigger-${restoredActionNodes[0].id}`,
          source: "trigger",
          target: restoredActionNodes[0].id,
          animated: false,
          style: { stroke: "#d1d5db", strokeWidth: 1 }
        });
        
        // Connect action nodes to each other
        for (let i = 0; i < restoredActionNodes.length - 1; i++) {
          allEdges.push({
            id: `${restoredActionNodes[i].id}-${restoredActionNodes[i + 1].id}`,
            source: restoredActionNodes[i].id,
            target: restoredActionNodes[i + 1].id,
            animated: false,
            style: { stroke: "#d1d5db", strokeWidth: 1 }
          });
        }
      }
      
      // Add the "add action" node after the last action node
      const lastActionNode = restoredActionNodes[restoredActionNodes.length - 1];
      if (lastActionNode) {
        const addActionNode: Node = {
          id: `add-action-${Date.now()}`,
          type: "addAction",
          position: { x: lastActionNode.position.x, y: lastActionNode.position.y + 120 },
          data: {
            parentId: lastActionNode.id,
            onClick: () => handleAddActionClick(`add-action-${Date.now()}`, lastActionNode.id)
          }
        };
        
        allNodes.push(addActionNode);
        allEdges.push({
          id: `${lastActionNode.id}-${addActionNode.id}`,
          source: lastActionNode.id,
          target: addActionNode.id,
          animated: false,
          style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "5,5" }
        });
      } else {
        // If there are no action nodes after restoration, add a default add-action node connected to trigger
        const addActionNode: Node = {
          id: "add-action-1",
          type: "addAction",
          position: { x: 400, y: 240 },
          data: {
            parentId: "trigger",
            onClick: () => handleAddActionClick("add-action-1", "trigger")
          }
        };
        
        allNodes.push(addActionNode);
        allEdges.push({
          id: "trigger-add-action-1",
          source: "trigger",
          target: "add-action-1",
          animated: false,
          style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "5,5" }
        });
      }
      
      // Clear the preserved nodes from session storage
      sessionStorage.removeItem('preservedActionNodes');
    } else {
      // No preserved nodes, create new workflow with just trigger and add action node
      const addActionNode: Node = {
        id: "add-action-1",
        type: "addAction",
        position: { x: 400, y: 240 },
        data: {
          parentId: "trigger",
          onClick: () => handleAddActionClick("add-action-1", "trigger")
        }
      };
      
      allNodes.push(addActionNode);
      allEdges.push({
        id: "trigger-add-action-1",
        source: "trigger",
        target: "add-action-1",
        animated: false,
        style: {
          stroke: "#d1d5db",
          strokeWidth: 1,
          strokeDasharray: "5,5"
        }
      });
    }
    
    setNodes(allNodes);
    setEdges(allEdges);
    
    setShowTriggerDialog(false);
    setSelectedIntegration(null);
    setSelectedTrigger(null);
    setSearchQuery("");
    setTimeout(() => fitView({ padding: 0.5 }), 100);
  }

  const handleActionSelect = (integration: IntegrationInfo, action: NodeComponent) => {
    console.log('🔍 handleActionSelect called:', { integration: integration.id, action: action.type, sourceAddNode })
    
    let effectiveSourceAddNode = sourceAddNode
    
    // Fallback: if sourceAddNode is null, try to find the last Add Action node
    if (!effectiveSourceAddNode) {
      const addActionNodes = getNodes().filter(n => n.type === 'addAction')
      const lastAddActionNode = addActionNodes[addActionNodes.length - 1]
      if (lastAddActionNode && lastAddActionNode.data?.parentId) {
        effectiveSourceAddNode = { 
          id: lastAddActionNode.id, 
          parentId: lastAddActionNode.data.parentId as string
        }
        console.log('🔍 Using fallback sourceAddNode:', effectiveSourceAddNode)
      }
    }
    
    if (!effectiveSourceAddNode) {
      console.error('❌ sourceAddNode is null - cannot add action')
      toast({ 
        title: "Error", 
        description: "Unable to add action. Please try clicking the 'Add Action' button again.", 
        variant: "destructive" 
      })
      return
    }
    
    if (nodeNeedsConfiguration(action)) {
      // Store the pending action info and open configuration
      setPendingNode({ type: 'action', integration, nodeComponent: action, sourceNodeInfo: effectiveSourceAddNode });
      const integrationConfig = INTEGRATION_CONFIGS[integration.id as keyof typeof INTEGRATION_CONFIGS] || integration;
      
      setConfiguringNode({ 
        id: 'pending-action', 
        integration: integrationConfig, 
        nodeComponent: action, 
        config: {} 
      });
      setShowActionDialog(false);
      // Clear sourceAddNode immediately to prevent dialog from reopening
      setSourceAddNode(null);
    } else {
      // Add action directly if no configuration needed
      addActionToWorkflow(integration, action, {}, effectiveSourceAddNode);
    }
  }

  const addActionToWorkflow = (integration: IntegrationInfo, action: NodeComponent, config: Record<string, any>, sourceNodeInfo: { id: string; parentId: string }) => {
    const parentNode = getNodes().find((n) => n.id === sourceNodeInfo.parentId)
    if (!parentNode) return
    const newNodeId = `node-${Date.now()}`
    const newActionNode: Node = {
      id: newNodeId, type: "custom", position: { x: parentNode.position.x, y: parentNode.position.y + 120 },
      data: { 
        ...action, 
        title: action.title, 
        name: action.title || 'Unnamed Action',
        description: action.description,
        onConfigure: handleConfigureNode, 
        onDelete: handleDeleteNodeWithConfirmation, 
        providerId: integration.id, 
        config 
      },
    }
    const newAddActionId = `add-action-${Date.now()}`
    const newAddActionNode: Node = {
      id: newAddActionId, type: "addAction", position: { x: parentNode.position.x, y: parentNode.position.y + 240 },
      data: { parentId: newNodeId, onClick: () => handleAddActionClick(newAddActionId, newNodeId) },
    }
    setNodes((prevNodes: Node[]) => [...prevNodes.filter((n: Node) => n.id !== sourceNodeInfo.id), newActionNode, newAddActionNode])
    setEdges((prevEdges: Edge[]) => [
      ...prevEdges.filter((e: Edge) => e.target !== sourceNodeInfo.id),
      {
        id: `${parentNode.id}-${newNodeId}`,
        source: parentNode.id,
        target: newNodeId,
        animated: false,
        style: { stroke: "#d1d5db", strokeWidth: 1 }
      },
      {
        id: `${newNodeId}-${newAddActionId}`,
        source: newNodeId,
        target: newAddActionId,
        animated: false,
        style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "5,5" }
      }
    ])
    setShowActionDialog(false); setSelectedIntegration(null); setSourceAddNode(null)
    setTimeout(() => fitView({ padding: 0.5 }), 100)
  }

  const handleSaveConfiguration = (context: { id: string }, newConfig: Record<string, any>) => {
    if (context.id === 'pending-trigger' && pendingNode?.type === 'trigger') {
      // Add trigger to workflow with configuration
      addTriggerToWorkflow(pendingNode.integration, pendingNode.nodeComponent, newConfig);
      setPendingNode(null);
      setConfiguringNode(null);
      toast({ title: "Trigger Added", description: "Your trigger has been configured and added to the workflow." });
    } else if (context.id === 'pending-action' && pendingNode?.type === 'action' && pendingNode.sourceNodeInfo) {
      // Add action to workflow with configuration
      addActionToWorkflow(pendingNode.integration, pendingNode.nodeComponent, newConfig, pendingNode.sourceNodeInfo);
      setPendingNode(null);
      setConfiguringNode(null);
      toast({ title: "Action Added", description: "Your action has been configured and added to the workflow." });
    } else {
      // Handle existing node configuration updates
      setNodes((nds) => nds.map((node) => (node.id === context.id ? { ...node, data: { ...node.data, config: newConfig } } : node)))
      toast({ title: "Configuration Saved", description: "Your node configuration has been updated." })
      setConfiguringNode(null)
    }
  }

  const handleSave = async () => {
    if (!currentWorkflow) return
    
    // Prevent multiple simultaneous save operations
    if (isSaving) {
      console.log("Save already in progress, skipping...")
      return
    }
    
    console.log("Starting save process...")
    setIsSaving(true)
    isSavingRef.current = true
    
    // Add timeout protection
    const saveTimeout = setTimeout(() => {
      console.error("Save operation timed out")
      setIsSaving(false)
      isSavingRef.current = false
      toast({ 
        title: "Save Timeout", 
        description: "Save operation took too long. Please try again.", 
        variant: "destructive" 
      })
    }, 30000) // 30 second timeout
    
    try {
      // Get current nodes and edges from React Flow
      const reactFlowNodes = getNodes().filter((n: Node) => n.type === 'custom')
      const reactFlowEdges = getEdges().filter((e: Edge) => reactFlowNodes.some((n: Node) => n.id === e.source) && reactFlowNodes.some((n: Node) => n.id === e.target))

      console.log("React Flow nodes:", reactFlowNodes)
      console.log("React Flow edges:", reactFlowEdges)
      console.log("🔍 Save - Node positions:", reactFlowNodes.map(n => ({ id: n.id, position: n.position })))

      // Map to database format without losing React Flow properties
      const mappedNodes: WorkflowNode[] = reactFlowNodes.map((n: Node) => {
        // Ensure position is properly captured and converted to numbers
        const position = {
          x: typeof n.position.x === 'number' ? Math.round(n.position.x * 100) / 100 : parseFloat(parseFloat(n.position.x as unknown as string).toFixed(2)),
          y: typeof n.position.y === 'number' ? Math.round(n.position.y * 100) / 100 : parseFloat(parseFloat(n.position.y as unknown as string).toFixed(2))
        };
        
        // Log each node position to verify
        console.log(`Saving node ${n.id} position:`, position);
        
        return {
          id: n.id, 
          type: 'custom', 
          position: position,
          data: { 
            label: n.data.label as string, 
            type: n.data.type as string, 
            config: n.data.config || {},
            providerId: n.data.providerId as string | undefined,
            isTrigger: n.data.isTrigger as boolean | undefined,
            title: n.data.title as string | undefined,
            description: n.data.description as string | undefined
          },
        };
      })
      
      const mappedConnections: WorkflowConnection[] = reactFlowEdges.map((e: Edge) => ({
        id: e.id, 
        source: e.source, 
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined, 
        targetHandle: e.targetHandle ?? undefined,
      }))

      console.log("Mapped nodes:", mappedNodes)
      console.log("Mapped connections:", mappedConnections)
      console.log("🔍 Save - Mapped node positions:", mappedNodes.map(n => ({ id: n.id, position: n.position })))

      const updates: Partial<Workflow> = {
        name: workflowName, 
        description: currentWorkflow.description,
        nodes: mappedNodes, 
        connections: mappedConnections, 
        status: currentWorkflow.status,
      }

      console.log("Saving updates:", updates)
      console.log("🔍 Database update payload:", JSON.stringify(updates, null, 2))

      // Save to database with better error handling
      const result = await updateWorkflow(currentWorkflow!.id, updates)
      console.log("🔍 Database update result:", result)
      
      // Update the current workflow state with the new data but keep React Flow intact
      const userId: string = typeof currentWorkflow!.user_id === "string" ? currentWorkflow!.user_id : (() => { throw new Error("user_id is missing from currentWorkflow"); })();
      const newWorkflow: Workflow = {
        id: currentWorkflow!.id,
        name: workflowName,
        description: currentWorkflow!.description || null,
        user_id: userId as string,
        nodes: mappedNodes,
        connections: mappedConnections,
        status: currentWorkflow!.status,
        created_at: currentWorkflow!.created_at,
        updated_at: currentWorkflow!.updated_at
      };
      setCurrentWorkflow(newWorkflow);
      
      console.log("✅ Save completed successfully")
      console.log("✅ Saved workflow with nodes:", JSON.stringify(mappedNodes.map(n => ({ id: n.id, position: n.position })), null, 2))
      toast({ title: "Workflow Saved", description: "Your workflow has been successfully saved." })
      
      // Immediately clear unsaved changes flag to prevent UI flicker
      setHasUnsavedChanges(false);
      
      // Update the last save timestamp to prevent immediate change detection
      lastSaveTimeRef.current = Date.now();
      console.log('⏱️ Updated last save time:', new Date(lastSaveTimeRef.current).toISOString());
      
      // Update the current workflow with the saved data to avoid loading screen
      console.log("🔄 Updating current workflow with saved data...");
      
      // Update the current workflow with the saved data instead of clearing it
      setCurrentWorkflow(newWorkflow);
      
      // Force a rebuild of nodes after save to ensure positions are updated
      console.log("🔄 Force rebuilding nodes after save...");
      setIsRebuildingAfterSave(true);
      
      setTimeout(() => {
        const customNodes: Node[] = (newWorkflow.nodes || []).map((node: WorkflowNode) => {
          const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === node.data.type);
          
          return {
            id: node.id, 
            type: "custom", 
            position: node.position,
            data: {
              ...node.data,
              title: node.data.title || (nodeComponent ? nodeComponent.title : undefined),
              name: node.data.title || (nodeComponent ? nodeComponent.title : node.data.label || 'Unnamed Action'),
              description: node.data.description || (nodeComponent ? nodeComponent.description : undefined),
              onConfigure: handleConfigureNode,
              onDelete: handleDeleteNodeWithConfirmation,
              onChangeTrigger: node.data.type?.includes('trigger') ? handleChangeTrigger : undefined,
              providerId: node.data.providerId || node.data.type?.split('-')[0]
            },
          };
        });

        let allNodes: Node[] = [...customNodes];
        
        // Find the last action node (not the trigger) to position the add action node
        const actionNodes = customNodes.filter(n => n.id !== 'trigger');
        const lastActionNode = actionNodes.length > 0 
          ? actionNodes.sort((a, b) => b.position.y - a.position.y)[0] 
          : null;
        
        if (lastActionNode) {
          const addActionId = `add-action-${lastActionNode.id}`;
          const addActionNode: Node = {
            id: addActionId, 
            type: 'addAction', 
            position: { x: lastActionNode.position.x, y: lastActionNode.position.y + 160 },
            data: { parentId: lastActionNode.id, onClick: () => handleAddActionClick(addActionId, lastActionNode.id) }
          };
          allNodes.push(addActionNode);
        } else {
          const triggerNode = customNodes.find(n => n.id === 'trigger');
          if (triggerNode) {
            const addActionId = `add-action-${triggerNode.id}`;
            const addActionNode: Node = {
              id: addActionId, 
              type: 'addAction', 
              position: { x: triggerNode.position.x, y: triggerNode.position.y + 160 },
              data: { parentId: triggerNode.id, onClick: () => handleAddActionClick(addActionId, triggerNode.id) }
            };
            allNodes.push(addActionNode);
          }
        }
        
        const initialEdges: Edge[] = (newWorkflow.connections || []).map((conn: WorkflowConnection) => ({
          id: conn.id, source: conn.source, target: conn.target,
        }));
        
        // Add edge from the last node (action or trigger) to the add action node
        const addActionNode = allNodes.find(n => n.type === 'addAction');
        if (addActionNode) {
          const sourceNode = lastActionNode || customNodes.find(n => n.id === 'trigger');
          if (sourceNode) {
            initialEdges.push({
              id: `${sourceNode.id}->${addActionNode.id}`, 
              source: sourceNode.id, 
              target: addActionNode.id, 
              animated: true,
              style: { stroke: '#b1b1b7', strokeWidth: 2, strokeDasharray: '5,5' }, 
              type: 'straight'
            });
          }
        }
        
        setNodes(allNodes);
        setEdges(initialEdges);
        console.log("✅ Nodes rebuilt after save with updated positions");
        
        // Ensure unsaved changes flag is cleared after rebuild completes and prevent detection
        setTimeout(() => {
          setHasUnsavedChanges(false);
          lastSaveTimeRef.current = Date.now(); // Refresh timestamp after rebuild
          console.log('⏱️ Updated last save time after rebuild:', new Date(lastSaveTimeRef.current).toISOString());
          setIsRebuildingAfterSave(false);
        }, 200);
      }, 100);
    } catch (error: any) {
      console.error("Failed to save workflow:", error)
      
      // Provide more specific error messages
      let errorMessage = "Could not save your changes. Please try again."
      if (error.message?.includes("network")) {
        errorMessage = "Network error. Please check your connection and try again."
      } else if (error.message?.includes("timeout")) {
        errorMessage = "Request timed out. Please try again."
      } else if (error.message?.includes("unauthorized")) {
        errorMessage = "Session expired. Please refresh the page and try again."
      }
      
      toast({ 
        title: "Error Saving Workflow", 
        description: errorMessage, 
        variant: "destructive" 
      })
    } finally {
      // Always clear the timeout and reset loading state
      clearTimeout(saveTimeout)
      setIsSaving(false)
      isSavingRef.current = false
    }
  }

  const handleExecute = async () => { 
    // Prevent multiple simultaneous executions
    if (isExecuting) {
      console.log("Execution already in progress, skipping...")
      return
    }
    
    setIsExecuting(true)
    
    // Add timeout protection
    const executeTimeout = setTimeout(() => {
      console.error("Execution operation timed out")
      setIsExecuting(false)
      toast({ 
        title: "Execution Timeout", 
        description: "Workflow execution took too long. Please try again.", 
        variant: "destructive" 
      })
    }, 60000) // 60 second timeout for execution
    
    try {
      if (!currentWorkflow) {
        throw new Error("No workflow selected")
      }

      console.log("Starting workflow execution...")
      console.log("Test mode:", testMode)

      // Get all workflow nodes and edges
      const workflowNodes = getNodes().filter((n: Node) => n.type === 'custom')
      const workflowEdges = getEdges()
      
      console.log("Workflow nodes:", workflowNodes.map(n => ({ id: n.id, type: n.data.type, config: n.data.config })))
      console.log("Workflow edges:", workflowEdges)

      // Track emails from all email-sending nodes
      for (const node of workflowNodes) {
        if (node.data.config && typeof node.data.type === 'string' && node.data.type.includes('send_email')) {
          // Only pass integrationId if it's a valid UUID, not a node type
          const providerId = node.data.providerId as string | undefined
          const integrationId = providerId && !providerId.includes('_') ? providerId : undefined
          await trackWorkflowEmails(node.data.config, integrationId)
        }
      }

      // Prepare workflow data for execution
      const workflowData = {
        id: currentWorkflow.id,
        nodes: workflowNodes.map(node => ({
          id: node.id,
          type: node.type,
          data: {
            type: node.data.type,
            title: node.data.title,
            description: node.data.description,
            providerId: node.data.providerId,
            isTrigger: node.data.isTrigger,
            config: node.data.config || {},
            requiredScopes: node.data.requiredScopes || []
          },
          position: node.position
        })),
        connections: workflowEdges.map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle,
          targetHandle: edge.targetHandle
        }))
      }

      console.log("Sending workflow execution request...")

      // Call the execution API with timeout
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 45000) // 45 second timeout for fetch
      
      const response = await fetch("/api/workflows/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflowId: currentWorkflow.id,
          testMode: testMode,
          inputData: {},
          workflowData: workflowData
        }),
        signal: controller.signal
      })
      
      clearTimeout(timeoutId)

      console.log("Execution response status:", response.status)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      console.log("Execution result:", result)

      if (result.success) {
        toast({ 
          title: "Workflow Executed Successfully!", 
          description: "Workflow execution was successful."
        })
        
        // Log execution results for debugging
        console.log("Workflow execution results:", result)
        
        // Update execution events if available
        if (result.executionEvents) {
          setExecutionEvents(result.executionEvents)
        }
      } else {
        throw new Error(result.error || "Workflow execution failed")
      }
      
    } catch (error: any) {
      console.error("Failed to execute workflow:", error)
      
      // Provide more specific error messages
      let errorMessage = "Failed to execute workflow. Please try again."
      if (error.name === 'AbortError') {
        errorMessage = "Execution timed out. Please try again."
      } else if (error.message?.includes("network")) {
        errorMessage = "Network error. Please check your connection and try again."
      } else if (error.message?.includes("unauthorized")) {
        errorMessage = "Session expired. Please refresh the page and try again."
      } else if (error.message) {
        errorMessage = error.message
      }
      
      toast({ 
        title: "Execution Failed", 
        description: errorMessage, 
        variant: "destructive" 
      })
    } finally {
      // Always clear the timeout and reset loading state
      clearTimeout(executeTimeout)
      setIsExecuting(false)
    }
  }

  const getWorkflowStatus = (): { variant: BadgeProps["variant"]; text: string } => {
    if (currentWorkflow?.status === 'published') return { variant: "default", text: "Published" }
    return { variant: "secondary", text: "Draft" }
  }
  const renderLogo = (integrationId: string, integrationName: string) => {
    // Extract provider name from integrationId (e.g., "slack_action_send_message" -> "slack")
    const providerId = integrationId.split('_')[0]
    const config = INTEGRATION_CONFIGS[providerId as keyof typeof INTEGRATION_CONFIGS]
    return <img 
      src={config?.logo || `/integrations/${providerId}.svg`} 
      alt={`${integrationName} logo`} 
      className="w-10 h-10 object-contain" 
      style={{ filter: "drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.05))" }}
    />
  }

  const filteredIntegrations = useMemo(() => {
    // console.log('🔍 Computing filteredIntegrations:', { 
    //   availableIntegrationsCount: availableIntegrations.length,
    //   showConnectedOnly,
    //   filterCategory,
    //   searchQuery,
    //   integrationsLoading
    // });
    
    // If integrations are still loading, show all integrations to avoid empty state
    if (integrationsLoading) {
      // console.log('🔍 Integrations still loading, showing all integrations');
      return availableIntegrations;
    }
    
    const result = availableIntegrations
      .filter(int => {
        if (showConnectedOnly) {
          const isConnected = isIntegrationConnected(int.id);
          // console.log('🔍 Filtering integration:', { id: int.id, name: int.name, isConnected });
          return isConnected;
        }
        return true;
      })
      .filter(int => {
        if (filterCategory === 'all') return true;
        return int.category === filterCategory;
      })
      .filter(int => {
        // Filter out integrations that have no triggers
        return int.triggers.length > 0;
      })
      .filter(int => {
        const searchLower = searchQuery.toLowerCase();
        if (searchLower === "") return true;
        
        // Search in integration name, description, and category
        const integrationMatches = int.name.toLowerCase().includes(searchLower) ||
                                 int.description.toLowerCase().includes(searchLower) ||
                                 int.category.toLowerCase().includes(searchLower);
        
        // Search in trigger names, descriptions, and types
        const triggerMatches = int.triggers.some(t => 
          (t.title && t.title.toLowerCase().includes(searchLower)) ||
          (t.description && t.description.toLowerCase().includes(searchLower)) ||
          (t.type && t.type.toLowerCase().includes(searchLower))
        );
        
        return integrationMatches || triggerMatches;
      });
    
    console.log('🔍 filteredIntegrations result:', { 
      resultCount: result.length,
      integrations: result.map(int => ({ id: int.id, name: int.name }))
    });
    
    return result;
  }, [availableIntegrations, searchQuery, filterCategory, showConnectedOnly, isIntegrationConnected, integrationsLoading]);
  
  const displayedTriggers = useMemo(() => {
    if (!selectedIntegration) return [];

    const searchLower = searchQuery.toLowerCase();
    if (!searchLower) return selectedIntegration.triggers;

    return selectedIntegration.triggers.filter((trigger) => {
      return (trigger.title && trigger.title.toLowerCase().includes(searchLower)) ||
             (trigger.description && trigger.description.toLowerCase().includes(searchLower)) ||
             (trigger.type && trigger.type.toLowerCase().includes(searchLower));
    });
  }, [selectedIntegration, searchQuery]);

  // Add global error handler to prevent stuck loading states
  useEffect(() => {
    const handleGlobalError = (event: ErrorEvent) => {
      // Skip null or undefined errors
      if (event.error === null || event.error === undefined) {
        console.debug("🔍 Workflow builder ignoring null/undefined error event")
        return
      }
      
      console.error("Global error caught:", event.error)
      // Reset loading states on any global error
      setIsSaving(false)
      setIsExecuting(false)
      isSavingRef.current = false
    }

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error("Unhandled promise rejection:", event.reason)
      // Reset loading states on unhandled promise rejection
      setIsSaving(false)
      setIsExecuting(false)
      isSavingRef.current = false
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        event.preventDefault()
        event.returnValue = "You have unsaved changes. Are you sure you want to leave?"
        return "You have unsaved changes. Are you sure you want to leave?"
      }
    }

    window.addEventListener('error', handleGlobalError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)
    window.addEventListener('beforeunload', handleBeforeUnload)

    return () => {
      window.removeEventListener('error', handleGlobalError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [hasUnsavedChanges])

  const handleResetLoadingStates = () => {
    console.log("Manually resetting loading states...")
    setIsSaving(false)
    setIsExecuting(false)
    isSavingRef.current = false
    toast({ 
      title: "Loading States Reset", 
      description: "All loading states have been reset.", 
      variant: "default" 
    })
  }

  // Track unsaved changes
  const checkForUnsavedChanges = useCallback(() => {
    if (!currentWorkflow) return false
    
    // Skip check if we're in the middle of a save or rebuild operation
    if (isSaving || isRebuildingAfterSave) {
      console.log('🔍 Skipping unsaved changes check - save/rebuild in progress');
      return false;
    }
    
    // Get a reference to the current ReactFlow nodes and edges
    const currentNodes = getNodes().filter((n: Node) => n.type === 'custom')
    const currentEdges = getEdges()
    
    // If there are no nodes yet, don't mark as changed
    if (currentNodes.length === 0) {
      return false;
    }
    
    // Compare nodes - first sort both arrays by ID to ensure consistent comparison
    const savedNodes = [...(currentWorkflow.nodes || [])].sort((a, b) => a.id.localeCompare(b.id))
    const sortedCurrentNodes = [...currentNodes].sort((a, b) => a.id.localeCompare(b.id))
    
    // Compare node counts
    const nodeCountDiffers = sortedCurrentNodes.length !== savedNodes.length
    
    // Compare node properties
    let nodePropertiesDiffer = false
    if (!nodeCountDiffers) {
      nodePropertiesDiffer = sortedCurrentNodes.some((node, index) => {
        const savedNode = savedNodes[index]
        if (!savedNode) return true
        
        // Compare IDs
        if (node.id !== savedNode.id) return true
        
        // Compare node types
        if (node.data.type !== savedNode.data.type) return true
        
        // Compare configurations (ignoring non-essential properties)
        const nodeConfig = node.data.config || {}
        const savedConfig = savedNode.data.config || {}
        if (JSON.stringify(nodeConfig) !== JSON.stringify(savedConfig)) return true
        
        // Compare positions with tolerance for floating point precision
        const positionDifference = 
          Math.abs(node.position.x - savedNode.position.x) > 0.5 || 
          Math.abs(node.position.y - savedNode.position.y) > 0.5
        
        return positionDifference
      })
    }
    
    const nodesChanged = nodeCountDiffers || nodePropertiesDiffer
    
    // Compare edges - sort by ID for consistent comparison
    const savedEdges = [...(currentWorkflow.connections || [])].sort((a, b) => a.id.localeCompare(b.id))
    const sortedCurrentEdges = [...currentEdges].sort((a, b) => a.id.localeCompare(b.id))
    
    // Compare edge counts
    const edgeCountDiffers = sortedCurrentEdges.length !== savedEdges.length
    
    // Compare edge properties
    let edgePropertiesDiffer = false
    if (!edgeCountDiffers) {
      edgePropertiesDiffer = sortedCurrentEdges.some((edge, index) => {
        const savedEdge = savedEdges[index]
        if (!savedEdge) return true
        return edge.id !== savedEdge.id ||
               edge.source !== savedEdge.source ||
               edge.target !== savedEdge.target
      })
    }
    
    const edgesChanged = edgeCountDiffers || edgePropertiesDiffer
    
    // Compare workflow name
    const nameChanged = workflowName !== currentWorkflow.name
    
    const hasChanges = nodesChanged || edgesChanged || nameChanged
    
    // Debug logging to see what's causing the change detection
    if (hasChanges) {
      console.log('🔍 Unsaved changes detected:', {
        nodesChanged,
        nodeCountDiffers,
        nodePropertiesDiffer,
        edgesChanged,
        edgeCountDiffers,
        edgePropertiesDiffer,
        nameChanged,
        currentNodesCount: currentNodes.length,
        savedNodesCount: savedNodes.length,
        currentEdgesCount: currentEdges.length,
        savedEdgesCount: savedEdges.length,
        currentPositions: sortedCurrentNodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y })),
        savedPositions: savedNodes.map(n => ({ id: n.id, x: n.position.x, y: n.position.y })),
        isSaving,
        isRebuildingAfterSave
      });
    }
    
    // Only update the state if it's different from the current state to avoid unnecessary re-renders
    if (hasChanges !== hasUnsavedChanges) {
      setHasUnsavedChanges(hasChanges);
    }
    
    return hasChanges;
  }, [currentWorkflow, getNodes, getEdges, workflowName, isSaving, isRebuildingAfterSave, hasUnsavedChanges])

  // Track the last time we saved to prevent immediate checks after save
  const lastSaveTimeRef = useRef<number>(0);
  
  // Check for unsaved changes whenever nodes, edges, or workflow name changes
  useEffect(() => {
    // Skip checks during save/rebuild operations or immediately after a save
    const now = Date.now();
    const timeSinceLastSave = now - lastSaveTimeRef.current;
    const recentlySaved = timeSinceLastSave < 1000; // Within 1 second of save
    
    if (recentlySaved) {
      console.log('🔍 Skipping unsaved changes check - recent save detected');
      return;
    }
    
    // Don't check for unsaved changes during save operations or rebuilds to prevent race condition
    if (currentWorkflow && !isSaving && !isRebuildingAfterSave) {
      // Add a longer delay to prevent checking during rebuilds and ensure stability
      const timeoutId = setTimeout(() => {
        // Double-check that we're still not in a save/rebuild state
        if (!isSaving && !isRebuildingAfterSave) {
          checkForUnsavedChanges();
        }
      }, 800);
      
      return () => clearTimeout(timeoutId);
    }
  }, [currentWorkflow, nodes, edges, workflowName, checkForUnsavedChanges, isSaving, isRebuildingAfterSave])

  // Debug effect to monitor position changes
  useEffect(() => {
    if (currentWorkflow && nodes.length > 0) {
      const currentPositions = nodes
        .filter(n => n.type === 'custom')
        .map(n => ({ id: n.id, position: n.position }))
        .sort((a, b) => a.id.localeCompare(b.id))
      
      const savedPositions = (currentWorkflow.nodes || [])
        .map(n => ({ id: n.id, position: n.position }))
        .sort((a, b) => a.id.localeCompare(b.id))
      
      const positionsChanged = JSON.stringify(currentPositions) !== JSON.stringify(savedPositions)
      
      if (positionsChanged) {
        console.log('🔍 Position comparison:', {
          current: currentPositions,
          saved: savedPositions,
          changed: positionsChanged
        })
      }
    }
  }, [nodes, currentWorkflow])

  // Debug current workflow and nodes
  useEffect(() => {
    console.log('🔍 Current workflow debug:', {
      hasCurrentWorkflow: !!currentWorkflow,
      workflowId: currentWorkflow?.id,
      workflowNodes: currentWorkflow?.nodes?.length || 0,
      reactFlowNodes: nodes.length,
      reactFlowCustomNodes: nodes.filter(n => n.type === 'custom').length
    })
  }, [currentWorkflow, nodes])

  // Handle navigation with unsaved changes warning
  const handleNavigation = useCallback((path: string) => {
    if (hasUnsavedChanges) {
      setPendingNavigation(path)
      setShowUnsavedChangesModal(true)
    } else {
      router.push(path)
    }
  }, [hasUnsavedChanges, router])

  // Handle save and continue navigation
  const handleSaveAndNavigate = async () => {
    try {
      await handleSave()
      if (pendingNavigation) {
        router.push(pendingNavigation)
      }
    } catch (error) {
      console.error('Failed to save before navigation:', error)
      toast({ 
        title: "Save Failed", 
        description: "Could not save your changes. Please try again.", 
        variant: "destructive" 
      })
    }
  }

  // Handle navigation without saving
  const handleNavigateWithoutSaving = () => {
    setShowUnsavedChangesModal(false)
    setPendingNavigation(null)
    if (pendingNavigation) {
      router.push(pendingNavigation)
    }
  }

  // Force reload workflow from database
  const forceReloadWorkflow = useCallback(async () => {
    if (!workflowId) return;
    
    try {
      console.log('🔄 Force reloading workflow from database...');
      // Use the existing API endpoint instead of direct Supabase access
      const response = await fetch(`/api/workflows/${workflowId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch workflow: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data) {
        throw new Error('Workflow not found');
      }
      
      console.log('✅ Workflow reloaded with positions:', 
        data.nodes?.map((n: WorkflowNode) => ({ id: n.id, position: n.position }))
      );
      
      // Update the current workflow with the fresh data
      setCurrentWorkflow(data);
      
      // Rebuild nodes with the fresh data
      if (data.nodes && data.nodes.length > 0) {
                  const customNodes = data.nodes.map((node: WorkflowNode) => {
          const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === node.data.type);
          
          // Ensure position is a number
          const position = {
            x: typeof node.position.x === 'number' ? node.position.x : parseFloat(node.position.x as unknown as string),
            y: typeof node.position.y === 'number' ? node.position.y : parseFloat(node.position.y as unknown as string)
          };
          
          console.log(`Loading node ${node.id} with position:`, position);
          
          return {
            id: node.id, 
            type: 'custom', 
            position: position,
            data: {
              ...node.data,
              title: node.data.title || (nodeComponent ? nodeComponent.title : undefined),
              name: node.data.title || (nodeComponent ? nodeComponent.title : node.data.label || 'Unnamed Action'),
              description: node.data.description || (nodeComponent ? nodeComponent.description : undefined),
              onConfigure: handleConfigureNode,
              onDelete: handleDeleteNodeWithConfirmation,
              onChangeTrigger: node.data.type?.includes('trigger') ? handleChangeTrigger : undefined,
              providerId: node.data.providerId || node.data.type?.split('-')[0]
            },
          };
        });

        let allNodes = [...customNodes];
        
        // Find the last action node (not the trigger) to position the add action node
        const actionNodes = customNodes.filter((n: Node) => n.id !== 'trigger');
        const lastActionNode = actionNodes.length > 0 
          ? actionNodes.sort((a: Node, b: Node) => b.position.y - a.position.y)[0] 
          : null;
        
        if (lastActionNode) {
          const addActionId = `add-action-${lastActionNode.id}`;
          const addActionNode: Node = {
            id: addActionId, 
            type: 'addAction', 
            position: { x: lastActionNode.position.x, y: lastActionNode.position.y + 160 },
            data: { parentId: lastActionNode.id, onClick: () => handleAddActionClick(addActionId, lastActionNode.id) }
          };
          allNodes.push(addActionNode);
        } else {
          const triggerNode = customNodes.find((n: Node) => n.id === 'trigger');
          if (triggerNode) {
            const addActionId = `add-action-${triggerNode.id}`;
            const addActionNode: Node = {
              id: addActionId, 
              type: 'addAction', 
              position: { x: triggerNode.position.x, y: triggerNode.position.y + 160 },
              data: { parentId: triggerNode.id, onClick: () => handleAddActionClick(addActionId, triggerNode.id) }
            };
            allNodes.push(addActionNode);
          }
        }
        
        const initialEdges: Edge[] = (data.connections || []).map((conn: any) => ({
          id: conn.id, source: conn.source, target: conn.target,
        }));
        
        // Add edge from the last node (action or trigger) to the add action node
        const addActionNode = allNodes.find((n: Node) => n.type === 'addAction');
        if (addActionNode) {
          const sourceNode = lastActionNode || customNodes.find((n: Node) => n.id === 'trigger');
          if (sourceNode) {
            initialEdges.push({
              id: `${sourceNode.id}->${addActionNode.id}`, 
              source: sourceNode.id, 
              target: addActionNode.id, 
              animated: true,
              style: { stroke: '#b1b1b7', strokeWidth: 2, strokeDasharray: '5,5' }, 
              type: 'straight'
            });
          }
        }
        
        setNodes(allNodes);
        setEdges(initialEdges);
      }
    } catch (error) {
      console.error('Error reloading workflow:', error);
    }
  }, [workflowId, handleConfigureNode, handleDeleteNodeWithConfirmation, handleChangeTrigger, handleAddActionClick, setNodes, setEdges, setCurrentWorkflow]);

  return {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    debugOnNodesChange,
    onEdgesChange,
    onConnect,
    workflowName,
    setWorkflowName,
    isSaving,
    handleSave,
    handleExecute,
    showTriggerDialog,
    setShowTriggerDialog,
    showActionDialog,
    setShowActionDialog,
    handleTriggerSelect,
    handleActionSelect,
    selectedIntegration,
    setSelectedIntegration,
    availableIntegrations,
    renderLogo,
    getWorkflowStatus,
    currentWorkflow,
    isExecuting,
    executionEvents,
    configuringNode,
    setConfiguringNode,
    handleSaveConfiguration,
    collaborators,
    pendingNode,
    setPendingNode,
    selectedTrigger,
    setSelectedTrigger,
    selectedAction,
    setSelectedAction,
    searchQuery,
    setSearchQuery,
    filterCategory,
    setFilterCategory,
    forceReloadWorkflow,
    showConnectedOnly,
    setShowConnectedOnly,
    filteredIntegrations,
    displayedTriggers,
    deletingNode,
    setDeletingNode,
    confirmDeleteNode,
    isIntegrationConnected,
    integrationsLoading,
    workflowLoading,
    testMode,
    setTestMode,
    handleResetLoadingStates,
    sourceAddNode,
    handleActionDialogClose,
    nodeNeedsConfiguration,
    workflows: workflowsData,
    workflowId,
    hasShownLoading,
    setHasShownLoading,
    hasUnsavedChanges,
    setHasUnsavedChanges,
    showUnsavedChangesModal,
    setShowUnsavedChangesModal,
    pendingNavigation,
    setPendingNavigation,
    handleNavigation,
    handleSaveAndNavigate,
    handleNavigateWithoutSaving
  }
}

export default function CollaborativeWorkflowBuilder() {
  return (
    <div className="w-full h-full bg-background">
      <ReactFlowProvider><WorkflowBuilderContent /></ReactFlowProvider>
    </div>
  )
}

function WorkflowBuilderContent() {
  const router = useRouter()
  const { toast } = useToast()
  const { setCurrentWorkflow } = useWorkflowStore()
  
  const {
    nodes, edges, setNodes, setEdges, onNodesChange, debugOnNodesChange, onEdgesChange, onConnect, workflowName, setWorkflowName, isSaving, handleSave, handleExecute, 
    showTriggerDialog, setShowTriggerDialog, showActionDialog, setShowActionDialog, handleTriggerSelect, handleActionSelect, selectedIntegration, setSelectedIntegration,
    availableIntegrations, renderLogo, getWorkflowStatus, currentWorkflow, isExecuting, executionEvents,
    configuringNode, setConfiguringNode, handleSaveConfiguration, collaborators, pendingNode, setPendingNode,
    selectedTrigger, setSelectedTrigger, selectedAction, setSelectedAction, searchQuery, setSearchQuery, filterCategory, setFilterCategory, showConnectedOnly, setShowConnectedOnly,
    filteredIntegrations, displayedTriggers, deletingNode, setDeletingNode, confirmDeleteNode, isIntegrationConnected, integrationsLoading, workflowLoading, testMode, setTestMode, handleResetLoadingStates,
    sourceAddNode, handleActionDialogClose, nodeNeedsConfiguration, workflows, workflowId, hasShownLoading, setHasShownLoading, hasUnsavedChanges, setHasUnsavedChanges, showUnsavedChangesModal, setShowUnsavedChangesModal, pendingNavigation, setPendingNavigation,
    handleNavigation, handleSaveAndNavigate, handleNavigateWithoutSaving, forceReloadWorkflow
  } = useWorkflowBuilderState()

  const categories = useMemo(() => {
    const allCategories = availableIntegrations
      .map(int => int.category);
    return ['all', ...Array.from(new Set(allCategories))];
  }, [availableIntegrations]);

  const handleOpenTriggerDialog = () => {
    setSelectedIntegration(null);
    setSelectedTrigger(null);
    setSearchQuery("");
    setShowTriggerDialog(true);
  }

  // Debug loading states
  console.log('🔍 Loading states:', {
    currentWorkflow: !!currentWorkflow,
    integrationsLoading,
    workflowLoading,
    workflowsLength: workflows.length,
    workflowId
  })

  // Use a more robust loading condition that prevents double loading
  // Only show loading if we're actually in a loading state AND we don't have the required data
  const shouldShowLoading = () => {
    // If we have a workflowId but no currentWorkflow, we're loading
    if (workflowId && !currentWorkflow) {
      return true
    }
    
    // If integrations are loading and we don't have any workflows yet, show loading
    if (integrationsLoading && workflows.length === 0) {
      return true
    }
    
    // If workflow is loading and we don't have the current workflow, show loading
    if (workflowLoading && !currentWorkflow) {
      return true
    }
    
    return false
  }

  // Track if we should show loading and prevent double loading
  const isLoading = shouldShowLoading()
  
  // Set hasShownLoading to true when we start loading
  if (isLoading && !hasShownLoading) {
    setHasShownLoading(true)
  }
  
  // Reset hasShownLoading when we're no longer loading
  if (!isLoading && hasShownLoading) {
    setHasShownLoading(false)
  }

  if (isLoading) {
    console.log('🔄 Showing loading screen due to:', {
      workflowId,
      hasCurrentWorkflow: !!currentWorkflow,
      integrationsLoading,
      workflowLoading,
      workflowsLength: workflows.length,
      hasShownLoading
    })
    return <WorkflowLoadingScreen />
  }
  return (
    <div style={{ height: "calc(100vh - 65px)", position: "relative" }}>
      {/* Top UI - Always visible */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
        <div className="flex justify-between items-start p-4 pointer-events-auto">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" onClick={() => handleNavigation("/workflows")}><ArrowLeft className="w-5 h-5" /></Button>
            <Input value={workflowName} onChange={(e) => setWorkflowName(e.target.value)} onBlur={handleSave} className="text-xl font-semibold !border-none !outline-none !ring-0 p-0 bg-transparent" style={{ boxShadow: "none" }} />
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant={getWorkflowStatus().variant}>{getWorkflowStatus().text}</Badge>
            {hasUnsavedChanges && (
              <Badge variant="outline" className="text-orange-600 border-orange-600">
                Unsaved Changes
              </Badge>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild><Button onClick={handleSave} disabled={isSaving || isExecuting} variant="secondary">{isSaving ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Save className="w-5 h-5 mr-2" />}Save</Button></TooltipTrigger>
                <TooltipContent><p>Save your workflow</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={testMode ? "destructive" : "outline"} 
                    size="sm"
                    onClick={() => setTestMode(!testMode)}
                    disabled={isSaving || isExecuting}
                  >
                    {testMode ? "Test Mode: ON" : "Test Mode: OFF"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{testMode ? "Workflow will run in test mode (no real actions)" : "Workflow will perform real actions"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild><Button onClick={handleExecute} disabled={isSaving || isExecuting} variant="default">{isExecuting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Play className="w-5 h-5 mr-2" />}Execute</Button></TooltipTrigger>
                <TooltipContent><p>Execute the workflow</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={async () => {
                      console.log('🔄 Force reload button clicked');
                      try {
                        // Clear current workflow and reload fresh from API
                        setCurrentWorkflow(null);
                        
                        if (workflowId) {
                          const response = await fetch(`/api/workflows/${workflowId}`);
                          if (response.ok) {
                            const freshWorkflow = await response.json();
                            setCurrentWorkflow(freshWorkflow);
                            toast({ 
                              title: "Workflow Reloaded", 
                              description: "Fresh workflow data loaded from database.",
                              variant: "default"
                            });
                          } else {
                            throw new Error('Failed to reload workflow');
                          }
                        }
                      } catch (error) {
                        console.error('Error reloading:', error);
                        toast({ 
                          title: "Reload Failed", 
                          description: "Could not reload the workflow.",
                          variant: "destructive"
                        });
                      }
                    }} 
                    variant="outline" 
                    size="sm"
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Reload
                  </Button>
                </TooltipTrigger>
                <TooltipContent><p>Force reload workflow from database</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {/* Emergency reset button - only show if loading states are stuck */}
            {(isSaving || isExecuting) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      onClick={handleResetLoadingStates}
                      variant="outline" 
                      size="sm"
                      className="text-orange-600 border-orange-600 hover:bg-orange-50"
                    >
                      <RefreshCw className="w-4 h-4 mr-1" />
                      Reset
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Reset stuck loading states</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>

      {nodes.length === 0 ? (
        // Empty state outside of ReactFlow
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background p-4">
          <div className="text-center max-w-md flex flex-col items-center">
            <div 
              className="w-20 h-20 rounded-full border-2 border-dashed border-border flex items-center justify-center mb-6 cursor-pointer hover:border-muted-foreground hover:shadow-sm transition-all"
              onClick={handleOpenTriggerDialog}
            >
              <Plus className="h-10 w-10 text-muted-foreground hover:text-foreground" />
            </div>
            <h2 className="text-[32px] font-bold mb-2">Start your Chain</h2>
            <p className="text-muted-foreground mb-8 text-center leading-relaxed text-lg">
              Chains start with a trigger – an event that kicks off<br />
              your workflow
            </p>
            <button 
              onClick={handleOpenTriggerDialog}
              className="bg-primary text-primary-foreground px-8 py-3 rounded-md hover:bg-primary/90 transition-colors font-medium text-lg shadow-sm hover:shadow"
            >
              Choose a trigger
            </button>
          </div>
        </div>
      ) : (
        // Regular ReactFlow when there are nodes
        <>
          {console.log('🎯 Rendering ReactFlow with nodes:', nodes.length)}
          <ReactFlow 
          nodes={nodes} 
          edges={edges} 
          onNodesChange={debugOnNodesChange} 
          onEdgesChange={onEdgesChange} 
          onConnect={onConnect} 
          onNodeDrag={(event, node) => {
            // Track position changes during drag
            console.log(`🔄 Node ${node.id} dragging to position:`, node.position)
            console.log(`🔄 onNodeDrag event:`, event)
            setHasUnsavedChanges(true)
          }}
          onNodeDragStop={(event, node) => {
            // Update node position in state and mark as unsaved
            console.log(`✅ Node ${node.id} drag stopped at position:`, node.position)
            console.log(`✅ onNodeDragStop event:`, event)
            setNodes((nds: Node[]) => 
              nds.map((n: Node) => 
                n.id === node.id 
                  ? { ...n, position: node.position }
                  : n
              )
            )
            setHasUnsavedChanges(true)
            
            // Force a small delay to ensure position is updated
            setTimeout(() => {
              console.log(`💾 Position change detected for node ${node.id}, marking as unsaved`)
            }, 50)
          }}
          nodeTypes={nodeTypes} 
          fitView 
          className="bg-background" 
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            type: 'straight',
            style: { strokeWidth: 1, stroke: 'hsl(var(--border))' },
            animated: false
          }}
          defaultViewport={{ x: 0, y: 0, zoom: 1.2 }}
        >
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="hsl(var(--muted))" />
          <Controls className="left-4 bottom-4 top-auto" />
          <CollaboratorCursors collaborators={collaborators || []} />
          {isExecuting && executionEvents.length > 0 && <ExecutionMonitor events={executionEvents} />}
        </ReactFlow>
        </>
      )}

      <Dialog open={showTriggerDialog} onOpenChange={setShowTriggerDialog}>
        <DialogContent className="max-w-4xl h-[95vh] flex flex-col p-0 bg-card rounded-lg shadow-2xl">
          <DialogHeader className="p-6 pb-4 border-b border-border">
            <DialogTitle className="text-xl font-bold">Select a Trigger</DialogTitle>
            <DialogDescription>Choose an integration and a trigger to start your workflow.</DialogDescription>
          </DialogHeader>
          
          <div className="px-6 py-4 border-b border-border">
            <div className="flex items-center space-x-4">
              <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  placeholder="Search integrations or triggers..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat === 'all' ? 'All Categories' : cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center space-x-2">
                <Checkbox id="connected-apps" checked={showConnectedOnly} onCheckedChange={(checked: boolean) => setShowConnectedOnly(Boolean(checked))} />
                <Label htmlFor="connected-apps" className="whitespace-nowrap">Show only connected apps</Label>
              </div>
            </div>
          </div>

          <div className="flex-grow flex min-h-0 overflow-hidden">
            <ScrollArea className="w-1/3 border-r border-border flex-1">
              <div className="pt-2 pb-8 px-3">
              {filteredIntegrations.length === 0 && showConnectedOnly ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="text-muted-foreground mb-2">
                    <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">No connected integrations found</p>
                  <p className="text-xs text-muted-foreground/70">Try unchecking "Show only connected apps"</p>
                </div>
              ) : filteredIntegrations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="text-muted-foreground mb-2">
                    <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-muted-foreground">No integrations match your search</p>
                </div>
              ) : (
                filteredIntegrations.map((integration) => (
                  <div
                    key={integration.id}
                    className={`flex items-center p-3 rounded-md cursor-pointer ${selectedIntegration?.id === integration.id ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted/50'}`}
                    onClick={() => setSelectedIntegration(integration)}
                  >
                    {renderLogo(integration.id, integration.name)}
                    <span className="font-semibold ml-4 flex-grow">{integration.name}</span>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                ))
              )}
              </div>
            </ScrollArea>
            <div className="w-2/3 h-full">
              <ScrollArea className="flex-1">
                <div className="p-4">
                {selectedIntegration ? (
                  <div className="h-full">
                    {displayedTriggers.length > 0 ? (
                      <div className="grid grid-cols-1 gap-3">
                        {displayedTriggers.map((trigger, index) => (
                          <div
                            key={`${trigger.type}-${trigger.title}-${index}`}
                            className={`p-4 border rounded-lg cursor-pointer transition-all ${selectedTrigger?.type === trigger.type ? 'border-primary bg-primary/10 ring-1 ring-primary/20' : 'border-border hover:border-muted-foreground hover:shadow-sm'}`}
                            onClick={() => setSelectedTrigger(trigger)}
                            onDoubleClick={() => {
                              setSelectedTrigger(trigger)
                              if (selectedIntegration) {
                                handleTriggerSelect(selectedIntegration, trigger)
                              }
                            }}
                          >
                            <p className="font-medium">{trigger.title}</p>
                            <p className="text-sm text-muted-foreground mt-1">{trigger.description}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 text-center">
                        <div className="text-muted-foreground mb-2">
                          <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">No triggers available</p>
                        <p className="text-xs text-muted-foreground/70">
                          {selectedIntegration.name} doesn't have any triggers defined yet
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>Select an integration to see its triggers</p>
                  </div>
                )}
                </div>
              </ScrollArea>
            </div>
          </div>
          
          <DialogFooter className="p-4 border-t border-border bg-muted/20 flex justify-between items-center">
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <div className="text-sm text-muted-foreground">
              {selectedIntegration && (
                <>
                  <span className="font-medium">Integration:</span> {selectedIntegration.name}
                  {selectedTrigger && <span className="ml-4"><span className="font-medium">Trigger:</span> {selectedTrigger.title}</span>}
                </>
              )}
            </div>
            <div className="flex space-x-2">
              <Button 
                disabled={!selectedTrigger || !selectedIntegration}
                onClick={() => {
                  if (selectedIntegration && selectedTrigger) {
                    handleTriggerSelect(selectedIntegration, selectedTrigger)
                  }
                }}
              >
                Continue →
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showActionDialog} onOpenChange={handleActionDialogClose}>
        <DialogContent className="max-w-4xl h-[95vh] flex flex-col p-0 bg-card rounded-lg shadow-2xl">
          <DialogHeader className="p-6 pb-4 border-b border-border">
            <DialogTitle className="text-xl font-bold">Select an Action</DialogTitle>
            <DialogDescription>Choose an integration and an action to add to your workflow.</DialogDescription>
          </DialogHeader>
          
          <div className="px-6 py-4 border-b border-border">
            <div className="flex items-center space-x-4">
              <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                <Input 
                  placeholder="Search integrations or actions..."
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat === 'all' ? 'All Categories' : cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="connected-apps-actions" 
                  checked={showConnectedOnly}
                  onCheckedChange={(checked: boolean) => setShowConnectedOnly(Boolean(checked))}
                />
                <Label htmlFor="connected-apps-actions" className="whitespace-nowrap">Show only connected apps</Label>
              </div>
            </div>
          </div>

          <div className="flex-grow flex min-h-0 overflow-hidden">
            <ScrollArea className="w-1/3 border-r border-border flex-1">
              <div className="pt-2 pb-8 px-3">
              {availableIntegrations.filter(int => {
                if (showConnectedOnly && !isIntegrationConnected(int.id)) return false
                if (filterCategory !== 'all' && int.category !== filterCategory) return false
                
                // Filter out integrations that have no compatible actions
                const trigger = nodes.find(node => node.data?.isTrigger)
                const compatibleActions = int.actions.filter(action => {
                  // Gmail actions should only be available with Gmail triggers
                  if (action.providerId === 'gmail' && trigger && trigger.data?.providerId !== 'gmail') {
                    return false
                  }
                  return true
                })
                if (compatibleActions.length === 0) return false
                
                if (searchQuery) {
                  const query = searchQuery.toLowerCase()
                  const matchesIntegration = int.name.toLowerCase().includes(query) || int.description.toLowerCase().includes(query)
                  const matchesAction = compatibleActions.some(action => 
                    (action.title?.toLowerCase() || '').includes(query) || (action.description?.toLowerCase() || '').includes(query)
                  )
                  return matchesIntegration || matchesAction
                }
                return compatibleActions.length > 0
              }).length === 0 && showConnectedOnly ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="text-muted-foreground mb-2">
                    <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">No connected integrations found</p>
                  <p className="text-xs text-muted-foreground/70">Try unchecking "Show only connected apps"</p>
                </div>
              ) : availableIntegrations.filter(int => {
                if (showConnectedOnly && !isIntegrationConnected(int.id)) return false
                if (filterCategory !== 'all' && int.category !== filterCategory) return false
                
                // Filter out integrations that have no compatible actions
                const trigger = nodes.find(node => node.data?.isTrigger)
                const compatibleActions = int.actions.filter(action => {
                  // Gmail actions should only be available with Gmail triggers
                  if (action.providerId === 'gmail' && trigger && trigger.data?.providerId !== 'gmail') {
                    return false
                  }
                  return true
                })
                if (compatibleActions.length === 0) return false
                
                if (searchQuery) {
                  const query = searchQuery.toLowerCase()
                  const matchesIntegration = int.name.toLowerCase().includes(query) || int.description.toLowerCase().includes(query)
                  const matchesAction = compatibleActions.some(action => 
                    (action.title?.toLowerCase() || '').includes(query) || (action.description?.toLowerCase() || '').includes(query)
                  )
                  return matchesIntegration || matchesAction
                }
                return compatibleActions.length > 0
              }).length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="text-muted-foreground mb-2">
                    <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-muted-foreground">No integrations match your search</p>
                </div>
              ) : (
                availableIntegrations
                  .filter(int => {
                    if (showConnectedOnly && !isIntegrationConnected(int.id)) return false
                    if (filterCategory !== 'all' && int.category !== filterCategory) return false
                    
                    // Filter out integrations that have no compatible actions
                    const trigger = nodes.find(node => node.data?.isTrigger)
                    const compatibleActions = int.actions.filter(action => {
                      // Gmail actions should only be available with Gmail triggers
                      if (action.providerId === 'gmail' && trigger && trigger.data?.providerId !== 'gmail') {
                        return false
                      }
                      return true
                    })
                    // Don't filter out AI Agent integration even if it has no actions initially
                    if (compatibleActions.length === 0 && int.id !== 'ai') return false
                    
                    if (searchQuery) {
                      const query = searchQuery.toLowerCase()
                      const matchesIntegration = int.name.toLowerCase().includes(query) || int.description.toLowerCase().includes(query)
                      const matchesAction = compatibleActions.some(action => 
                        (action.title?.toLowerCase() || '').includes(query) || (action.description?.toLowerCase() || '').includes(query)
                      )
                      return matchesIntegration || matchesAction
                    }
                    return compatibleActions.length > 0
                  })
                  .map((integration) => (
                    <div
                      key={integration.id}
                      className={`flex items-center p-3 rounded-md cursor-pointer ${selectedIntegration?.id === integration.id ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted/50'}`}
                      onClick={() => setSelectedIntegration(integration)}
                    >
                      {renderLogo(integration.id, integration.name)}
                      <span className="font-semibold ml-4 flex-grow">{integration.name}</span>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  ))
              )}
              </div>
            </ScrollArea>
            <div className="w-2/3 h-full">
              <ScrollArea className="flex-1">
                <div className="p-4">
                {selectedIntegration ? (
                  <div className="h-full">
                    <div className="grid grid-cols-1 gap-3">
                      {selectedIntegration.actions
                        .filter(action => {
                          
                          // First check if action is compatible with current trigger
                          const trigger = nodes.find(node => node.data?.isTrigger)
                          if (trigger && action.providerId === 'gmail' && trigger.data?.providerId !== 'gmail') {
                            return false
                          }
                          
                          // AI Agent is always shown - validation happens in config modal
                          // If no sourceAddNode, allow AI Agent to show (it will be restricted when actually adding)
                          
                          if (searchQuery) {
                            const query = searchQuery.toLowerCase()
                            return (action.title?.toLowerCase() || '').includes(query) || (action.description?.toLowerCase() || '').includes(query)
                          }
                          return true
                        })
                        .map((action) => {
                          const isComingSoon = action.comingSoon
                          return (
                            <div
                              key={action.type}
                              className={`p-4 border rounded-lg transition-all ${
                                isComingSoon 
                                  ? 'border-muted bg-muted/30 cursor-not-allowed opacity-60' 
                                  : 'border-border hover:border-muted-foreground hover:shadow-sm cursor-pointer'
                              }`}
                              onClick={() => {
                                if (isComingSoon) return
                                setSelectedAction(action)
                                // If action doesn't need configuration, add it immediately
                                if (selectedIntegration && !nodeNeedsConfiguration(action)) {
                                  handleActionSelect(selectedIntegration, action)
                                }
                              }}
                              onDoubleClick={() => {
                                if (isComingSoon) return
                                setSelectedAction(action)
                                if (selectedIntegration) {
                                  handleActionSelect(selectedIntegration, action)
                                }
                              }}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className={`font-medium ${isComingSoon ? 'text-muted-foreground' : ''}`}>
                                    {action.title || 'Unnamed Action'}
                                  </p>
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {action.description || 'No description available'}
                                  </p>
                                </div>
                                {isComingSoon && (
                                  <span className="text-xs bg-muted text-muted-foreground px-2 py-1 rounded-full ml-2">
                                    Coming Soon
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    <p>Select an integration to see its actions</p>
                  </div>
                )}
                </div>
              </ScrollArea>
            </div>
          </div>

          <div className="p-4 border-t border-border bg-muted/20 flex justify-between items-center">
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <div className="text-sm text-muted-foreground">
              {selectedIntegration && (
                <>
                  <span className="font-medium">Integration:</span> {selectedIntegration.name}
                  {selectedAction && <span className="ml-4"><span className="font-medium">Action:</span> {selectedAction.title || 'Unnamed Action'}</span>}
                </>
              )}
            </div>
            <div className="flex space-x-2">
              <Button 
                disabled={!selectedAction || !selectedIntegration || selectedAction?.comingSoon}
                onClick={() => {
                  console.log('🔍 Continue button clicked:', { 
                    selectedIntegration: selectedIntegration?.id, 
                    selectedAction: selectedAction?.type,
                    sourceAddNode 
                  })
                  if (selectedIntegration && selectedAction && !selectedAction.comingSoon) {
                    handleActionSelect(selectedIntegration, selectedAction)
                  }
                }}
              >
                Continue →
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {configuringNode && (
        <>
          {/* Use AI Agent config modal for AI Agent nodes */}
          {configuringNode.nodeComponent.type === "ai_agent" ? (
            <AIAgentConfigModal
              isOpen={!!configuringNode}
              onClose={() => {
                setConfiguringNode(null);
                setPendingNode(null);
                // Don't reopen the action selection modal - let the user manually add more actions if needed
              }}
              onSave={(config) => handleSaveConfiguration(configuringNode, config)}
              onUpdateConnections={(sourceNodeId, targetNodeId) => {
                // Create or update the edge between the selected input node and the AI Agent
                const newEdge = {
                  id: `e${sourceNodeId}-${targetNodeId}`,
                  source: sourceNodeId,
                  target: targetNodeId,
                  type: 'smoothstep'
                };
                
                // Remove any existing edges to the AI Agent
                const filteredEdges = edges.filter(edge => edge.target !== targetNodeId);
                
                // Add the new edge
                setEdges([...filteredEdges, newEdge]);
              }}
              initialData={configuringNode.config}
              workflowData={{ nodes, edges }}
              currentNodeId={configuringNode.id}
            />
          ) : (
            <ConfigurationModal
              isOpen={!!configuringNode}
              onClose={(wasSaved = false) => {
                // Check if this is a pending node (hasn't been saved before)
                const isPendingNode = configuringNode?.id === 'pending-action' || configuringNode?.id === 'pending-trigger';
                
                setConfiguringNode(null);
                setPendingNode(null);
                
                // Only reopen the action selection modal if it was NOT saved and it's a pending node
                if (!wasSaved && isPendingNode && pendingNode?.type === 'action') {
                  console.log('🔄 Reopening action selection modal for unsaved pending action');
                  setShowActionDialog(true);
                } else if (!wasSaved && isPendingNode && pendingNode?.type === 'trigger') {
                  console.log('🔄 Reopening trigger selection modal for unsaved pending trigger');
                  setShowTriggerDialog(true);
                }
              }}
              onSave={(config) => handleSaveConfiguration(configuringNode, config)}
              nodeInfo={configuringNode.nodeComponent}
              integrationName={configuringNode.integration.name}
              initialData={configuringNode.config}
              workflowData={{ nodes, edges }}
              currentNodeId={configuringNode.id}
            />
          )}
        </>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingNode} onOpenChange={(open: boolean) => !open && setDeletingNode(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Node</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingNode?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setDeletingNode(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDeleteNode}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Unsaved Changes Warning Modal */}
      <Dialog open={showUnsavedChangesModal} onOpenChange={setShowUnsavedChangesModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes to your workflow. Would you like to save them before leaving?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-end space-x-2">
            <Button variant="outline" onClick={handleNavigateWithoutSaving}>
              Don't Save
            </Button>
            <Button onClick={handleSaveAndNavigate} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save & Continue'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Add React.memo to prevent unnecessary re-renders
const IntegrationItem = React.memo(({ integration, selectedIntegration, onSelect, renderLogo }: {
  integration: IntegrationInfo
  selectedIntegration: IntegrationInfo | null
  onSelect: (integration: IntegrationInfo) => void
  renderLogo: (id: string, name: string) => React.ReactNode
}) => (
  <div
    className={`flex items-center p-3 rounded-md cursor-pointer ${
      selectedIntegration?.id === integration.id 
        ? 'bg-primary/10 ring-1 ring-primary/20' 
        : 'hover:bg-muted/50'
    }`}
    onClick={() => onSelect(integration)}
  >
    {renderLogo(integration.id, integration.name)}
    <span className="font-semibold ml-4 flex-grow">{integration.name}</span>
    <ChevronRight className="w-5 h-5 text-muted-foreground" />
  </div>
))

// Virtual scrolling component for large lists
const VirtualIntegrationList = React.memo(({ 
  integrations, 
  selectedIntegration, 
  onSelect, 
  renderLogo 
}: {
  integrations: IntegrationInfo[]
  selectedIntegration: IntegrationInfo | null
  onSelect: (integration: IntegrationInfo) => void
  renderLogo: (id: string, name: string) => React.ReactNode
}) => {
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(400)
  const itemHeight = 56 // Fixed height for each integration item
  const bufferSize = 5 // Extra items to render for smooth scrolling
  
  const visibleStart = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize)
  const visibleEnd = Math.min(
    integrations.length,
    Math.ceil((scrollTop + containerHeight) / itemHeight) + bufferSize
  )
  
  const visibleIntegrations = integrations.slice(visibleStart, visibleEnd)
  
  return (
    <div
      className="overflow-auto"
      style={{ height: containerHeight }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: integrations.length * itemHeight, position: 'relative' }}>
        <div
          style={{
            transform: `translateY(${visibleStart * itemHeight}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
          }}
        >
          {visibleIntegrations.map((integration, index) => (
            <div key={integration.id} style={{ height: itemHeight }}>
              <IntegrationItem
                integration={integration}
                selectedIntegration={selectedIntegration}
                onSelect={onSelect}
                renderLogo={renderLogo}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})
