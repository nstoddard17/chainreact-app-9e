"use client"

import type React from "react"
import { useEffect, useCallback, useState, useRef } from "react"
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
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import { useWorkflowStore } from "@/stores/workflowStore"
import { useCollaborationStore } from "@/stores/collaborationStore"
import { useIntegrationStore } from "@/stores/integrationStore"
import ConfigurationPanel from "./ConfigurationPanel"
import CustomNode from "./CustomNode"
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
import { cn } from "@/lib/utils"
import { ALL_NODE_COMPONENTS, NodeComponent } from "@/lib/workflows/availableNodes"
import { INTEGRATION_CONFIGS } from "@/lib/integrations/availableIntegrations"
import { integrationIcons } from "@/lib/integrations/integration-icons"

const nodeTypes: NodeTypes = {
  custom: CustomNode,
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
  const [executing, setExecuting] = useState(false)
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [workflowName, setWorkflowName] = useState("")
  const [isEditingName, setIsEditingName] = useState(false)
  
  // New states for the guided approach
  const [showTriggerDialog, setShowTriggerDialog] = useState(false)

  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const cursorUpdateTimer = useRef<NodeJS.Timeout | null>(null)

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

  const getWorkflowStatus = () => {
    if (executing) return { status: "running", color: "bg-blue-500" }
    if (nodes.length === 0) return { status: "draft", color: "bg-gray-400" }
    if (nodes.some(node => !node.data.status || node.data.status === "error")) return { status: "error", color: "bg-red-500" }
    if (nodes.every(node => node.data.status === "connected")) return { status: "ready", color: "bg-green-500" }
    return { status: "draft", color: "bg-yellow-500" }
  }

  const workflowStatus = getWorkflowStatus()

  // Get available integrations grouped by category
  const getIntegrationsFromNodes = () => {
    const integrationMap: Record<
      string,
      {
        id: string
        name: string
        logo: any
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
          logo: integrationIcons[config.id],
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

  const availableIntegrations = getIntegrationsFromNodes()
  const triggerIntegrations = availableIntegrations.filter(integration => integration.triggers.length > 0)

  const handleTriggerSelect = (integration: any, trigger: NodeComponent) => {
    const newNode: Node = {
      id: `trigger-${Date.now()}`,
      type: "custom",
      position: { x: 400, y: 200 },
      data: {
        type: trigger.type,
        title: trigger.title,
        description: trigger.description,
        provider: integration.id,
        status: "disconnected",
        config: {}
      },
    }

    setNodes((nds) => [...nds, newNode])
    setShowTriggerDialog(false)
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
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving ? "Saving..." : "Enable"}
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
                  <div className="w-20 h-20 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center mx-auto mb-8">
                    <Plus className="w-8 h-8 text-slate-400" />
                  </div>
                  <h2 className="text-3xl font-bold text-slate-900 mb-4">Start your Chain</h2>
                  <p className="text-lg text-slate-600 mb-8">
                    Chains start with a trigger – an event that kicks off your workflow
                  </p>
                  <Button
                    onClick={() => setShowTriggerDialog(true)}
                    className="bg-slate-900 hover:bg-slate-800 text-white px-8 py-3 text-lg"
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
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
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

          {/* Right Panel - Configuration */}
          {selectedNode && (
            <div className="w-80 bg-white border-l border-slate-200">
              <ConfigurationPanel />
            </div>
          )}
        </div>

                {/* Trigger Selection Dialog */}
        <Dialog open={showTriggerDialog} onOpenChange={setShowTriggerDialog}>
          <DialogContent className="max-w-5xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle className="text-2xl">Choose a trigger</DialogTitle>
              <DialogDescription className="text-base">
                Select the app and event that will start your workflow
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[60vh] overflow-y-auto p-2">
              {triggerIntegrations.map((integration) => (
                <Card 
                  key={integration.id}
                  className="p-4 hover:shadow-lg hover:scale-105 transition-all duration-200 cursor-pointer flex flex-col items-center justify-center text-center space-y-2"
                  onClick={() => {
                    // For now, just select the first trigger
                    if (integration.triggers.length > 0) {
                      handleTriggerSelect(integration, integration.triggers[0])
                    }
                  }}
                >
                  <div 
                    className="w-12 h-12 flex items-center justify-center mb-2 rounded-lg"
                    style={{ backgroundColor: integration.color }}
                  >
                    {integration.logo && <integration.logo className="w-7 h-7 text-white" />}
                  </div>
                  <p className="font-semibold text-slate-800">{integration.name}</p>
                  <p className="text-xs text-slate-500">
                    {integration.triggers.length} trigger{integration.triggers.length !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-slate-400 mt-1 text-center px-2">{integration.description}</p>
                </Card>
              ))}
            </div>
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
      </div>
    </TooltipProvider>
  )
}
