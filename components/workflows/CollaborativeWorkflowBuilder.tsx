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
import { useWorkflowErrorStore } from "@/stores/workflowErrorStore"
import { supabase, createClient } from "@/utils/supabaseClient"
import { ConfigurationModal } from "./configuration"
import AIAgentConfigModal from "./AIAgentConfigModal"
import CustomNode from "./CustomNode"
import { AddActionNode } from "./AddActionNode"
import { CollaboratorCursors } from "./CollaboratorCursors"
import ErrorNotificationPopup from "./ErrorNotificationPopup"

import { Button } from "@/components/ui/button"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Save, Loader2, Play, ArrowLeft, Plus, Search, ChevronRight, RefreshCw, Bell, Zap, Ear } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ALL_NODE_COMPONENTS, NodeComponent } from "@/lib/workflows/availableNodes"
import { INTEGRATION_CONFIGS } from "@/lib/integrations/availableIntegrations"
import { useToast } from "@/hooks/use-toast"
import { saveNodeConfig, clearNodeConfig, loadNodeConfig } from "@/lib/workflows/configPersistence"
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

  const { currentWorkflow, setCurrentWorkflow, updateWorkflow, removeNode, loading: workflowLoading } = useWorkflowStore()
  const { joinCollaboration, leaveCollaboration, collaborators } = useCollaborationStore()
  const { getConnectedProviders, loading: integrationsLoading } = useIntegrationStore()
  const { addError, setCurrentWorkflow: setErrorStoreWorkflow, getLatestErrorForNode } = useWorkflowErrorStore()
  
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

  // Memoize node types to prevent unnecessary re-renders
  const nodeTypes = useMemo(() => ({
    custom: CustomNode,
    addAction: AddActionNode,
  }), [])

  const [isSaving, setIsSaving] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [activeExecutionNodeId, setActiveExecutionNodeId] = useState<string | null>(null)
  const [executionResults, setExecutionResults] = useState<Record<string, { status: 'pending' | 'running' | 'completed' | 'error', timestamp: number, error?: string }>>({})
  const [workflowName, setWorkflowName] = useState("")
  const [workflowDescription, setWorkflowDescription] = useState("")
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
  const [listeningMode, setListeningMode] = useState(false)
  const [hasShownLoading, setHasShownLoading] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [isRebuildingAfterSave, setIsRebuildingAfterSave] = useState(false)
  const [showDiscordConnectionModal, setShowDiscordConnectionModal] = useState(false)

  const { toast } = useToast()
  const { trackWorkflowEmails } = useWorkflowEmailTracking()
  const { updateWithTransition } = useConcurrentStateUpdates()
  
  const availableIntegrations = useMemo(() => {
    const integrations = getIntegrationsFromNodes()
    // Integrations loaded successfully
    
    // AI Agent integration validation
    const aiIntegration = integrations.find(int => int.id === 'ai')
    
    // Debug: Check some integrations that should have triggers
    const gmailIntegration = integrations.find(int => int.id === 'gmail')
    if (gmailIntegration) {
    }
    
    return integrations
  }, [])

  const nodeNeedsConfiguration = (nodeComponent: NodeComponent): boolean => {
    // All trigger nodes should have configuration
    if (nodeComponent.isTrigger) {
      return true;
    }
    
    // For non-trigger nodes, check if they have a configuration schema
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
    
    // Show all actions regardless of trigger
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
    
    return isConnected;
  }, [integrations, getConnectedProviders])



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
        
        // Clear all preferences for this user
        const response = await fetch(`/api/user/config-preferences`, {
          method: "DELETE"
        })
        
        if (response.ok) {
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

  const handleConfigureNode = useCallback(async (nodeId: string) => {
    const nodeToConfigure = getNodes().find((n) => n.id === nodeId)
    if (!nodeToConfigure) return
    const nodeComponent = ALL_NODE_COMPONENTS.find((c) => c.type === nodeToConfigure.data.type)
    if (!nodeComponent) return

    const providerId = nodeToConfigure.data.providerId as keyof typeof INTEGRATION_CONFIGS
    const integration = INTEGRATION_CONFIGS[providerId]
    if (integration && nodeComponent) {
      console.log('🔍 [WorkflowBuilder] Setting up configuration for node:');
      console.log('  - Node ID:', nodeId);
      console.log('  - Node Data:', nodeToConfigure.data);
      console.log('  - Saved Config:', nodeToConfigure.data.config);
      console.log('  - Has Config:', !!nodeToConfigure.data.config);
      console.log('  - Config Keys:', nodeToConfigure.data.config ? Object.keys(nodeToConfigure.data.config) : []);
      
      // Try to load configuration from our persistence system first
      let config = nodeToConfigure.data.config || {}
      
      if (typeof window !== "undefined") {
        try {
          // Extract workflow ID from URL
          const pathParts = window.location.pathname.split('/')
          const builderIndex = pathParts.indexOf('builder')
          const workflowId = builderIndex !== -1 && pathParts.length > builderIndex + 1 ? pathParts[builderIndex + 1] : null
          
          if (workflowId) {
            console.log('🔍 [WorkflowBuilder] Attempting to load from persistence system:', {
              workflowId,
              nodeId,
              nodeType: nodeToConfigure.data.type
            });
            
            const savedNodeData = loadNodeConfig(workflowId, nodeId, nodeToConfigure.data.type)
            if (savedNodeData && savedNodeData.config) {
              console.log('✅ [WorkflowBuilder] Loaded configuration from persistence system:', savedNodeData.config);
              config = savedNodeData.config
            } else {
              console.log('📋 [WorkflowBuilder] No saved configuration found in persistence system, using workflow store config');
            }
          }
        } catch (error) {
          console.error('Failed to load from persistence system:', error);
          // Fall back to workflow store config
        }
      }
      
      setConfiguringNode({ id: nodeId, integration, nodeComponent, config })
    }
  }, [getNodes])

  const handleAddActionClick = useCallback((nodeId: string, parentId: string) => {
    setSourceAddNode({ id: nodeId, parentId })
    setSelectedIntegration(null)
    setSelectedAction(null)
    setSearchQuery("")
    setShowActionDialog(true)
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
        
        // Clear our enhanced config persistence data
        if (currentWorkflow?.id && nodeId && nodeType) {
          try {
            console.log('🔄 [WorkflowBuilder] Clearing saved node config:', {
              workflowId: currentWorkflow.id,
              nodeId: nodeId,
              nodeType: nodeType
            });
            
            await clearNodeConfig(currentWorkflow.id, nodeId, nodeType)
            
            console.log('✅ [WorkflowBuilder] Node configuration cleared from persistence layer');
          } catch (configError) {
            console.error('❌ [WorkflowBuilder] Failed to clear node configuration from persistence layer:', configError);
          }
        }
        
        if (nodeType && providerId) {
          
          // Since we can't easily identify which preferences belong to which node,
          // we'll clear ALL preferences for this node type and provider
          // This is a temporary solution until we implement proper node isolation
          const response = await fetch(`/api/user/config-preferences?nodeType=${encodeURIComponent(nodeType)}&providerId=${encodeURIComponent(providerId)}`, {
            method: "DELETE"
          })
          
          if (response.ok) {
            console.log('✅ [WorkflowBuilder] Node preferences cleared');
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
          
          // Clear all preferences for this user
          const response = await fetch(`/api/user/config-preferences`, {
            method: "DELETE"
          })
          
          if (response.ok) {
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
    
    // Remove the node from the workflow store
    removeNode(nodeId)
    
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
    
    // Save the workflow after node deletion
    setTimeout(async () => {
      try {
        if (currentWorkflow?.id) {
          // Get current nodes and edges from React Flow (same as handleSave)
          const reactFlowNodes = getNodes().filter((n: Node) => n.type === 'custom')
          const reactFlowEdges = getEdges().filter((e: Edge) => reactFlowNodes.some((n: Node) => n.id === e.source) && reactFlowNodes.some((n: Node) => n.id === e.target))

          // Map to database format (same as handleSave)
          const mappedNodes: WorkflowNode[] = reactFlowNodes.map((n: Node) => {
            const position = {
              x: typeof n.position.x === 'number' ? Math.round(n.position.x * 100) / 100 : parseFloat(parseFloat(n.position.x as unknown as string).toFixed(2)),
              y: typeof n.position.y === 'number' ? Math.round(n.position.y * 100) / 100 : parseFloat(parseFloat(n.position.y as unknown as string).toFixed(2))
            };
            
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

          await updateWorkflow(currentWorkflow.id, { 
            nodes: mappedNodes, 
            connections: mappedConnections 
          })
          console.log('✅ [WorkflowBuilder] Workflow saved after node deletion')
        }
      } catch (error) {
        console.error('❌ [WorkflowBuilder] Failed to save workflow after node deletion:', error)
      }
    }, 100) // Delay slightly more to ensure all state updates are complete
  }, [getNodes, getEdges, setNodes, setEdges, fitView, handleAddActionClick, removeNode, currentWorkflow, updateWorkflow])

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
  const optimizedOnNodesChange = useCallback((changes: any) => {
    onNodesChange(changes)
  }, [onNodesChange])

  useEffect(() => {
    if (workflowId) {
      joinCollaboration(workflowId)
      // Set current workflow in error store
      setErrorStoreWorkflow(workflowId)
    }
    return () => { 
      if (workflowId) leaveCollaboration() 
      // Reset loading states on cleanup
      setIsSaving(false)
      setIsExecuting(false)
      isSavingRef.current = false
    }
  }, [workflowId]) // Remove function dependencies since Zustand functions are stable

  // Debug sourceAddNode changes (trimmed for performance)
  // useEffect(() => {
  //   console.log('🔍 sourceAddNode changed:', sourceAddNode)
  // }, [sourceAddNode])

  // Disable cache-based workflow loading to prevent conflicts
  // useEffect(() => {
  //   if (!workflowsData.length && !workflowsCacheLoading) {
  //     loadWorkflows()
  //   }
  // }, [workflowsData.length, workflowsCacheLoading])

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

  // Debug listeningMode state changes
  useEffect(() => {
  }, [listeningMode])

  useEffect(() => {
    if (workflowId) {
      // Clear any existing workflow data first to ensure fresh load
      setCurrentWorkflow(null);
      
      // Always fetch fresh data from the API instead of using cached data
      const loadFreshWorkflow = async () => {
        try {
          const response = await fetch(`/api/workflows/${workflowId}`);
          if (response.ok) {
            const freshWorkflow = await response.json();
            setCurrentWorkflow(freshWorkflow);
          } else {
            console.error('Failed to load workflow:', response.status, response.statusText);
            
            // Handle specific error cases
            if (response.status === 404) {
              toast({
                title: "Workflow Not Found",
                description: "The workflow you're trying to access doesn't exist or you don't have permission to view it.",
                variant: "destructive",
              });
              router.push('/workflows');
            } else if (response.status === 401) {
              toast({
                title: "Authentication Required",
                description: "Please log in to access this workflow.",
                variant: "destructive",
              });
              router.push('/auth/login');
            } else if (response.status === 500) {
              toast({
                title: "Server Error",
                description: "There was an error loading the workflow. Please try again.",
                variant: "destructive",
              });
            }
          }
        } catch (error) {
          console.error('Error loading fresh workflow:', error);
          toast({
            title: "Connection Error",
            description: "Unable to connect to the server. Please check your internet connection and try again.",
            variant: "destructive",
          });
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
      setWorkflowName(currentWorkflow.name)
      setWorkflowDescription(currentWorkflow.description || "")
      
      // Always rebuild nodes on initial load to ensure positions are loaded correctly
      const currentNodeIds = getNodes().filter(n => n.type === 'custom').map(n => n.id).sort()
      const workflowNodeIds = (currentWorkflow.nodes || []).map(n => n.id).sort()
      const nodesChanged = JSON.stringify(currentNodeIds) !== JSON.stringify(workflowNodeIds)
      
      
      // Check positions even if node IDs haven't changed
      let positionsChanged = false
      if (getNodes().length > 0) {
        const allNodes = getNodes()
        
        const currentPositions = allNodes.filter(n => n.type === 'custom').map(n => ({ id: n.id, position: n.position })).sort((a, b) => a.id.localeCompare(b.id))
        const savedPositions = (currentWorkflow.nodes || []).map(n => ({ id: n.id, position: n.position })).sort((a, b) => a.id.localeCompare(b.id))
        positionsChanged = JSON.stringify(currentPositions) !== JSON.stringify(savedPositions)
        
      }
      
      // Always rebuild nodes on load to ensure positions are correct
      if (true) {
          // Log the nodes we're loading from the database to verify positions
          
          const customNodes: Node[] = (currentWorkflow.nodes || []).map((node: WorkflowNode) => {
            // Get the component definition to ensure we have the correct title
            const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === node.data.type);
            
            // Ensure position is a number
            const position = {
              x: typeof node.position.x === 'number' ? node.position.x : parseFloat(node.position.x as unknown as string),
              y: typeof node.position.y === 'number' ? node.position.y : parseFloat(node.position.y as unknown as string)
            };
            
            
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
                providerId: node.data.providerId || node.data.type?.split(/[-_]/)[0],
                // Add execution status for visual feedback
                executionStatus: executionResults[node.id]?.status || null,
                isActiveExecution: activeExecutionNodeId === node.id,
                isListening: listeningMode,
                error: executionResults[node.id]?.error,
                errorMessage: getLatestErrorForNode(node.id)?.errorMessage,
                errorTimestamp: getLatestErrorForNode(node.id)?.timestamp,
                // Debug data
                debugListeningMode: listeningMode,
                debugExecutionStatus: executionResults[node.id]?.status || 'none'
              },
            };
            
            // Debug node data being passed
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
    const triggerId = `trigger-${Date.now()}`;
    const triggerNode: Node = {
      id: triggerId,
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
      try {
        const preservedActionNodes = JSON.parse(preservedActionNodesJson);
        allNodes = [triggerNode, ...preservedActionNodes];
        sessionStorage.removeItem('preservedActionNodes');
      } catch (error) {
        console.error('Error parsing preserved action nodes:', error);
      }
    }
    
    // Add the "add action" node after the trigger
    const addActionId = `add-action-${triggerNode.id}`;
    const addActionNode: Node = {
      id: addActionId,
      type: 'addAction',
      position: { x: triggerNode.position.x, y: triggerNode.position.y + 160 },
      data: { parentId: triggerNode.id, onClick: () => handleAddActionClick(addActionId, triggerNode.id) }
    };
    
    // Add edge from trigger to add action node
    const addActionEdge: Edge = {
      id: `${triggerNode.id}->${addActionId}`,
      source: triggerNode.id,
      target: addActionId,
      animated: true,
      style: { stroke: '#b1b1b7', strokeWidth: 2, strokeDasharray: '5,5' },
      type: 'straight'
    };
    
    allNodes.push(addActionNode);
    allEdges.push(addActionEdge);
    
    setNodes(allNodes);
    setEdges(allEdges);
    setHasUnsavedChanges(true);
    
    // Don't auto-save when trigger is selected - let user save manually

    // Webhook registration is now handled only by the Listen button or workflow activation
  };

  // Check if a trigger supports webhooks
  const isWebhookSupportedTrigger = (triggerType: string): boolean => {
    const webhookSupportedTriggers = [
      'gmail_trigger_new_email',
      'gmail_trigger_new_attachment', 
      'gmail_trigger_new_label',
      'google_calendar_trigger_new_event',
      'google_calendar_trigger_event_updated',
      'google_calendar_trigger_event_canceled',
      'google-drive:new_file_in_folder',
      'google-drive:new_folder_in_folder',
      'google-drive:file_updated',
      'google_sheets_trigger_new_row',
      'google_sheets_trigger_new_worksheet',
      'google_sheets_trigger_updated_row',
      'slack_trigger_new_message',
      'slack_trigger_channel_created',
      'slack_trigger_user_joined',
      'github_trigger_new_issue',
      'github_trigger_issue_updated',
      'github_trigger_new_pr',
      'github_trigger_pr_updated',
      'notion_trigger_new_page',
      'notion_trigger_page_updated',
      'hubspot_trigger_new_contact',
      'hubspot_trigger_contact_updated',
      'airtable_trigger_new_record',
      'airtable_trigger_record_updated',
      'discord_trigger_new_message',
      'discord_trigger_member_joined',
      'discord_trigger_reaction_added'
    ];
    
    return webhookSupportedTriggers.includes(triggerType);
  };

  // Register webhook for trigger
  const registerWebhookForTrigger = async (trigger: NodeComponent, providerId: string, config: Record<string, any>) => {
    if (!workflowId) return;

    try {
      const response = await fetch('/api/workflows/webhook-registration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workflowId,
          triggerType: trigger.type,
          providerId,
          config
        })
      });

      if (response.ok) {
        const result = await response.json();
        
        // Show success notification
        toast({
          title: "Webhook Registered",
          description: `Webhook for ${trigger.title} has been automatically registered.`,
          variant: "default"
        });
      } else {
        const error = await response.json();
        console.warn('⚠️ Webhook registration failed:', error);
        
        // Show warning notification
        toast({
          title: "Webhook Registration Failed",
          description: `Could not register webhook for ${trigger.title}. You may need to configure it manually.`,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error registering webhook:', error);
      
      toast({
        title: "Webhook Registration Error",
        description: `Failed to register webhook for ${trigger.title}.`,
        variant: "destructive"
      });
    }
  };

  const handleActionSelect = (integration: IntegrationInfo, action: NodeComponent) => {
    
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
      
      const configuringNodeData = { 
        id: 'pending-action', 
        integration: integrationConfig, 
        nodeComponent: action, 
        config: {} 
      };
      setConfiguringNode(configuringNodeData);
      setShowActionDialog(false);
      // Clear sourceAddNode immediately to prevent dialog from reopening
      setSourceAddNode(null);
    } else {
      // Add action directly if no configuration needed
      addActionToWorkflow(integration, action, {}, effectiveSourceAddNode);
    }
  }

  const addActionToWorkflow = (integration: IntegrationInfo, action: NodeComponent, config: Record<string, any>, sourceNodeInfo: { id: string; parentId: string }): string | null => {
    const parentNode = getNodes().find((n) => n.id === sourceNodeInfo.parentId)
    if (!parentNode) return null
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
    
    return newNodeId // Return the new node ID so we can save its config to persistence
  }

  const handleSaveConfiguration = async (context: { id: string }, newConfig: Record<string, any>) => {
    if (context.id === 'pending-trigger' && pendingNode?.type === 'trigger') {
      // Add trigger to workflow with configuration
      addTriggerToWorkflow(pendingNode.integration, pendingNode.nodeComponent, newConfig);
      
      // Auto-save the workflow to database after adding the new trigger
      // Wait for React state updates to flush before saving
      setTimeout(async () => {
        try {
          await handleSave();
          console.log('✅ [WorkflowBuilder] New trigger saved to database automatically');
        } catch (error) {
          console.error('❌ [WorkflowBuilder] Failed to save new trigger to database:', error);
          toast({ 
            title: "Save Warning", 
            description: "Trigger added but failed to save to database. Please save manually.", 
            variant: "destructive" 
          });
        }
      }, 0);
      
      setPendingNode(null);
      setConfiguringNode(null);
      toast({ title: "Trigger Added", description: "Your trigger has been configured and added to the workflow." });
    } else if (context.id === 'pending-action' && pendingNode?.type === 'action' && pendingNode.sourceNodeInfo) {
      // Add action to workflow with configuration
      const newNodeId = addActionToWorkflow(pendingNode.integration, pendingNode.nodeComponent, newConfig, pendingNode.sourceNodeInfo);
      
      // Auto-save the workflow to database after adding the new action
      // Wait for React state updates to flush before saving
      setTimeout(async () => {
        try {
          await handleSave();
          console.log('✅ [WorkflowBuilder] New action saved to database automatically');
          
          // Now save node configuration to persistence system after workflow is in database
          if (newNodeId && currentWorkflow?.id) {
            try {
              const nodeType = pendingNode.nodeComponent.type || 'unknown';
              console.log('🔄 [WorkflowBuilder] Saving new node configuration to persistence after database save:', {
                workflowId: currentWorkflow.id,
                nodeId: newNodeId,
                nodeType: nodeType
              });
              
              await saveNodeConfig(currentWorkflow.id, newNodeId, nodeType, newConfig);
              console.log('✅ [WorkflowBuilder] New node configuration saved to persistence layer successfully');
            } catch (persistenceError) {
              console.error('❌ [WorkflowBuilder] Failed to save new node configuration to persistence layer:', persistenceError);
            }
          }
        } catch (error) {
          console.error('❌ [WorkflowBuilder] Failed to save new action to database:', error);
          toast({ 
            title: "Save Warning", 
            description: "Action added but failed to save to database. Please save manually.", 
            variant: "destructive" 
          });
        }
      }, 0);
      
      setPendingNode(null);
      setConfiguringNode(null);
      toast({ title: "Action Added", description: "Your action has been configured and added to the workflow." });
    } else {
      // Handle existing node configuration updates - update local state AND save to database
      console.log('✅ [WorkflowBuilder] Updating existing node configuration in local state');
      setNodes((nds) => nds.map((node) => (node.id === context.id ? { ...node, data: { ...node.data, config: newConfig } } : node)));
      
      // Save individual node configuration to persistent storage using our configPersistence system
      if (currentWorkflow?.id && context.id) {
        try {
          // Determine node type from the node data
          const currentNode = nodes.find(node => node.id === context.id)
          const nodeType = currentNode?.data?.type || 'unknown'
          
          console.log('🔄 [WorkflowBuilder] Saving node configuration to persistence layer:', {
            workflowId: currentWorkflow.id,
            nodeId: context.id,
            nodeType: nodeType
          });
          
          // Save to our enhanced persistence system (Supabase + localStorage fallback)
          await saveNodeConfig(currentWorkflow.id, context.id, nodeType, newConfig)
          
          console.log('✅ [WorkflowBuilder] Node configuration saved to persistence layer successfully');
        } catch (persistenceError) {
          console.error('❌ [WorkflowBuilder] Failed to save node configuration to persistence layer:', persistenceError);
          // Don't show error toast here since we'll try the workflow save below
        }
      }
      
      // Also save to database immediately (as a backup and for workflow structure)
      setTimeout(async () => {
        try {
          console.log('🔄 [WorkflowBuilder] Saving updated workflow to database...');
          await handleSave();
          console.log('✅ [WorkflowBuilder] Existing node configuration saved to database successfully');
        } catch (error) {
          console.error('❌ [WorkflowBuilder] Failed to save existing node configuration to database:', error);
          toast({ 
            title: "Save Warning", 
            description: "Configuration updated but failed to save to database. Please save manually.", 
            variant: "destructive" 
          });
        }
      }, 50); // Small delay to ensure React state update is applied
      
      setConfiguringNode(null);
    }
  }

  const handleSave = async () => {
    if (!currentWorkflow) return
    
    // Prevent multiple simultaneous save operations
    if (isSaving) {
      return
    }
    
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


      // Map to database format without losing React Flow properties
      const mappedNodes: WorkflowNode[] = reactFlowNodes.map((n: Node) => {
        // Ensure position is properly captured and converted to numbers
        const position = {
          x: typeof n.position.x === 'number' ? Math.round(n.position.x * 100) / 100 : parseFloat(parseFloat(n.position.x as unknown as string).toFixed(2)),
          y: typeof n.position.y === 'number' ? Math.round(n.position.y * 100) / 100 : parseFloat(parseFloat(n.position.y as unknown as string).toFixed(2))
        };
        
        // Log each node position to verify
        
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


      const updates: Partial<Workflow> = {
        name: workflowName, 
        description: workflowDescription,
        nodes: mappedNodes, 
        connections: mappedConnections, 
        status: currentWorkflow.status,
      }


      // Save to database with better error handling
      const result = await updateWorkflow(currentWorkflow!.id, updates)
      
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
      
      
      // Note: Webhook registration happens only when "Listen" button is clicked, not on save
      toast({ title: "Workflow Saved", description: "Your workflow has been successfully saved." })
      
      // Immediately clear unsaved changes flag to prevent UI flicker
      setHasUnsavedChanges(false);
      
      // Update the last save timestamp to prevent immediate change detection
      lastSaveTimeRef.current = Date.now();
      
      // Update the current workflow with the saved data to avoid loading screen
      
      // Update the current workflow with the saved data instead of clearing it
      setCurrentWorkflow(newWorkflow);
      
      // Force a rebuild of nodes after save to ensure positions are updated
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
        
        // Ensure unsaved changes flag is cleared after rebuild completes and prevent detection
        setTimeout(() => {
          setHasUnsavedChanges(false);
          lastSaveTimeRef.current = Date.now(); // Refresh timestamp after rebuild
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
    // Toggle listening mode instead of executing
    if (isExecuting && !listeningMode) {
      return
    }
    
    try {
      if (!currentWorkflow) {
        throw new Error("No workflow selected")
      }

      // If we're already in listening mode, turn it off
      if (listeningMode) {
        setListeningMode(false)
        setIsExecuting(false)
        setActiveExecutionNodeId(null)
        setExecutionResults({})
        toast({
          title: "Listening Mode Disabled",
          description: "No longer listening for triggers.",
        })
        return
      }

      setIsExecuting(true)
      
      // Get all workflow nodes and edges
      const workflowNodes = getNodes().filter((n: Node) => n.type === 'custom')
      
      // Find trigger nodes
      const triggerNodes = workflowNodes.filter(node => node.data?.isTrigger)
      
      if (triggerNodes.length === 0) {
        throw new Error("No trigger nodes found in workflow")
      }
      
      // Setup real-time monitoring for execution events
      const supabaseClient = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
      )
      
      // Subscribe to execution events for this workflow to track node status
      const channel = supabaseClient
        .channel(`execution_events_${currentWorkflow.id}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "live_execution_events",
            filter: `workflow_id=eq.${currentWorkflow.id}`,
          },
          (payload) => {
            const event = payload.new as any
            
            // Update node execution status
            if (event.node_id) {
              const status = event.event_type === 'node_started' ? 'running' : 
                           event.event_type === 'node_completed' ? 'completed' :
                           event.event_type === 'node_error' ? 'error' : 'pending'
              
              setExecutionResults(prev => ({
                ...prev,
                [event.node_id]: {
                  status,
                  timestamp: Date.now(),
                  error: event.error_message || undefined
                }
              }))
              
              // Handle error state - add to error store
              if (event.event_type === 'node_error' && event.error_message) {
                const nodeName = getNodes().find(n => n.id === event.node_id)?.data?.title || `Node ${event.node_id}`
                addError({
                  workflowId: currentWorkflow.id,
                  nodeId: event.node_id,
                  nodeName,
                  errorMessage: event.error_message,
                  timestamp: new Date().toISOString(),
                  executionSessionId: event.execution_session_id
                })
              }
              
              // Debug execution results update
              
              // Set active node if it's running
              if (event.event_type === 'node_started') {
                setActiveExecutionNodeId(event.node_id)
              } else if (event.event_type === 'node_completed' || event.event_type === 'node_error') {
                setActiveExecutionNodeId(null)
                
                // Stop listening after successful completion (not on error)
                if (event.event_type === 'node_completed' && !getNodes().some(n => 
                  n.id !== event.node_id && 
                  executionResults[n.id]?.status === 'running' || 
                  executionResults[n.id]?.status === 'pending'
                )) {
                  // All nodes completed successfully - stop listening mode
                  setTimeout(() => {
                    setIsExecuting(false)
                    setListeningMode(false)
                  }, 2000) // Wait 2 seconds to show success state
                }
              }
            }
          }
        )
        .subscribe()
      
      // Register webhooks for trigger nodes
      let registeredWebhooks = 0
      for (const triggerNode of triggerNodes) {
        const nodeData = triggerNode.data
        const providerId = nodeData?.providerId
        
        if (providerId) {
          try {
            
            // Register webhook with the provider
            const webhookResponse = await fetch('/api/workflows/webhook-registration', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                workflowId: currentWorkflow.id,
                nodeId: triggerNode.id,
                providerId: providerId,
                triggerType: nodeData.type,
                config: nodeData.config || {}
              })
            })
            
            
            if (webhookResponse.ok) {
              const webhookResult = await webhookResponse.json()
              registeredWebhooks++
              
              // Check for our special debug message
              if (webhookResult.message?.includes('🚨')) {
              }
            } else {
              const errorText = await webhookResponse.text()
              console.error(`❌ Failed to register webhook for ${providerId}:`, errorText)
              console.error(`❌ Response status: ${webhookResponse.status}`)
            }
          } catch (error) {
            console.error(`❌ Error registering webhook for ${providerId}:`, error)
          }
        }
      }
      
      // Enable listening mode
              setListeningMode(true)
      
      toast({
        title: "Listening Mode Enabled",
        description: `Now listening for triggers. ${registeredWebhooks} webhook(s) registered. Trigger the events to see the workflow execute.`,
      })
      
    } catch (error: any) {
      console.error("Failed to setup listening mode:", error)
      
      let errorMessage = error.message || "Failed to setup listening mode"
      
      toast({ 
        title: "Setup Failed", 
        description: errorMessage, 
        variant: "destructive" 
      })
      
      setListeningMode(false)
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
      return false;
    }
    
    // Get a reference to the current ReactFlow nodes and edges
    const currentNodes = getNodes().filter((n: Node) => n.type === 'custom')
    // Filter out UI-only edges (like the dashed "Add Action" edge) from change detection
    const currentEdges = getEdges().filter((edge: Edge) => 
      // Exclude edges that connect to addAction nodes (these are UI-only)
      !edge.target.includes('addAction') && 
      // Exclude dashed edges (these are typically UI helpers)
      !(edge.style?.strokeDasharray)
    )
    
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
      }
    }
  }, [nodes, currentWorkflow])

  // Debug current workflow and nodes
  useEffect(() => {
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
    setHasUnsavedChanges(false)
    setPendingNavigation(null)
    if (pendingNavigation) {
      router.push(pendingNavigation)
    }
  }

  // Force reload workflow from database
  const forceReloadWorkflow = useCallback(async () => {
    if (!workflowId) return;
    
    try {
      // Use the existing API endpoint instead of direct Supabase access
      const response = await fetch(`/api/workflows/${workflowId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch workflow: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data) {
        throw new Error('Workflow not found');
      }
      
      
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

  // Check for Discord integration when workflow is loaded
  useEffect(() => {
    if (currentWorkflow && nodes.length > 0) {
      // Check if any nodes require Discord integration
      const hasDiscordNodes = nodes.some(node => 
        node.data?.providerId === 'discord' || 
        node.data?.type?.includes('discord')
      );
      
      if (hasDiscordNodes) {
        const connectedProviders = getConnectedProviders();
        const hasDiscordIntegration = connectedProviders.includes('discord');
        if (!hasDiscordIntegration) {
          // For now, just log the issue - we'll handle the UI later
        }
      }
    }
  }, [currentWorkflow, nodes, getConnectedProviders]);

  return {
    nodes,
    edges,
    setNodes,
    setEdges,
    onNodesChange,
    optimizedOnNodesChange,
    onEdgesChange,
    onConnect,
    workflowName,
    setWorkflowName,
    workflowDescription,
    setWorkflowDescription,
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
    activeExecutionNodeId,
    executionResults,
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
    listeningMode,
    setListeningMode,
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
    handleNavigateWithoutSaving,
    showDiscordConnectionModal,
    setShowDiscordConnectionModal
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
    nodes, edges, setNodes, setEdges, onNodesChange, optimizedOnNodesChange, onEdgesChange, onConnect, workflowName, setWorkflowName, workflowDescription, setWorkflowDescription, isSaving, handleSave, handleExecute, 
    showTriggerDialog, setShowTriggerDialog, showActionDialog, setShowActionDialog, handleTriggerSelect, handleActionSelect, selectedIntegration, setSelectedIntegration,
    availableIntegrations, renderLogo, getWorkflowStatus, currentWorkflow, isExecuting, activeExecutionNodeId, executionResults,
    configuringNode, setConfiguringNode, handleSaveConfiguration, collaborators, pendingNode, setPendingNode,
    selectedTrigger, setSelectedTrigger, selectedAction, setSelectedAction, searchQuery, setSearchQuery, filterCategory, setFilterCategory, showConnectedOnly, setShowConnectedOnly,
    filteredIntegrations, displayedTriggers, deletingNode, setDeletingNode, confirmDeleteNode, isIntegrationConnected, integrationsLoading, workflowLoading, listeningMode, setListeningMode, handleResetLoadingStates,
    sourceAddNode, handleActionDialogClose, nodeNeedsConfiguration, workflows, workflowId, hasShownLoading, setHasShownLoading, hasUnsavedChanges, setHasUnsavedChanges, showUnsavedChangesModal, setShowUnsavedChangesModal, pendingNavigation, setPendingNavigation,
    handleNavigation, handleSaveAndNavigate, handleNavigateWithoutSaving, showDiscordConnectionModal, setShowDiscordConnectionModal, forceReloadWorkflow
  } = useWorkflowBuilderState()

  const categories = useMemo(() => {
    const allCategories = availableIntegrations
      .map(int => int.category);
    return ['all', ...Array.from(new Set(allCategories))];
  }, [availableIntegrations]);

  // Integrations to mark as coming soon in the trigger selection modal
  const comingSoonIntegrations = useMemo(() => new Set([
    'beehiiv',
    'manychat',
    'gumroad',
    'kit',
    'paypal',
    'shopify',
    'blackbaud',
    'box',
  ]), []);

  const handleOpenTriggerDialog = () => {
    setSelectedIntegration(null);
    setSelectedTrigger(null);
    setSearchQuery("");
    setShowTriggerDialog(true);
  }

  // Debug loading states (reduced frequency)
  // console.log('🔍 Loading states:', {
  //   currentWorkflow: !!currentWorkflow,
  //   integrationsLoading,
  //   workflowLoading,
  //   workflowsLength: workflows.length,
  //   workflowId
  // })

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
  
  // Use useEffect to manage hasShownLoading state to prevent infinite re-renders
  useEffect(() => {
    if (isLoading && !hasShownLoading) {
      setHasShownLoading(true)
    } else if (!isLoading && hasShownLoading) {
      setHasShownLoading(false)
    }
  }, [isLoading, hasShownLoading])

  if (isLoading) {
    // Only log loading screen reason once per loading cycle to prevent console spam
    if (!hasShownLoading) {
    }
    return <WorkflowLoadingScreen />
  }
  return (
    <div style={{ height: "calc(100vh - 65px)", position: "relative" }}>
      {/* Top UI - Always visible */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
        <div className="flex justify-between items-start p-4 pointer-events-auto">
          <div className="flex items-center space-x-4 flex-1 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => handleNavigation("/workflows")} className="flex-shrink-0"><ArrowLeft className="w-5 h-5" /></Button>
            <div className="flex flex-col space-y-1 flex-1 min-w-0">
              <Input 
                value={workflowName} 
                onChange={(e) => setWorkflowName(e.target.value)} 
                onBlur={handleSave} 
                className="text-xl font-semibold !border-none !outline-none !ring-0 p-0 bg-transparent w-auto min-w-[200px] max-w-full" 
                style={{ 
                  boxShadow: "none",
                  width: `${Math.max(200, (workflowName?.length || 0) * 10 + 20)}px`
                }}
                placeholder="Untitled Workflow"
                title={workflowName || "Untitled Workflow"}
              />
            </div>
          </div>
          <div className="flex items-center space-x-2 flex-shrink-0">
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
                    variant={listeningMode ? "destructive" : "outline"} 
                    onClick={handleExecute} 
                    disabled={isExecuting && !listeningMode || isSaving}
                    size="sm"
                  >
                    {isExecuting && !listeningMode ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : listeningMode ? <Ear className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                    {listeningMode ? "Stop Listening" : "Listen"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{listeningMode ? "Stop listening for webhook triggers" : "Listen for webhook triggers in real-time"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild><Button onClick={handleExecute} disabled={isSaving || isExecuting} variant="default">{isExecuting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Play className="w-5 h-5 mr-2" />}Execute</Button></TooltipTrigger>
                <TooltipContent><p>Execute the workflow</p></TooltipContent>
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
          <ReactFlow 
          nodes={nodes} 
          edges={edges} 
          onNodesChange={optimizedOnNodesChange} 
          onEdgesChange={onEdgesChange} 
          onConnect={onConnect} 
          onNodeDrag={(event, node) => {
            // Track position changes during drag
            setHasUnsavedChanges(true)
          }}
          onNodeDragStop={(event, node) => {
            // Update node position in state and mark as unsaved
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
        </ReactFlow>
        </>
      )}

      <Dialog open={showTriggerDialog} onOpenChange={setShowTriggerDialog}>
        <DialogContent className="sm:max-w-[900px] h-[90vh] max-h-[90vh] w-full bg-gradient-to-br from-slate-50 to-white border-0 shadow-2xl flex flex-col overflow-hidden" style={{ paddingRight: '2rem' }}>
          <DialogHeader className="pb-3 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg text-white">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                    Select a Trigger
                    <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">Trigger</Badge>
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-600 mt-1">
                    Choose an integration and a trigger to start your workflow.
                  </DialogDescription>
                </div>
              </div>
              {/* Rely on default Dialog close button to avoid double X */}
            </div>
          </DialogHeader>
          
          <div className="pt-3 pb-3 border-b border-slate-200">
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

          <div className="flex-1 flex min-h-0 overflow-hidden">
            <ScrollArea className="w-2/5 border-r border-border flex-1" style={{ scrollbarGutter: 'stable' }}>
              <div className="pt-2 pb-3 pl-3 pr-5">
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
                    className={`flex items-center p-3 rounded-md ${
                      comingSoonIntegrations.has(integration.id)
                        ? 'cursor-not-allowed opacity-60'
                        : 'cursor-pointer'
                    } ${selectedIntegration?.id === integration.id ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted/50'}`}
                    onClick={() => {
                      if (comingSoonIntegrations.has(integration.id)) return
                      setSelectedIntegration(integration)
                    }}
                    aria-disabled={comingSoonIntegrations.has(integration.id)}
                  >
                    {renderLogo(integration.id, integration.name)}
                    <span className="font-semibold ml-4 flex-grow truncate">
                      {integration.name}
                    </span>
                    {comingSoonIntegrations.has(integration.id) && (
                      <Badge variant="secondary" className="ml-2 shrink-0 whitespace-nowrap text-[10px] h-5 px-2 rounded-full bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wide">Coming soon</Badge>
                    )}
                    {/* Right indicator: subtle dot indicator instead of arrow */}
                    <span className="ml-2 shrink-0 inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground/60" aria-hidden="true" />
                  </div>
                ))
              )}
              </div>
            </ScrollArea>
            <div className="w-3/5 flex-1">
              <ScrollArea className="h-full" style={{ scrollbarGutter: 'stable' }}>
                <div className="p-4">
                {selectedIntegration ? (
                  <div className="h-full">
                    {displayedTriggers.length > 0 ? (
                      <div className="grid grid-cols-1 gap-3">
                        {displayedTriggers.map((trigger, index) => {
                          const isTriggerComingSoon = Boolean((trigger as any).comingSoon) || (selectedIntegration && comingSoonIntegrations.has(selectedIntegration.id))
                          return (
                            <div
                              key={`${trigger.type}-${trigger.title}-${index}`}
                              className={`relative p-4 border rounded-lg transition-all ${
                                isTriggerComingSoon ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                              } ${selectedTrigger?.type === trigger.type ? 'border-primary bg-primary/10 ring-1 ring-primary/20' : 'border-border hover:border-muted-foreground hover:shadow-sm'}`}
                              onClick={() => {
                                if (isTriggerComingSoon) return
                                setSelectedTrigger(trigger)
                              }}
                              onDoubleClick={() => {
                                if (isTriggerComingSoon) return
                                setSelectedTrigger(trigger)
                                if (selectedIntegration) {
                                  handleTriggerSelect(selectedIntegration, trigger)
                                }
                              }}
                              aria-disabled={isTriggerComingSoon}
                            >
                              <div className="flex items-center gap-2">
                                <p className="font-medium flex-1 min-w-0 truncate">{trigger.title}</p>
                                {isTriggerComingSoon && (
                                  <Badge variant="secondary" className="ml-2 shrink-0 whitespace-nowrap text-[10px] h-5 px-2 rounded-full bg-amber-100 text-amber-800 border border-amber-200 uppercase tracking-wide">Coming soon</Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">{trigger.description}</p>
                            </div>
                          )
                        })}
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
          
          <DialogFooter className="p-4 flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {selectedIntegration && (
                <>
                  <span className="font-medium">Integration:</span> {selectedIntegration.name}
                  {selectedTrigger && <span className="ml-4"><span className="font-medium">Trigger:</span> {selectedTrigger.title}</span>}
                </>
              )}
            </div>
            <div className="flex space-x-2">
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
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
        <DialogContent className="sm:max-w-[900px] h-[90vh] max-h-[90vh] w-full bg-gradient-to-br from-slate-50 to-white border-0 shadow-2xl flex flex-col overflow-hidden" style={{ paddingRight: '2rem' }}>
          <DialogHeader className="pb-3 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg text-white">
                  <Zap className="w-5 h-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                    Select an Action
                    <Badge variant="secondary" className="bg-green-100 text-green-800 border-green-200">Action</Badge>
                  </DialogTitle>
                  <DialogDescription className="text-sm text-slate-600 mt-1">
                    Choose an integration and an action to add to your workflow.
                  </DialogDescription>
                </div>
              </div>
              {/* Rely on default Dialog close button to avoid double X */}
            </div>
          </DialogHeader>
          
          <div className="pt-3 pb-3 border-b border-slate-200">
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

          <div className="flex-1 flex min-h-0 overflow-hidden">
            <ScrollArea className="w-2/5 border-r border-border flex-1" style={{ scrollbarGutter: 'stable' }}>
              <div className="pt-2 pb-3 pl-3 pr-5">
              {(() => {
                // Memoize the filtered integrations to avoid duplicate filtering
                const filteredIntegrationsForActions = availableIntegrations.filter(int => {
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
                });

                if (filteredIntegrationsForActions.length === 0 && showConnectedOnly) {
                  return (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="text-muted-foreground mb-2">
                        <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">No connected integrations found</p>
                      <p className="text-xs text-muted-foreground/70">Try unchecking "Show only connected apps"</p>
                    </div>
                  );
                }

                if (filteredIntegrationsForActions.length === 0) {
                  return (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <div className="text-muted-foreground mb-2">
                        <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </div>
                      <p className="text-sm text-muted-foreground">No integrations match your search</p>
                    </div>
                  );
                }

                // Use the already filtered integrations instead of filtering again
                return filteredIntegrationsForActions.map((integration) => (
                    <div
                      key={integration.id}
                      className={`flex items-center p-3 rounded-md cursor-pointer ${selectedIntegration?.id === integration.id ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted/50'}`}
                      onClick={() => setSelectedIntegration(integration)}
                    >
                      {renderLogo(integration.id, integration.name)}
                      <span className="font-semibold ml-4 flex-grow">{integration.name}</span>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </div>
                  ));
              })()}
              </div>
            </ScrollArea>
            <div className="w-3/5 flex-1">
              <ScrollArea className="h-full" style={{ scrollbarGutter: 'stable' }}>
                <div className="p-4">
                {selectedIntegration ? (
                  <div className="h-full">
                    <div className="grid grid-cols-1 gap-3">
                      {selectedIntegration.actions
                        .filter(action => {
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
                                  : selectedAction?.type === action.type 
                                    ? 'border-primary bg-primary/10 ring-1 ring-primary/20' 
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

          <div className="p-4 flex justify-between items-center">
            <div className="text-sm text-muted-foreground">
              {selectedIntegration && (
                <>
                  <span className="font-medium">Integration:</span> {selectedIntegration.name}
                  {selectedAction && <span className="ml-4"><span className="font-medium">Action:</span> {selectedAction.title || 'Unnamed Action'}</span>}
                </>
              )}
            </div>
            <div className="flex space-x-2">
              <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
              <Button 
                disabled={!selectedAction || !selectedIntegration || selectedAction?.comingSoon}
                onClick={() => {
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
              onSave={async (config) => await handleSaveConfiguration(configuringNode, config)}
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
                  setShowActionDialog(true);
                } else if (!wasSaved && isPendingNode && pendingNode?.type === 'trigger') {
                  setShowTriggerDialog(true);
                }
              }}
              onSave={async (config) => await handleSaveConfiguration(configuringNode, config)}
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

      {/* Discord Connection Modal */}
      <Dialog open={showDiscordConnectionModal} onOpenChange={setShowDiscordConnectionModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Discord Connection Required</DialogTitle>
            <DialogDescription>
              It seems like your workflow requires Discord integration, but no Discord integration has been found.
              Please add a Discord integration to your workflow.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setShowDiscordConnectionModal(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              // Add Discord integration setup logic here
              setShowDiscordConnectionModal(false);
            }}>
              Add Discord Integration
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Error Notification Popup */}
      {workflowId && <ErrorNotificationPopup workflowId={workflowId} />}
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
