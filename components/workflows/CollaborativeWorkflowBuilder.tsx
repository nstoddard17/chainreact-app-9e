"use client"

import React, { useEffect, useCallback, useState, useMemo } from "react"
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
import ConfigurationModal from "./ConfigurationModal"
import CustomNode from "./CustomNode"
import { AddActionNode } from "./AddActionNode"
import { CollaboratorCursors } from "./CollaboratorCursors"
import { ExecutionMonitor, type ExecutionEvent } from "./ExecutionMonitor"
import { Button } from "@/components/ui/button"
import { Badge, type BadgeProps } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Save, Loader2, Play, ArrowLeft, Plus, Search, ChevronRight } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ALL_NODE_COMPONENTS, NodeComponent } from "@/lib/workflows/availableNodes"
import { INTEGRATION_CONFIGS } from "@/lib/integrations/availableIntegrations"
import { useToast } from "@/hooks/use-toast"
import { Card } from "@/components/ui/card"

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
  return Object.values(integrationMap)
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
  const [showInstalledOnly, setShowInstalledOnly] = useState(false)
  const [sourceAddNode, setSourceAddNode] = useState<{ id: string; parentId: string } | null>(null)
  const [configuringNode, setConfiguringNode] = useState<{ id: string; integration: any; nodeComponent: NodeComponent; config: Record<string, any> } | null>(null)
  const [pendingNode, setPendingNode] = useState<{ type: 'trigger' | 'action'; integration: IntegrationInfo; nodeComponent: NodeComponent; sourceNodeInfo?: { id: string; parentId: string } } | null>(null)
  const [deletingNode, setDeletingNode] = useState<{ id: string; name: string } | null>(null)

  const { toast } = useToast()
  const availableIntegrations = useMemo(() => getIntegrationsFromNodes(), [])

  const nodeNeedsConfiguration = (nodeComponent: NodeComponent): boolean => {
    // Check if the node has configuration fields that require user input
    return !!(nodeComponent.config && Object.keys(nodeComponent.config).length > 0)
  }

  const handleChangeTrigger = useCallback(() => {
    // Clear the current workflow and open trigger selection
    setNodes([])
    setEdges([])
    setSelectedIntegration(null);
    setSelectedTrigger(null);
    setSearchQuery("");
    setShowTriggerDialog(true);
  }, [setNodes, setEdges, setSelectedIntegration, setSelectedTrigger, setSearchQuery, setShowTriggerDialog])

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
    const nodeToRemove = getNodes().find((n) => n.id === nodeId)
    if (!nodeToRemove) return
    if (nodeToRemove.data.isTrigger || getNodes().filter((n: Node) => n.type === "custom").length <= 1) {
      setNodes([])
      setEdges([])
      return
    }
    setNodes((prevNodes: Node[]) => prevNodes.filter((n: Node) => n.id !== nodeId))
    setEdges((prevEdges: Edge[]) => prevEdges.filter((e: Edge) => e.source !== nodeId && e.target !== nodeId))
    if (nodeToRemove.type === "custom") {
      const edgeToNode = getEdges().find((e) => e.target === nodeId)
      if (edgeToNode) {
        setNodes((prevNodes: Node[]) => prevNodes.filter((n: Node) => !(n.type === "addAction" && n.id === edgeToNode.source)))
      }
    }
    setTimeout(recalculateLayout, 50)
  }, [getNodes, getEdges, setNodes, setEdges, recalculateLayout])

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
    return () => { if (workflowId) leaveCollaboration() }
  }, [workflowId, joinCollaboration, leaveCollaboration])

  useEffect(() => {
    if (!workflows.length) fetchWorkflows()
  }, [fetchWorkflows, workflows.length])

  useEffect(() => {
    if (workflowId && workflows.length > 0 && !currentWorkflow) {
      const foundWorkflow = workflows.find((w) => w.id === workflowId)
      if (foundWorkflow) setCurrentWorkflow(foundWorkflow)
    }
  }, [workflowId, workflows, currentWorkflow, setCurrentWorkflow])

  useEffect(() => {
    if (currentWorkflow) {
      setWorkflowName(currentWorkflow.name)
      const customNodes: Node[] = (currentWorkflow.nodes || []).map((node: WorkflowNode) => ({
        id: node.id, type: "custom", position: node.position,
        data: {
            ...node.data, 
            name: node.data.label, 
            onConfigure: handleConfigureNode,
            onDelete: handleDeleteNodeWithConfirmation,
            onChangeTrigger: node.data.type.includes('trigger') ? handleChangeTrigger : undefined,
            providerId: node.data.type.split('-')[0]
        },
      }))

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
    } else if (!workflowId) {
      setNodes([])
      setEdges([])
      // Don't automatically show the trigger dialog, let the user click the button
    }
  }, [currentWorkflow, fitView, handleAddActionClick, handleConfigureNode, handleDeleteNode, setCurrentWorkflow, setEdges, setNodes, workflowId])

  const handleTriggerSelect = (integration: IntegrationInfo, trigger: NodeComponent) => {
    console.log("Trigger selected:", trigger);
    
    if (nodeNeedsConfiguration(trigger)) {
      // Store the pending trigger info and open configuration
      setPendingNode({ type: 'trigger', integration, nodeComponent: trigger });
      setConfiguringNode({ 
        id: 'pending-trigger', 
        integration: INTEGRATION_CONFIGS[integration.id as keyof typeof INTEGRATION_CONFIGS] || integration, 
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
        name: trigger.name,
        isTrigger: true,
        onConfigure: handleConfigureNode,
        onDelete: handleDeleteNodeWithConfirmation,
        onChangeTrigger: handleChangeTrigger,
        providerId: integration.id,
        config
      }
    };
    
    const addActionNode: Node = {
      id: "add-action-1",
      type: "addAction",
      position: { x: 400, y: 220 },
      data: {
        parentId: "trigger",
        onClick: () => handleAddActionClick("add-action-1", "trigger")
      }
    };
    
    setNodes([triggerNode, addActionNode]);
    
    setEdges([{
      id: "trigger-add-action-1",
      source: "trigger",
      target: "add-action-1",
      animated: false,
      style: {
        stroke: "#d1d5db",
        strokeWidth: 1,
        strokeDasharray: "5,5"
      }
    }]);
    
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
      setConfiguringNode({ 
        id: 'pending-action', 
        integration: INTEGRATION_CONFIGS[integration.id as keyof typeof INTEGRATION_CONFIGS] || integration, 
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
      data: { ...action, name: action.name, onConfigure: handleConfigureNode, onDelete: handleDeleteNodeWithConfirmation, providerId: integration.id, config },
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
    setIsSaving(true)
    const reactFlowNodes = getNodes().filter((n: Node) => n.type === 'custom')
    const reactFlowEdges = getEdges().filter((e: Edge) => reactFlowNodes.some((n: Node) => n.id === e.source) && reactFlowNodes.some((n: Node) => n.id === e.target))

    const mappedNodes: WorkflowNode[] = reactFlowNodes.map((n: Node) => ({
      id: n.id, type: 'custom', position: n.position,
      data: { label: n.data.name as string, type: n.data.type as string, config: n.data.config || {} },
    }))
    const mappedConnections: WorkflowConnection[] = reactFlowEdges.map((e: Edge) => ({
      id: e.id, source: e.source, target: e.target,
      sourceHandle: e.sourceHandle ?? undefined, targetHandle: e.targetHandle ?? undefined,
    }))
    const updates: Partial<Workflow> = {
      name: workflowName, description: currentWorkflow.description,
      nodes: mappedNodes, connections: mappedConnections, status: currentWorkflow.status,
    }
    try {
      await updateWorkflow(currentWorkflow.id, updates)
      toast({ title: "Workflow Saved", description: "Your workflow has been successfully saved." })
    } catch (error) {
      console.error("Failed to save workflow:", error)
      toast({ title: "Error Saving Workflow", description: "Could not save your changes. Please try again.", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }

  const handleExecute = async () => { /* Placeholder */ }

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
        if (showInstalledOnly) {
          // Placeholder for installed app logic
          // This would need a way to know which integrations the user has installed/connected.
          return true; 
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
  }, [availableIntegrations, searchQuery, filterCategory, showInstalledOnly]);
  
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

  return {
    nodes, edges, onNodesChange, onEdgesChange, onConnect, workflowName, setWorkflowName, isSaving, handleSave, handleExecute, showTriggerDialog,
    setShowTriggerDialog, showActionDialog, setShowActionDialog, handleTriggerSelect, handleActionSelect, selectedIntegration, setSelectedIntegration,
    availableIntegrations, renderLogo, getWorkflowStatus, currentWorkflow, isExecuting, executionEvents,
    configuringNode, setConfiguringNode, handleSaveConfiguration, collaborators, pendingNode, setPendingNode,
    selectedTrigger, setSelectedTrigger, selectedAction, setSelectedAction, searchQuery, setSearchQuery, filterCategory, setFilterCategory, showInstalledOnly, setShowInstalledOnly,
    filteredIntegrations, displayedTriggers, deletingNode, setDeletingNode, confirmDeleteNode
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
    selectedTrigger, setSelectedTrigger, selectedAction, setSelectedAction, searchQuery, setSearchQuery, filterCategory, setFilterCategory, showInstalledOnly, setShowInstalledOnly,
    filteredIntegrations, displayedTriggers, deletingNode, setDeletingNode, confirmDeleteNode
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
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin" /></div>
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
                <TooltipTrigger asChild><Button onClick={handleExecute} disabled={isSaving || isExecuting} variant="default">{isExecuting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <Play className="w-5 h-5 mr-2" />}Execute</Button></TooltipTrigger>
                <TooltipContent><p>Execute the workflow</p></TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {nodes.length === 0 ? (
        // Empty state outside of ReactFlow
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background p-4">
          <div className="text-center max-w-md flex flex-col items-center">
            <div 
              className="w-20 h-20 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center mb-6 cursor-pointer hover:border-gray-400 hover:shadow-sm transition-all"
              onClick={handleOpenTriggerDialog}
            >
              <Plus className="h-10 w-10 text-gray-400 hover:text-gray-500" />
            </div>
            <h2 className="text-[32px] font-bold mb-2">Start your Chain</h2>
            <p className="text-gray-600 mb-8 text-center leading-relaxed text-lg">
              Chains start with a trigger – an event that kicks off<br />
              your workflow
            </p>
            <button 
              onClick={handleOpenTriggerDialog}
              className="bg-gray-900 text-white px-8 py-3 rounded-md hover:bg-gray-800 transition-colors font-medium text-lg shadow-sm hover:shadow"
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
            style: { strokeWidth: 1, stroke: '#d1d5db' },
            animated: false
          }}
          defaultViewport={{ x: 0, y: 0, zoom: 1.2 }}
        >
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} color="#e2e8f0" />
          <Controls className="left-4 bottom-4 top-auto" />
          <CollaboratorCursors collaborators={collaborators || []} />
          {isExecuting && executionEvents.length > 0 && <ExecutionMonitor events={executionEvents} />}
        </ReactFlow>
      )}

      <Dialog open={showTriggerDialog} onOpenChange={setShowTriggerDialog}>
        <DialogContent className="max-w-4xl h-[75vh] flex flex-col p-0 bg-white rounded-lg shadow-2xl">
          <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle className="text-xl font-bold">Select a Trigger</DialogTitle>
            <DialogDescription>Choose an integration and a trigger to start your workflow.</DialogDescription>
          </DialogHeader>
          
          <div className="px-6 py-4 border-b">
            <div className="flex items-center space-x-4">
              <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
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
                <Checkbox id="installed-apps" checked={showInstalledOnly} onCheckedChange={(checked) => setShowInstalledOnly(Boolean(checked))} />
                <Label htmlFor="installed-apps" className="whitespace-nowrap">Show only installed apps</Label>
              </div>
            </div>
          </div>

          <div className="flex-grow flex min-h-0 overflow-hidden">
            <ScrollArea className="w-1/3 border-r">
              <div className="py-2 px-3">
              {filteredIntegrations.map((integration) => (
                <div
                  key={integration.id}
                  className={`flex items-center p-3 rounded-md cursor-pointer ${selectedIntegration?.id === integration.id ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'}`}
                  onClick={() => setSelectedIntegration(integration)}
                >
                  {renderLogo(integration.id, integration.name)}
                  <span className="font-semibold ml-4 flex-grow">{integration.name}</span>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              ))}
              </div>
            </ScrollArea>
            <div className="w-2/3 h-full">
              <ScrollArea className="h-full">
                <div className="p-4">
                {selectedIntegration ? (
                  <div className="h-full max-h-[400px] overflow-y-auto">
                    <div className="grid grid-cols-1 gap-3">
                      {displayedTriggers.map((trigger) => (
                        <div
                          key={trigger.type}
                          className={`p-4 border rounded-lg cursor-pointer transition-all ${selectedTrigger?.type === trigger.type ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'hover:border-gray-300 hover:shadow-sm'}`}
                          onClick={() => setSelectedTrigger(trigger)}
                        >
                          <p className="font-medium">{trigger.name}</p>
                          <p className="text-sm text-gray-500 mt-1">{trigger.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <p>Select an integration to see its triggers</p>
                  </div>
                )}
                </div>
              </ScrollArea>
            </div>
          </div>
          
          <DialogFooter className="p-4 border-t bg-gray-50 flex justify-between items-center">
            <div>
              {selectedIntegration && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Integration:</span> {selectedIntegration.name}
                  {selectedTrigger && <span className="ml-4"><span className="font-medium">Trigger:</span> {selectedTrigger.name}</span>}
                </div>
              )}
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={() => setShowTriggerDialog(false)}>Cancel</Button>
              <Button 
                className="bg-blue-600 hover:bg-blue-700 text-white"
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
        <DialogContent className="max-w-4xl h-[75vh] flex flex-col p-0 bg-white rounded-lg shadow-2xl">
          <DialogHeader className="p-6 pb-4 border-b">
            <DialogTitle className="text-xl font-bold">Select an Action</DialogTitle>
            <DialogDescription>Choose an integration and an action to add to your workflow.</DialogDescription>
          </DialogHeader>
          
          <div className="px-6 py-4 border-b">
            <div className="flex items-center space-x-4">
              <div className="relative flex-grow">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
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
                <Checkbox id="installed-apps-actions" checked={showInstalledOnly} onCheckedChange={(checked) => setShowInstalledOnly(Boolean(checked))} />
                <Label htmlFor="installed-apps-actions" className="whitespace-nowrap">Show only installed apps</Label>
              </div>
            </div>
          </div>

          <div className="flex-grow flex min-h-0 overflow-hidden">
            <ScrollArea className="w-1/3 border-r">
              <div className="py-2 px-3">
              {availableIntegrations
                .filter(int => int.actions.length > 0)
                .filter(int => {
                  if (showInstalledOnly) {
                    return true; 
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
                  
                  const integrationMatches = int.name.toLowerCase().includes(searchLower) ||
                                           int.description.toLowerCase().includes(searchLower) ||
                                           int.category.toLowerCase().includes(searchLower);
                  
                  const actionMatches = int.actions.some(a => 
                    (a.name && a.name.toLowerCase().includes(searchLower)) ||
                    (a.description && a.description.toLowerCase().includes(searchLower)) ||
                    (a.type && a.type.toLowerCase().includes(searchLower))
                  );
                  
                  return integrationMatches || actionMatches;
                })
                .map((integration) => (
                <div
                  key={integration.id}
                  className={`flex items-center p-3 rounded-md cursor-pointer ${selectedIntegration?.id === integration.id ? 'bg-blue-50 ring-1 ring-blue-200' : 'hover:bg-gray-50'}`}
                  onClick={() => setSelectedIntegration(integration)}
                >
                  {renderLogo(integration.id, integration.name)}
                  <span className="font-semibold ml-4 flex-grow">{integration.name}</span>
                  <ChevronRight className="w-5 h-5 text-gray-400" />
                </div>
              ))}
              </div>
            </ScrollArea>
            <div className="w-2/3 h-full">
              <ScrollArea className="h-full">
                                <div className="p-4">
                {selectedIntegration ? (
                  <div className="h-full max-h-[400px] overflow-y-auto">
                    <div className="grid grid-cols-1 gap-3">
                      {selectedIntegration.actions
                        .filter((action) => {
                          if (!searchQuery) return true;
                          const searchLower = searchQuery.toLowerCase();
                          return (action.name && action.name.toLowerCase().includes(searchLower)) ||
                                 (action.description && action.description.toLowerCase().includes(searchLower)) ||
                                 (action.type && action.type.toLowerCase().includes(searchLower));
                        })
                        .map((action) => (
                         <div
                           key={action.type}
                           className={`p-4 border rounded-lg cursor-pointer transition-all ${selectedAction?.type === action.type ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'hover:border-gray-300 hover:shadow-sm'}`}
                           onClick={() => setSelectedAction(action)}
                         >
                           <p className="font-medium">{action.name}</p>
                           <p className="text-sm text-gray-500 mt-1">{action.description}</p>
                         </div>
                       ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <p>Select an integration to see its actions</p>
                  </div>
                )}
                </div>
              </ScrollArea>
            </div>
          </div>
          
          <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
            <div>
              {selectedIntegration && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium">Integration:</span> {selectedIntegration.name}
                  {selectedAction && <span className="ml-4"><span className="font-medium">Action:</span> {selectedAction.name}</span>}
                </div>
              )}
            </div>
            <div className="flex space-x-2">
              <Button variant="outline" onClick={() => setShowActionDialog(false)}>Cancel</Button>
              <Button 
                className="bg-blue-600 hover:bg-blue-700 text-white"
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

      {configuringNode && <ConfigurationModal
        isOpen={!!configuringNode}
        onClose={() => {
          setConfiguringNode(null);
          setPendingNode(null);
        }}
        onSave={(config) => handleSaveConfiguration(configuringNode, config)}
        nodeInfo={configuringNode.nodeComponent}
        integrationName={configuringNode.integration.name}
        initialData={configuringNode.config}
      />}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingNode} onOpenChange={(open) => !open && setDeletingNode(null)}>
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
