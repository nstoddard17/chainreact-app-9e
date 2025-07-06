"use client"

import React, { useEffect, useCallback, useState, useMemo, useRef } from "react"
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
import ConfigurationModal from "./ConfigurationModal"
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
import { IntegrationLoadingScreen, WorkflowLoadingScreen } from "@/components/ui/loading-screen"

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
  
  // Sort integrations to put logic first, then alphabetically
  return integrations.sort((a, b) => {
    if (a.id === 'logic') return -1
    if (b.id === 'logic') return 1
    return a.name.localeCompare(b.name)
  })
}

const nodeTypes: NodeTypes = {
  custom: CustomNode as React.ComponentType<NodeProps>,
  addAction: AddActionNode as React.ComponentType<NodeProps>,
}



const useWorkflowBuilderState = () => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const workflowId = searchParams.get("id")

  const { currentWorkflow, setCurrentWorkflow, fetchWorkflows, workflows, updateWorkflow } = useWorkflowStore()
  const { joinCollaboration, leaveCollaboration, collaborators } = useCollaborationStore()
  const { integrations, getConnectedProviders, fetchIntegrations, loading: integrationsLoading } = useIntegrationStore()

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

  const { toast } = useToast()
  const { trackWorkflowEmails } = useWorkflowEmailTracking()
  const availableIntegrations = useMemo(() => getIntegrationsFromNodes(), [])

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

  const isIntegrationConnected = useCallback((integrationId: string): boolean => {
    // Logic integration is always "connected" since it doesn't require authentication
    if (integrationId === 'logic') return true;
    
    // Use the integration store to check if this integration is connected
    const connectedProviders = getConnectedProviders();
    return connectedProviders.includes(integrationId);
  }, [getConnectedProviders])



  const handleChangeTrigger = useCallback(() => {
    // Store existing action nodes (non-trigger nodes) to preserve them
    const currentNodes = getNodes();
    const actionNodes = currentNodes.filter(node => 
      node.type === 'custom' && !node.data.isTrigger
    );
    
    // Store the action nodes temporarily in state so we can restore them after trigger selection
    // We'll use a ref or state to store these
    sessionStorage.setItem('preservedActionNodes', JSON.stringify(actionNodes));
    
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
    setSourceAddNode({ id: nodeId, parentId })
    setSelectedIntegration(null)
    setSelectedAction(null)
    setSearchQuery("")
    setShowActionDialog(true)
  }, [])

  const recalculateLayout = useCallback(() => {
    const nodeList = getNodes()
      .filter((n: Node) => n.type === "custom" || n.type === "addAction")
      .sort((a: Node, b: Node) => a.position.y - b.position.y)
    if (nodeList.length === 0) return

    const triggerNode = nodeList.find((n: Node) => n.data?.isTrigger)
    const basePosition = triggerNode ? { x: triggerNode.position.x, y: triggerNode.position.y } : { x: 400, y: 100 }
    const verticalGap = 120
    let currentY = basePosition.y
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
    setTimeout(() => fitView({ padding: 0.5 }), 100)
  }, [getNodes, setNodes, setEdges, fitView])

  const handleDeleteNode = useCallback((nodeId: string) => {
    const allNodes = getNodes()
    const allEdges = getEdges()
    const nodeToRemove = allNodes.find((n) => n.id === nodeId)
    if (!nodeToRemove) return
    
    // If we're deleting the trigger or this is the last custom node, reset the workflow
    const customNodes = allNodes.filter((n: Node) => n.type === "custom")
    if (nodeToRemove.data.isTrigger || customNodes.length <= 1) {
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

  useEffect(() => {
    if (!workflows.length) fetchWorkflows()
  }, [fetchWorkflows, workflows.length])

  useEffect(() => {
    // Fetch integrations to ensure we have up-to-date connection status
    fetchIntegrations()
  }, [fetchIntegrations])

  useEffect(() => {
    if (workflowId && workflows.length > 0 && !currentWorkflow) {
      const foundWorkflow = workflows.find((w) => w.id === workflowId)
      if (foundWorkflow) setCurrentWorkflow(foundWorkflow)
    }
  }, [workflowId, workflows, currentWorkflow, setCurrentWorkflow])

  // Add a ref to track if we're in a save operation
  const isSavingRef = useRef(false)
  
  useEffect(() => {
    // Don't rebuild nodes if we're currently saving (to prevent visual disruption)
    if (isSavingRef.current) {
      return
    }
    
    if (currentWorkflow) {
      setWorkflowName(currentWorkflow.name)
      
      // Only rebuild nodes if we don't already have nodes (initial load) or if nodes have actually changed
      const currentNodeIds = getNodes().filter(n => n.type === 'custom').map(n => n.id).sort()
      const workflowNodeIds = (currentWorkflow.nodes || []).map(n => n.id).sort()
      const nodesChanged = JSON.stringify(currentNodeIds) !== JSON.stringify(workflowNodeIds)
      
      if (getNodes().length === 0 || nodesChanged) {
        const customNodes: Node[] = (currentWorkflow.nodes || []).map((node: WorkflowNode) => {
          // Get the component definition to ensure we have the correct title
          const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === node.data.type);
          
          return {
            id: node.id, 
            type: "custom", 
            position: node.position,
            data: {
              ...node.data,
              // Use title from multiple sources in order of preference 
              title: node.data.title || (nodeComponent ? nodeComponent.title : undefined),
              // Set name for backwards compatibility (used by UI)
              name: node.data.title || (nodeComponent ? nodeComponent.title : node.data.label || 'Unnamed Action'),
              description: node.data.description || (nodeComponent ? nodeComponent.description : undefined),
              onConfigure: handleConfigureNode,
              onDelete: handleDeleteNodeWithConfirmation,
              onChangeTrigger: node.data.type.includes('trigger') ? handleChangeTrigger : undefined,
              // Use the saved providerId directly, fallback to extracting from type if not available
              providerId: node.data.providerId || node.data.type.split('-')[0]
            },
          };
        })

        let allNodes: Node[] = [...customNodes]
        const lastNode = customNodes.length > 0 ? customNodes.sort((a,b) => b.position.y - a.position.y)[0] : null
        
        if(lastNode) {
            const addActionId = `add-action-${lastNode.id}`
            const addActionNode: Node = {
                id: addActionId, type: 'addAction', position: { x: lastNode.position.x, y: lastNode.position.y + 160 },
                data: { parentId: lastNode.id, onClick: () => handleAddActionClick(addActionId, lastNode.id) }
            }
            allNodes.push(addActionNode)
        }
        
        const initialEdges: Edge[] = (currentWorkflow.connections || []).map((conn: WorkflowConnection) => ({
          id: conn.id, source: conn.source, target: conn.target,
        }))
        
        if(lastNode && allNodes.find(n => n.type === 'addAction')) {
            const addNode = allNodes.find(n => n.type === 'addAction')!
            initialEdges.push({
                id: `${lastNode.id}->${addNode.id}`, source: lastNode.id, target: addNode.id, animated: true,
                style: { stroke: '#b1b1b7', strokeWidth: 2, strokeDasharray: '5,5' }, type: 'straight'
            })
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
    if (!sourceAddNode) return
    
    if (nodeNeedsConfiguration(action)) {
      // Store the pending action info and open configuration
      setPendingNode({ type: 'action', integration, nodeComponent: action, sourceNodeInfo: sourceAddNode });
      const integrationConfig = INTEGRATION_CONFIGS[integration.id as keyof typeof INTEGRATION_CONFIGS] || integration;
      
      setConfiguringNode({ 
        id: 'pending-action', 
        integration: integrationConfig, 
        nodeComponent: action, 
        config: {} 
      });
      setShowActionDialog(false);
    } else {
      // Add action directly if no configuration needed
      addActionToWorkflow(integration, action, {}, sourceAddNode);
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

      // Map to database format without losing React Flow properties
      const mappedNodes: WorkflowNode[] = reactFlowNodes.map((n: Node) => ({
        id: n.id, 
        type: 'custom', 
        position: n.position,
        data: { 
          label: n.data.label as string, 
          type: n.data.type as string, 
          config: n.data.config || {},
          // Preserve additional properties that might be needed
          providerId: n.data.providerId as string | undefined,
          isTrigger: n.data.isTrigger as boolean | undefined,
          title: n.data.title as string | undefined,
          description: n.data.description as string | undefined
        },
      }))
      
      const mappedConnections: WorkflowConnection[] = reactFlowEdges.map((e: Edge) => ({
        id: e.id, 
        source: e.source, 
        target: e.target,
        sourceHandle: e.sourceHandle ?? undefined, 
        targetHandle: e.targetHandle ?? undefined,
      }))

      console.log("Mapped nodes:", mappedNodes)
      console.log("Mapped connections:", mappedConnections)

      const updates: Partial<Workflow> = {
        name: workflowName, 
        description: currentWorkflow.description,
        nodes: mappedNodes, 
        connections: mappedConnections, 
        status: currentWorkflow.status,
      }

      console.log("Saving updates:", updates)

      // Save to database with better error handling
      await updateWorkflow(currentWorkflow.id, updates)
      
      // Update the current workflow state with the new data but keep React Flow intact
      setCurrentWorkflow({
        ...currentWorkflow,
        name: workflowName,
        nodes: mappedNodes,
        connections: mappedConnections
      })
      
      console.log("Save completed successfully")
      toast({ title: "Workflow Saved", description: "Your workflow has been successfully saved." })
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
    const config = INTEGRATION_CONFIGS[integrationId as keyof typeof INTEGRATION_CONFIGS]
    return <img 
      src={config?.logo || `/integrations/${integrationId}.svg`} 
      alt={`${integrationName} logo`} 
      className="w-10 h-10 object-contain" 
      style={{ filter: "drop-shadow(0px 1px 2px rgba(0, 0, 0, 0.05))" }}
    />
  }

  const filteredIntegrations = useMemo(() => {
    return availableIntegrations
      .filter(int => int.triggers.length > 0)
      .filter(int => {
        if (showConnectedOnly) {
          return isIntegrationConnected(int.id);
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
          (t.name && t.name.toLowerCase().includes(searchLower)) ||
          (t.description && t.description.toLowerCase().includes(searchLower)) ||
          (t.type && t.type.toLowerCase().includes(searchLower))
        );
        
        return integrationMatches || triggerMatches;
      });
  }, [availableIntegrations, searchQuery, filterCategory, showConnectedOnly]);
  
  const displayedTriggers = useMemo(() => {
    if (!selectedIntegration) return [];

    const searchLower = searchQuery.toLowerCase();
    if (!searchLower) return selectedIntegration.triggers;

    return selectedIntegration.triggers.filter((trigger) => {
      return (trigger.name && trigger.name.toLowerCase().includes(searchLower)) ||
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

    window.addEventListener('error', handleGlobalError)
    window.addEventListener('unhandledrejection', handleUnhandledRejection)

    return () => {
      window.removeEventListener('error', handleGlobalError)
      window.removeEventListener('unhandledrejection', handleUnhandledRejection)
    }
  }, [])

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

  return {
    nodes, edges, onNodesChange, onEdgesChange, onConnect, workflowName, setWorkflowName, isSaving, handleSave, handleExecute, showTriggerDialog,
    setShowTriggerDialog, showActionDialog, setShowActionDialog, handleTriggerSelect, handleActionSelect, selectedIntegration, setSelectedIntegration,
    availableIntegrations, renderLogo, getWorkflowStatus, currentWorkflow, isExecuting, executionEvents,
    configuringNode, setConfiguringNode, handleSaveConfiguration, collaborators, pendingNode, setPendingNode,
    selectedTrigger, setSelectedTrigger, selectedAction, setSelectedAction, searchQuery, setSearchQuery, filterCategory, setFilterCategory, showConnectedOnly, setShowConnectedOnly,
    filteredIntegrations, displayedTriggers, deletingNode, setDeletingNode, confirmDeleteNode, isIntegrationConnected, integrationsLoading, testMode, setTestMode, handleResetLoadingStates
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
  
  const {
    nodes, edges, onNodesChange, onEdgesChange, onConnect, workflowName, setWorkflowName, isSaving, handleSave, handleExecute, 
    showTriggerDialog, setShowTriggerDialog, showActionDialog, setShowActionDialog, handleTriggerSelect, handleActionSelect, selectedIntegration, setSelectedIntegration,
    availableIntegrations, renderLogo, getWorkflowStatus, currentWorkflow, isExecuting, executionEvents,
    configuringNode, setConfiguringNode, handleSaveConfiguration, collaborators, pendingNode, setPendingNode,
    selectedTrigger, setSelectedTrigger, selectedAction, setSelectedAction, searchQuery, setSearchQuery, filterCategory, setFilterCategory, showConnectedOnly, setShowConnectedOnly,
    filteredIntegrations, displayedTriggers, deletingNode, setDeletingNode, confirmDeleteNode, isIntegrationConnected, integrationsLoading, testMode, setTestMode, handleResetLoadingStates
  } = useWorkflowBuilderState()

  const categories = useMemo(() => {
    const allCategories = availableIntegrations
      .filter(int => int.triggers.length > 0)
      .map(int => int.category);
    return ['all', ...Array.from(new Set(allCategories))];
  }, [availableIntegrations]);

  const handleOpenTriggerDialog = () => {
    setSelectedIntegration(null);
    setSelectedTrigger(null);
    setSearchQuery("");
    setShowTriggerDialog(true);
  }

  if (!currentWorkflow) {
    return <WorkflowLoadingScreen />
  }

  if (integrationsLoading) {
    return <IntegrationLoadingScreen />
  }
  return (
    <div style={{ height: "calc(100vh - 65px)", position: "relative" }}>
      {/* Top UI - Always visible */}
      <div className="absolute top-0 left-0 right-0 z-10 pointer-events-none">
        <div className="flex justify-between items-start p-4 pointer-events-auto">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" onClick={() => router.push("/workflows")}><ArrowLeft className="w-5 h-5" /></Button>
            <Input value={workflowName} onChange={(e) => setWorkflowName(e.target.value)} onBlur={handleSave} className="text-xl font-semibold !border-none !outline-none !ring-0 p-0 bg-transparent" style={{ boxShadow: "none" }} />
          </div>
          <div className="flex items-center space-x-2">
            <Badge variant={getWorkflowStatus().variant}>{getWorkflowStatus().text}</Badge>
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
        <ReactFlow 
          nodes={nodes} 
          edges={edges} 
          onNodesChange={onNodesChange} 
          onEdgesChange={onEdgesChange} 
          onConnect={onConnect} 
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
      )}

      <Dialog open={showTriggerDialog} onOpenChange={setShowTriggerDialog}>
        <DialogContent className="max-w-4xl h-[75vh] flex flex-col p-0 bg-card rounded-lg shadow-2xl">
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
            <ScrollArea className="w-1/3 border-r border-border">
              <div className="py-2 px-3">
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
              <ScrollArea className="h-full">
                <div className="p-4">
                {selectedIntegration ? (
                  <div className="h-full">
                    <div className="grid grid-cols-1 gap-3">
                      {displayedTriggers.map((trigger) => (
                        <div
                          key={trigger.type}
                          className={`p-4 border rounded-lg cursor-pointer transition-all ${selectedTrigger?.type === trigger.type ? 'border-primary bg-primary/10 ring-1 ring-primary/20' : 'border-border hover:border-muted-foreground hover:shadow-sm'}`}
                          onClick={() => setSelectedTrigger(trigger)}
                          onDoubleClick={() => {
                            setSelectedTrigger(trigger)
                            if (selectedIntegration) {
                              handleTriggerSelect(selectedIntegration, trigger)
                            }
                          }}
                        >
                          <p className="font-medium">{trigger.name}</p>
                          <p className="text-sm text-muted-foreground mt-1">{trigger.description}</p>
                        </div>
                      ))}
                    </div>
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
                  {selectedTrigger && <span className="ml-4"><span className="font-medium">Trigger:</span> {selectedTrigger.name}</span>}
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

      <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
        <DialogContent className="max-w-4xl h-[75vh] flex flex-col p-0 bg-card rounded-lg shadow-2xl">
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
            <ScrollArea className="w-1/3 border-r border-border">
              <div className="py-2 px-3">
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
              <ScrollArea className="h-full">
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
                          
                          if (searchQuery) {
                            const query = searchQuery.toLowerCase()
                            return (action.title?.toLowerCase() || '').includes(query) || (action.description?.toLowerCase() || '').includes(query)
                          }
                          return true
                        })
                        .map((action) => (
                          <div
                            key={action.type}
                            className={`p-4 border rounded-lg cursor-pointer transition-all ${selectedAction?.type === action.type ? 'border-primary bg-primary/10 ring-1 ring-primary/20' : 'border-border hover:border-muted-foreground hover:shadow-sm'}`}
                            onClick={() => setSelectedAction(action)}
                            onDoubleClick={() => {
                              setSelectedAction(action)
                              if (selectedIntegration) {
                                handleActionSelect(selectedIntegration, action)
                              }
                            }}
                          >
                            <p className="font-medium">{action.title || 'Unnamed Action'}</p>
                            <p className="text-sm text-muted-foreground mt-1">{action.description || 'No description available'}</p>
                          </div>
                        ))}
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
                disabled={!selectedAction || !selectedIntegration}
                onClick={() => {
                  if (selectedIntegration && selectedAction) {
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
        <ConfigurationModal
          isOpen={!!configuringNode}
          onClose={() => {
            setConfiguringNode(null);
            setPendingNode(null);
            // Reopen the action selection modal when canceling configuration
            setShowActionDialog(true);
          }}
          onSave={(config) => handleSaveConfiguration(configuringNode, config)}
          nodeInfo={configuringNode.nodeComponent}
          integrationName={configuringNode.integration.name}
          initialData={configuringNode.config}
          workflowData={{ nodes, edges }}
          currentNodeId={configuringNode.id}
        />
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
    </div>
  )
}
