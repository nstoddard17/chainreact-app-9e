"use client"

import type React from "react"
import { useEffect, useCallback, useState, useRef } from "react"
import { useSearchParams } from "next/navigation"
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
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { useWorkflowStore } from "@/stores/workflowStore"
import { useCollaborationStore } from "@/stores/collaborationStore"
import NodePalette from "./NodePalette"
import ConfigurationPanel from "./ConfigurationPanel"
import CustomNode from "./CustomNode"
import { CollaboratorCursors } from "./CollaboratorCursors"
import { ExecutionMonitor } from "./ExecutionMonitor"
import { ConflictResolutionDialog } from "./ConflictResolutionDialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
// import { Separator } from "@/components/ui/separator"
import { 
  Save, 
  Loader2, 
  Users, 
  Zap, 
  Play, 
  Pause, 
  Settings, 
  Eye, 
  History,
  Share2,
  Download,
  Upload,
  Maximize2,
  Minimize2,
  Grid3X3,
  Layers,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  MoreVertical,
  Copy,
  Trash2,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  XCircle
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
import { cn } from "@/lib/utils"

const nodeTypes: NodeTypes = {
  custom: CustomNode,
}

export default function CollaborativeWorkflowBuilder() {
  const searchParams = useSearchParams()
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

  const [nodes, setNodes, onNodesChange] = useNodesState([] as Node[])
  const [edges, setEdges, onEdgesChange] = useEdgesState([] as Edge[])
  const [saving, setSaving] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState(false)
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false)
  const [showMiniMap, setShowMiniMap] = useState(true)
  const [workflowName, setWorkflowName] = useState("")
  const [isEditingName, setIsEditingName] = useState(false)

  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const cursorUpdateTimer = useRef<NodeJS.Timeout>()

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
        setWorkflowName(workflow.name || "Untitled Workflow")
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
  }, [])

  // Update nodes and edges when current workflow changes
  useEffect(() => {
    if (currentWorkflow) {
      // Convert WorkflowNode to ReactFlow Node
      const reactFlowNodes = (currentWorkflow.nodes || []).map((node: any) => ({
        id: node.id,
        type: 'custom',
        position: node.position,
        data: {
          ...node.data,
          title: node.data.label || node.data.type,
          type: node.data.type
        }
      }))
      
      // Convert WorkflowConnection to ReactFlow Edge
      const reactFlowEdges = (currentWorkflow.connections || []).map((conn: any) => ({
        id: conn.id,
        source: conn.source,
        target: conn.target,
        sourceHandle: conn.sourceHandle,
        targetHandle: conn.targetHandle,
        animated: true,
        style: { stroke: '#8b5cf6', strokeWidth: 2 }
      }))
      
      setNodes(reactFlowNodes)
      setEdges(reactFlowEdges)
    }
  }, [currentWorkflow, setNodes, setEdges])

  // Show conflict dialog when conflicts arise
  useEffect(() => {
    if (conflicts.length > 0) {
      setShowConflictDialog(true)
    }
  }, [conflicts])

  // Handle mouse movement for cursor tracking
  const handleMouseMove = useCallback(
    (event: React.MouseEvent) => {
      if (!collaborationSession) return

      // Throttle cursor updates
      if (cursorUpdateTimer.current) {
        clearTimeout(cursorUpdateTimer.current)
      }

      cursorUpdateTimer.current = setTimeout(() => {
        const rect = reactFlowWrapper.current?.getBoundingClientRect()
        if (rect) {
          const position = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          }
          updateCursorPosition(position)
        }
      }, 100)
    },
    [collaborationSession, updateCursorPosition],
  )

  const onConnect = useCallback(
    async (params: Connection) => {
      const newEdge: Edge = {
        id: `edge-${Date.now()}`,
        source: params.source!,
        target: params.target!,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle,
        animated: true,
        style: { stroke: '#8b5cf6', strokeWidth: 2 },
      }

      // Apply change through collaboration system
      if (collaborationSession) {
        const result = await applyChange("edge_add", {
          edge: newEdge,
        })

        if (result.success) {
          setEdges((eds) => addEdge(newEdge, eds))
        } else if (result.conflicts) {
          console.log("Edge add conflicts:", result.conflicts)
        }
      } else {
        setEdges((eds) => addEdge(newEdge, eds))
      }
    },
    [setEdges, collaborationSession, applyChange],
  )

  const onNodeClick = useCallback(
    async (event: React.MouseEvent, node: Node) => {
      setSelectedNode(node as any)

      if (collaborationSession) {
        await updateSelectedNodes([node.id])
      }
    },
    [setSelectedNode, collaborationSession, updateSelectedNodes],
  )

  const onPaneClick = useCallback(async () => {
    setSelectedNode(null)

    if (collaborationSession) {
      await updateSelectedNodes([])
    }
  }, [setSelectedNode, collaborationSession, updateSelectedNodes])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }, [])

  const onDrop = useCallback(
    async (event: React.DragEvent) => {
      event.preventDefault()

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect()
      const type = event.dataTransfer.getData("application/reactflow")
      const nodeData = JSON.parse(event.dataTransfer.getData("application/nodedata") || "{}")

      if (typeof type === "undefined" || !type || !reactFlowBounds) {
        return
      }

      const position = {
        x: event.clientX - reactFlowBounds.left - 100,
        y: event.clientY - reactFlowBounds.top - 50,
      }

      const newNode: Node = {
        id: `node-${Date.now()}`,
        type: "custom",
        position,
        data: {
          ...nodeData,
          type,
          title: nodeData.label || type,
          status: "disconnected",
        },
      }

      if (collaborationSession) {
        const result = await applyChange("node_add", {
          node: newNode,
        })

        if (result.success) {
          setNodes((nds) => nds.concat(newNode))
        }
      } else {
        setNodes((nds) => nds.concat(newNode))
      }
    },
    [setNodes, collaborationSession, applyChange],
  )

  const handleSave = async () => {
    if (!currentWorkflow) return

    setSaving(true)
    try {
      // First update the current workflow with the current nodes and edges
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
        }))
      }
      
      setCurrentWorkflow(updatedWorkflow)
      await saveWorkflow()
    } catch (error) {
      console.error("Failed to save workflow:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleExecute = async () => {
    if (!currentWorkflow) return

    setExecuting(true)
    try {
      const response = await fetch("/api/workflows/execute-advanced", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflowId: currentWorkflow.id,
          inputData: {},
          options: {
            enableParallel: true,
            maxConcurrency: 3,
            enableSubWorkflows: true,
          },
        }),
      })

      const result = await response.json()

      if (result.success) {
        // Show success notification
      } else {
        // Show error notification
      }
    } catch (error) {
      console.error("Failed to execute workflow:", error)
    } finally {
      setExecuting(false)
    }
  }

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen)
  }

  const getWorkflowStatus = () => {
    if (executing) return { status: "running", color: "bg-blue-500" }
    if (nodes.length === 0) return { status: "empty", color: "bg-gray-400" }
    if (nodes.some(node => !node.data.status || node.data.status === "error")) return { status: "error", color: "bg-red-500" }
    if (nodes.every(node => node.data.status === "connected")) return { status: "ready", color: "bg-green-500" }
    return { status: "draft", color: "bg-yellow-500" }
  }

  const workflowStatus = getWorkflowStatus()

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
            <Sparkles className="w-4 h-4 mr-2" />
            Create New Workflow
          </Button>
        </Card>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className={cn(
        "h-screen bg-slate-50 flex flex-col",
        isFullscreen && "fixed inset-0 z-50"
      )}>
        {/* Top Header */}
        <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shadow-sm">
          {/* Left Section */}
          <div className="flex items-center space-x-4">
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
              <Badge variant="outline" className="capitalize">
                {workflowStatus.status}
              </Badge>
            </div>
          </div>

          {/* Center Section - Collaborators */}
          {activeCollaborators.length > 0 && (
            <div className="flex items-center space-x-2">
              <Users className="w-4 h-4 text-slate-600" />
              <div className="flex -space-x-2">
                {activeCollaborators.slice(0, 3).map((collaborator, index) => (
                  <div
                    key={collaborator.id}
                    className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-600 border-2 border-white flex items-center justify-center text-white text-xs font-medium"
                    title={collaborator.user_name}
                  >
                                         {collaborator.user_name.charAt(0).toUpperCase()}
                  </div>
                ))}
                {activeCollaborators.length > 3 && (
                  <div className="w-8 h-8 rounded-full bg-slate-200 border-2 border-white flex items-center justify-center text-slate-600 text-xs">
                    +{activeCollaborators.length - 3}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Right Section */}
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowMiniMap(!showMiniMap)}
            >
              <Grid3X3 className="w-4 h-4" />
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>

            <div className="w-px h-6 bg-border" />

            <Button
              variant="outline"
              size="sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? "Saving..." : "Save"}
            </Button>

            <Button
              onClick={handleExecute}
              disabled={executing || nodes.length === 0}
              className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
            >
              {executing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Test Run
                </>
              )}
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
          {/* Left Panel - Node Palette */}
          <div className={cn(
            "transition-all duration-300 bg-white border-r border-slate-200",
            leftPanelCollapsed ? "w-12" : "w-80"
          )}>
            <div className="h-full flex flex-col">
              <div className="h-12 border-b border-slate-200 flex items-center justify-between px-4">
                {!leftPanelCollapsed && (
                  <h3 className="font-semibold text-slate-900">Components</h3>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
                >
                  {leftPanelCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </Button>
              </div>
              {!leftPanelCollapsed && (
                <div className="flex-1 overflow-hidden">
                  <NodePalette />
                </div>
              )}
            </div>
          </div>

          {/* Center Panel - Canvas */}
          <div className="flex-1 relative">
            <div
              ref={reactFlowWrapper}
              className="w-full h-full"
              onMouseMove={handleMouseMove}
            >
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                onNodeClick={onNodeClick}
                onPaneClick={onPaneClick}
                onDrop={onDrop}
                onDragOver={onDragOver}
                nodeTypes={nodeTypes}
                fitView
                attributionPosition="bottom-right"
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
                {showMiniMap && (
                  <MiniMap
                    className="bg-white shadow-lg border border-slate-200 rounded-lg"
                    maskColor="rgba(100, 116, 139, 0.1)"
                    nodeColor="#8b5cf6"
                  />
                )}
                
                {/* Status Panel */}
                <Panel position="top-left" className="bg-white shadow-lg border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center space-x-3 text-sm">
                    <div className="flex items-center space-x-2">
                      <Layers className="w-4 h-4 text-slate-600" />
                      <span className="text-slate-600">{nodes.length} nodes</span>
                    </div>
                    <div className="w-px h-4 bg-border" />
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 bg-purple-500 rounded-full" />
                      <span className="text-slate-600">{edges.length} connections</span>
                    </div>
                  </div>
                </Panel>

                {/* Collaboration Cursors */}
                <CollaboratorCursors collaborators={activeCollaborators} />
              </ReactFlow>
            </div>

            {/* Empty State */}
            {nodes.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Card className="p-8 max-w-sm text-center shadow-lg pointer-events-auto">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Zap className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">Start Building</h3>
                  <p className="text-slate-600 mb-4">
                    Drag components from the left panel to create your workflow
                  </p>
                  <div className="text-xs text-slate-500">
                    Tip: Start with a trigger node
                  </div>
                </Card>
              </div>
            )}
          </div>

          {/* Right Panel - Configuration */}
          <div className={cn(
            "transition-all duration-300 bg-white border-l border-slate-200",
            rightPanelCollapsed ? "w-12" : "w-80"
          )}>
            <div className="h-full flex flex-col">
              <div className="h-12 border-b border-slate-200 flex items-center justify-between px-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
                >
                  {rightPanelCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </Button>
                {!rightPanelCollapsed && (
                  <h3 className="font-semibold text-slate-900">Properties</h3>
                )}
              </div>
              {!rightPanelCollapsed && (
                <div className="flex-1 overflow-hidden">
                  {selectedNode ? (
                    <ConfigurationPanel />
                  ) : (
                    <div className="p-6 text-center text-slate-500">
                      <Settings className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p>Select a node to configure its properties</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

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
      </div>
    </TooltipProvider>
  )
}
