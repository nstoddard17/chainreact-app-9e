"use client"

import React, { useEffect, useCallback, useState, useRef, useMemo } from "react"
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
  type NodeChange,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { useWorkflowStore, WorkflowNode } from "@/stores/workflowStore"
import { useCollaborationStore } from "@/stores/collaborationStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import ConfigurationModal from "./ConfigurationModal"
import CustomNode from "./CustomNode"
import { AddActionNode } from "./AddActionNode"
import { CollaboratorCursors } from "./CollaboratorCursors"
import { ExecutionMonitor } from "./ExecutionMonitor"
import { ConflictResolutionDialog } from "./ConflictResolutionDialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { 
  Save, 
  Loader2, 
  Users, 
  Zap, 
  Play, 
  Settings, 
  History,
  Share2,
  Download,
  MoreVertical,
  Copy,
  Trash2,
  AlertCircle,
  ArrowLeft,
  Plus
} from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { ALL_NODE_COMPONENTS, NodeComponent } from "@/lib/workflows/availableNodes"
import { INTEGRATION_CONFIGS } from "@/lib/integrations/availableIntegrations"
import { useToast } from "@/hooks/use-toast"
import { motion } from "framer-motion"

// This function doesn't depend on component state, so it can be moved outside.
const getIntegrationsFromNodes = () => {
  const integrationMap: Record<
    string,
    {
      id: string
      name: string
      description: string
      category: string
      color: string
      triggers: NodeComponent[]
      actions: NodeComponent[]
    }
  > = {}

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
  custom: CustomNode as any,
  addAction: AddActionNode,
}

export default function CollaborativeWorkflowBuilder() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const workflowId = searchParams.get("id")

  const {
    currentWorkflow,
    selectedNode,
    setCurrentWorkflow,
    setSelectedNode,
    saveWorkflow,
    fetchWorkflows,
    workflows,
    addNode,
  } = useWorkflowStore()

  const {
    collaborationSession,
    activeCollaborators,
    pendingChanges,
    conflicts,
    executionEvents,
    joinCollaboration,
    leaveCollaboration,
    updateCursorPosition,
    updateSelectedNodes,
    applyChange,
    resolveConflict,
  } = useCollaborationStore()

  const { integrations } = useIntegrationStore()

  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[])
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[])
  const [saving, setSaving] = useState(false)
  const [enabling, setEnabling] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [testTriggers, setTestTriggers] = useState<string[]>([])
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [workflowName, setWorkflowName] = useState("")
  const [isEditingName, setIsEditingName] = useState(false)
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({})
  
  // New states for the guided approach
  const [showTriggerDialog, setShowTriggerDialog] = useState(false)
  const [showActionDialog, setShowActionDialog] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState<any | null>(null)
  const [sourceAddNode, setSourceAddNode] = useState<{ id: string, parentId: string } | null>(null)
  const [configuringNode, setConfiguringNode] = useState<{
    id: string
    integration: any
    nodeComponent: NodeComponent
    config: Record<string, any>
  } | null>(null)

  const { fitView } = useReactFlow()
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const cursorUpdateTimer = useRef<NodeJS.Timeout | null>(null)

  // Use refs to hold the latest nodes and edges for callbacks without creating dependency cycles
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  
  const availableIntegrations = useMemo(() => getIntegrationsFromNodes(), [])

  const { toast } = useToast()
  const [isSaving, setIsSaving] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [testExecutions, setTestExecutions] = useState<any[]>([])

  const handleConfigureNode = useCallback((nodeId: string) => {
    const nodeToConfigure = nodesRef.current.find(n => n.id === nodeId)
    if (!nodeToConfigure) return

    const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === nodeToConfigure.data.type)
    if (!nodeComponent?.configSchema || nodeComponent.configSchema.length === 0) return

    const integration = availableIntegrations.find(i => i.id === nodeToConfigure.data.providerId)
    if (integration && nodeComponent) {
      setConfiguringNode({
        id: nodeId,
        integration,
        nodeComponent,
        config: nodeToConfigure.data.config || {},
      })
    }
  }, [availableIntegrations, setConfiguringNode])

  const handleDeleteNode = useCallback((nodeId: string) => {
    const nodeToRemove = nodesRef.current.find(n => n.id === nodeId)
    if (!nodeToRemove) return

    if (nodeToRemove.data.isTrigger) {
      setNodes([])
      setEdges([])
      return
    }

    const incomingEdge = edgesRef.current.find(e => e.target === nodeId)
    const outgoingEdges = edgesRef.current.filter(e => e.source === nodeId)

    const newNodes = nodesRef.current.filter(n => n.id !== nodeId)
    let newEdges = edgesRef.current.filter(e => e.source !== nodeId && e.target !== nodeId)

    if (incomingEdge && outgoingEdges.length > 0) {
      const predecessorId = incomingEdge.source
      outgoingEdges.forEach(outgoingEdge => {
        const successorId = outgoingEdge.target
        newEdges.push({
          id: `${predecessorId}-${successorId}`,
          source: predecessorId,
          target: successorId,
          animated: true,
          style: {
            stroke: successorId.startsWith('add-action') ? '#b1b1b7' : '#8b5cf6',
            strokeWidth: 2,
            strokeDasharray: successorId.startsWith('add-action') ? '5,5' : undefined,
          },
          type: 'straight',
        })
      })
    }
    
    setNodes(newNodes)
    setEdges(newEdges)
  }, [setNodes, setEdges])

  const handleAddActionClick = useCallback((nodeId: string, parentId: string) => {
    setSourceAddNode({ id: nodeId, parentId })
    setShowActionDialog(true)
  }, [])

  const onNodesChangeCustom = useCallback((changes: NodeChange[]) => {
    const removeChange = changes.find(change => change.type === 'remove');

    if (removeChange) {
      const nodeIdToRemove = removeChange.id;
      const nodeToRemove = nodesRef.current.find(n => n.id === nodeIdToRemove);

      if (nodeToRemove && nodeToRemove.type === 'custom') {
        const incomingEdge = edgesRef.current.find(e => e.target === nodeIdToRemove);
        const outgoingEdge = edgesRef.current.find(e => e.source === nodeIdToRemove);
        const successorNode = outgoingEdge ? nodesRef.current.find(n => n.id === outgoingEdge.target) : undefined;

        if (incomingEdge && outgoingEdge && successorNode && successorNode.type === 'addAction') {
          const predecessorNode = nodesRef.current.find(n => n.id === incomingEdge.source);

          if (predecessorNode) {
            const newNodes = nodesRef.current
              .map(n => {
                if (n.id === successorNode.id) {
                  return { ...n, position: { x: predecessorNode.position.x, y: predecessorNode.position.y + 150 } };
                }
                return n;
              })
              .filter(n => n.id !== nodeIdToRemove);

            const newEdge: Edge = {
              id: `${predecessorNode.id}-${successorNode.id}`,
              source: predecessorNode.id,
              target: successorNode.id,
              animated: true,
              style: { stroke: '#b1b1b7', strokeWidth: 2, strokeDasharray: '5,5' },
              type: 'straight',
            };

            const newEdges = edgesRef.current.filter(e => e.id !== incomingEdge.id && e.id !== outgoingEdge.id);
            newEdges.push(newEdge);

            setNodes(newNodes);
            setEdges(newEdges);
            return;
          }
        }
      }
    }

    onNodesChange(changes);
  }, [onNodesChange, setNodes, setEdges]);

  const onNodeDragStop = useCallback((event: React.MouseEvent, node: Node) => {
    const sortedNodes = nodesRef.current
      .filter(n => n.type === 'custom' || n.type === 'addAction')
      .sort((a, b) => a.position.y - b.position.y)
    
    const draggedNodeIndex = sortedNodes.findIndex(n => n.id === node.id)
    if (draggedNodeIndex === -1) return

    // Find the new index based on Y position
    let newIndex = 0
    for (let i = 0; i < sortedNodes.length; i++) {
      if (i !== draggedNodeIndex) {
        if (node.position.y > sortedNodes[i].position.y) {
          newIndex = i > draggedNodeIndex ? i : i + 1
        }
      }
    }
    newIndex = Math.min(newIndex, sortedNodes.length - 1)

    if (newIndex === draggedNodeIndex) {
      // Node didn't change position, just snap it back
      const updatedNodes = nodesRef.current.map(n => {
        if (n.id === node.id) {
          return { ...n, position: sortedNodes[draggedNodeIndex].position }
        }
        return n
      })
      setNodes(updatedNodes)
      return
    }

    const newSortedNodes = [...sortedNodes]
    const [draggedNode] = newSortedNodes.splice(draggedNodeIndex, 1)
    newSortedNodes.splice(newIndex, 0, draggedNode)

    const basePosition = newSortedNodes[0].position
    const updatedNodes = newSortedNodes.map((n, index) => ({
      ...n,
      position: { x: basePosition.x, y: basePosition.y + index * 150 },
    }))

    const newEdges: Edge[] = []
    for (let i = 0; i < updatedNodes.length - 1; i++) {
      newEdges.push({
        id: `${updatedNodes[i].id}-${updatedNodes[i+1].id}`,
        source: updatedNodes[i].id,
        target: updatedNodes[i+1].id,
        animated: true,
        style: { 
          stroke: updatedNodes[i+1].type === 'addAction' ? '#b1b1b7' : '#8b5cf6',
          strokeWidth: 2, 
          strokeDasharray: updatedNodes[i+1].type === 'addAction' ? '5,5' : undefined 
        },
        type: 'straight'
      })
    }
    
    setNodes(nodesRef.current.map(n => updatedNodes.find(un => un.id === n.id) || n))
    setEdges(newEdges)

  }, [setNodes, setEdges])

  const renderLogo = (integrationId: string, integrationName: string) => {
    const logoPath = `/integrations/${integrationId}.svg`
    return (
      <img
        src={logoPath}
        alt={`${integrationName} logo`}
        className="w-7 h-7 object-contain"
      />
    )
  }

  // Join collaboration session when workflow loads
  useEffect(() => {
    if (workflowId && !collaborationSession) {
      joinCollaboration(workflowId)
    }

    return () => {
      if (collaborationSession) {
        leaveCollaboration()
      }
    }
  }, [workflowId, collaborationSession, joinCollaboration, leaveCollaboration])

  // Load workflow
  useEffect(() => {
    if (workflowId && workflows.length > 0) {
      const workflow = workflows.find((w) => w.id === workflowId)
      if (workflow) {
        setCurrentWorkflow(workflow)
        setWorkflowName(workflow.name || "Untitled Chain")
      }
    }
  }, [workflowId, workflows, setCurrentWorkflow])

  // Fetch workflows on mount
  useEffect(() => {
    const loadWorkflows = async () => {
      try {
        await fetchWorkflows()
      } catch (error) {
        console.error('Failed to fetch workflows:', error)
      }
    }
    loadWorkflows()
  }, [fetchWorkflows])

  // Update nodes and edges when current workflow changes
  useEffect(() => {
    if (currentWorkflow) {
      const reactFlowNodes = (currentWorkflow.nodes || []).map((node: any) => ({
        id: node.id,
        type: node.type || 'custom',
        position: node.position,
        data: {
          ...node.data,
          onConfigure: handleConfigureNode,
          onDelete: handleDeleteNode,
          onClick: node.type === 'addAction' ? () => handleAddActionClick(node.id, node.data.parentId) : undefined,
        }
      }))
      
      const reactFlowEdges = (currentWorkflow.connections || []).map((conn: any) => ({
        id: conn.id,
        source: conn.source,
        target: conn.target,
        sourceHandle: conn.sourceHandle,
        targetHandle: conn.targetHandle,
        animated: true,
        style: { stroke: conn.target.startsWith('add-action') ? '#b1b1b7' : '#8b5cf6', strokeWidth: 2, strokeDasharray: conn.target.startsWith('add-action') ? '5,5' : undefined } as React.CSSProperties
      }))
      
      setNodes(reactFlowNodes)
      setEdges(reactFlowEdges)
    }
  }, [currentWorkflow, handleConfigureNode, handleDeleteNode, setNodes, setEdges, handleAddActionClick])

  const handleSaveDraft = async () => {
    if (!currentWorkflow) return

    setIsSaving(true)
    try {
      // Create a version of the nodes and connections suitable for saving to the DB.
      // This means stripping out functions and other non-serializable data.
      const dbNodes = nodes.map(node => {
        const dataForDb: any = { ...node.data }
        delete dataForDb.onConfigure
        delete dataForDb.onDelete
        delete dataForDb.onClick
        delete dataForDb.icon

        return {
          id: node.id,
          type: node.type || 'custom',
          position: node.position,
          data: {
            // Ensure the base properties are present and correctly typed
            label: dataForDb.label || dataForDb.title || 'Untitled',
            type: dataForDb.type || 'custom',
            config: dataForDb.config || {},
            // Spread the rest of the serializable data
            ...dataForDb,
          },
        }
      })

      const dbConnections = edges.map(edge => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle || undefined,
        targetHandle: edge.targetHandle || undefined,
      }))

      const updatedWorkflow = {
        ...currentWorkflow,
        name: workflowName,
        nodes: dbNodes,
        connections: dbConnections,
      }
      
      // Update the store's current workflow without triggering a local re-render with incomplete data
      useWorkflowStore.setState({ currentWorkflow: updatedWorkflow })
      
      // Now call the actual save function which likely uses the store's state
      await saveWorkflow()

    } catch (error) {
      console.error("Failed to save workflow:", error)
    } finally {
      setIsSaving(false)
    }
  }

  const handleEnable = async () => {
    if (!currentWorkflow) return

    setEnabling(true)
    try {
      const updatedWorkflow = {
        ...currentWorkflow,
        name: workflowName,
        nodes: nodes.map(node => ({
          id: node.id,
          type: (node.data.type as string) || 'custom',
          position: node.position,
          data: {
            label: (node.data.title as string) || (node.data.label as string) || 'Untitled',
            type: (node.data.type as string) || 'custom',
            config: (node.data.config as Record<string, any>) || {}
          }
        })),
        connections: edges.map(edge => ({
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.sourceHandle || undefined,
          targetHandle: edge.targetHandle || undefined
        })),
        status: 'active'
      }
      
      setCurrentWorkflow(updatedWorkflow)
      await saveWorkflow()
    } catch (error) {
      console.error("Failed to enable workflow:", error)
    } finally {
      setEnabling(false)
    }
  }

  const handleExecute = async () => {
    if (!currentWorkflow) return
    setIsExecuting(true)
    try {
      const response = await fetch(`/api/workflows/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId }),
      })
      const result = await response.json()
      if (response.ok && result.success) {
        toast({
          title: "Success",
          description: "Workflow test executed successfully.",
        })
        // Add to history
        setTestExecutions(prev => [{ id: result.output?.executionId, status: 'Completed', timestamp: new Date() }, ...prev])
      } else {
        throw new Error(result.message || "Failed to execute workflow test.")
      }
    } catch (error: any) {
      console.error("Failed to execute workflow:", error)
      toast({
        title: "Error",
        description: `Workflow test failed: ${error.message}`,
        variant: "destructive",
      })
      // Add to history
      setTestExecutions(prev => [{ id: Date.now(), status: `Failed: ${error.message}`, timestamp: new Date() }, ...prev])
    } finally {
      setIsExecuting(false)
    }
  }

  const getWorkflowStatus = () => {
    if (executing) return { status: "running", color: "bg-blue-500" }
    if (nodes.length === 0) return { status: "draft", color: "bg-gray-400" }
    if (nodes.some(node => !node.data.status || node.data.status === "error")) return { status: "error", color: "bg-red-500" }
    if (nodes.every(node => node.data.status === "connected")) return { status: "ready", color: "bg-green-500" }
    return { status: "draft", color: "bg-yellow-500" }
  }

  const workflowStatus = getWorkflowStatus()

  // Get available integrations grouped by category
  const triggerIntegrations = availableIntegrations.filter(integration => integration.triggers.length > 0)

  const handleTriggerSelect = (integration: any, trigger: NodeComponent) => {
    if (trigger.configSchema && trigger.configSchema.length > 0) {
      // We set a temporary ID for triggers since we know it's a new node
      setConfiguringNode({ id: 'new-trigger', integration, nodeComponent: trigger, config: {} })
    } else {
      handleSaveConfiguration({ integration, nodeComponent: trigger, id: 'new-trigger', config: {} }, {})
    }
    setShowTriggerDialog(false)
  }

  const handleActionSelect = (integration: any, action: NodeComponent) => {
    if (!sourceAddNode) return

    // Don't add the node yet, just open the configuration modal
    // We set a temporary ID here, the actual ID is created on save
    setConfiguringNode({ id: 'new-action', integration, nodeComponent: action, config: {} })
    setShowActionDialog(false)
  }

  const handleSaveConfiguration = (
    context: { id: string; integration: any; nodeComponent: NodeComponent; config: Record<string, any> },
    newConfig: Record<string, any>,
  ) => {
    const { id, integration, nodeComponent } = context

    // Case 1: Updating an existing node
    if (id !== 'new-trigger' && id !== 'new-action') {
      setNodes(prevNodes =>
        prevNodes.map(node =>
          node.id === id
            ? {
                ...node,
                data: {
                  ...node.data,
                  config: newConfig,
                },
              }
            : node
        )
      )
      setConfiguringNode(null)
      return
    }

    // Case 2: Adding a new trigger node
    if (nodeComponent.isTrigger) {
      // Logic to add a new trigger node
      const triggerNodeId = crypto.randomUUID()
      const addActionNodeId = crypto.randomUUID()

      const triggerNode: Node = {
        id: triggerNodeId,
        type: "custom",
        position: { x: 400, y: 100 },
        data: {
          type: nodeComponent.type,
          title: nodeComponent.title,
          description: nodeComponent.description,
          icon: nodeComponent.icon,
          providerId: integration.id,
          isTrigger: nodeComponent.isTrigger,
          configSchema: nodeComponent.configSchema,
          config: newConfig,
          onConfigure: handleConfigureNode,
          onDelete: handleDeleteNode,
        },
      }

      const addActionNode: Node = {
        id: addActionNodeId,
        type: "addAction",
        position: { x: triggerNode.position.x, y: triggerNode.position.y + 150 },
        data: {
          onClick: () => handleAddActionClick(addActionNodeId, triggerNodeId),
        },
      }

      setNodes([triggerNode, addActionNode])
      setEdges([
        {
          id: crypto.randomUUID(),
          source: triggerNodeId,
          target: addActionNodeId,
          animated: true,
          style: { stroke: '#b1b1b7', strokeWidth: 2, strokeDasharray: '5,5' } as React.CSSProperties,
          type: 'straight',
        },
      ])
    } else {
      // Case 3: Adding a new action node
      if (!sourceAddNode) return

      const parentNode = nodes.find(n => n.id === sourceAddNode.parentId)
      if (!parentNode) return

      const addActionNode = nodes.find(n => n.id === sourceAddNode.id)
      if (!addActionNode) return

      const incomingEdge = edges.find(e => e.target === addActionNode.id)
      if (!incomingEdge) return

      const newNodeId = crypto.randomUUID()
      const newAddActionNodeId = crypto.randomUUID()

      const newNode: Node = {
        id: newNodeId,
        type: "custom",
        position: { x: parentNode.position.x, y: addActionNode.position.y },
        data: {
          type: nodeComponent.type,
          title: nodeComponent.title,
          description: nodeComponent.description,
          icon: nodeComponent.icon,
          providerId: integration.id,
          isTrigger: nodeComponent.isTrigger,
          configSchema: nodeComponent.configSchema,
          config: newConfig,
          onConfigure: handleConfigureNode,
          onDelete: handleDeleteNode,
        },
      }

      const newAddActionNode: Node = {
        id: newAddActionNodeId,
        type: "addAction",
        position: { x: parentNode.position.x, y: newNode.position.y + 150 },
        data: {
          onClick: () => handleAddActionClick(newAddActionNodeId, newNodeId),
        },
      }

      setNodes(prev => [...prev.filter(n => n.id !== addActionNode.id), newNode, newAddActionNode])

      const newEdgeToNewNode: Edge = {
        ...incomingEdge,
        id: crypto.randomUUID(),
        target: newNode.id,
        style: { stroke: "#8b5cf6", strokeWidth: 2 } as React.CSSProperties,
        animated: true,
        type: "straight",
      }

      const newEdgeToAddAction: Edge = {
        id: crypto.randomUUID(),
        source: newNode.id,
        target: newAddActionNode.id,
        animated: true,
        style: { stroke: "#b1b1b7", strokeWidth: 2, strokeDasharray: "5,5" } as React.CSSProperties,
        type: "straight",
      }

      setEdges(prev => [...prev.filter(e => e.id !== incomingEdge.id), newEdgeToNewNode, newEdgeToAddAction])
      setSourceAddNode(null)
    }

    setConfiguringNode(null)
    setSelectedIntegration(null)
    setTimeout(() => fitView({ duration: 300 }), 0)
  }

  if (!currentWorkflow) {
    return (
      <div className="h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Card className="p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">No workflow selected</h2>
          <p className="text-slate-600 mb-6">
            Create a new workflow or select an existing one to start building amazing automations
          </p>
          <Button className="w-full">
            Create New Workflow
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="h-screen bg-slate-50 flex flex-col">
        {/* Top Header */}
        <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm">
          {/* Left Section */}
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center space-x-3">
              <div className={cn("w-3 h-3 rounded-full", workflowStatus.color)} />
              {isEditingName ? (
                <Input
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  onBlur={() => setIsEditingName(false)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setIsEditingName(false)
                  }}
                  className="text-xl font-bold bg-transparent border-none p-0 h-auto focus-visible:ring-0"
                  autoFocus
                />
              ) : (
                <h1 
                  className="text-xl font-bold text-slate-900 cursor-pointer hover:text-slate-700"
                  onClick={() => setIsEditingName(true)}
                >
                  {workflowName}
                </h1>
              )}
            </div>
          </div>

          {/* Right Section */}
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              onClick={handleSaveDraft}
              disabled={saving || enabling}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Saving...
                </>
              ) : (
                "Save"
              )}
            </Button>
            <Button
              variant="outline"
              onClick={handleExecute}
              disabled={executing || nodes.length === 0}
            >
              {executing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Testing...
                </>
              ) : (
                "Test"
              )}
            </Button>
            
            <Button 
              onClick={handleEnable}
              disabled={saving || enabling}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {enabling ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Enabling...
                </>
              ) : "Enable"}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem>
                  <Share2 className="w-4 h-4 mr-2" />
                  Share Workflow
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <History className="w-4 h-4 mr-2" />
                  Version History
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem className="text-red-600">
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex">
          {/* Main Panel - Canvas */}
          <div className="flex-1 relative">
            {nodes.length === 0 ? (
              // Empty State - Start Your Chain
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center max-w-md">
                  <div
                    className="w-20 h-20 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center mx-auto mb-8 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setShowTriggerDialog(true)}
                  >
                    <Plus className="w-8 h-8 text-slate-400" />
                  </div>
                  <h2 className="text-3xl font-bold text-slate-900 mb-4">Start your Chain</h2>
                  <p className="text-lg text-slate-600 mb-8">
                    Chains start with a trigger – an event that kicks off your workflow
                  </p>
                  <Button
                    className="bg-slate-900 hover:bg-slate-800"
                    onClick={() => setShowTriggerDialog(true)}
                  >
                    Choose a trigger
                  </Button>
                </div>
              </div>
            ) : (
              // ReactFlow Canvas
              <div
                ref={reactFlowWrapper}
                className="w-full h-full"
              >
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodesChange={onNodesChangeCustom}
                  onEdgesChange={onEdgesChange}
                  onNodeDragStop={onNodeDragStop}
                  onNodeClick={(_event, node) => {
                    if (node && node.type) {
                      const nodeData = node.data as { label: string; type: string; config: Record<string, any> };
                      const workflowNode: WorkflowNode = {
                        id: node.id,
                        type: node.type,
                        position: node.position,
                        data: {
                          label: nodeData.label,
                          type: nodeData.type,
                          config: nodeData.config,
                        },
                      };
                      setSelectedNode(workflowNode);
                    } else {
                      setSelectedNode(null);
                    }
                  }}
                  nodeTypes={nodeTypes}
                  fitView
                  className="bg-slate-50"
                >
                  <Background 
                    variant={BackgroundVariant.Dots} 
                    gap={20} 
                    size={1} 
                    color="#cbd5e1"
                  />
                  <Controls 
                    className="bg-white shadow-lg border border-slate-200 rounded-lg"
                    showInteractive={false}
                  />
                  <CollaboratorCursors collaborators={activeCollaborators} />
                </ReactFlow>
              </div>
            )}
          </div>

          {/* Right Panel - Configuration has been removed */}
        </div>

        {/* Configuration Modal */}
        <ConfigurationModal
          isOpen={!!configuringNode}
          onClose={() => setConfiguringNode(null)}
          onSave={(config) => {
            if (configuringNode) {
              handleSaveConfiguration(configuringNode, config)
            }
          }}
          nodeInfo={configuringNode?.nodeComponent || null}
          initialData={configuringNode?.config || {}}
          integrationName={configuringNode?.integration?.name || ""}
        />

        {/* Trigger Selection Dialog */}
        <Dialog open={showTriggerDialog} onOpenChange={(isOpen) => {
          if (!isOpen) {
            setShowTriggerDialog(false);
            setSelectedIntegration(null);
          } else {
            setShowTriggerDialog(true);
          }
        }}>
          <DialogContent className={cn(
            "h-[70vh] flex flex-col",
            selectedIntegration ? "sm:max-w-md" : "max-w-4xl"
          )}>
            <DialogHeader>
              <DialogTitle>
                {selectedIntegration ? `Select a trigger for ${selectedIntegration.name}` : 'Select an Integration'}
              </DialogTitle>
              <DialogDescription>
                {selectedIntegration
                  ? 'Choose a trigger to start your workflow.'
                  : 'Choose an application to connect to.'}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-grow p-4 -mx-4">
              {!selectedIntegration ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {Object.values(INTEGRATION_CONFIGS)
                    .filter(integration =>
                      ALL_NODE_COMPONENTS.some(
                        node => node.providerId === integration.id && node.isTrigger
                      )
                    )
                    .map(integration => (
                      <Card
                        key={integration.id}
                        className="p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:shadow-lg transition-all"
                        onClick={() => setSelectedIntegration(integration)}
                      >
                        {renderLogo(integration.id, integration.name)}
                        <h3 className="mt-3 font-semibold">{integration.name}</h3>
                        <p className="text-xs text-slate-500 mt-1">{integration.description}</p>
                      </Card>
                    ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2 px-4">
                  <Button variant="ghost" onClick={() => setSelectedIntegration(null)} className="mb-2 -ml-4">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Integrations
                  </Button>
                  {ALL_NODE_COMPONENTS.filter(
                    component => component.providerId === selectedIntegration.id && component.isTrigger
                  ).map(component => (
                    <Card
                      key={component.type}
                      className="p-3 hover:bg-slate-50 cursor-pointer transition-all duration-150"
                      onClick={() => handleTriggerSelect(selectedIntegration, component)}
                    >
                      <div className="flex items-center gap-3">
                        {component.icon && React.createElement(component.icon, { className: "w-5 h-5" })}
                        <div>
                          <h4 className="font-semibold text-sm">{component.title}</h4>
                          <p className="text-xs text-slate-500">{component.description}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Action Selection Dialog */}
        <Dialog open={showActionDialog} onOpenChange={(isOpen) => {
          if (!isOpen) {
            setShowActionDialog(false);
            setSelectedIntegration(null);
          } else {
            setShowActionDialog(true);
          }
        }}>
          <DialogContent className={cn(
            "h-[70vh] flex flex-col",
            selectedIntegration ? "sm:max-w-md" : "max-w-4xl"
          )}>
            <DialogHeader>
              <DialogTitle>
                {selectedIntegration ? `Select an action for ${selectedIntegration.name}` : 'Select an Integration'}
              </DialogTitle>
              <DialogDescription>
                {selectedIntegration
                  ? 'Choose an action to perform after the previous step.'
                  : 'Choose an application to connect to.'}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="flex-grow p-4 -mx-4">
              {!selectedIntegration ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {Object.values(INTEGRATION_CONFIGS)
                    .filter(integration =>
                      ALL_NODE_COMPONENTS.some(
                        node => node.providerId === integration.id && !node.isTrigger
                      )
                    )
                    .map(integration => (
                      <Card
                        key={integration.id}
                        className="p-4 flex flex-col items-center justify-center text-center cursor-pointer hover:shadow-lg transition-all"
                        onClick={() => setSelectedIntegration(integration)}
                      >
                        {renderLogo(integration.id, integration.name)}
                        <h3 className="mt-3 font-semibold">{integration.name}</h3>
                        <p className="text-xs text-slate-500 mt-1">{integration.description}</p>
                      </Card>
                    ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2 px-4">
                  <Button variant="ghost" onClick={() => setSelectedIntegration(null)} className="mb-2 -ml-4">
                    <ArrowLeft className="w-4 h-4 mr-2" /> Back to Integrations
                  </Button>
                  {ALL_NODE_COMPONENTS.filter(
                    component => component.providerId === selectedIntegration.id && !component.isTrigger
                  ).map(component => (
                    <Card
                      key={component.type}
                      className="p-3 hover:bg-slate-50 cursor-pointer transition-all duration-150"
                      onClick={() => handleActionSelect(selectedIntegration, component)}
                    >
                      <div className="flex items-center gap-3">
                        {component.icon && React.createElement(component.icon, { className: "w-5 h-5" })}
                        <div>
                          <h4 className="font-semibold text-sm">{component.title}</h4>
                          <p className="text-xs text-slate-500">{component.description}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </DialogContent>
        </Dialog>

        {/* Execution Monitor */}
        {executionEvents.length > 0 && (
          <div className="h-48 border-t border-slate-200 bg-white">
            <ExecutionMonitor events={executionEvents} />
          </div>
        )}

        {/* Conflict Resolution Dialog */}
        {showConflictDialog && (
          <ConflictResolutionDialog
            open={showConflictDialog}
            onOpenChange={setShowConflictDialog}
            conflicts={conflicts}
            onResolve={resolveConflict}
          />
        )}

        {/* Status Messages */}
        {pendingChanges.length > 0 && (
          <div className="absolute bottom-4 left-4">
            <Alert className="bg-yellow-50 border-yellow-200">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <AlertDescription className="text-yellow-800">
                {pendingChanges.length} unsaved changes
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Test Runs */}
        <div className="mt-4 p-4 border rounded-lg bg-gray-50">
          <h3 className="text-lg font-semibold mb-2">Test Runs</h3>
          <div className="max-h-60 overflow-y-auto">
            {testExecutions.length === 0 ? (
              <p className="text-sm text-gray-500">No test runs yet. Click "Test" to see results.</p>
            ) : (
              <ul className="space-y-2">
                {testExecutions.map((run) => (
                  <li key={run.id} className="p-2 border rounded-md text-sm flex justify-between items-center">
                    <div>
                      <span className={`font-medium ${run.status === 'Completed' ? 'text-green-600' : 'text-red-600'}`}>{run.status}</span>
                      <p className="text-xs text-gray-500">{new Date(run.timestamp).toLocaleString()}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  )
}
