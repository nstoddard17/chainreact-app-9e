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
  type EdgeTypes,
  Panel,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  type NodeProps,
  type EdgeProps,
  getBezierPath,
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
import { AIAgentConfigModal } from "./AIAgentConfigModal"
import CustomNode from "./CustomNode"
import { AddActionNode } from "./AddActionNode"
import { CollaboratorCursors } from "./CollaboratorCursors"
import ErrorNotificationPopup from "./ErrorNotificationPopup"
import { ReAuthNotification } from "@/components/integrations/ReAuthNotification"
import WorkflowExecutions from "./WorkflowExecutions"
import { ExecutionHistoryModal } from "./ExecutionHistoryModal"
import { SandboxPreviewPanel } from "./SandboxPreviewPanel"

import { Button } from "@/components/ui/button"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Save, Loader2, Play, ArrowLeft, Plus, Search, ChevronRight, RefreshCw, Bell, Zap, Ear, GitBranch, Bot, History, Radio, Pause, TestTube, Rocket, Shield, FlaskConical } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ALL_NODE_COMPONENTS, NodeComponent } from "@/lib/workflows/nodes"
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
  
  // Add Core integration for built-in triggers
  integrationMap['core'] = {
    id: 'core',
    name: 'Core',
    description: 'Built-in workflow triggers and utilities',
    category: 'Core',
    color: '#6B7280',
    triggers: [],
    actions: [],
  }
  
  // Add Logic integration for control flow
  integrationMap['logic'] = {
    id: 'logic',
    name: 'Logic',
    description: 'Control flow and data manipulation',
    category: 'Core',
    color: '#6B7280',
    triggers: [],
    actions: [],
  }
  
  // Add AI Agent as a separate integration
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
    // Handle core triggers (webhook, schedule, manual) that don't have providerId
    if (!node.providerId && (node.type === 'webhook' || node.type === 'schedule' || node.type === 'manual')) {
      integrationMap['core'].triggers.push(node)
    }
    // Handle nodes with providerId
    else if (node.providerId && integrationMap[node.providerId]) {
      if (node.isTrigger) {
        integrationMap[node.providerId].triggers.push(node)
      } else {
        integrationMap[node.providerId].actions.push(node)
      }
    }
  })
  const integrations = Object.values(integrationMap)
  
  // Sort integrations to put core first, then logic, then AI Agent, then alphabetically
  return integrations.sort((a, b) => {
    if (a.id === 'core') return -1
    if (b.id === 'core') return 1
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
  const { 
    getConnectedProviders, 
    integrations: storeIntegrations,
    fetchIntegrations,
    loading: integrationsLoading 
  } = useIntegrationStore()
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
  const { fitView, getNodes, getEdges } = useReactFlow<Node, Edge>()

  // Memoize node types to prevent unnecessary re-renders
  const nodeTypes = useMemo(() => ({
    custom: CustomNode,
    addAction: AddActionNode,
  }), [])
  
  // Memoize edge types to enable custom edges with plus buttons
  const edgeTypes = useMemo(() => ({
    custom: CustomEdgeWithButton,
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
  const [showConnectedOnly, setShowConnectedOnly] = useState(false) // Show all integrations including "Coming soon" ones
  const [sourceAddNode, setSourceAddNode] = useState<{ id: string; parentId: string; insertBefore?: string } | null>(null)
  const [configuringNode, setConfiguringNode] = useState<{ id: string; integration: any; nodeComponent: NodeComponent; config: Record<string, any> } | null>(null)
  const [pendingNode, setPendingNode] = useState<{ type: 'trigger' | 'action'; integration: IntegrationInfo; nodeComponent: NodeComponent; sourceNodeInfo?: { id: string; parentId: string } } | null>(null)
  const [deletingNode, setDeletingNode] = useState<{ id: string; name: string } | null>(null)
  const [aiAgentActionCallback, setAiAgentActionCallback] = useState<((nodeType: string, providerId: string, config?: any) => void) | null>(null)
  const [listeningMode, setListeningMode] = useState(false)
  const [hasShownLoading, setHasShownLoading] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showUnsavedChangesModal, setShowUnsavedChangesModal] = useState(false)
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null)
  const [isRebuildingAfterSave, setIsRebuildingAfterSave] = useState(false)
  const [showDiscordConnectionModal, setShowDiscordConnectionModal] = useState(false)
  const [showExecutionHistory, setShowExecutionHistory] = useState(false)
  const [showSandboxPreview, setShowSandboxPreview] = useState(false)
  const [sandboxInterceptedActions, setSandboxInterceptedActions] = useState<any[]>([])
  const isProcessingChainsRef = useRef(false)

  const { toast } = useToast()
  const { trackWorkflowEmails } = useWorkflowEmailTracking()
  const { updateWithTransition } = useConcurrentStateUpdates()
  
  const availableIntegrations = useMemo(() => {
    const integrations = getIntegrationsFromNodes()
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
    // Core integration is always "connected" since it's built-in
    if (integrationId === 'core') return true;
    
    // Logic integration is always "connected" since it doesn't require authentication
    if (integrationId === 'logic') return true;
    
    // AI Agent is always "connected" since it doesn't require external authentication
    if (integrationId === 'ai') return true;
    
    // Webhook and scheduler don't require authentication
    if (integrationId === 'webhook' || integrationId === 'scheduler') return true;
    
    // For Google services, check if ANY Google service is connected
    // Google services share authentication, so if one is connected, all are connected
    if (integrationId.startsWith('google-') || integrationId === 'gmail') {
      // Check if any Google service integration exists that's properly connected
      const googleServices = ['google-drive', 'google-sheets', 'google-docs', 'google-calendar', 'gmail'];
      const connectedGoogleService = storeIntegrations.find(i => 
        googleServices.includes(i.provider) && 
        i.status !== 'disconnected' && 
        i.status !== 'failed' && 
        i.status !== 'expired' &&
        i.status !== 'needs_reauthorization' &&
        !i.disconnected_at
      );
      
      if (connectedGoogleService) {
        return true;
      }
      
      // Also check via getConnectedProviders which handles the grouping
      const connectedProviders = getConnectedProviders();
      const hasAnyGoogleConnected = googleServices.some(service => connectedProviders.includes(service));
      if (hasAnyGoogleConnected) {
        return true;
      }
      
      return false;
    }
    
    // Check if this specific integration exists in the store
    const integration = storeIntegrations.find(i => i.provider === integrationId);
    if (integration) {
      // Consider it connected if it's not explicitly disconnected or failed
      const isConnected = integration.status !== 'disconnected' && 
                          integration.status !== 'failed' && 
                          integration.status !== 'expired' &&
                          integration.status !== 'needs_reauthorization' &&
                          !integration.disconnected_at;
      return isConnected;
    }
    
    // Use the getConnectedProviders as fallback
    const connectedProviders = getConnectedProviders();
    return connectedProviders.includes(integrationId);
  }, [storeIntegrations, getConnectedProviders])



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
      console.log('  - Node Type:', nodeToConfigure.data.type);
      console.log('  - Provider ID:', providerId);
      console.log('  - Node Data:', nodeToConfigure.data);
      console.log('  - Saved Config:', nodeToConfigure.data.config);
      console.log('  - Has Config:', !!nodeToConfigure.data.config);
      console.log('  - Config Keys:', nodeToConfigure.data.config ? Object.keys(nodeToConfigure.data.config) : []);
      console.log('  - Config Values:', nodeToConfigure.data.config);
      
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
            
            // IMPORTANT: await the async loadNodeConfig function
            const savedNodeData = await loadNodeConfig(workflowId, nodeId, nodeToConfigure.data.type as string)
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
      
      console.log('🔍 [WorkflowBuilder] Final config being set to configuringNode:', config);
      setConfiguringNode({ id: nodeId, integration, nodeComponent, config })
    }
  }, [getNodes])

  const handleAddActionClick = useCallback((nodeId: string, parentId: string) => {
    // Check if there's already a trigger in the workflow
    const hasTrigger = getNodes().some(node => 
      node.id === 'trigger' || 
      node.data?.isTrigger === true ||
      (typeof node.data?.type === 'string' && node.data.type.includes('trigger'))
    )
    
    if (!hasTrigger && nodeId.includes('add-action-trigger')) {
      // This is the initial add button and there's no trigger - open trigger dialog
      setSelectedIntegration(null)
      setSelectedTrigger(null)
      setSearchQuery("")
      setShowTriggerDialog(true)
    } else {
      // Normal action adding
      setSourceAddNode({ id: nodeId, parentId })
      setSelectedIntegration(null)
      setSelectedAction(null)
      setSearchQuery("")
      setShowActionDialog(true)
    }
  }, [getNodes])

  // Handle insert action between nodes
  const handleInsertAction = useCallback((sourceNodeId: string, targetNodeId: string) => {
    console.log('🔄 [WorkflowBuilder] handleInsertAction called:', { sourceNodeId, targetNodeId })
    setSourceAddNode({ 
      id: `insert-${sourceNodeId}-${targetNodeId}`, 
      parentId: sourceNodeId,
      insertBefore: targetNodeId 
    })
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



  // Handle renaming nodes
  const handleRenameNode = useCallback((nodeId: string, newTitle: string) => {
    setNodes((nds) => 
      nds.map((node) => {
        if (node.id === nodeId) {
          return {
            ...node,
            data: {
              ...node.data,
              title: newTitle,
              label: newTitle
            }
          }
        }
        return node
      })
    )
    setHasUnsavedChanges(true)
  }, [setNodes])

  // Memoize the recalculateLayout function to prevent unnecessary calls
  const recalculateLayout = useCallback(() => {
    const nodeList = getNodes()
      .filter((n: Node) => n.type === "custom" || n.type === "addAction")
      .sort((a: Node, b: Node) => a.position.y - b.position.y)
    if (nodeList.length === 0) return

    const triggerNode = nodeList.find((n: Node) => n.data?.isTrigger)
    const basePosition = triggerNode ? { x: triggerNode.position.x, y: triggerNode.position.y } : { x: 400, y: 100 }
    const verticalGap = 200
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
    
    // Check if this is an AI Agent node
    const isAIAgent = nodeToRemove.data?.type === 'ai_agent'
    
    // If it's an AI Agent, collect all child nodes to delete
    let nodesToDelete = [nodeId]
    if (isAIAgent) {
      console.log('🗑️ [WorkflowBuilder] Deleting AI Agent node and all its chains')
      console.log('  - AI Agent ID:', nodeId)
      console.log('  - Total nodes to check:', allNodes.length)
      
      // First, let's log all Add Action nodes to see what we have
      const allAddActionNodes = allNodes.filter(n => n.type === 'addAction')
      console.log('  - All Add Action nodes in workflow:', allAddActionNodes.map(n => ({
        id: n.id,
        parentAIAgentId: n.data?.parentAIAgentId,
        parentId: n.data?.parentId,
        chainIndex: n.data?.parentChainIndex
      })))
      
      // Find all nodes that are children of this AI Agent
      const childNodes = allNodes.filter(n => {
        // Don't delete the AI Agent itself (already in list)
        if (n.id === nodeId) return false
        
        // Check if it's a direct child of the AI Agent (has parentAIAgentId)
        if (n.data?.parentAIAgentId === nodeId) {
          console.log(`  - Found child via parentAIAgentId: ${n.id}`)
          return true
        }
        
        // Only delete Add Action nodes that are specifically part of AI Agent chains
        // Don't delete regular workflow plus buttons that might be after the AI agent
        if (n.type === 'addAction') {
          // Delete chain Add Action nodes (marked with isChainAddAction)
          if (n.data?.parentAIAgentId === nodeId && n.data?.isChainAddAction) {
            console.log(`  - Found chain Add Action via parentAIAgentId: ${n.id}`)
            return true
          }
          // Also check if the parentId points to a node that's a child of this AI Agent
          const parentNode = allNodes.find(pn => pn.id === n.data?.parentId)
          if (parentNode?.data?.isAIAgentChild && parentNode?.data?.parentAIAgentId === nodeId) {
            console.log(`  - Found Add Action via parent node: ${n.id}`)
            return true
          }
        }
        
        // Check if it's part of an AI Agent chain (has the AI Agent ID in its ID)
        if (n.id.includes(`${nodeId}-chain`) || n.id.includes(`${nodeId}-rt-chain`)) {
          console.log(`  - Found chain node via ID pattern: ${n.id}`)
          return true
        }
        
        return false
      })
      
      // Add all child nodes to the delete list
      childNodes.forEach(child => {
        nodesToDelete.push(child.id)
        console.log(`  ✓ Will delete: ${child.id} (${child.data?.title || child.data?.type || 'Add Action'})`)
      })
      
      console.log(`🗑️ [WorkflowBuilder] Total nodes to delete: ${nodesToDelete.length}`)
    }
    
    // Check if we're deleting from an AI Agent chain
    const isAIAgentChainNode = nodeToRemove.data?.isAIAgentChild && nodeToRemove.data?.parentAIAgentId
    
    // Find nodes to reposition after deletion (only for AI Agent chains)
    let nodesToReposition: string[] = []
    let repositionAmount = 0
    
    if (isAIAgentChainNode && !isAIAgent) {
      console.log('🔄 [WorkflowBuilder] Deleting node from AI Agent chain, will reposition nodes')
      
      // Find all nodes below the deleted node in the same chain (same X position)
      const deletedNodePos = nodeToRemove.position
      const nodesBelow = allNodes.filter(n => 
        n.position.x === deletedNodePos.x && 
        n.position.y > deletedNodePos.y &&
        !nodesToDelete.includes(n.id) // Don't reposition nodes that are being deleted
      )
      
      // Calculate how much to move nodes up (120px for AI chains)
      repositionAmount = -120
      nodesToReposition = nodesBelow.map(n => n.id)
      
      console.log('🔄 [WorkflowBuilder] Nodes to move up:', nodesToReposition)
      console.log('🔄 [WorkflowBuilder] Move amount:', repositionAmount)
    }
    
    // Clear configuration preferences for all deleted nodes
    const clearNodePreferences = async () => {
      try {
        // Clear configurations for all nodes being deleted
        for (const deletingNodeId of nodesToDelete) {
          const nodeToClear = allNodes.find(n => n.id === deletingNodeId)
          if (!nodeToClear) continue
          
          const nodeType = nodeToClear.data.type
          const providerId = nodeToClear.data.providerId
          
          // Clear our enhanced config persistence data
          if (currentWorkflow?.id && deletingNodeId && nodeType) {
            try {
              console.log('🔄 [WorkflowBuilder] Clearing saved node config:', {
                workflowId: currentWorkflow.id,
                nodeId: deletingNodeId,
                nodeType: nodeType
              });
              
              await clearNodeConfig(currentWorkflow.id, deletingNodeId, nodeType as string)
              
              console.log('✅ [WorkflowBuilder] Node configuration cleared from persistence layer');
            } catch (configError) {
              console.error('❌ [WorkflowBuilder] Failed to clear node configuration from persistence layer:', configError);
            }
          }
          
          if (nodeType && providerId) {
            // Since we can't easily identify which preferences belong to which node,
            // we'll clear ALL preferences for this node type and provider
            // This is a temporary solution until we implement proper node isolation
            const response = await fetch(`/api/user/config-preferences?nodeType=${encodeURIComponent(nodeType as string)}&providerId=${encodeURIComponent(providerId as string)}`, {
              method: "DELETE"
            })
            
            if (response.ok) {
              console.log('✅ [WorkflowBuilder] Node preferences cleared');
            } else {
              console.warn(`⚠️ Failed to clear preferences for ${nodeType}:`, response.status)
            }
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
    
    // Remove all nodes in the delete list and their related edges
    const nodesAfterRemoval = allNodes.filter((n: Node) => !nodesToDelete.includes(n.id))
    let edgesAfterRemoval = allEdges.filter((e: Edge) => 
      !nodesToDelete.includes(e.source) && !nodesToDelete.includes(e.target)
    )
    
    // Remove any add action nodes that were connected to deleted nodes
    let cleanedNodes = nodesAfterRemoval.filter((n: Node) => {
      // Check if this is an add action node connected to any deleted node
      if (n.type === "addAction") {
        const parentId = n.data.parentId
        if (parentId && nodesToDelete.includes(parentId as string)) {
          return false
        }
      }
      return true
    })
    
    // Additional cleanup: Remove orphaned Add Action buttons from AI Agent chains
    // when the last action in a chain is deleted
    if (isAIAgentChainNode && !isAIAgent) {
      console.log('🧹 [WorkflowBuilder] Checking for orphaned Add Action buttons after AI Agent chain node deletion')
      
      // Find the parent AI Agent node
      const parentAIAgentId = nodeToRemove.data?.parentAIAgentId
      const chainIndex = nodeToRemove.data?.parentChainIndex
      
      if (parentAIAgentId !== undefined) {
        // Check if there are any remaining nodes in this specific chain
        const remainingChainNodes = cleanedNodes.filter(n => 
          n.data?.isAIAgentChild && 
          n.data?.parentAIAgentId === parentAIAgentId &&
          n.data?.parentChainIndex === chainIndex &&
          n.type !== 'addAction' // Don't count Add Action buttons
        )
        
        console.log(`🧹 [WorkflowBuilder] Chain ${chainIndex} has ${remainingChainNodes.length} remaining nodes`)
        
        // If no nodes remain in this chain, remove its Add Action button and mark chain as emptied
        if (remainingChainNodes.length === 0) {
          console.log(`🧹 [WorkflowBuilder] No nodes left in chain ${chainIndex}, removing Add Action button completely`)
          
          // Find and remove the Add Action button for this chain
          const removedAddActionIds: string[] = []
          cleanedNodes = cleanedNodes.filter(n => {
            if (n.type === 'addAction' && 
                n.data?.parentAIAgentId === parentAIAgentId &&
                n.data?.parentChainIndex === chainIndex) {
              console.log(`  ✓ Removing orphaned Add Action button: ${n.id}`)
              removedAddActionIds.push(n.id)
              return false
            }
            return true
          })
          
          // Also remove edges connected to the removed Add Action buttons
          if (removedAddActionIds.length > 0) {
            edgesAfterRemoval = edgesAfterRemoval.filter(e => 
              !removedAddActionIds.includes(e.source) && !removedAddActionIds.includes(e.target)
            )
            console.log(`  ✓ Removed edges connected to orphaned Add Action buttons`)
          }
          
          // Mark this chain as intentionally emptied in the AI Agent node's data
          cleanedNodes = cleanedNodes.map(n => {
            if (n.id === parentAIAgentId && n.data?.type === 'ai_agent') {
              // Initialize emptiedChains array if it doesn't exist
              const emptiedChains = n.data.emptiedChains || []
              if (!emptiedChains.includes(chainIndex)) {
                emptiedChains.push(chainIndex)
              }
              
              console.log(`  ✓ Marked chain ${chainIndex} as intentionally emptied in AI Agent node`)
              console.log(`  ✓ emptiedChains is now:`, emptiedChains)
              
              return {
                ...n,
                data: {
                  ...n.data,
                  emptiedChains: emptiedChains
                }
              }
            }
            return n
          })
        }
      }
    }
    
    // If deleting a middle node, reconnect the chain and move nodes up
    let updatedEdges = [...edgesAfterRemoval]
    let nodesToShift: Node[] = []
    let shiftAmount = 0
    
    if (previousNodeId && outgoingEdges.length > 0) {
      // This is a middle node deletion - need to reconnect the chain
      console.log('🔄 [WorkflowBuilder] Deleting middle node, reconnecting chain:', {
        deletedNode: nodeId,
        previousNode: previousNodeId,
        nextNodes: outgoingEdges.map(e => e.target)
      })
      
      // Connect the previous node to all nodes that were after the deleted node
      outgoingEdges.forEach(outgoingEdge => {
        const nextNodeId = outgoingEdge.target
        
        // Create new edge to reconnect the chain
        const newEdge: Edge = {
          id: `${previousNodeId}-${nextNodeId}`,
          source: previousNodeId,
          target: nextNodeId,
          type: 'custom',
          animated: false,
          style: { stroke: "#94a3b8", strokeWidth: 2 },
          data: {
            onAddNode: (sourceId: string, targetId: string, position: { x: number, y: number }) => {
              handleInsertAction(previousNodeId, nextNodeId)
            }
          }
        }
        updatedEdges.push(newEdge)
        
        // For AI Agent chains, we need to find all nodes that should move up
        const nextNode = allNodes.find(n => n.id === nextNodeId)
        if (nextNode?.data?.isAIAgentChild) {
          // Find all nodes in this chain that are below the deleted node
          const chainNodes = cleanedNodes.filter(n => 
            n.data?.isAIAgentChild && 
            n.data?.parentAIAgentId === nextNode.data.parentAIAgentId &&
            n.data?.parentChainIndex === nextNode.data.parentChainIndex &&
            n.position.y >= nextNode.position.y
          )
          nodesToShift.push(...chainNodes)
        } else {
          // For main workflow, find all nodes below the deleted node
          const nodesBelow = cleanedNodes.filter(n => 
            !n.data?.isAIAgentChild &&
            n.position.y >= nextNode?.position.y &&
            n.type === 'custom'
          )
          nodesToShift.push(...nodesBelow)
        }
      })
      
      // Calculate how much space was freed by deleting the node
      const deletedNode = allNodes.find(n => n.id === nodeId)
      if (deletedNode && nodesToShift.length > 0) {
        // Standard spacing between nodes is 160px
        shiftAmount = 160
        console.log('🔄 [WorkflowBuilder] Moving nodes up by:', shiftAmount)
      }
    }
    
    // Update node positions if we need to shift them up
    let finalNodes = cleanedNodes
    if (shiftAmount > 0 && nodesToShift.length > 0) {
      finalNodes = cleanedNodes.map(node => {
        if (nodesToShift.some(n => n.id === node.id)) {
          return {
            ...node,
            position: {
              ...node.position,
              y: node.position.y - shiftAmount
            }
          }
        }
        return node
      })
    }
    
    // Update the nodes and edges state
    setNodes(finalNodes)
    setEdges(updatedEdges)
    
    console.log('🔄 [WorkflowBuilder] After deletion - edges:', updatedEdges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target
    })))
    
    // Remove all deleted nodes from the workflow store
    nodesToDelete.forEach(deletedNodeId => {
      removeNode(deletedNodeId)
    })
    
    // Now rebuild the add action button logic
    setTimeout(() => {
      const currentNodes = getNodes()
      const currentEdges = getEdges()
      
      // Only filter out nodes that are being deleted
      const remainingCustomNodes = currentNodes.filter((n: Node) => 
        n.type === "custom" && 
        !nodesToDelete.includes(n.id)
      )
      
      if (remainingCustomNodes.length === 0) {
        return
      }
      
      // Keep track of which AI Agent chains need their Add Action buttons updated
      const chainsNeedingUpdate = new Set<string>()
      
      // If we're deleting an AI Agent child node, mark that chain for update
      nodesToDelete.forEach(nodeId => {
        const node = allNodes.find(n => n.id === nodeId)
        if (node?.data?.isAIAgentChild && node?.data?.parentAIAgentId) {
          const chainKey = `${node.data.parentAIAgentId}-chain${node.data.parentChainIndex}`
          chainsNeedingUpdate.add(chainKey)
        }
      })
      
      // Keep AI Agent chain Add Action nodes that don't need updating
      const addActionNodesToKeep = currentNodes.filter((n: Node) => {
        if (n.type !== 'addAction') return false
        if (nodesToDelete.includes(n.id)) return false
        
        // If it's an AI Agent chain Add Action
        if (n.data?.isChainAddAction && n.data?.parentAIAgentId) {
          const chainKey = `${n.data.parentAIAgentId}-chain${n.data.parentChainIndex}`
          // Keep it if this chain doesn't need updating
          return !chainsNeedingUpdate.has(chainKey)
        }
        
        // Remove main workflow Add Actions (we'll rebuild them)
        return false
      })
      
      // Remove all Add Action nodes that need to be rebuilt and apply repositioning
      const nodesWithoutRebuildingAddActions = currentNodes
        .filter((n: Node) => {
          if (nodesToDelete.includes(n.id)) return false
          if (n.type !== 'addAction') return true
          // Keep the Add Action nodes we identified above
          return addActionNodesToKeep.includes(n)
        })
        .map((n: Node) => {
          // Apply repositioning for AI Agent chain nodes
          if (nodesToReposition.includes(n.id)) {
            return {
              ...n,
              position: {
                ...n.position,
                y: n.position.y + repositionAmount
              }
            }
          }
          return n
        })
      
      // Keep edges for Add Action nodes we're keeping
      const edgesWithoutRebuildingAddActions = currentEdges.filter((e: Edge) => {
        const targetNode = currentNodes.find((n: Node) => n.id === e.target)
        const sourceNode = currentNodes.find((n: Node) => n.id === e.source)
        
        // Remove edges to/from deleted nodes
        if (nodesToDelete.includes(e.source) || nodesToDelete.includes(e.target)) {
          return false
        }
        
        // Keep edges for Add Action nodes we're keeping
        if (addActionNodesToKeep.some(n => n.id === e.source || n.id === e.target)) {
          return true
        }
        
        // Remove edges for Add Actions we're rebuilding
        if (targetNode?.type === 'addAction' || sourceNode?.type === 'addAction') {
          return false
        }
        
        return true
      })
      
      // For each AI Agent chain that needs updating, find its last node and add an Add Action button
      chainsNeedingUpdate.forEach(chainKey => {
        const [aiAgentId, chainPart] = chainKey.split('-chain')
        const chainIndex = parseInt(chainPart)
        
        // Find all nodes in this chain - including those connected but missing metadata
        // Start with nodes that have the chain metadata
        const nodesWithChainMetadata = remainingCustomNodes.filter(n => 
          n.data?.isAIAgentChild && 
          n.data?.parentAIAgentId === aiAgentId && 
          n.data?.parentChainIndex === chainIndex
        )
        
        // Find all nodes connected to this chain (even if they don't have metadata)
        const chainNodes = new Set(nodesWithChainMetadata)
        let nodesToCheck = [...nodesWithChainMetadata]
        const checkedNodes = new Set<string>()
        
        while (nodesToCheck.length > 0) {
          const currentNode = nodesToCheck.shift()!
          if (checkedNodes.has(currentNode.id)) continue
          checkedNodes.add(currentNode.id)
          
          // Find nodes connected to this one
          edgesWithoutRebuildingAddActions.forEach(edge => {
            if (edge.source === currentNode.id) {
              const targetNode = remainingCustomNodes.find(n => n.id === edge.target)
              if (targetNode && !chainNodes.has(targetNode)) {
                chainNodes.add(targetNode)
                nodesToCheck.push(targetNode)
              }
            }
            if (edge.target === currentNode.id) {
              const sourceNode = remainingCustomNodes.find(n => n.id === edge.source)
              if (sourceNode && !chainNodes.has(sourceNode) && sourceNode.data?.isAIAgentChild) {
                chainNodes.add(sourceNode)
                nodesToCheck.push(sourceNode)
              }
            }
          })
        }
        
        const chainNodesArray = Array.from(chainNodes)
        
        if (chainNodesArray.length > 0) {
          // Find the last node in this chain by finding the node that has no outgoing edges to other nodes in the chain
          let lastChainNode = chainNodesArray[0]; // Default to first node if we can't determine
          
          // Find the node that doesn't have any edges going to other nodes in this chain
          for (const node of chainNodesArray) {
            const hasOutgoingEdgeToChainNode = edgesWithoutRebuildingAddActions.some(edge => 
              edge.source === node.id && 
              chainNodesArray.some(cn => cn.id === edge.target)
            );
            
            if (!hasOutgoingEdgeToChainNode) {
              lastChainNode = node;
              break;
            }
          }
          
          // Create new Add Action button for this chain
          const addActionId = `add-action-${aiAgentId}-chain${chainIndex}-${Date.now()}`
          const addActionNode: Node = {
            id: addActionId,
            type: 'addAction',
            position: { 
              x: lastChainNode.position.x, 
              y: lastChainNode.position.y + 160 
            },
            data: {
              parentId: lastChainNode.id,
              parentAIAgentId: aiAgentId,
              parentChainIndex: chainIndex,
              isChainAddAction: true,
              onClick: () => handleAddActionClick(addActionId, lastChainNode.id)
            }
          }
          
          nodesWithoutRebuildingAddActions.push(addActionNode)
          
          // Add edge to the Add Action button
          edgesWithoutRebuildingAddActions.push({
            id: `${lastChainNode.id}-${addActionId}`,
            source: lastChainNode.id,
            target: addActionId,
            animated: false,
            style: { stroke: "#b1b1b7", strokeWidth: 2, strokeDasharray: "5,5" },
            type: "straight"
          })
        }
      })
      
      // Handle main workflow Add Action button
      const mainWorkflowNodes = remainingCustomNodes
        .filter(n => !n.data?.isAIAgentChild)
        .sort((a, b) => a.position.y - b.position.y)
      
      // Find the last node in the main workflow chain
      const lastMainNode = mainWorkflowNodes.find(node => {
        return !edgesWithoutRebuildingAddActions.some(edge => 
          edge.source === node.id && 
          mainWorkflowNodes.some(n => n.id === edge.target)
        )
      }) || mainWorkflowNodes[mainWorkflowNodes.length - 1]
      
      if (lastMainNode) {
        // Add new add action node after the actual last custom node
        const addActionId = `add-action-${Date.now()}`
        const addActionNode: Node = {
          id: addActionId,
          type: "addAction",
          position: { x: lastMainNode.position.x, y: lastMainNode.position.y + 160 },
          data: { 
            parentId: lastMainNode.id, 
            onClick: () => handleAddActionClick(addActionId, lastMainNode.id) 
          }
        }
        
        nodesWithoutRebuildingAddActions.push(addActionNode)
        
        // Add edge from last node to add action button
        edgesWithoutRebuildingAddActions.push({
          id: `${lastMainNode.id}-${addActionId}`,
          source: lastMainNode.id,
          target: addActionId,
          animated: false,
          style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "5,5" },
          type: "straight"
        })
      }
      
      // Apply the emptiedChains update to the AI Agent node if it was updated earlier
      const finalNodes = nodesWithoutRebuildingAddActions.map(n => {
        // Find if this node was updated with emptiedChains in cleanedNodes
        const updatedNode = cleanedNodes.find(cn => cn.id === n.id && cn.data?.emptiedChains)
        if (updatedNode && n.data?.type === 'ai_agent') {
          console.log(`🔄 [WorkflowBuilder] Transferring emptiedChains to final AI Agent node ${n.id}:`, updatedNode.data.emptiedChains)
          return {
            ...n,
            data: {
              ...n.data,
              emptiedChains: updatedNode.data.emptiedChains
            }
          }
        }
        return n
      })
      
      setNodes(finalNodes)
      setEdges(edgesWithoutRebuildingAddActions)
      
      // Fit view to show the updated workflow
      setTimeout(() => fitView({ padding: 0.5 }), 100)
    }, 50)
    
    // Save the workflow after node deletion
    // IMPORTANT: We need to get the current nodes which have the updated emptiedChains data
    // Wait longer to ensure the state update has completed
    setTimeout(async () => {
      try {
        if (currentWorkflow?.id) {
          // Get the current nodes from React Flow state which should have the emptiedChains update
          const reactFlowNodes = getNodes().filter((n: Node) => 
            n.type === 'custom'
          )
          // Get the current edges
          const reactFlowEdges = getEdges()

          // Map to database format (same as handleSave)
          const mappedNodes: WorkflowNode[] = reactFlowNodes.map((n: Node) => {
            // Log AI Agent nodes to check emptiedChains
            if (n.data?.type === 'ai_agent') {
              console.log(`🔍 [WorkflowBuilder] Saving AI Agent node ${n.id} with emptiedChains:`, n.data.emptiedChains || 'undefined')
              console.log(`🔍 [WorkflowBuilder] Full AI Agent node data:`, n.data)
            }
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
                description: n.data.description as string | undefined,
                // Preserve AI Agent chain metadata
                isAIAgentChild: n.data.isAIAgentChild as boolean | undefined,
                parentAIAgentId: n.data.parentAIAgentId as string | undefined,
                parentChainIndex: n.data.parentChainIndex as number | undefined,
                // Preserve emptiedChains tracking for AI Agent nodes
                emptiedChains: n.data.emptiedChains as number[] | undefined
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
    }, 200) // Increased delay to ensure state updates with emptiedChains are complete
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

  // Handle adding a node between two existing nodes
  const handleAddNodeBetween = useCallback((sourceId: string, targetId: string, position: { x: number, y: number }) => {
    console.log('🔄 [WorkflowBuilder] handleAddNodeBetween called:', { sourceId, targetId, position })
    
    // Check if this is an AI Agent chain (nodes have isAIAgentChild flag)
    const allNodes = getNodes()
    const sourceNode = allNodes.find(n => n.id === sourceId)
    const targetNode = allNodes.find(n => n.id === targetId)
    
    // Store context for AI Agent chains
    if (sourceNode?.data?.isAIAgentChild || targetNode?.data?.isAIAgentChild) {
      console.log('🤖 [WorkflowBuilder] Inserting into AI Agent chain')
    }
    
    // Set up for insertion - parentId is the source, insertBefore is the target
    setSourceAddNode({ 
      id: `insert-${sourceId}-${targetId}`, 
      parentId: sourceId,
      insertBefore: targetId,
      isAIAgentChain: sourceNode?.data?.isAIAgentChild || targetNode?.data?.isAIAgentChild,
      parentAIAgentId: sourceNode?.data?.parentAIAgentId || targetNode?.data?.parentAIAgentId
    })
    setSelectedIntegration(null)
    setSelectedAction(null)
    setSearchQuery("")
    setShowActionDialog(true)
  }, [getNodes])
  
  // Handle adding a new chain to an AI Agent node
  const handleAddChain = useCallback((aiAgentNodeId: string) => {
    const allNodes = getNodes()
    const aiAgentNode = allNodes.find(n => n.id === aiAgentNodeId)
    if (!aiAgentNode) return
    
    // Find all nodes that are children of this AI agent (excluding Add Action buttons)
    const childNodes = allNodes.filter(n => 
      (n.data?.parentAIAgentId === aiAgentNodeId || 
       n.id.startsWith(`${aiAgentNodeId}-chain`) ||
       n.id.includes(`${aiAgentNodeId}-node`)) &&
      n.type !== 'addAction'
    )
    
    // Count existing chain placeholders to determine chain number
    const chainPlaceholders = childNodes.filter(n => n.data?.type === 'chain_placeholder')
    const newChainNumber = chainPlaceholders.length + 1
    
    // Calculate position with proper spacing
    const horizontalSpacing = 550  // Increased gap between chains to prevent overlap
    const baseY = aiAgentNode.position.y + 200  // Vertical offset from AI agent
    let newX: number
    
    if (childNodes.length === 0) {
      // First chain - directly below AI agent  
      newX = aiAgentNode.position.x
    } else {
      // Find the rightmost position of any child node
      let rightmostX = -Infinity
      
      childNodes.forEach(node => {
        if (node.position.x > rightmostX) {
          rightmostX = node.position.x
        }
      })
      
      // Place new chain to the right with spacing
      newX = rightmostX + horizontalSpacing
    }
    
    // Create a chain placeholder node like in AI agent builder
    const newNodeId = `${aiAgentNodeId}-chain-${Date.now()}`
    const newNode = {
      id: newNodeId,
      type: 'custom',
      position: { 
        x: newX, 
        y: baseY
      },
      data: {
        title: `Chain ${newChainNumber}`,
        description: 'Add actions to build your workflow',
        type: 'chain_placeholder',
        isTrigger: false,
        hasAddButton: true,
        parentAIAgentId: aiAgentNodeId,
        config: {},
        onConfigure: () => {},
        onDelete: () => handleDeleteNode(newNodeId),
        onAddAction: () => {
          handleAddActionClick(newNodeId, aiAgentNodeId)
        },
        isLastInChain: true
      }
    }
    
    // Add the new node
    setTimeout(() => {
      setNodes(nds => [...nds, newNode])
      
      // Create edge from AI Agent to new chain start
      const newEdge = {
        id: `e${aiAgentNodeId}-${newNodeId}`,
        source: aiAgentNodeId,
        target: newNodeId,
        type: 'custom',
        animated: false,
        style: { stroke: '#94a3b8', strokeWidth: 2 },
        data: { 
          onAddNode: (sourceId: string, targetId: string, position: { x: number, y: number }) => {
            handleInsertAction(aiAgentNodeId, newNodeId)
          }
        }
      }
      
      setEdges(eds => [...eds, newEdge])
      
      // Auto-zoom to show all nodes
      setTimeout(() => {
        fitView({ 
          padding: 0.2, 
          includeHiddenNodes: false,
          duration: 400,
          maxZoom: 2,
          minZoom: 0.05
        })
      }, 50)
    }, 100)  // Small delay to ensure shift happens first
    
    toast({
      title: "New Chain Added",
      description: `Chain ${newChainNumber} has been added. Click to add actions to your chain.`
    })
  }, [getNodes, setNodes, setEdges, handleAddActionClick, handleDeleteNode, handleInsertAction, fitView, toast])

  const onConnect = useCallback((params: Edge | Connection) => setEdges((eds: Edge[]) => addEdge(params, eds)), [setEdges])

  // Enhanced onNodesChange to make Add Action nodes follow their parent nodes
  const optimizedOnNodesChange = useCallback((changes: any) => {
    // First apply the base changes
    onNodesChange(changes)
    
    // Check if any position changes occurred
    const positionChanges = changes.filter((change: any) => change.type === 'position')
    
    if (positionChanges.length > 0) {
      setNodes((nds) => {
        const updatedNodes = [...nds]
        const currentEdges = getEdges()
        
        // For each position change, update connected Add Action nodes
        positionChanges.forEach((change: any) => {
          if (!change.position) return
          
          const parentNodeIndex = updatedNodes.findIndex(n => n.id === change.id)
          if (parentNodeIndex === -1) return
          
          // Update the parent node's position if it's being dragged
          if (change.dragging !== false) {
            updatedNodes[parentNodeIndex] = {
              ...updatedNodes[parentNodeIndex],
              position: change.position
            }
          }
          
          // Find Add Action nodes connected to this node via edges
          const connectedAddActions = currentEdges
            .filter(edge => edge.source === change.id)
            .map(edge => updatedNodes.find(n => n.id === edge.target))
            .filter(node => node && node.type === 'addAction')
          
          // Also check by parentId and ID patterns as fallback
          const addActionPatterns = [
            `add-action-${change.id}`, // Standard pattern
            `add-action-${change.id}-`, // Pattern with additional suffixes
          ]
          
          updatedNodes.forEach((node, index) => {
            if (node.type === 'addAction') {
              // Check if this Add Action is connected to the moved node
              const isConnected = connectedAddActions.some(n => n?.id === node.id)
              
              // Also check other patterns as fallback
              const belongsToParent = 
                isConnected || // Primary: Check edge connection
                node.data?.parentId === change.id || // Check parentId in data
                addActionPatterns.some(pattern => node.id.startsWith(pattern)) // Check ID patterns
              
              if (belongsToParent) {
                // For AI Agent chains, check if this is part of a chain
                const isAIAgentChain = node.data?.parentAIAgentId || node.id.includes('-chain')
                
                // Update Add Action node position to follow parent
                updatedNodes[index] = {
                  ...updatedNodes[index],
                  position: {
                    x: change.position.x,
                    y: change.position.y + 160 // Maintain 160px spacing below parent
                  }
                }
              }
            }
          })
        })
        
        return updatedNodes
      })
    }
  }, [onNodesChange, setNodes, getEdges])

  // Fetch integrations when component mounts
  useEffect(() => {
    fetchIntegrations(true) // Force fetch to ensure we have latest data
  }, [fetchIntegrations])

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
                onRename: handleRenameNode,
                onChangeTrigger: (typeof node.data.type === 'string' && node.data.type.includes('trigger')) ? handleChangeTrigger : undefined,
                onAddChain: node.data.type === 'ai_agent' && !(node.data as any)?.hasChains ? handleAddChain : undefined,
                // Use the saved providerId directly, or look it up from the node component
                providerId: node.data.providerId || (nodeComponent ? nodeComponent.providerId : undefined) || 
                  // Fallback: determine providerId based on known types
                  (['custom_script', 'if_condition', 'filter', 'loop', 'try_catch', 'switch_case'].includes(node.data.type) ? 'logic' : 
                   node.data.type === 'ai_agent' ? 'ai' : 
                   node.data.type === 'manual_trigger' ? 'manual' : 
                   node.data.type === 'schedule_trigger' ? 'schedule' : 
                   node.data.type === 'webhook_trigger' ? 'webhook' : undefined),
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
        
        // Handle AI Agent chains separately
        const aiAgentNodes = customNodes.filter(n => n.data?.type === 'ai_agent');
        console.log('🔄 [WorkflowBuilder] Loading workflow - AI Agent nodes found:', aiAgentNodes.length);
        
        // Track all Add Action nodes for AI Agent chains
        const aiAgentAddActionNodes: Node[] = [];
        const aiAgentAddActionEdges: Edge[] = [];
        
        if (aiAgentNodes.length > 0) {
          // For each AI Agent node, find its chain children and add Add Action nodes
          aiAgentNodes.forEach(aiAgentNode => {
            const aiAgentId = aiAgentNode.id;
            console.log(`🔄 [WorkflowBuilder] Processing AI Agent ${aiAgentId} during load`);
            console.log(`🔍 [WorkflowBuilder] AI Agent ${aiAgentId} emptiedChains:`, aiAgentNode.data?.emptiedChains || 'undefined');
            
            // Find all child nodes of this AI Agent
            const directChildNodes = customNodes.filter(n => {
              // Check if this node is marked as a child of this AI agent
              if (n.data?.isAIAgentChild && n.data?.parentAIAgentId === aiAgentId) {
                return true;
              }
              // Fallback: Check if this node ID indicates it's a chain child of this AI agent
              // Pattern: {aiAgentId}-chain{chainIndex}-action{actionIndex}-...
              return n.id.startsWith(`${aiAgentId}-chain`) && n.id.includes('-action');
            });
            
            // Group children by chain, including nodes connected to chain nodes
            const chainGroups: Record<number, Node[]> = {};
            const currentEdges = getEdges();
            
            // First, add direct child nodes to their chains
            directChildNodes.forEach(child => {
              // Use the parentChainIndex metadata if available
              let chainIndex = child.data?.parentChainIndex;
              
              // Fallback: Extract chain index from ID pattern: ...-chain{index}-...
              if (chainIndex === undefined || chainIndex === null) {
                const chainMatch = child.id.match(/chain(\d+)/);
                chainIndex = chainMatch ? parseInt(chainMatch[1]) : 0;
              }
              
              if (!chainGroups[chainIndex]) {
                chainGroups[chainIndex] = [];
              }
              chainGroups[chainIndex].push(child);
            });
            
            // Now find any nodes connected to chain nodes that aren't already included
            Object.keys(chainGroups).forEach(chainIndexStr => {
              const chainIndex = parseInt(chainIndexStr);
              const chainNodes = [...chainGroups[chainIndex]]; // Copy to avoid modifying while iterating
              const processedNodes = new Set(chainNodes.map(n => n.id));
              
              // Find all nodes connected to this chain
              let nodesToCheck = [...chainNodes];
              while (nodesToCheck.length > 0) {
                const currentNode = nodesToCheck.shift()!;
                
                // Find nodes connected to the current node
                currentEdges.forEach(edge => {
                  if (edge.source === currentNode.id) {
                    const targetNode = customNodes.find(n => n.id === edge.target);
                    if (targetNode && !processedNodes.has(targetNode.id) && !targetNode.data?.isTrigger) {
                      // This node is connected to the chain but wasn't originally identified
                      chainGroups[chainIndex].push(targetNode);
                      processedNodes.add(targetNode.id);
                      nodesToCheck.push(targetNode);
                      console.log(`🔄 [WorkflowBuilder] Found connected node ${targetNode.id} (${targetNode.data?.title || targetNode.data?.type}) for chain ${chainIndex} via edge from ${currentNode.id}`);
                    }
                  }
                });
              }
            });
            
            console.log(`🔄 [WorkflowBuilder] AI Agent ${aiAgentId} has ${Object.keys(chainGroups).length} chains`);
            
            // Ensure we process all chains, not just those with existing nodes
            // Check the AI Agent config to know how many chains it should have
            const aiAgentConfig = aiAgentNode.data?.config;
            const chainsFromConfig = aiAgentConfig?.chains?.chains || aiAgentConfig?.chains || [];
            const expectedChainCount = Math.max(
              chainsFromConfig.length,
              Object.keys(chainGroups).length,
              2 // Minimum 2 chains for AI Agent
            );
            
            console.log(`🔄 [WorkflowBuilder] AI Agent expects ${expectedChainCount} chains (from config: ${chainsFromConfig.length}, from nodes: ${Object.keys(chainGroups).length})`);
            
            // Process each chain index up to the expected count
            for (let chainIndex = 0; chainIndex < expectedChainCount; chainIndex++) {
              const chainNodes = chainGroups[chainIndex] || [];
              
              console.log(`🔄 [WorkflowBuilder] Processing chain ${chainIndex} with ${chainNodes.length} nodes`);
              console.log(`  Chain ${chainIndex} nodes:`, chainNodes.map(n => ({
                id: n.id,
                title: n.data?.title || n.data?.type,
                hasMetadata: !!(n.data?.isAIAgentChild && n.data?.parentAIAgentId)
              })));
              
              if (chainNodes.length > 0) {
                // Find the last node in this chain by checking connections
                let lastChainNode = chainNodes[0]; // Default to first node if we can't determine
                
                // Find the node that doesn't have any edges going to other nodes in this chain
                // Use the current edges from React Flow, not the saved connections
                const currentEdges = getEdges();
                for (const node of chainNodes) {
                  const hasOutgoingEdgeToChainNode = currentEdges.some(edge => 
                    edge.source === node.id && 
                    chainNodes.some(cn => cn.id === edge.target)
                  );
                  
                  if (!hasOutgoingEdgeToChainNode) {
                    lastChainNode = node;
                    break;
                  }
                }
                
                console.log(`🔄 [WorkflowBuilder] Chain ${chainIndex} has ${chainNodes.length} nodes, last node: ${lastChainNode.id}`);
                
                // Create Add Action node for this chain
                const addActionId = `add-action-${aiAgentId}-chain${chainIndex}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                const addActionNode: Node = {
                  id: addActionId,
                  type: 'addAction',
                  position: { 
                    x: lastChainNode.position.x, 
                    y: lastChainNode.position.y + 160 
                  },
                  data: {
                    parentId: lastChainNode.id,
                    parentAIAgentId: aiAgentId,
                    parentChainIndex: chainIndex,
                    isChainAddAction: true,
                    onClick: () => {
                      // Call handleAddActionClick with the correct parameters
                      handleAddActionClick(addActionId, lastChainNode.id);
                    }
                  }
                };
                
                aiAgentAddActionNodes.push(addActionNode);
                console.log(`🔄 [WorkflowBuilder] Created Add Action node ${addActionId} for chain ${chainIndex} at position:`, {
                  x: lastChainNode.position.x,
                  y: lastChainNode.position.y + 160
                });
              } else {
                // Chain exists but has no nodes yet
                // Check if this chain was intentionally emptied
                const emptiedChains = aiAgentNode.data?.emptiedChains || [];
                const wasIntentionallyEmptied = emptiedChains.includes(chainIndex);
                
                console.log(`🔍 [WorkflowBuilder] Checking if chain ${chainIndex} was intentionally emptied:`, {
                  aiAgentNodeId: aiAgentNode.id,
                  emptiedChains: emptiedChains,
                  chainIndex: chainIndex,
                  wasIntentionallyEmptied: wasIntentionallyEmptied,
                  aiAgentNodeData: aiAgentNode.data
                });
                
                if (wasIntentionallyEmptied) {
                  console.log(`🔄 [WorkflowBuilder] Chain ${chainIndex} was intentionally emptied, NOT creating placeholder Add Action`);
                } else {
                  // Chain was never populated - create a placeholder Add Action
                  console.log(`🔄 [WorkflowBuilder] Chain ${chainIndex} is empty, creating placeholder Add Action`);
                  
                  // Position it relative to the AI Agent node
                  const baseX = aiAgentNode.position.x + (chainIndex * 250); // Offset each chain horizontally
                  const baseY = aiAgentNode.position.y + 200;
                  
                  const addActionId = `add-action-${aiAgentId}-chain${chainIndex}-placeholder-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                  const addActionNode: Node = {
                    id: addActionId,
                    type: 'addAction',
                    position: { x: baseX, y: baseY },
                    data: {
                      parentId: aiAgentId, // Parent is the AI Agent itself for empty chains
                      parentAIAgentId: aiAgentId,
                      parentChainIndex: chainIndex,
                      isChainAddAction: true,
                      isPlaceholder: true,
                      onClick: () => {
                        // For placeholder, open the action dialog for this chain
                        handleAddActionClick(addActionId, aiAgentId);
                      }
                    }
                  };
                  
                  aiAgentAddActionNodes.push(addActionNode);
                  console.log(`🔄 [WorkflowBuilder] Created placeholder Add Action node ${addActionId} for empty chain ${chainIndex}`);
                }
              }
            }
          });
        }
        
        // Add all AI Agent Add Action nodes to the main nodes array
        allNodes = [...allNodes, ...aiAgentAddActionNodes];
        
        // Handle regular workflow Add Action nodes (non-AI Agent)
        const hasAIAgentChains = aiAgentNodes.some(n => {
          // Check if any nodes have IDs indicating they're children of this AI agent
          const childNodes = customNodes.filter(cn => 
            cn.id.startsWith(`${n.id}-chain`) && cn.id.includes('-action')
          );
          return childNodes.length > 0;
        });
        
        if (!hasAIAgentChains) {
          // Original logic for non-AI Agent workflows
          const actionNodes = customNodes.filter(n => n.id !== 'trigger' && !n.data?.isAIAgentChild);
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
        }
        
        const initialEdges: Edge[] = (currentWorkflow.connections || []).map((conn: WorkflowConnection) => {
          // Check if this is a connection between action nodes (not to addAction nodes)
          const sourceNode = allNodes.find(n => n.id === conn.source)
          const targetNode = allNodes.find(n => n.id === conn.target)
          const isActionToAction = sourceNode && targetNode && 
            sourceNode.type === 'custom' && targetNode.type === 'custom' &&
            targetNode.data?.type !== 'addAction'
          
          return {
            id: conn.id, 
            source: conn.source, 
            target: conn.target,
            type: isActionToAction ? 'custom' : undefined,
            data: isActionToAction ? {
              onAddNode: (sourceId: string, targetId: string, position: { x: number, y: number }) => {
                handleInsertAction(conn.source, conn.target)
              }
            } : undefined
          }
        })
        
        // Add edges to all Add Action nodes
        const addActionNodes = allNodes.filter(n => n.type === 'addAction');
        console.log(`🔄 [WorkflowBuilder] Adding edges to ${addActionNodes.length} Add Action nodes`);
        
        addActionNodes.forEach(addActionNode => {
          const parentId = addActionNode.data?.parentId;
          if (parentId) {
            const edgeId = `${parentId}->${addActionNode.id}`;
            // Check if edge already exists
            if (!initialEdges.some(e => e.id === edgeId)) {
              // Check if this is a placeholder Add Action (for empty chains)
              const isPlaceholder = addActionNode.data?.isPlaceholder;
              
              initialEdges.push({
                id: edgeId,
                source: parentId,
                target: addActionNode.id,
                animated: !isPlaceholder, // Don't animate placeholder edges
                style: { 
                  stroke: isPlaceholder ? '#d1d5db' : '#b1b1b7', 
                  strokeWidth: isPlaceholder ? 1 : 2, 
                  strokeDasharray: '5,5' 
                },
                type: 'straight'
              });
              console.log(`🔄 [WorkflowBuilder] Added edge from ${parentId} to Add Action ${addActionNode.id} (chain ${addActionNode.data?.parentChainIndex !== undefined ? addActionNode.data.parentChainIndex : 'main'})`);
            }
          }
        })
        
        setNodes(allNodes)
        setEdges(initialEdges)
        
        // Debug: Log what was set
        console.log('🔍 [WorkflowBuilder] Final nodes set:', allNodes.length, 'nodes')
        console.log('🔍 [WorkflowBuilder] Add Action nodes:', allNodes.filter(n => n.type === 'addAction').map(n => ({
          id: n.id,
          parentId: n.data?.parentId,
          parentAIAgentId: n.data?.parentAIAgentId,
          chainIndex: n.data?.parentChainIndex
        })))
        console.log('🔍 [WorkflowBuilder] Edges to Add Actions:', initialEdges.filter(e => 
          allNodes.some(n => n.type === 'addAction' && n.id === e.target)
        ).map(e => ({ id: e.id, source: e.source, target: e.target })))
        
        setTimeout(() => fitView({ padding: 0.2, duration: 300 }), 100)
      }
    } else if (!workflowId) {
      setNodes([])
      setEdges([])
      // Don't automatically show the trigger dialog, let the user click the button
          }
    }, [currentWorkflow, fitView, handleAddActionClick, handleConfigureNode, handleDeleteNode, setCurrentWorkflow, setEdges, setNodes, workflowId, getNodes])

  const handleTriggerSelect = (integration: IntegrationInfo, trigger: NodeComponent) => {
    // Skip configuration for manual triggers
    if (trigger.type === 'manual_trigger' || trigger.type === 'manual') {
      // Add manual trigger directly without configuration
      addTriggerToWorkflow(integration, trigger, {});
      setShowTriggerDialog(false);
    } else if (nodeNeedsConfiguration(trigger)) {
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
        onRename: handleRenameNode,
        onChangeTrigger: handleChangeTrigger,
        onAddChain: undefined,
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
    // Check if trying to add an AI Agent when one already exists
    if (action.type === 'ai_agent') {
      const existingAIAgent = getNodes().find(n => n.data?.type === 'ai_agent')
      if (existingAIAgent) {
        toast({
          title: "AI Agent Already Exists",
          description: "You can only have one AI Agent node per workflow. Use the existing AI Agent to configure multiple action chains.",
          variant: "destructive"
        })
        // Keep the dialog open but don't proceed
        return
      }
    }
    
    // Check if this is for an AI Agent chain
    if (aiAgentActionCallback) {
      // Call the callback with the action details
      aiAgentActionCallback(action.type, integration.id, {})
      
      // Clear the callback and close the dialog
      setAiAgentActionCallback(null)
      setShowActionDialog(false)
      setSelectedIntegration(null)
      setSelectedAction(null)
      setSourceAddNode(null)
      
      toast({
        title: "Action Added",
        description: `Added ${action.title || action.type} to AI Agent chain`
      })
      return
    }
    
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

  const addActionToWorkflow = (integration: IntegrationInfo, action: NodeComponent, config: Record<string, any>, sourceNodeInfo: { id: string; parentId: string; insertBefore?: string }): string | null => {
    const parentNode = getNodes().find((n) => n.id === sourceNodeInfo.parentId)
    if (!parentNode) return null
    
    // Check if this is an AI Agent with chains
    const isAIAgent = action.type === 'ai_agent';
    const chainsArray = Array.isArray(config?.chains) ? config.chains : config?.chains?.chains;
    const hasChains = chainsArray && Array.isArray(chainsArray) && chainsArray.length > 0;
    
    if (isAIAgent) {
      console.log('🤖 [WorkflowBuilder] Creating AI Agent node:', {
        nodeId: `node-${Date.now()}`,
        hasChains,
        chainsCount: chainsArray?.length || 0,
        configStructure: config?.chains
      });
    }
    
    // Check if we're adding to an AI Agent chain
    const clickedAddActionNode = getNodes().find(n => n.id === sourceNodeInfo.id)
    const isAddingToAIAgentChain = clickedAddActionNode?.data?.isChainAddAction
    
    const newNodeId = `node-${Date.now()}`
    const newActionNodeData: any = {
      ...action, 
      title: action.title, 
      name: action.title || 'Unnamed Action',
      description: action.description,
      onConfigure: handleConfigureNode, 
      onDelete: handleDeleteNodeWithConfirmation,
      onRename: handleRenameNode,
      // Only show Add Chain button if it's an AI Agent without chains
      onAddChain: isAIAgent && !hasChains ? handleAddChain : undefined,
      providerId: integration.id, 
      config,
      // Set hasChains flag for AI Agents
      hasChains: isAIAgent ? hasChains : undefined,
      chainCount: isAIAgent && hasChains ? chainsArray.length : undefined
    }
    
    // If adding to an AI Agent chain, preserve the chain metadata
    if (isAddingToAIAgentChain && clickedAddActionNode?.data) {
      newActionNodeData.isAIAgentChild = true
      newActionNodeData.parentAIAgentId = clickedAddActionNode.data.parentAIAgentId
      newActionNodeData.parentChainIndex = clickedAddActionNode.data.parentChainIndex
    }
    
    // Handle insertion between nodes - check this BEFORE creating the node
    if (sourceNodeInfo.insertBefore) {
      console.log('🔄 [WorkflowBuilder] Preparing to insert node between:', { 
        parentId: sourceNodeInfo.parentId, 
        insertBefore: sourceNodeInfo.insertBefore,
        newNodeId 
      })
      
      // We're inserting between sourceNodeInfo.parentId and sourceNodeInfo.insertBefore
      const targetNode = getNodes().find((n) => n.id === sourceNodeInfo.insertBefore)
      
      // Check if we're inserting into an AI Agent chain
      const parentNodeData = parentNode.data
      const targetNodeData = targetNode?.data
      const isInsertingIntoAIAgentChain = 
        (parentNodeData?.isAIAgentChild && parentNodeData?.parentAIAgentId) ||
        (targetNodeData?.isAIAgentChild && targetNodeData?.parentAIAgentId)
      
      // If inserting into an AI Agent chain, inherit the chain metadata
      if (isInsertingIntoAIAgentChain) {
        const chainMetadata = parentNodeData?.isAIAgentChild ? parentNodeData : targetNodeData
        newActionNodeData.isAIAgentChild = true
        newActionNodeData.parentAIAgentId = chainMetadata.parentAIAgentId
        newActionNodeData.parentChainIndex = chainMetadata.parentChainIndex
        console.log('🔄 [WorkflowBuilder] Will inherit AI Agent chain metadata:', {
          parentAIAgentId: chainMetadata.parentAIAgentId,
          parentChainIndex: chainMetadata.parentChainIndex,
          newNodeId: newNodeId
        })
      }
    }
    
    // Use consistent 120px vertical spacing like AI Agent chain builder
    const newActionNode: Node = {
      id: newNodeId, 
      type: "custom", 
      position: { x: parentNode.position.x, y: parentNode.position.y + 120 },
      data: newActionNodeData,
    }
    
    // Handle insertion between nodes
    if (sourceNodeInfo.insertBefore) {
      // We're inserting between sourceNodeInfo.parentId and sourceNodeInfo.insertBefore
      const targetNode = getNodes().find((n) => n.id === sourceNodeInfo.insertBefore)
      const allNodes = getNodes()
      
      if (targetNode) {
        // Check if we're inserting into an AI Agent chain
        const parentNodeData = parentNode.data
        const targetNodeData = targetNode?.data
        const isInsertingIntoAIAgentChain = 
          (parentNodeData?.isAIAgentChild && parentNodeData?.parentAIAgentId) ||
          (targetNodeData?.isAIAgentChild && targetNodeData?.parentAIAgentId)
        
        // Position the new node between the parent and target
        const parentNodePos = parentNode.position
        const targetNodePos = targetNode.position
        
        // Calculate vertical spacing - tighter for AI Agent chains
        const standardNodeSpacing = isInsertingIntoAIAgentChain ? 120 : 160 // Tighter spacing for AI chains
        const nodeHeight = 80 // Approximate height of a node
        const minGap = isInsertingIntoAIAgentChain ? 40 : 80 // Smaller gap for AI chains
        
        // Check current distance between parent and target
        const currentDistance = targetNodePos.y - parentNodePos.y
        
        // For AI Agent chains, place the new node at the exact position of the target
        // For regular chains, place with standard spacing
        newActionNode.position = {
          x: targetNodePos.x,
          y: isInsertingIntoAIAgentChain ? targetNodePos.y : parentNodePos.y + standardNodeSpacing
        }
        
        // Calculate how much to shift nodes down
        const shiftAmount = isInsertingIntoAIAgentChain ? 120 : standardNodeSpacing // Fixed shift for AI chains
        
        // Find all nodes that need to be pushed down
        // For AI Agent chains, only shift nodes in the same chain (same X position)
        const nodesToShift = allNodes.filter(n => {
          if (isInsertingIntoAIAgentChain) {
            // Only shift nodes in the same vertical chain and below target
            return n.position.x === targetNodePos.x && 
                   n.position.y >= targetNodePos.y && 
                   n.id !== sourceNodeInfo.parentId &&
                   !n.id.startsWith('insert-') &&
                   n.id !== newNodeId
          } else {
            // For regular workflow, shift all nodes below target
            return n.position.y >= targetNode.position.y && 
                   n.id !== sourceNodeInfo.parentId &&
                   !n.id.startsWith('insert-') &&
                   n.id !== newNodeId
          }
        })
        
        console.log('🔄 [WorkflowBuilder] Nodes to shift down:', nodesToShift.map(n => n.id))
        console.log('🔄 [WorkflowBuilder] Shift amount:', shiftAmount)
        
        // Store chain metadata for closure
        const chainMetadata = isInsertingIntoAIAgentChain 
          ? (parentNodeData?.isAIAgentChild ? parentNodeData : targetNodeData)
          : null
        
        // Update nodes - add new node and shift existing ones down
        setNodes((prevNodes: Node[]) => {
          const filteredNodes = prevNodes.filter((n: Node) => !n.id.startsWith('insert-'))
          
          const updatedNodes = filteredNodes.map(node => {
            let updatedNode = node
            
            // If we're adding to an AI Agent chain that was previously emptied, clear the emptiedChains flag
            if (chainMetadata && node.data?.type === 'ai_agent' && node.id === chainMetadata.parentAIAgentId) {
              const emptiedChains = node.data?.emptiedChains || []
              if (emptiedChains.includes(chainMetadata.parentChainIndex)) {
                const updatedEmptiedChains = emptiedChains.filter((idx: number) => idx !== chainMetadata.parentChainIndex)
                updatedNode = {
                  ...updatedNode,
                  data: {
                    ...updatedNode.data,
                    emptiedChains: updatedEmptiedChains
                  }
                }
                console.log(`🔄 [WorkflowBuilder] Cleared emptied flag for chain ${chainMetadata.parentChainIndex} in AI Agent`)
              }
            }
            
            // Shift down nodes that are at or below the insertion point
            if (nodesToShift.some(n => n.id === node.id)) {
              updatedNode = {
                ...updatedNode,
                position: {
                  ...updatedNode.position,
                  y: updatedNode.position.y + shiftAmount
                }
              }
            }
            
            // If we're inserting into an AI Agent chain and this is a node being shifted (downstream), inherit metadata
            if (chainMetadata && nodesToShift.some(n => n.id === node.id)) {
              // Only update if it doesn't already have the metadata
              if (!updatedNode.data?.isAIAgentChild) {
                updatedNode = {
                  ...updatedNode,
                  data: {
                    ...updatedNode.data,
                    isAIAgentChild: true,
                    parentAIAgentId: chainMetadata.parentAIAgentId,
                    parentChainIndex: chainMetadata.parentChainIndex
                  }
                }
                console.log(`🔄 [WorkflowBuilder] Updating downstream node ${node.id} with chain metadata`)
              }
            }
            
            return updatedNode
          })
          
          // Add the new node
          return [...updatedNodes, newActionNode]
        })
        
        // Update edges - redirect the edge from parent->target to parent->new->target
        setEdges((prevEdges: Edge[]) => {
          // Remove the edge between parent and target
          const filteredEdges = prevEdges.filter((e: Edge) => 
            !(e.source === sourceNodeInfo.parentId && e.target === sourceNodeInfo.insertBefore)
          )
          
          // Add new edges: parent->new and new->target
          return [
            ...filteredEdges,
            {
              id: `${sourceNodeInfo.parentId}-${newNodeId}`,
              source: sourceNodeInfo.parentId,
              target: newNodeId,
              type: 'custom',
              animated: false,
              style: { stroke: "#94a3b8", strokeWidth: 2 },
              data: {
                onAddNode: (sourceId: string, targetId: string, position: { x: number, y: number }) => {
                  handleInsertAction(sourceNodeInfo.parentId, newNodeId)
                }
              }
            },
            {
              id: `${newNodeId}-${sourceNodeInfo.insertBefore}`,
              source: newNodeId,
              target: sourceNodeInfo.insertBefore as string,
              type: 'custom',
              animated: false,
              style: { stroke: "#94a3b8", strokeWidth: 2 },
              data: {
                onAddNode: (sourceId: string, targetId: string, position: { x: number, y: number }) => {
                  handleInsertAction(newNodeId, sourceNodeInfo.insertBefore as string)
                }
              }
            }
          ]
        })
        
        // Ensure the add action button at the end is preserved
        // Find the existing add action button if it exists
        const existingAddActionNode = allNodes.find(n => 
          n.type === 'addAction' && 
          !n.id.startsWith('insert-')
        )
        
        if (!existingAddActionNode) {
          // If there's no add action button, we should add one at the end
          // Find the last action node in the chain
          const lastActionNode = allNodes
            .filter(n => n.type === 'custom' && n.data?.type !== 'chain_placeholder')
            .sort((a, b) => b.position.y - a.position.y)[0]
          
          if (lastActionNode) {
            const addActionId = `add-action-${Date.now()}`
            const addActionNode: Node = {
              id: addActionId,
              type: 'addAction',
              position: { x: lastActionNode.position.x, y: lastActionNode.position.y + 240 },
              data: { parentId: lastActionNode.id, onClick: () => handleAddActionClick(addActionId, lastActionNode.id) }
            }
            
            setTimeout(() => {
              setNodes((prevNodes: Node[]) => [...prevNodes, addActionNode])
              setEdges((prevEdges: Edge[]) => [...prevEdges, {
                id: `${lastActionNode.id}-${addActionId}`,
                source: lastActionNode.id,
                target: addActionId,
                animated: false,
                style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "5,5" }
              }])
            }, 100)
          }
        }
      }
    } else {
      // Normal add action at the end - replicate AI Agent chain builder pattern
      const newAddActionId = `add-action-${newNodeId}`
      
      // Check if the clicked Add Action button belongs to an AI Agent chain
      const clickedAddAction = getNodes().find(n => n.id === sourceNodeInfo.id)
      const isAIAgentChain = clickedAddAction?.data?.isChainAddAction
      
      // Create new Add Action node after the new action with consistent 120px spacing
      const newAddActionNode: Node = {
        id: newAddActionId, 
        type: "addAction", 
        position: { 
          x: newActionNode.position.x, 
          y: newActionNode.position.y + 120  // Use consistent 120px spacing like AI Agent builder
        },
        data: {
          parentId: newNodeId,
          onClick: () => handleAddActionClick(newAddActionId, newNodeId),
          // Preserve chain metadata for AI Agent chains
          ...(isAIAgentChain && clickedAddAction?.data ? {
            parentAIAgentId: clickedAddAction.data.parentAIAgentId,
            parentChainIndex: clickedAddAction.data.parentChainIndex,
            isChainAddAction: true
          } : {})
        },
      }
      
      // Find and remove the old Add Action node that was clicked
      const oldAddActionId = sourceNodeInfo.id
      
      setNodes((prevNodes: Node[]) => {
        // Remove old Add Action and add new nodes
        return prevNodes
          .filter((n: Node) => n.id !== oldAddActionId)
          .concat([newActionNode, newAddActionNode])
      })
      
      setEdges((prevEdges: Edge[]) => {
        // Remove edge to old Add Action node
        const filteredEdges = prevEdges.filter((e: Edge) => e.target !== oldAddActionId)
        
        return [
          ...filteredEdges,
          {
            id: `e-${parentNode.id}-${newNodeId}`,
            source: parentNode.id,
            target: newNodeId,
            type: 'custom',
            animated: false,
            style: { 
              stroke: '#94a3b8',
              strokeWidth: 2 
            },
            data: {
              onAddNode: (position: { x: number, y: number }) => {
                handleAddNodeBetween(parentNode.id, newNodeId, position)
              }
            }
          },
          {
            id: `e-${newNodeId}-${newAddActionId}`,
            source: newNodeId,
            target: newAddActionId,
            type: 'straight',
            animated: false,
            style: { 
              stroke: '#b1b1b7',
              strokeWidth: 2,
              strokeDasharray: '5,5'
            }
          }
        ]
      })
    }
    
    setShowActionDialog(false)
    setSelectedIntegration(null)
    setSourceAddNode(null)
    setTimeout(() => fitView({ padding: 0.5 }), 100)
    
    // Auto-save after inserting action
    if (sourceNodeInfo.insertBefore) {
      console.log('🔄 [WorkflowBuilder] Auto-saving after node insertion')
      setTimeout(async () => {
        try {
          await handleSave()
          console.log('✅ [WorkflowBuilder] Workflow saved after node insertion')
        } catch (error) {
          console.error('❌ [WorkflowBuilder] Failed to save after node insertion:', error)
        }
      }, 500) // Give React time to update state
    }
    
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
      return null; // No node ID for triggers
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
      return newNodeId; // Return the new node ID for AI Agent processing
    } else {
      // Handle existing node configuration updates - update local state AND save to database
      console.log('✅ [WorkflowBuilder] Updating existing node configuration in local state');
      console.log('  - Node ID:', context.id);
      console.log('  - New Config:', newConfig);
      console.log('  - Config keys:', Object.keys(newConfig));
      console.log('  - Current nodes before update:', nodes.map(n => ({ id: n.id, type: n.type, hasConfig: !!n.data?.config })));
      
      setNodes((nds) => nds.map((node) => {
        if (node.id === context.id) {
          // Check if this is an AI Agent node with chains
          const isAIAgent = node.data?.type === 'ai_agent';
          // Handle both formats: newConfig.chains (array) or newConfig.chains.chains (nested)
          const chainsArray = Array.isArray(newConfig?.chains) ? newConfig.chains : newConfig?.chains?.chains;
          const hasChains = chainsArray && Array.isArray(chainsArray) && chainsArray.length > 0;
          
          console.log('🔄 [WorkflowBuilder] Updating AI Agent node:', {
            nodeId: node.id,
            isAIAgent,
            hasChains,
            chainsCount: chainsArray?.length || 0
          });
          
          // Build updated node data
          const updatedData: any = {
            ...node.data,
            config: newConfig
          };
          
          // If it's an AI Agent, handle chains data and emptiedChains tracking
          if (isAIAgent) {
            // Extract emptiedChains from the chains configuration
            const emptiedChains = newConfig?.chains?.emptiedChains || [];
            updatedData.emptiedChains = emptiedChains;
            
            console.log('🔍 [WorkflowBuilder] Storing emptiedChains in AI Agent node:', {
              nodeId: node.id,
              emptiedChains: emptiedChains,
              emptiedChainsCount: emptiedChains.length
            });
            
            if (hasChains) {
              updatedData.onAddChain = undefined;
              updatedData.hasChains = true;
              updatedData.chainCount = chainsArray.length;
              console.log('✅ [WorkflowBuilder] Removing onAddChain from AI Agent node with', chainsArray.length, 'chains');
            } else {
              // Ensure we preserve the hasChains state even if config doesn't have chains
              updatedData.hasChains = (node.data as any).hasChains || false;
              updatedData.chainCount = (node.data as any).chainCount || 0;
            }
          }
          
          const updatedNode = { ...node, data: updatedData };
          console.log('  - Updated node:', updatedNode);
          return updatedNode;
        }
        return node;
      }));
      
      // Mark the workflow as having unsaved changes
      setHasUnsavedChanges(true);
      
      // Show success message
      toast({ 
        title: "Configuration Updated", 
        description: "Node configuration has been updated. Remember to save the workflow." 
      });
      
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
          await saveNodeConfig(currentWorkflow.id, context.id, nodeType as string, newConfig)
          
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
      return null; // No new node ID for existing nodes
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
    
    // Add timeout protection - increased for complex workflows with AI Agent nodes
    const saveTimeout = setTimeout(() => {
      console.error("Save operation timed out")
      setIsSaving(false)
      isSavingRef.current = false
      toast({ 
        title: "Save Timeout", 
        description: "Save operation took too long. Please try again.", 
        variant: "destructive" 
      })
    }, 60000) // 60 second timeout for complex workflows
    
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
        
        // Deep clone config to avoid circular references, especially for AI Agent nodes
        let nodeConfig = {};
        try {
          if (n.data.config) {
            // Use JSON parse/stringify to create a deep clone and remove any circular references
            nodeConfig = JSON.parse(JSON.stringify(n.data.config));
          }
        } catch (error) {
          console.error(`Failed to serialize config for node ${n.id}:`, error);
          // If serialization fails, try to extract only serializable properties
          nodeConfig = n.data.config || {};
        }
        
        return {
          id: n.id, 
          type: 'custom', 
          position: position,
          data: { 
            label: n.data.label as string, 
            type: n.data.type as string, 
            config: nodeConfig,
            providerId: n.data.providerId as string | undefined,
            isTrigger: n.data.isTrigger as boolean | undefined,
            title: n.data.title as string | undefined,
            description: n.data.description as string | undefined,
            hasChains: n.data.hasChains as boolean | undefined,
            chainCount: n.data.chainCount as number | undefined,
            // Preserve AI Agent chain metadata
            isAIAgentChild: n.data.isAIAgentChild as boolean | undefined,
            parentAIAgentId: n.data.parentAIAgentId as string | undefined,
            parentChainIndex: n.data.parentChainIndex as number | undefined,
            // Preserve emptiedChains tracking for AI Agent nodes
            emptiedChains: n.data.emptiedChains as number[] | undefined
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

      // Log the save operation details for debugging
      console.log("🔄 Starting save operation:", {
        workflowId: currentWorkflow!.id,
        nodesCount: mappedNodes.length,
        connectionsCount: mappedConnections.length,
        hasAIAgent: mappedNodes.some(n => n.data.type === 'ai_agent'),
        timestamp: new Date().toISOString()
      })

      // Save to database with better error handling
      // Clear the timeout as soon as the save completes
      const savePromise = updateWorkflow(currentWorkflow!.id, updates);
      
      const result = await savePromise;
      
      // Clear timeout immediately after successful save
      clearTimeout(saveTimeout);
      
      console.log("✅ Save operation completed successfully:", {
        workflowId: currentWorkflow!.id,
        timestamp: new Date().toISOString()
      })
      
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
      
      // Skip rebuild if nodes haven't structurally changed - just update the workflow state
      // This significantly speeds up save operations
      const currentNodes = getNodes();
      const needsRebuild = currentNodes.length !== mappedNodes.length || 
        currentNodes.some((n: Node, i: number) => n.id !== mappedNodes[i]?.id);
      
      if (needsRebuild) {
        // Force a rebuild of nodes after save to ensure positions are updated
        setIsRebuildingAfterSave(true);
        
        // Use requestAnimationFrame for smoother UI updates
        requestAnimationFrame(() => {
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
                onRename: handleRenameNode,
                onChangeTrigger: node.data.type?.includes('trigger') ? handleChangeTrigger : undefined,
                onAddChain: node.data.type === 'ai_agent' && !(node.data as any)?.hasChains ? handleAddChain : undefined,
                providerId: node.data.providerId || node.data.type?.split('-')[0]
              },
            };
          });

          let allNodes: Node[] = [...customNodes];
          
          // Handle AI Agent chains first
          const aiAgentNodes = customNodes.filter(n => n.data?.type === 'ai_agent');
          
          if (aiAgentNodes.length > 0) {
            // For each AI Agent node, find its chain children and add Add Action nodes
            aiAgentNodes.forEach(aiAgentNode => {
              const aiAgentId = aiAgentNode.id;
              
              // Find all child nodes of this AI Agent
              const directChildNodes = customNodes.filter(n => {
                // Check if this node is marked as a child of this AI agent
                if (n.data?.isAIAgentChild && n.data?.parentAIAgentId === aiAgentId) {
                  return true;
                }
                // Fallback: Check if this node ID indicates it's a chain child of this AI agent
                return n.id.startsWith(`${aiAgentId}-chain`) && n.id.includes('-action');
              });
              
              // Group children by chain, including nodes connected to chain nodes
              const chainGroups: Record<number, Node[]> = {};
              const workflowConnections = newWorkflow.connections || [];
              
              // First, add direct child nodes to their chains
              directChildNodes.forEach(child => {
                // Use the parentChainIndex metadata if available
                let chainIndex = child.data?.parentChainIndex;
                
                // Fallback: Extract chain index from ID pattern
                if (chainIndex === undefined || chainIndex === null) {
                  const chainMatch = child.id.match(/chain(\d+)/);
                  chainIndex = chainMatch ? parseInt(chainMatch[1]) : 0;
                }
                
                if (!chainGroups[chainIndex]) {
                  chainGroups[chainIndex] = [];
                }
                chainGroups[chainIndex].push(child);
              });
              
              // Now find any nodes connected to chain nodes that aren't already included
              Object.keys(chainGroups).forEach(chainIndexStr => {
                const chainIndex = parseInt(chainIndexStr);
                const chainNodes = [...chainGroups[chainIndex]]; // Copy to avoid modifying while iterating
                const processedNodes = new Set(chainNodes.map(n => n.id));
                
                // Find all nodes connected to this chain
                let nodesToCheck = [...chainNodes];
                while (nodesToCheck.length > 0) {
                  const currentNode = nodesToCheck.shift()!;
                  
                  // Find nodes connected to the current node
                  workflowConnections.forEach(conn => {
                    if (conn.source === currentNode.id) {
                      const targetNode = customNodes.find(n => n.id === conn.target);
                      if (targetNode && !processedNodes.has(targetNode.id) && !targetNode.data?.isTrigger) {
                        // This node is connected to the chain but wasn't originally identified
                        chainGroups[chainIndex].push(targetNode);
                        processedNodes.add(targetNode.id);
                        nodesToCheck.push(targetNode);
                      }
                    }
                  });
                }
              });
              
              // Check the AI Agent config to know how many chains it should have
              const aiAgentConfig = aiAgentNode.data?.config;
              const chainsFromConfig = aiAgentConfig?.chains?.chains || aiAgentConfig?.chains || [];
              const expectedChainCount = Math.max(
                chainsFromConfig.length,
                Object.keys(chainGroups).length,
                2 // Minimum 2 chains for AI Agent
              );
              
              // Process each chain index up to the expected count
              for (let chainIndex = 0; chainIndex < expectedChainCount; chainIndex++) {
                const chainNodes = chainGroups[chainIndex] || [];
                
                if (chainNodes.length > 0) {
                  // Find the last node in this chain by checking connections
                  let lastChainNode = chainNodes[0]; // Default to first node if we can't determine
                  
                  // Find the node that doesn't have any edges going to other nodes in this chain
                  const workflowConnections = newWorkflow.connections || [];
                  for (const node of chainNodes) {
                    const hasOutgoingEdgeToChainNode = workflowConnections.some(conn => 
                      conn.source === node.id && 
                      chainNodes.some(cn => cn.id === conn.target)
                    );
                    
                    if (!hasOutgoingEdgeToChainNode) {
                      lastChainNode = node;
                      break;
                    }
                  }
                  
                  // Create Add Action node for this chain
                  const addActionId = `add-action-${aiAgentId}-chain${chainIndex}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                  const addActionNode: Node = {
                    id: addActionId,
                    type: 'addAction',
                    position: { 
                      x: lastChainNode.position.x, 
                      y: lastChainNode.position.y + 160 
                    },
                    data: {
                      parentId: lastChainNode.id,
                      parentAIAgentId: aiAgentId,
                      parentChainIndex: chainIndex,
                      isChainAddAction: true,
                      onClick: () => handleAddActionClick(addActionId, lastChainNode.id)
                    }
                  };
                  
                  allNodes.push(addActionNode);
                }
              }
            });
          } else {
            // Only add main workflow Add Action if there are no AI Agent chains
            // Find the last action node (not the trigger) to position the add action node
            const actionNodes = customNodes.filter(n => n.id !== 'trigger' && !n.data?.isAIAgentChild);
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
          }
          
          const initialEdges: Edge[] = (newWorkflow.connections || []).map((conn: WorkflowConnection) => {
            // Check if this is a connection between action nodes (not to addAction nodes)
            const sourceNode = allNodes.find(n => n.id === conn.source)
            const targetNode = allNodes.find(n => n.id === conn.target)
            const isActionToAction = sourceNode && targetNode && 
              sourceNode.type === 'custom' && targetNode.type === 'custom' &&
              targetNode.data?.type !== 'addAction'
            
            return {
              id: conn.id, 
              source: conn.source, 
              target: conn.target,
              type: isActionToAction ? 'custom' : undefined,
              data: isActionToAction ? {
                onAddNode: (sourceId: string, targetId: string, position: { x: number, y: number }) => {
                  handleInsertAction(conn.source, conn.target)
                }
              } : undefined
            }
          });
          
          // Add edges to all Add Action nodes
          const addActionNodes = allNodes.filter(n => n.type === 'addAction');
          addActionNodes.forEach(addActionNode => {
            const parentId = addActionNode.data?.parentId;
            if (parentId) {
              const edgeId = `${parentId}->${addActionNode.id}`;
              // Check if edge already exists
              if (!initialEdges.some(e => e.id === edgeId)) {
                initialEdges.push({
                  id: edgeId,
                  source: parentId,
                  target: addActionNode.id,
                  animated: true,
                  style: { stroke: '#b1b1b7', strokeWidth: 2, strokeDasharray: '5,5' },
                  type: 'straight'
                });
              }
            }
          });
          
          setNodes(allNodes);
          setEdges(initialEdges);
          
          // Clear flags immediately - don't need additional delay
          setHasUnsavedChanges(false);
          lastSaveTimeRef.current = Date.now();
          setIsRebuildingAfterSave(false);
        });
      } else {
        // No rebuild needed - just clear the unsaved changes flag
        setHasUnsavedChanges(false);
        lastSaveTimeRef.current = Date.now();
      }
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

  // Handle toggling workflow live status
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false)
  
  const handleToggleLive = async () => {
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
  }

  // Handle Test mode (sandbox) - safe testing without external calls
  const handleTestSandbox = async () => {
    if (isExecuting) return
    
    // If already in sandbox mode, stop it
    if (listeningMode) {
      setListeningMode(false)
      setIsExecuting(false)
      setSandboxInterceptedActions([]) // Clear intercepted actions when stopping
      setShowSandboxPreview(false) // Hide preview panel
      toast({
        title: "Sandbox Mode Stopped",
        description: "Test mode has been disabled.",
      })
      return
    }
    
    try {
      if (!currentWorkflow) {
        throw new Error("No workflow selected")
      }
      
      setIsExecuting(true)
      setListeningMode(true)
      
      // Execute in sandbox mode with test data
      const response = await fetch('/api/workflows/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: currentWorkflow.id,
          testMode: true, // Legacy flag for compatibility
          executionMode: 'sandbox', // New flag for sandbox mode
          inputData: {
            trigger: {
              type: 'manual',
              timestamp: new Date().toISOString(),
              source: 'sandbox_test'
            }
          },
          workflowData: {
            nodes: getNodes(),
            edges: getEdges()
          }
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        
        // Process intercepted actions from results
        const interceptedActions = []
        if (result.results && Array.isArray(result.results)) {
          const processNodeResults = (nodeResults: any, depth = 0) => {
            for (const nodeResult of nodeResults) {
              // Check if this node has intercepted data
              if (nodeResult?.intercepted) {
                interceptedActions.push({
                  nodeId: nodeResult.nodeId || `node-${Date.now()}`,
                  nodeName: nodeResult.nodeName || nodeResult.type,
                  type: nodeResult.intercepted.type,
                  timestamp: new Date().toISOString(),
                  config: nodeResult.intercepted.config,
                  wouldHaveSent: nodeResult.intercepted.wouldHaveSent,
                  sandbox: true
                })
              }
              
              // Process nested results if they exist
              if (nodeResult?.results && Array.isArray(nodeResult.results)) {
                processNodeResults(nodeResult.results, depth + 1)
              }
              
              // Also check for output that might contain intercepted data
              if (nodeResult?.output?.intercepted) {
                interceptedActions.push({
                  nodeId: nodeResult.nodeId || `node-${Date.now()}`,
                  nodeName: nodeResult.nodeName,
                  type: nodeResult.output.intercepted.type,
                  timestamp: new Date().toISOString(),
                  config: nodeResult.output.intercepted.config,
                  wouldHaveSent: nodeResult.output.intercepted.wouldHaveSent,
                  sandbox: true
                })
              }
            }
          }
          
          processNodeResults(result.results)
        }
        
        // Update state with intercepted actions and show preview panel
        if (interceptedActions.length > 0) {
          setSandboxInterceptedActions(prev => [...prev, ...interceptedActions])
          setShowSandboxPreview(true)
        }
        
        toast({
          title: "Sandbox Test Complete",
          description: `Workflow tested successfully. ${interceptedActions.length} action(s) intercepted.`,
          variant: "default"
        })
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to test workflow')
      }
    } catch (error: any) {
      console.error('Error testing workflow:', error)
      toast({
        title: "Sandbox Test Failed",
        description: error.message || "Failed to test workflow in sandbox mode.",
        variant: "destructive"
      })
      setListeningMode(false)
    } finally {
      setIsExecuting(false)
    }
  }

  // Handle Execute mode (live) - one-time execution with real external calls  
  const handleExecuteLive = async () => {
    if (isExecuting) return
    
    try {
      if (!currentWorkflow) {
        throw new Error("No workflow selected")
      }
      
      setIsExecuting(true)
      
      // Execute the workflow immediately with test data but REAL external calls
      const response = await fetch('/api/workflows/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: currentWorkflow.id,
          testMode: false, // This is LIVE mode - real external calls
          executionMode: 'live', // New flag to distinguish from sandbox
          inputData: {
            trigger: {
              type: 'manual',
              timestamp: new Date().toISOString(),
              source: 'live_test'
            }
          },
          workflowData: {
            nodes: getNodes(),
            edges: getEdges()
          }
        })
      })
      
      if (response.ok) {
        const result = await response.json()
        toast({
          title: "Live Execution Complete",
          description: `Workflow executed with real external calls. Check your connected services for results.`,
          variant: "default"
        })
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || 'Failed to execute workflow')
      }
    } catch (error: any) {
      console.error('Error executing live workflow:', error)
      toast({
        title: "Live Execution Failed",
        description: error.message || "Failed to execute workflow with live data.",
        variant: "destructive"
      })
    } finally {
      setIsExecuting(false)
    }
  }

  // Legacy handleExecute - keep for backward compatibility but will be phased out
  const handleExecute = async () => {
    if (isExecuting && !listeningMode) {
      return
    }
    
    try {
      if (!currentWorkflow) {
        throw new Error("No workflow selected")
      }
      
      // Get all workflow nodes and edges FIRST to check trigger type
      const workflowNodes = getNodes().filter((n: Node) => n.type === 'custom')
      
      // Find trigger nodes
      const triggerNodes = workflowNodes.filter(node => node.data?.isTrigger)
      
      if (triggerNodes.length === 0) {
        throw new Error("No trigger nodes found in workflow")
      }
      
      // Check if we have a manual trigger
      const hasManualTrigger = triggerNodes.some(node => 
        node.data?.providerId === 'manual' || 
        node.data?.type === 'manual'
      )

      // If we're already in listening mode
      if (listeningMode) {
        // If it's a manual trigger, execute the workflow instead of turning off listening
        if (hasManualTrigger) {
          // Determine if this is TEST MODE or EXECUTE MODE
          // In listening mode, Execute button runs in TEST MODE (simulation)
          const isTestMode = true // When in listening/test mode, always simulate
          
          console.log(`🔄 ${isTestMode ? 'Testing' : 'Executing'} manual trigger workflow from Execute button`)
          
          // Execute the workflow directly
          try {
            const response = await fetch('/api/workflows/execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                workflowId: currentWorkflow.id,
                testMode: isTestMode,
                inputData: {
                  trigger: {
                    type: 'manual',
                    timestamp: new Date().toISOString(),
                    source: isTestMode ? 'test_mode' : 'live_mode'
                  }
                },
                workflowData: {
                  nodes: getNodes(),
                  edges: getEdges()
                }
              })
            })
            
            if (response.ok) {
              const result = await response.json()
              
              // Different toasts for test vs execute mode
              if (isTestMode) {
                toast({
                  title: "Test Run Complete",
                  description: "Workflow simulated successfully. Check results for preview of actions.",
                })
              } else {
                toast({
                  title: "Workflow Executed",
                  description: `Live execution completed. ID: ${result.executionId}`,
                })
              }
              
              // Don't turn off listening mode - keep it active
              return
            } else {
              const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
              console.error('Failed to execute workflow:', errorData)
              throw new Error(errorData.error || 'Failed to execute workflow')
            }
          } catch (error: any) {
            console.error('Error executing manual workflow:', error)
            toast({
              title: isTestMode ? "Test Failed" : "Execution Failed",
              description: error.message || "Failed to run workflow. Please check the console for details.",
              variant: "destructive"
            })
            return
          }
        } else {
          // For non-manual triggers, turn off listening mode
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
      }

      setIsExecuting(true)
      
      // Setup real-time monitoring for execution events
      const supabaseClient = createClient()
      
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
                const nodeName = getNodes().find(n => n.id === event.node_id)?.data?.title || getNodes().find(n => n.id === event.node_id)?.data?.label || `Node ${event.node_id}`
                addError({
                  workflowId: currentWorkflow.id,
                  nodeId: event.node_id,
                  nodeName: String(nodeName),
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
      
      // Register webhooks for trigger nodes (skip manual triggers)
      let registeredWebhooks = 0
      for (const triggerNode of triggerNodes) {
        const nodeData = triggerNode.data
        const providerId = nodeData?.providerId
        
        // Skip webhook registration for manual triggers
        if (providerId === 'manual' || nodeData?.type === 'manual') {
          console.log('⏩ Skipping webhook registration for manual trigger')
          continue
        }
        
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
    // Handle special integrations with icons
    if (integrationId === 'core') {
      return (
        <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-lg">
          <Zap className="w-6 h-6 text-gray-600" />
        </div>
      )
    }
    if (integrationId === 'logic') {
      return (
        <div className="w-10 h-10 flex items-center justify-center bg-gray-100 rounded-lg">
          <GitBranch className="w-6 h-6 text-gray-600" />
        </div>
      )
    }
    if (integrationId === 'ai') {
      return (
        <div className="w-10 h-10 flex items-center justify-center bg-purple-100 rounded-lg">
          <Bot className="w-6 h-6 text-purple-600" />
        </div>
      )
    }
    
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
    // If integrations are still loading, show all integrations to avoid empty state
    if (integrationsLoading) {
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
              onRename: handleRenameNode,
              onChangeTrigger: node.data.type?.includes('trigger') ? handleChangeTrigger : undefined,
              onAddChain: node.data.type === 'ai_agent' ? handleAddChain : undefined,
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
        
        const initialEdges: Edge[] = (data.connections || []).map((conn: any) => {
          // Check if this is a connection between action nodes (not to addAction nodes)
          const sourceNode = allNodes.find(n => n.id === conn.source)
          const targetNode = allNodes.find(n => n.id === conn.target)
          const isActionToAction = sourceNode && targetNode && 
            sourceNode.type === 'custom' && targetNode.type === 'custom' &&
            targetNode.data?.type !== 'addAction'
          
          return {
            id: conn.id, 
            source: conn.source, 
            target: conn.target,
            type: isActionToAction ? 'custom' : undefined,
            data: isActionToAction ? {
              onAddNode: (sourceId: string, targetId: string, position: { x: number, y: number }) => {
                handleInsertAction(conn.source, conn.target)
              }
            } : undefined
          }
        });
        
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
        (typeof node.data?.type === 'string' && node.data.type.includes('discord'))
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
    nodeTypes,
    edgeTypes,
    workflowName,
    setWorkflowName,
    workflowDescription,
    setWorkflowDescription,
    isSaving,
    handleSave,
    handleToggleLive,
    isUpdatingStatus,
    handleExecute,
    handleTestSandbox,
    handleExecuteLive,
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
    setShowDiscordConnectionModal,
    handleAddNodeBetween,
    isProcessingChainsRef,
    handleConfigureNode,
    handleDeleteNodeWithConfirmation,
    handleAddActionClick,
    fitView,
    aiAgentActionCallback,
    setAiAgentActionCallback,
    showExecutionHistory,
    setShowExecutionHistory,
    showSandboxPreview,
    setShowSandboxPreview,
    sandboxInterceptedActions,
    setSandboxInterceptedActions
  }
}

// Custom Edge with Plus Button for adding actions between nodes
const CustomEdgeWithButton = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  data
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })
  
  const [isHovered, setIsHovered] = React.useState(false)
  
  // Handle adding node between source and target
  // Note: onAddNode might not be available for programmatically created edges
  const onAddNode = data?.onAddNode
  
  return (
    <g 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: onAddNode ? 'pointer' : 'default' }}
    >
      <path
        d={edgePath}
        fill="none"
        strokeWidth={40}
        stroke="transparent"
        style={{ pointerEvents: 'stroke' }}
      />
      <path
        id={id}
        style={style}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        strokeWidth={2}
        stroke={style?.stroke || '#d1d5db'}
      />
      
      {onAddNode && (isHovered || data?.alwaysShowButton) ? (
        <foreignObject
          width={30}
          height={30}
          x={labelX - 15}
          y={labelY - 15}
          style={{ overflow: 'visible', pointerEvents: 'all' }}
        >
          <div 
            className="flex items-center justify-center"
            style={{ width: '30px', height: '30px' }}
          >
            <button
              className="w-7 h-7 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 flex items-center justify-center shadow-md transition-all hover:scale-110"
              onClick={(e) => {
                e.stopPropagation()
                if (typeof onAddNode === 'function') {
                  // The onAddNode function in data can have different signatures:
                  // 1. For edges created in workflow loading: (sourceId, targetId, position) => ...
                  // 2. For edges with bound parameters: (position) => ...
                  // 3. For processedEdges: (sourceId, targetId, position) => ...
                  
                  // Try to determine the signature based on function length
                  if (onAddNode.length <= 1) {
                    // Function expects only position (parameters are bound via closure)
                    onAddNode({ x: labelX, y: labelY })
                  } else {
                    // Function expects all three parameters
                    // Need to parse the edge ID to get source and target
                    // Try different ID formats
                    let sourceId, targetId
                    
                    if (id.includes('->')) {
                      // Format: "sourceId->targetId"
                      const parts = id.split('->')
                      sourceId = parts[0]
                      targetId = parts[1]
                    } else if (id.startsWith('e-')) {
                      // Format: "e-sourceId-targetId"
                      const parts = id.substring(2).split('-')
                      if (parts.length >= 2) {
                        // Take first part as source, rest as target (handles IDs with hyphens)
                        sourceId = parts[0]
                        targetId = parts.slice(1).join('-')
                      }
                    } else {
                      // Format: "sourceId-targetId" 
                      // Find the last occurrence of a pattern like "node-timestamp"
                      const matches = id.match(/^(.*?)-(node-\d+)$/)
                      if (matches) {
                        sourceId = matches[1]
                        targetId = matches[2]
                      } else {
                        // Fallback: split by first hyphen after "node"
                        const nodeIndex = id.lastIndexOf('node-')
                        if (nodeIndex > 0) {
                          sourceId = id.substring(0, nodeIndex - 1)
                          targetId = id.substring(nodeIndex)
                        }
                      }
                    }
                    
                    if (sourceId && targetId) {
                      onAddNode(sourceId, targetId, { x: labelX, y: labelY })
                    } else {
                      console.warn('Could not parse edge ID for insertion:', id)
                    }
                  }
                }
              }}
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </foreignObject>
      ) : null}
    </g>
  )
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
    nodes, edges, setNodes, setEdges, onNodesChange, optimizedOnNodesChange, onEdgesChange, onConnect, nodeTypes, edgeTypes, workflowName, setWorkflowName, workflowDescription, setWorkflowDescription, isSaving, hasUnsavedChanges, handleSave, handleToggleLive, isUpdatingStatus, handleExecute, handleTestSandbox, handleExecuteLive, 
    showTriggerDialog, setShowTriggerDialog, showActionDialog, setShowActionDialog, handleTriggerSelect, handleActionSelect, selectedIntegration, setSelectedIntegration,
    availableIntegrations, renderLogo, getWorkflowStatus, currentWorkflow, isExecuting, activeExecutionNodeId, executionResults,
    configuringNode, setConfiguringNode, handleSaveConfiguration, collaborators, pendingNode, setPendingNode,
    selectedTrigger, setSelectedTrigger, selectedAction, setSelectedAction, searchQuery, setSearchQuery, filterCategory, setFilterCategory, showConnectedOnly, setShowConnectedOnly,
    filteredIntegrations, displayedTriggers, deletingNode, setDeletingNode, confirmDeleteNode, isIntegrationConnected, integrationsLoading, workflowLoading, listeningMode, setListeningMode, handleResetLoadingStates,
    sourceAddNode, handleActionDialogClose, nodeNeedsConfiguration, workflows, workflowId, hasShownLoading, setHasShownLoading, setHasUnsavedChanges, showUnsavedChangesModal, setShowUnsavedChangesModal, pendingNavigation, setPendingNavigation,
    handleNavigation, handleSaveAndNavigate, handleNavigateWithoutSaving, showDiscordConnectionModal, setShowDiscordConnectionModal, handleAddNodeBetween, isProcessingChainsRef,
    handleConfigureNode, handleDeleteNodeWithConfirmation, handleAddActionClick, fitView, aiAgentActionCallback, setAiAgentActionCallback, showExecutionHistory, setShowExecutionHistory,
    showSandboxPreview, setShowSandboxPreview, sandboxInterceptedActions, setSandboxInterceptedActions
  } = useWorkflowBuilderState()

  // Add handleAddNodeBetween to all custom edges that don't already have it
  const processedEdges = useMemo(() => {
    return edges.map(edge => {
      if (edge.type === 'custom') {
        // If edge already has onAddNode, preserve it
        // Otherwise, create one using the edge's source and target
        if (edge.data?.onAddNode) {
          return edge  // Keep existing handler
        }
        
        return {
          ...edge,
          data: {
            ...edge.data,
            onAddNode: (position: { x: number, y: number }) => {
              // Use the edge's source and target directly
              handleAddNodeBetween(edge.source, edge.target, position)
            }
          }
        }
      }
      return edge
    })
  }, [edges, handleAddNodeBetween])

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
    'dropbox',
    'gitlab',
    'instagram',
    'linkedin',
    'teams',  // Microsoft Teams uses 'teams' as its ID
    'stripe',
    'tiktok',
    'youtube',
    'youtube-studio',
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
                    onClick={handleToggleLive} 
                    disabled={isUpdatingStatus || isSaving || hasUnsavedChanges}
                    variant={currentWorkflow?.status === 'active' ? "destructive" : "default"}
                  >
                    {isUpdatingStatus ? (
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    ) : currentWorkflow?.status === 'active' ? (
                      <Pause className="w-5 h-5 mr-2" />
                    ) : (
                      <Radio className="w-5 h-5 mr-2" />
                    )}
                    {currentWorkflow?.status === 'active' ? 'Deactivate' : 'Activate Workflow'}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p className="font-semibold mb-1">
                    {currentWorkflow?.status === 'active' ? 'Deactivate Workflow' : 'Activate Workflow'}
                  </p>
                  <p className="text-xs">
                    {hasUnsavedChanges 
                      ? "Save your changes before activating the workflow" 
                      : currentWorkflow?.status === 'active' 
                        ? "Stop the workflow from running automatically on triggers" 
                        : "Enable automatic execution when trigger events occur (e.g., new email, webhook)"
                    }
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={listeningMode ? "secondary" : "outline"} 
                    onClick={handleTestSandbox} 
                    disabled={isExecuting && !listeningMode || isSaving}
                  >
                    {isExecuting && !listeningMode ? (
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    ) : listeningMode ? (
                      <Shield className="w-5 h-5 mr-2" />
                    ) : (
                      <FlaskConical className="w-5 h-5 mr-2" />
                    )}
                    {listeningMode ? "Stop Sandbox" : "Test (Sandbox)"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p className="font-semibold mb-1">
                    {listeningMode ? "Stop Sandbox Mode" : "Test in Sandbox Mode"}
                  </p>
                  <p className="text-xs">
                    {listeningMode 
                      ? "Stop testing your workflow" 
                      : "Run workflow with test data. No emails sent, no external actions performed. Perfect for testing your logic safely."
                    }
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Show preview button when in sandbox mode and have intercepted actions */}
            {listeningMode && sandboxInterceptedActions.length > 0 && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={showSandboxPreview ? "default" : "outline"}
                      size="icon"
                      onClick={() => setShowSandboxPreview(!showSandboxPreview)}
                      className="relative"
                    >
                      <Shield className="w-5 h-5" />
                      {sandboxInterceptedActions.length > 0 && (
                        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center">
                          {sandboxInterceptedActions.length}
                        </span>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="font-semibold">
                      {showSandboxPreview ? "Hide" : "Show"} Sandbox Preview
                    </p>
                    <p className="text-xs">
                      {sandboxInterceptedActions.length} intercepted action{sandboxInterceptedActions.length !== 1 ? 's' : ''}
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    onClick={handleExecuteLive}
                    disabled={isSaving || isExecuting} 
                    variant="default"
                  >
                    {isExecuting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Rocket className="w-5 h-5 mr-2" />}
                    Run Once (Live)
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p className="font-semibold mb-1">Run Once with Live Data</p>
                  <p className="text-xs">
                    Execute workflow immediately with test trigger data. <span className="text-yellow-500 font-semibold">Warning:</span> This will send real emails, post real messages, and perform actual actions in your connected services.
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            {/* Execution History Button */}
            {workflowId && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      onClick={() => setShowExecutionHistory(true)} 
                      variant="outline"
                    >
                      <History className="w-5 h-5 mr-2" />
                      History
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent><p>View execution history</p></TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

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
          edges={processedEdges} 
          onNodesChange={optimizedOnNodesChange} 
          onEdgesChange={onEdgesChange} 
          onConnect={onConnect} 
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeDrag={(event, node) => {
            // Track position changes during drag
            setHasUnsavedChanges(true)
          }}
          onNodeDragStop={(event, node) => {
            // Update node position in state and mark as unsaved
            setNodes((nds: Node[]) => 
              nds.map((n: Node) => {
                // Update the dragged node itself
                if (n.id === node.id) {
                  return { ...n, position: node.position }
                }
                // Update any AddAction nodes that have this node as their parent
                if (n.type === 'addAction' && n.data?.parentId === node.id) {
                  return {
                    ...n,
                    position: {
                      x: node.position.x,
                      y: node.position.y + 160
                    }
                  }
                }
                return n
              })
            )
            setHasUnsavedChanges(true)
            
            // Force a small delay to ensure position is updated
            setTimeout(() => {
            }, 50)
          }}
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
            </div>
          </div>

          <div className="flex-1 flex min-h-0 overflow-hidden">
            <ScrollArea className="w-2/5 border-r border-border flex-1" style={{ scrollbarGutter: 'stable' }}>
              <div className="pt-2 pb-3 pl-3 pr-5">
              {filteredIntegrations.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="text-muted-foreground mb-2">
                    <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <p className="text-sm text-muted-foreground">No integrations match your search</p>
                </div>
              ) : (
                filteredIntegrations
                  .filter(integration => integration.triggers && integration.triggers.length > 0)
                  .map((integration) => {
                  const isConnected = isIntegrationConnected(integration.id);
                  const isComingSoon = comingSoonIntegrations.has(integration.id);
                  
                  return (
                    <div
                      key={integration.id}
                      className={`flex items-center p-3 rounded-md ${
                        isComingSoon 
                          ? 'cursor-not-allowed opacity-60'
                          : isConnected 
                            ? `cursor-pointer ${selectedIntegration?.id === integration.id ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted/50'}`
                            : 'opacity-60'
                      }`}
                      onClick={() => !isComingSoon && isConnected && setSelectedIntegration(integration)}
                    >
                      {renderLogo(integration.id, integration.name)}
                      <span className="font-semibold ml-4 flex-grow">{integration.name}</span>
                      {isComingSoon ? (
                        <Badge variant="secondary" className="ml-2 shrink-0">
                          Coming soon
                        </Badge>
                      ) : !isConnected && 
                           integration.id !== 'core' && 
                           integration.id !== 'logic' && 
                           integration.id !== 'webhook' && 
                           integration.id !== 'scheduler' && 
                           integration.id !== 'ai' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mr-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Handle OAuth connection
                            const config = INTEGRATION_CONFIGS[integration.id as keyof typeof INTEGRATION_CONFIGS];
                            if (config?.authUrl) {
                              window.location.href = config.authUrl;
                            }
                          }}
                        >
                          Connect
                        </Button>
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  );
                })
              )}
              </div>
            </ScrollArea>
            <div className="w-3/5 flex-1">
              <ScrollArea className="h-full" style={{ scrollbarGutter: 'stable' }}>
                <div className="p-4">
                {selectedIntegration ? (
                  <div className="h-full">
                    {!isIntegrationConnected(selectedIntegration.id) ? (
                      // Show message for unconnected integrations
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="text-muted-foreground mb-4">
                          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold mb-2">Connect {selectedIntegration.name}</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          You need to connect your {selectedIntegration.name} account to use these triggers.
                        </p>
                        <Button
                          variant="default"
                          onClick={() => {
                            const config = INTEGRATION_CONFIGS[selectedIntegration.id as keyof typeof INTEGRATION_CONFIGS];
                            if (config?.authUrl) {
                              window.location.href = config.authUrl;
                            }
                          }}
                        >
                          Connect {selectedIntegration.name}
                        </Button>
                      </div>
                    ) : displayedTriggers.length > 0 ? (
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
                      // Show actions for connected integrations
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
            </div>
          </div>

          <div className="flex-1 flex min-h-0 overflow-hidden">
            <ScrollArea className="w-2/5 border-r border-border flex-1" style={{ scrollbarGutter: 'stable' }}>
              <div className="pt-2 pb-3 pl-3 pr-5">
              {(() => {
                // Filter integrations for action dialog
                const filteredIntegrationsForActions = availableIntegrations.filter(int => {
                  // Filter by category if selected
                  if (filterCategory !== 'all' && int.category !== filterCategory) {
                    return false
                  }
                  
                  // Core integration only has triggers, not actions - filter it out from action dialog
                  if (int.id === 'core') {
                    return false
                  }
                  
                  // Filter out integrations that have no compatible actions
                  const trigger = nodes.find(node => node.data?.isTrigger)
                  const compatibleActions = int.actions.filter(action => {
                    // Gmail actions should only be available with Gmail triggers
                    if (action.providerId === 'gmail' && trigger && trigger.data?.providerId !== 'gmail') {
                      return false
                    }
                    return true
                  })
                  
                  if (compatibleActions.length === 0) {
                    return false
                  }
                  
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
                
                // Sort to put Logic and AI first
                const sortedIntegrations = filteredIntegrationsForActions.sort((a, b) => {
                  if (a.id === 'logic') return -1
                  if (b.id === 'logic') return 1
                  if (a.id === 'ai') return -1
                  if (b.id === 'ai') return 1
                  return a.name.localeCompare(b.name)
                })


                if (sortedIntegrations.length === 0) {
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

                // Use the already filtered and sorted integrations
                return sortedIntegrations.map((integration) => {
                  const isConnected = isIntegrationConnected(integration.id);
                  const isComingSoon = comingSoonIntegrations.has(integration.id);
                  
                  return (
                    <div
                      key={integration.id}
                      className={`flex items-center p-3 rounded-md ${
                        isComingSoon 
                          ? 'cursor-not-allowed opacity-60'
                          : isConnected 
                            ? `cursor-pointer ${selectedIntegration?.id === integration.id ? 'bg-primary/10 ring-1 ring-primary/20' : 'hover:bg-muted/50'}`
                            : 'opacity-60'
                      }`}
                      onClick={() => !isComingSoon && isConnected && setSelectedIntegration(integration)}
                    >
                      {renderLogo(integration.id, integration.name)}
                      <span className="font-semibold ml-4 flex-grow">{integration.name}</span>
                      {isComingSoon ? (
                        <Badge variant="secondary" className="ml-2 shrink-0">
                          Coming soon
                        </Badge>
                      ) : !isConnected && 
                           integration.id !== 'core' && 
                           integration.id !== 'logic' && 
                           integration.id !== 'webhook' && 
                           integration.id !== 'scheduler' && 
                           integration.id !== 'ai' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mr-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Handle OAuth connection
                            const config = INTEGRATION_CONFIGS[integration.id as keyof typeof INTEGRATION_CONFIGS];
                            if (config?.authUrl) {
                              window.location.href = config.authUrl;
                            }
                          }}
                        >
                          Connect
                        </Button>
                      ) : (
                        <ChevronRight className="w-5 h-5 text-muted-foreground" />
                      )}
                    </div>
                  );
                });
              })()}
              </div>
            </ScrollArea>
            <div className="w-3/5 flex-1">
              <ScrollArea className="h-full" style={{ scrollbarGutter: 'stable' }}>
                <div className="p-4">
                {selectedIntegration ? (
                  <div className="h-full">
                    {!isIntegrationConnected(selectedIntegration.id) ? (
                      // Show message for unconnected integrations
                      <div className="flex flex-col items-center justify-center h-full text-center">
                        <div className="text-muted-foreground mb-4">
                          <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        </div>
                        <h3 className="text-lg font-semibold mb-2">Connect {selectedIntegration.name}</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          You need to connect your {selectedIntegration.name} account to use these actions.
                        </p>
                        <Button
                          variant="default"
                          onClick={() => {
                            const config = INTEGRATION_CONFIGS[selectedIntegration.id as keyof typeof INTEGRATION_CONFIGS];
                            if (config?.authUrl) {
                              window.location.href = config.authUrl;
                            }
                          }}
                        >
                          Connect {selectedIntegration.name}
                        </Button>
                      </div>
                    ) : (
                      // Show actions for connected integrations
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
                            const existingAIAgent = nodes.find(n => n.data?.type === 'ai_agent')
                            const isAIAgentDisabled = action.type === 'ai_agent' && existingAIAgent
                            
                            return (
                              <div
                                key={action.type}
                                className={`p-4 border rounded-lg transition-all ${
                                  isComingSoon || isAIAgentDisabled
                                    ? 'border-muted bg-muted/30 cursor-not-allowed opacity-60' 
                                    : selectedAction?.type === action.type 
                                      ? 'border-primary bg-primary/10 ring-1 ring-primary/20' 
                                      : 'border-border hover:border-muted-foreground hover:shadow-sm cursor-pointer'
                                }`}
                                onClick={() => {
                                  if (isComingSoon) return
                                  if (isAIAgentDisabled) {
                                    toast({
                                      title: "AI Agent Already Exists",
                                      description: "You can only have one AI Agent node per workflow. Use the existing AI Agent to configure multiple action chains.",
                                      variant: "destructive"
                                    })
                                    return
                                  }
                                  setSelectedAction(action)
                                  // If action doesn't need configuration, add it immediately
                                  if (selectedIntegration && !nodeNeedsConfiguration(action)) {
                                    handleActionSelect(selectedIntegration, action)
                                  }
                                }}
                              onDoubleClick={() => {
                                if (isComingSoon) return
                                if (isAIAgentDisabled) {
                                  toast({
                                    title: "AI Agent Already Exists",
                                    description: "You can only have one AI Agent node per workflow. Use the existing AI Agent to configure multiple action chains.",
                                    variant: "destructive"
                                  })
                                  return
                                }
                                setSelectedAction(action)
                                if (selectedIntegration) {
                                  handleActionSelect(selectedIntegration, action)
                                }
                              }}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className={`font-medium ${isComingSoon || isAIAgentDisabled ? 'text-muted-foreground' : ''}`}>
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
                                {isAIAgentDisabled && (
                                  <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded-full ml-2">
                                    Already Added
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                          })}
                      </div>
                    )}
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
              onAddActionToWorkflow={(configuringNode.id === 'pending-action' || configuringNode.id === 'pending-trigger') ? undefined : (action, config) => {
                // Handle adding a new action from the AI Agent modal
                console.log('🎯 [WorkflowBuilder] Adding action from AI Agent modal:', action, config);
                
                // Find the AI Agent node
                const aiAgentNode = nodes.find(n => n.data?.type === 'ai_agent');
                if (!aiAgentNode) {
                  console.error('AI Agent node not found in workflow');
                  return;
                }
                
                // Find the last action node connected to the AI Agent
                const aiAgentEdges = edges.filter(e => e.source === aiAgentNode.id || e.target === aiAgentNode.id);
                let lastNode = aiAgentNode;
                let maxDistance = 0;
                
                // Find the furthest node in the chain
                const findFurthestNode = (nodeId: string, distance: number) => {
                  const outgoingEdges = edges.filter(e => e.source === nodeId);
                  if (outgoingEdges.length === 0) {
                    if (distance > maxDistance) {
                      maxDistance = distance;
                      const node = nodes.find(n => n.id === nodeId);
                      if (node) lastNode = node;
                    }
                  } else {
                    outgoingEdges.forEach(edge => {
                      findFurthestNode(edge.target, distance + 1);
                    });
                  }
                };
                
                findFurthestNode(aiAgentNode.id, 0);
                
                // Create the new action node
                const timestamp = Date.now();
                const newNodeId = `node-${timestamp}`;
                const actionComponent = ALL_NODE_COMPONENTS.find(n => n.type === action.type);
                
                const newNode = {
                  id: newNodeId,
                  type: 'custom',
                  position: {
                    x: lastNode.position.x + (lastNode === aiAgentNode ? 450 : 0),
                    y: lastNode.position.y + (lastNode === aiAgentNode ? 0 : 200)
                  },
                  data: {
                    title: actionComponent?.title || action.title || action.type,
                    description: actionComponent?.description || action.description || '',
                    type: action.type,
                    providerId: action.providerId || action.integration?.id,
                    config: config || {},
                    onConfigure: () => handleConfigureNode(newNodeId),
                    onDelete: () => handleDeleteNodeWithConfirmation(newNodeId)
                  }
                };
                
                // Create Add Action node to attach after the new action
                const addActionNodeId = `add-action-${newNodeId}`;
                const addActionNode = {
                  id: addActionNodeId,
                  type: 'addAction',
                  position: {
                    x: newNode.position.x,
                    y: newNode.position.y + 200
                  },
                  data: {
                    parentId: newNodeId,
                    onClick: () => handleAddActionClick(addActionNodeId, newNodeId)
                  }
                };
                
                // Add the new node, Add Action node, and edges
                setNodes(nds => {
                  // Remove any existing Add Action nodes that were connected to the last node
                  const filteredNodes = nds.filter(n => !(n.type === 'addAction' && n.data?.parentId === lastNode.id));
                  return [...filteredNodes, newNode, addActionNode];
                });
                
                setEdges(eds => {
                  // Remove edges to old Add Action nodes
                  const filteredEdges = eds.filter(e => !e.target.startsWith('add-action-'));
                  return [
                    ...filteredEdges,
                    {
                      id: `e-${lastNode.id}-${newNodeId}`,
                      source: lastNode.id,
                      target: newNodeId,
                      type: 'custom'
                    },
                    {
                      id: `e-${newNodeId}-${addActionNodeId}`,
                      source: newNodeId,
                      target: addActionNodeId,
                      type: 'straight',
                      animated: true,
                      style: {
                        stroke: '#b1b1b7',
                        strokeWidth: 2,
                        strokeDasharray: '5,5'
                      }
                    }
                  ];
                });
                
                // If the action needs configuration and not in AI mode, open the config modal
                if (action.needsConfiguration) {
                  setTimeout(() => {
                    setConfiguringNode({
                      id: newNodeId,
                      integration: action.integration,
                      nodeComponent: actionComponent || action
                    });
                  }, 100);
                }
              }}
              onSave={async (config) => {
                console.log('🤖 [WorkflowBuilder] AI Agent config received:', config);
                console.log('🤖 [WorkflowBuilder] ConfiguringNode:', configuringNode);
                console.log('🤖 [WorkflowBuilder] AI Agent layout:', config.chainsLayout);
                console.log('🤖 [WorkflowBuilder] Layout detail:', config.chainsLayout);
                
                // Store the chains layout data before saving configuration
                const chainsToProcess = config.chainsLayout;
                console.log('🔍 [WorkflowBuilder] chainsToProcess structure:', {
                  hasNodes: !!chainsToProcess?.nodes,
                  nodesCount: chainsToProcess?.nodes?.length || 0,
                  hasEdges: !!chainsToProcess?.edges,
                  edgesCount: chainsToProcess?.edges?.length || 0,
                  hasChains: !!chainsToProcess?.chains,
                  chainsCount: chainsToProcess?.chains?.length || 0,
                  isArray: Array.isArray(chainsToProcess),
                  type: typeof chainsToProcess
                });
                
                // Save the AI Agent configuration and get the new node ID if it's a pending node
                let finalAIAgentNodeId = configuringNode.id;
                if (configuringNode.id === 'pending-action' && pendingNode?.type === 'action') {
                  // For pending nodes, addActionToWorkflow returns the new node ID
                  const newNodeId = await handleSaveConfiguration(configuringNode, config);
                  if (newNodeId) {
                    finalAIAgentNodeId = newNodeId;
                    console.log('🔄 [WorkflowBuilder] New AI Agent node created with ID:', newNodeId);
                  }
                } else {
                  await handleSaveConfiguration(configuringNode, config);
                }
                
                // Prevent duplicate chain processing - check and set flag immediately
                if (isProcessingChainsRef.current) {
                  console.log('⚠️ [WorkflowBuilder] Already processing chains, skipping duplicate call');
                  return;
                }
                
                isProcessingChainsRef.current = true;
                
                // Capture the final node ID for use in the setTimeout
                const aiAgentNodeIdToUse = finalAIAgentNodeId;
                
                // Process chains after a longer delay to ensure the AI Agent node has been added to state
                // This is especially important for pending nodes that are being added for the first time
                setTimeout(() => {
                  
                  // Check if we have the new comprehensive format with full node/edge data
                  const hasFullLayout = chainsToProcess?.nodes && chainsToProcess?.edges;
                  const chainsData = chainsToProcess?.chains || chainsToProcess;
                  const aiAgentPosition = chainsToProcess?.aiAgentPosition;
                  const layoutConfig = chainsToProcess?.layout || { verticalSpacing: 120, horizontalSpacing: 150 };
                  
                  console.log('🎯 [WorkflowBuilder] Chain processing decision:', {
                    hasFullLayout,
                    chainsDataIsArray: Array.isArray(chainsData),
                    chainsDataLength: Array.isArray(chainsData) ? chainsData.length : 'not array',
                    nodesLength: chainsToProcess?.nodes?.length || 0,
                    willProcessFullLayout: hasFullLayout && chainsToProcess.nodes && chainsToProcess.nodes.length > 0,
                    willProcessFallback: !hasFullLayout && chainsData && Array.isArray(chainsData) && chainsData.length > 0
                  });
                  
                  // Check if there are any chains to process
                  if ((hasFullLayout && chainsToProcess.nodes && chainsToProcess.nodes.length > 0) || 
                      (chainsData && Array.isArray(chainsData) && chainsData.length > 0)) {
                    console.log('🔄 [WorkflowBuilder] Processing chains from AI Agent');
                    
                    const aiAgentNodeId = aiAgentNodeIdToUse;
                  
                  // Use setNodes to access current state and find the AI Agent node
                  setNodes((currentNodes) => {
                    // Collect all new nodes and edges first
                    const newNodesToAdd: any[] = [];
                    const newEdgesToAdd: any[] = [];
                    // If configuringNode.id is "pending-action", find the AI Agent node by type
                    let aiAgentNode;
                    if (aiAgentNodeId === 'pending-action') {
                      // Find the most recently added AI Agent node
                      aiAgentNode = currentNodes
                        .filter(n => n.data?.type === 'ai_agent')
                        .sort((a, b) => {
                          // Sort by ID (assuming IDs are like "node-timestamp")
                          const aTime = parseInt(a.id.split('-')[1] || '0');
                          const bTime = parseInt(b.id.split('-')[1] || '0');
                          return bTime - aTime; // Most recent first
                        })[0];
                      console.log('🔄 [WorkflowBuilder] Found AI Agent node by type:', aiAgentNode?.id);
                    } else {
                      aiAgentNode = currentNodes.find(n => n.id === aiAgentNodeId);
                    }
                    
                    console.log('🔄 [WorkflowBuilder] Looking for AI Agent node with ID:', aiAgentNodeId);
                    console.log('🔄 [WorkflowBuilder] Current nodes:', currentNodes.map(n => ({ id: n.id, type: n.data?.type })));
                    console.log('🔄 [WorkflowBuilder] AI Agent node found:', aiAgentNode);
                    
                    if (!aiAgentNode) {
                      console.log('❌ [WorkflowBuilder] AI Agent node not found, skipping chain creation');
                      return currentNodes; // Return unchanged nodes
                    }
                    
                    // Use the actual found node ID consistently throughout
                    const actualAIAgentId = aiAgentNode.id;
                    console.log(`🔄 [WorkflowBuilder] Using AI Agent node ID: ${actualAIAgentId}`);
                    
                    // Check if this AI Agent already has chain nodes (editing existing vs new)
                    const existingChainNodes = currentNodes.filter(n => 
                      n.data?.parentAIAgentId === actualAIAgentId && 
                      n.data?.isAIAgentChild
                    );
                    
                    if (existingChainNodes.length > 0) {
                      console.log(`⚠️ [WorkflowBuilder] AI Agent ${actualAIAgentId} already has ${existingChainNodes.length} chain nodes, skipping duplicate creation`);
                      isProcessingChainsRef.current = false;
                      return currentNodes; // Don't add duplicates
                    }
                    
                    // Decide which processing method to use
                    if (hasFullLayout && chainsToProcess.nodes && chainsToProcess.nodes.length > 0) {
                      // If we have full layout data, recreate the exact structure
                      console.log('🎯 [WorkflowBuilder] Using full layout data to recreate exact structure');
                      console.log('🎯 [WorkflowBuilder] Nodes to add:', chainsToProcess.nodes.length);
                      console.log('🎯 [WorkflowBuilder] Edges to add:', chainsToProcess.edges.length);
                      console.log('🎯 [WorkflowBuilder] Full chainsToProcess data:', chainsToProcess);
                      
                      // Create nodes with exact positions from AI Agent builder
                      chainsToProcess.nodes.forEach((nodeData: any) => {
                        const timestamp = Date.now();
                        const newNodeId = `${actualAIAgentId}-${nodeData.id}-${timestamp}`;
                        const actionComponent = ALL_NODE_COMPONENTS.find(n => n.type === nodeData.type);
                        
                        // Calculate position offset
                        const offsetX = aiAgentNode.position.x - (aiAgentPosition?.x || 400);
                        const offsetY = aiAgentNode.position.y - (aiAgentPosition?.y || 200);
                        
                        console.log(`📍 [WorkflowBuilder] Positioning node ${nodeData.id}:`, {
                          originalPosition: nodeData.position,
                          aiAgentInModal: aiAgentPosition || { x: 400, y: 200 },
                          aiAgentInWorkflow: aiAgentNode.position,
                          offset: { x: offsetX, y: offsetY },
                          finalPosition: {
                            x: nodeData.position.x + offsetX,
                            y: nodeData.position.y + offsetY
                          }
                        });
                        
                        const newNode = {
                          id: newNodeId,
                          type: 'custom',
                          position: {
                            x: nodeData.position.x + offsetX,
                            y: nodeData.position.y + offsetY
                          },
                          data: {
                            title: nodeData.title || actionComponent?.title || nodeData.type,
                            description: nodeData.description || actionComponent?.description || '',
                            type: nodeData.type,
                            providerId: nodeData.providerId,
                            config: nodeData.config || {},
                            onConfigure: (id: string) => handleConfigureNode(id),
                            onDelete: (id: string) => handleDeleteNodeWithConfirmation(id),
                            onRename: (id: string, newTitle: string) => handleRenameNode(id, newTitle),
                            onAddChain: undefined,
                            isAIAgentChild: true,
                            parentAIAgentId: actualAIAgentId,
                            originalNodeId: nodeData.id // Keep track of original ID for edge mapping
                          }
                        };
                        
                        newNodesToAdd.push(newNode);
                      });
                      
                      // Create edges based on the original edge structure
                      const nodeIdMap = new Map();
                      newNodesToAdd.forEach(node => {
                        nodeIdMap.set(node.data.originalNodeId, node.id);
                      });
                      
                      // Track which nodes are first in their chains (directly connected to AI Agent)
                      const chainStartNodes = new Set();
                      
                      chainsToProcess.edges.forEach((edgeData: any) => {
                        const sourceId = edgeData.source === 'ai-agent' ? actualAIAgentId : nodeIdMap.get(edgeData.source);
                        const targetId = nodeIdMap.get(edgeData.target);
                        
                        // If source is AI Agent, mark target as chain start
                        if (edgeData.source === 'ai-agent' && targetId) {
                          chainStartNodes.add(targetId);
                        }
                        
                        if (sourceId && targetId) {
                          const edgeId = `edge-${sourceId}-${targetId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                          const newEdge = {
                            id: edgeId,
                            source: sourceId,
                            target: targetId,
                            type: 'custom',
                            animated: true,
                            style: { stroke: '#94a3b8', strokeWidth: 2 },
                            data: {
                              onAddNode: (pos: { x: number, y: number }) => {
                                handleAddNodeBetween(sourceId, targetId, pos);
                              }
                            }
                          };
                          newEdgesToAdd.push(newEdge);
                        }
                      });
                      
                      // Add "Add Action" nodes at the end of each chain
                      // First, group nodes by chain based on edges from AI Agent
                      const chainGroups = new Map(); // chainStartNodeId -> array of nodes in chain
                      const processedInChain = new Set();
                      
                      console.log('🔗 [WorkflowBuilder] Chain start nodes:', Array.from(chainStartNodes));
                      console.log('🔗 [WorkflowBuilder] All new edges:', newEdgesToAdd);
                      
                      // Process each chain starting from nodes directly connected to AI Agent
                      // Convert chainStartNodes to array and sort by X position to ensure consistent ordering
                      const chainStartArray = Array.from(chainStartNodes).sort((a, b) => {
                        const nodeA = newNodesToAdd.find(n => n.id === a);
                        const nodeB = newNodesToAdd.find(n => n.id === b);
                        return (nodeA?.position.x || 0) - (nodeB?.position.x || 0);
                      });
                      
                      chainStartArray.forEach((chainStartId, chainIndex) => {
                        if (!chainGroups.has(chainStartId)) {
                          chainGroups.set(chainStartId, []);
                        }
                        
                        // Follow the chain from this start node
                        let currentId = chainStartId;
                        const chainNodes = [];
                        
                        while (currentId && !processedInChain.has(currentId)) {
                          const node = newNodesToAdd.find(n => n.id === currentId);
                          if (node && node.type !== 'addAction') {
                            // Add parentChainIndex metadata to the node
                            node.data.parentChainIndex = chainIndex;
                            chainNodes.push(node);
                            processedInChain.add(currentId);
                            
                            // Find next node in chain
                            const nextEdge = newEdgesToAdd.find(e => 
                              e.source === currentId && 
                              e.target !== actualAIAgentId &&
                              !e.target.includes('add-action')
                            );
                            currentId = nextEdge?.target || null;
                          } else {
                            break;
                          }
                        }
                        
                        if (chainNodes.length > 0) {
                          chainGroups.set(chainStartId, chainNodes);
                        }
                      });
                      
                      // Add Add Action button at the end of each chain
                      console.log('🔗 [WorkflowBuilder] Chain groups found:', chainGroups.size, 'chains');
                      chainGroups.forEach((nodes, startId) => {
                        console.log(`  Chain starting at ${startId}: ${nodes.length} nodes`);
                      });
                      
                      // Determine expected number of chains from the layout data
                      const expectedChainCount = chainsToProcess.chains?.length || 2;
                      const placeholderPositions = chainsToProcess.chainPlaceholderPositions || [];
                      console.log(`🔗 [WorkflowBuilder] Expected ${expectedChainCount} chains from layout`);
                      console.log(`🔗 [WorkflowBuilder] Placeholder positions:`, placeholderPositions);
                      
                      // Process all chains, including empty ones
                      for (let chainIndex = 0; chainIndex < expectedChainCount; chainIndex++) {
                        // Find nodes for this chain index in chainGroups
                        const chainNodes = Array.from(chainGroups.values())[chainIndex] || [];
                        
                        if (chainNodes.length > 0) {
                          // Chain has actions - add Add Action after last node
                          const lastNode = chainNodes[chainNodes.length - 1];
                          const addActionId = `add-action-${actualAIAgentId}-chain${chainIndex}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                          
                          const addActionNode = {
                            id: addActionId,
                            type: 'addAction',
                            position: {
                              x: lastNode.position.x,
                              y: lastNode.position.y + layoutConfig.verticalSpacing
                            },
                            data: {
                              parentId: lastNode.id,
                              parentAIAgentId: actualAIAgentId,
                              parentChainIndex: chainIndex,
                              isChainAddAction: true,
                              onClick: () => handleAddActionClick(addActionId, lastNode.id)
                            }
                          };
                          
                          newNodesToAdd.push(addActionNode);
                          
                          // Add edge to Add Action node
                          const edgeToAddAction = {
                            id: `e-${lastNode.id}-${addActionId}`,
                            source: lastNode.id,
                            target: addActionId,
                            type: 'straight',
                            animated: true,
                            style: {
                              stroke: '#b1b1b7',
                              strokeWidth: 2,
                              strokeDasharray: '5,5'
                            }
                          };
                          newEdgesToAdd.push(edgeToAddAction);
                        } else if (placeholderPositions[chainIndex]) {
                          // Empty chain with placeholder position - create Add Action at placeholder position
                          const placeholderPos = placeholderPositions[chainIndex];
                          const offsetX = aiAgentNode.position.x - (aiAgentPosition?.x || 400);
                          const offsetY = aiAgentNode.position.y - (aiAgentPosition?.y || 200);
                          
                          const addActionId = `add-action-${actualAIAgentId}-chain${chainIndex}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                          
                          const addActionNode = {
                            id: addActionId,
                            type: 'addAction',
                            position: {
                              x: placeholderPos.x + offsetX,
                              y: placeholderPos.y + offsetY
                            },
                            data: {
                              parentId: actualAIAgentId,
                              parentAIAgentId: actualAIAgentId,
                              parentChainIndex: chainIndex,
                              isChainAddAction: true,
                              isChainStart: true,
                              onClick: () => handleAddActionClick(addActionId, actualAIAgentId)
                            }
                          };
                          
                          newNodesToAdd.push(addActionNode);
                          
                          // Add edge from AI Agent to Add Action
                          const edgeToAddAction = {
                            id: `e-${actualAIAgentId}-${addActionId}`,
                            source: actualAIAgentId,
                            target: addActionId,
                            type: 'straight',
                            animated: true,
                            style: {
                              stroke: '#b1b1b7',
                              strokeWidth: 2,
                              strokeDasharray: '5,5'
                            }
                          };
                          newEdgesToAdd.push(edgeToAddAction);
                        }
                      }
                      
                      // Add all new nodes to the current nodes
                      const finalNodes = [...currentNodes, ...newNodesToAdd];
                      
                      // Update edges after nodes are added
                      setTimeout(() => {
                        setEdges((currentEdges) => [...currentEdges, ...newEdgesToAdd]);
                      }, 100);
                      
                      // Reset the processing flag
                      isProcessingChainsRef.current = false;
                      
                      return finalNodes;
                    } else if (chainsData && Array.isArray(chainsData) && chainsData.length > 0) {
                      // Fallback to old chain-based logic if we don't have full layout data
                      // For each chain, create the action nodes
                      console.log(`🔄 [WorkflowBuilder] Using fallback chain-based processing`);
                      console.log(`🔄 [WorkflowBuilder] Processing ${chainsData.length} chains`);
                      console.log(`🔄 [WorkflowBuilder] Chains data:`, JSON.stringify(chainsData, null, 2));
                      
                      chainsData.forEach((chain: any, chainIndex: number) => {
                      console.log(`🔄 [WorkflowBuilder] Processing chain ${chainIndex} with ${chain?.length || 0} actions:`, chain);
                      // Process all chains, even empty ones
                      if (Array.isArray(chain)) {
                        if (chain.length > 0) {
                        // Create separate chain with proper connection to AI Agent
                        let previousNodeId: string | null = null;
                        let lastPosition: { x: number; y: number } | null = null;
                        
                        // Create nodes for each action in the chain
                        chain.forEach((action, actionIndex) => {
                          const timestamp = Date.now();
                          const newNodeId = `${actualAIAgentId}-chain${chainIndex}-action${actionIndex}-${timestamp}-${actionIndex}`;
                          const actionComponent = ALL_NODE_COMPONENTS.find(n => n.type === action.type);
                          
                          // Use the position from the AI Agent builder if available
                          let nodePosition: { x: number; y: number };
                          if (action.position) {
                            // Use exact position from AI Agent builder, adjusted for AI Agent's position in main workflow
                            // The position is relative to where the AI Agent was in the modal (400, 200)
                            nodePosition = {
                              x: action.position.x + (aiAgentNode.position.x - (aiAgentPosition?.x || 400)),
                              y: action.position.y + (aiAgentNode.position.y - (aiAgentPosition?.y || 200))
                            };
                          } else {
                            // Fallback to calculated position
                            const baseX = aiAgentNode.position.x + (chainIndex + 1) * 250;
                            const baseY = aiAgentNode.position.y + 150;
                            nodePosition = {
                              x: baseX,
                              y: baseY + (actionIndex * 200)
                            };
                          }
                          
                          const newNode = {
                            id: newNodeId,
                            type: 'custom',
                            position: nodePosition,
                            data: {
                              title: action.title || actionComponent?.title || action.type,
                              description: action.description || actionComponent?.description || '',
                              type: action.type,
                              providerId: action.providerId,
                              config: action.config || {},
                              onConfigure: (id: string) => handleConfigureNode(id),
                              onDelete: (id: string) => handleDeleteNodeWithConfirmation(id),
                              onRename: (id: string, newTitle: string) => handleRenameNode(id, newTitle),
                              onAddChain: undefined,
                              isAIAgentChild: true,
                              parentAIAgentId: actualAIAgentId,
                              parentChainIndex: chainIndex
                            }
                          };
                          
                          console.log(`🔄 [WorkflowBuilder] Creating node for action:`, action, 'as node:', newNode);
                          newNodesToAdd.push(newNode);
                          
                          // Create edge - first node connects to AI Agent, rest connect to previous
                          if (actionIndex === 0) {
                            // First action in chain connects to AI Agent
                            // Use a more unique ID with chain index, action index, timestamp and random component
                            const edgeId = `edge-aiagent-chain${chainIndex}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
                            const newEdge = {
                              id: edgeId,
                              source: actualAIAgentId,
                              target: newNodeId,
                              type: 'custom',
                              animated: true,
                              style: { stroke: '#94a3b8', strokeWidth: 2 },
                              data: {
                                onAddNode: (pos: { x: number, y: number }) => {
                                  handleAddNodeBetween(actualAIAgentId, newNodeId, pos);
                                }
                              }
                            };
                            newEdgesToAdd.push(newEdge);
                          } else if (previousNodeId) {
                            // Subsequent actions connect to previous action
                            const edgeId = `edge-chain${chainIndex}-link${actionIndex}-${timestamp}-${Math.random().toString(36).substr(2, 9)}`;
                            const newEdge = {
                              id: edgeId,
                              source: previousNodeId!,
                              target: newNodeId,
                              type: 'custom',
                              animated: true,
                              style: { stroke: '#94a3b8', strokeWidth: 2 },
                              data: {
                                onAddNode: (pos: { x: number, y: number }) => {
                                  handleAddNodeBetween(previousNodeId!, newNodeId, pos);
                                }
                              }
                            };
                            newEdgesToAdd.push(newEdge);
                          }
                          
                          previousNodeId = newNodeId;
                          lastPosition = nodePosition;
                        });
                        
                        // Step 3: For each chain's final action node, verify an AddAction node exists
                        // Add an "Add Action" node at the end of each chain
                        if (previousNodeId && lastPosition) {
                          console.log(`🔄 [WorkflowBuilder] Creating Add Action for chain ${chainIndex}, last node: ${previousNodeId}`);
                          
                          const addActionTimestamp = Date.now() + chainIndex * 100; // Ensure uniqueness with chainIndex offset
                          const randomId = Math.random().toString(36).substr(2, 9);
                          const addActionId = `add-action-${actualAIAgentId}-chain${chainIndex}-${addActionTimestamp}-${randomId}`;
                          const addActionNode = {
                            id: addActionId,
                            type: 'addAction',
                            position: { 
                              x: (lastPosition as { x: number; y: number }).x, 
                              y: (lastPosition as { x: number; y: number }).y + 160 
                            },
                            data: {
                              parentId: previousNodeId,
                              // Don't mark Add Action nodes as AI agent children so they don't get filtered out
                              // isAIAgentChild: true,  // REMOVED - this causes them to be deleted on next save
                              parentAIAgentId: actualAIAgentId,
                              parentChainIndex: chainIndex,
                              isChainAddAction: true,  // Mark this as a chain Add Action for identification
                              onClick: () => {
                                // Use the Add Action node's own ID and its parent ID
                                handleAddActionClick(addActionId, previousNodeId || '');
                              }
                            }
                          };
                          newNodesToAdd.push(addActionNode);
                          console.log(`🔄 [WorkflowBuilder] Created Add Action node for chain ${chainIndex}: ${addActionId} with parent AI Agent: ${actualAIAgentId}`);
                          
                          // Add edge to Add Action node - use unique timestamp and random for edge ID
                          const edgeRandomId = Math.random().toString(36).substr(2, 9);
                          const edgeToAddAction = {
                            id: `edge-to-addaction-${actualAIAgentId}-chain${chainIndex}-${addActionTimestamp}-${edgeRandomId}`,
                            source: previousNodeId,
                            target: addActionId,
                            type: 'straight',
                            animated: true,
                            style: { 
                              stroke: '#b1b1b7', 
                              strokeWidth: 2, 
                              strokeDasharray: '5,5' 
                            }
                          };
                          newEdgesToAdd.push(edgeToAddAction);
                        }
                        } else {
                          // Empty chain - create Add Action button directly connected to AI Agent
                          console.log(`🔄 [WorkflowBuilder] Creating Add Action for empty chain ${chainIndex}`);
                          
                          // Calculate position for the empty chain's Add Action
                          const baseX = aiAgentNode.position.x + (chainIndex * 250) + 150;
                          const baseY = aiAgentNode.position.y + 150;
                          
                          const addActionTimestamp = Date.now() + chainIndex * 100;
                          const randomId = Math.random().toString(36).substr(2, 9);
                          const addActionId = `add-action-${actualAIAgentId}-chain${chainIndex}-${addActionTimestamp}-${randomId}`;
                          
                          const addActionNode = {
                            id: addActionId,
                            type: 'addAction',
                            position: { 
                              x: baseX, 
                              y: baseY
                            },
                            data: {
                              parentId: actualAIAgentId,
                              parentAIAgentId: actualAIAgentId,
                              parentChainIndex: chainIndex,
                              isChainAddAction: true,
                              isChainStart: true, // Mark as start of chain
                              onClick: () => {
                                handleAddActionClick(addActionId, actualAIAgentId);
                              }
                            }
                          };
                          newNodesToAdd.push(addActionNode);
                          console.log(`🔄 [WorkflowBuilder] Created Add Action node for empty chain ${chainIndex}: ${addActionId}`);
                          
                          // Add edge from AI Agent to Add Action
                          const edgeRandomId = Math.random().toString(36).substr(2, 9);
                          const edgeToAddAction = {
                            id: `edge-to-addaction-${actualAIAgentId}-chain${chainIndex}-${addActionTimestamp}-${edgeRandomId}`,
                            source: actualAIAgentId,
                            target: addActionId,
                            type: 'straight',
                            animated: true,
                            style: { 
                              stroke: '#b1b1b7', 
                              strokeWidth: 2, 
                              strokeDasharray: '5,5' 
                            }
                          };
                          newEdgesToAdd.push(edgeToAddAction);
                        }
                      }
                    });
                    
                    // Log summary and verify we have one Add Action per chain
                    const addActionNodesCreated = newNodesToAdd.filter(n => n.type === 'addAction');
                    console.log(`🔄 [WorkflowBuilder] Created ${addActionNodesCreated.length} Add Action nodes for ${chainsData.length} chains`);
                    
                    // Verify each chain has exactly one Add Action node
                    const chainAddActionCounts: Record<number, number> = {};
                    addActionNodesCreated.forEach(n => {
                      const chainIdx = n.data.parentChainIndex;
                      chainAddActionCounts[chainIdx] = (chainAddActionCounts[chainIdx] || 0) + 1;
                      console.log(`  - Add Action node: ${n.id} for chain ${chainIdx}`);
                    });
                    
                    // Check if any chain is missing an Add Action node
                    for (let i = 0; i < chainsData.length; i++) {
                      if (!chainAddActionCounts[i]) {
                        console.warn(`⚠️ [WorkflowBuilder] Chain ${i} is missing an Add Action node!`);
                      } else if (chainAddActionCounts[i] > 1) {
                        console.warn(`⚠️ [WorkflowBuilder] Chain ${i} has ${chainAddActionCounts[i]} Add Action nodes (should be 1)`);
                      }
                    }
                    
                    // Update nodes - remove existing AI Agent children and add new ones
                    console.log(`🔄 [WorkflowBuilder] Adding ${newNodesToAdd.length} nodes and ${newEdgesToAdd.length} edges`);
                    
                    // First remove any existing AI Agent child nodes and Add Action nodes
                    // Use the actual AI Agent node ID found above
                    console.log(`🔄 [WorkflowBuilder] Filtering nodes for AI Agent: ${actualAIAgentId}`);
                    
                    // Log all Add Action nodes before filtering
                    const allAddActionNodes = currentNodes.filter(n => n.type === 'addAction');
                    console.log(`🔄 [WorkflowBuilder] All Add Action nodes before filtering:`, allAddActionNodes.map(n => ({
                      id: n.id,
                      parentAIAgentId: n.data?.parentAIAgentId,
                      parentId: n.data?.parentId,
                      chainIndex: n.data?.parentChainIndex
                    })));
                    
                    // Create a set of new node IDs we're about to add
                    const newNodeIds = new Set(newNodesToAdd.map(n => n.id));
                    
                    const removedNodes: any[] = [];
                    const filteredNodes = currentNodes.filter(n => {
                      // Don't remove nodes we're about to add (prevents removing nodes we just created)
                      if (newNodeIds.has(n.id)) {
                        return true;
                      }
                      
                      // Remove OLD AI Agent child nodes (but not the ones we're adding now)
                      if (n.data?.isAIAgentChild && n.data?.parentAIAgentId === actualAIAgentId) {
                        // Only remove if it's not in our new nodes list
                        removedNodes.push({ id: n.id, type: 'Old AI Agent child' });
                        return false;
                      }
                      
                      // Don't remove any Add Action nodes here - they'll be handled separately
                      // Add Action nodes are the "+" buttons that allow extending chains
                      // We need to keep them to maintain the chain structure
                      if (n.type === 'addAction') {
                        return true; // Keep all Add Action nodes
                      }
                      // Keep all other nodes
                      return true;
                    });
                    console.log(`🔄 [WorkflowBuilder] Removed ${removedNodes.length} nodes:`, removedNodes);
                    
                    // Log the Add Action nodes we're about to add
                    const newAddActionNodes = newNodesToAdd.filter(n => n.type === 'addAction');
                    console.log(`🔄 [WorkflowBuilder] New Add Action nodes to add:`, newAddActionNodes.map(n => ({
                      id: n.id,
                      parentAIAgentId: n.data?.parentAIAgentId,
                      parentId: n.data?.parentId,
                      chainIndex: n.data?.parentChainIndex
                    })));
                    
                    // Update the AI Agent node to remove onAddChain
                    const updatedFilteredNodes = filteredNodes.map(node => {
                      if (node.id === actualAIAgentId) {
                        console.log(`🔄 [WorkflowBuilder] Updating AI Agent node ${actualAIAgentId} to remove onAddChain`);
                        // Preserve any existing hasChains flag from handleSaveConfiguration
                        return {
                          ...node,
                          data: {
                            ...node.data,
                            onAddChain: undefined,  // Remove the Add Chain button
                            hasChains: true,
                            chainCount: chainsData.length,
                            // Preserve the config that was saved
                            config: node.data?.config
                          }
                        };
                      }
                      return node;
                    });
                    
                    console.log(`🔄 [WorkflowBuilder] Filtered ${currentNodes.length - filteredNodes.length} existing AI Agent child nodes`);
                    // Then add new nodes
                    const updatedNodes = [...updatedFilteredNodes, ...newNodesToAdd];
                    console.log(`🔄 [WorkflowBuilder] Total nodes after update: ${updatedNodes.length}`);
                    
                    // Log final Add Action nodes in the updated nodes
                    const finalAddActionNodes = updatedNodes.filter(n => n.type === 'addAction');
                    console.log(`🔄 [WorkflowBuilder] Final Add Action nodes in workflow:`, finalAddActionNodes.map(n => ({
                      id: n.id,
                      parentAIAgentId: n.data?.parentAIAgentId,
                      chainIndex: n.data?.parentChainIndex
                    })));
                    
                    // Store edges to add them after nodes are updated
                    if (newEdgesToAdd.length > 0) {
                      setTimeout(() => {
                        setEdges((eds) => {
                          // Remove existing edges connected to AI Agent child nodes being removed
                          // But KEEP edges to/from Add Action nodes (plus buttons)
                          const filteredEdges = eds.filter(e => {
                            const sourceNode = currentNodes.find(n => n.id === e.source);
                            const targetNode = currentNodes.find(n => n.id === e.target);
                            
                            // Keep edges to/from Add Action nodes
                            if (sourceNode?.type === 'addAction' || targetNode?.type === 'addAction') {
                              return true;
                            }
                            
                            // Remove edges between AI agent child nodes (non-Add Action)
                            if (sourceNode?.data?.isAIAgentChild && sourceNode?.data?.parentAIAgentId === actualAIAgentId &&
                                targetNode?.data?.isAIAgentChild && targetNode?.data?.parentAIAgentId === actualAIAgentId) {
                              console.log(`🔄 [WorkflowBuilder] Removing edge between AI Agent children: ${e.id}`);
                              return false;
                            }
                            
                            // Remove edge from AI agent to its child nodes (non-Add Action)
                            if (sourceNode?.id === actualAIAgentId && 
                                targetNode?.data?.isAIAgentChild && 
                                targetNode?.data?.parentAIAgentId === actualAIAgentId) {
                              console.log(`🔄 [WorkflowBuilder] Removing edge from AI Agent to child: ${e.id}`);
                              return false;
                            }
                            
                            return true;
                          });
                          
                          // Deduplicate new edges before adding
                          const edgeIdSet = new Set(filteredEdges.map(e => e.id));
                          const uniqueNewEdges = newEdgesToAdd.filter(edge => {
                            if (edgeIdSet.has(edge.id)) {
                              console.log(`⚠️ [WorkflowBuilder] Skipping duplicate edge: ${edge.id}`);
                              return false;
                            }
                            edgeIdSet.add(edge.id);
                            return true;
                          });
                          
                          console.log(`🔄 [WorkflowBuilder] Adding ${uniqueNewEdges.length} edges to workflow`);
                          console.log(`🔄 [WorkflowBuilder] New edge IDs:`, uniqueNewEdges.map(e => e.id));
                          return [...filteredEdges, ...uniqueNewEdges];
                        });
                      }, 100);
                    }
                    
                    return updatedNodes;
                  }
                  
                  // If no branches matched, return unchanged nodes
                  return currentNodes;
                }); // End of setNodes
                    
                  // Auto-save after chains are added and update view
                  setTimeout(async () => {
                    // Auto-save the workflow with the chains
                    try {
                      await handleSave();
                      console.log('✅ [WorkflowBuilder] Workflow saved after adding AI Agent chains');
                    } catch (error) {
                      console.error('❌ [WorkflowBuilder] Failed to save workflow after adding chains:', error);
                      setHasUnsavedChanges(true);
                    }
                    
                    // Fit view to show all nodes with proper settings
                    try {
                      if (typeof fitView === 'function') {
                        fitView({ 
                          padding: 0.2,
                          includeHiddenNodes: false,
                          duration: 400,
                          maxZoom: 1,
                          minZoom: 0.1
                        });
                      } else {
                        console.log('⚠️ [WorkflowBuilder] fitView is not available');
                      }
                    } catch (error) {
                      console.log('❌ [WorkflowBuilder] Error fitting view:', error);
                    }
                    
                    const chainCount = chainsData?.length || 0;
                    toast({
                      title: "AI Agent Chains Added",
                      description: `${chainCount} chain(s) have been added to the workflow`
                    });
                    
                    // Reset the processing flag
                    isProcessingChainsRef.current = false;
                  }, 300);
                  } else {
                    // Reset flag if no chains to process
                    isProcessingChainsRef.current = false;
                  }
                }, 500); // Longer delay to ensure node is added to state
                
                // Close the modal after successful save
                setConfiguringNode(null);
                setPendingNode(null);
                
                // Ensure flag is reset after processing completes or if we exit early
                setTimeout(() => {
                  isProcessingChainsRef.current = false;
                }, 1000); // Reset after all processing should be complete
              }}
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
              onOpenActionDialog={() => setShowActionDialog(true)}
              onActionSelect={(callback) => {
                // Store the callback for when an action is selected from the main dialog
                setAiAgentActionCallback(() => callback)
              }}
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

      {/* Enhanced Execution History with Detailed Logging */}
      <ExecutionHistoryModal
        open={showExecutionHistory}
        onClose={() => setShowExecutionHistory(false)}
        workflowId={workflowId || ''}
        workflowName={workflowName}
      />

      {/* Sandbox Preview Panel */}
      <SandboxPreviewPanel
        isOpen={showSandboxPreview}
        onClose={() => setShowSandboxPreview(false)}
        interceptedActions={sandboxInterceptedActions}
        workflowName={workflowName}
        onClearActions={() => setSandboxInterceptedActions([])}
      />

      {/* Error Notification Popup */}
      {workflowId && <ErrorNotificationPopup workflowId={workflowId} />}
      
      {/* Integration Re-auth Notification - Only on workflow builder */}
      <ReAuthNotification />
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
