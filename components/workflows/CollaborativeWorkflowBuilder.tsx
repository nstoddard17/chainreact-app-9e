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
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import AppLayout from "@/components/layout/AppLayout"
import { useWorkflowStore } from "@/stores/workflowStore"
import { useCollaborationStore } from "@/stores/collaborationStore"
import WorkflowToolbar from "./WorkflowToolbar"
import NodePalette from "./NodePalette"
import ConfigurationPanel from "./ConfigurationPanel"
import CustomNode from "./CustomNode"
import { CollaboratorCursors } from "./CollaboratorCursors"
import { ExecutionMonitor } from "./ExecutionMonitor"
import { ConflictResolutionDialog } from "./ConflictResolutionDialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Save, Loader2, Users, Zap, GitBranch } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

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

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [saving, setSaving] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [showConflictDialog, setShowConflictDialog] = useState(false)

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
      }
    }
  }, [workflowId, workflows, setCurrentWorkflow])

  // Fetch workflows on mount
  useEffect(() => {
    fetchWorkflows()
  }, [fetchWorkflows])

  // Update nodes and edges when current workflow changes
  useEffect(() => {
    if (currentWorkflow) {
      setNodes(currentWorkflow.nodes || [])
      setEdges(currentWorkflow.connections || [])
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
      }

      // Apply change through collaboration system
      if (collaborationSession) {
        const result = await applyChange("edge_add", {
          edge: newEdge,
        })

        if (result.success) {
          setEdges((eds) => addEdge(newEdge, eds))
        } else if (result.conflicts) {
          // Handle conflicts
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

      const nodeType = event.dataTransfer.getData("application/reactflow")
      const nodeData = JSON.parse(event.dataTransfer.getData("application/nodedata"))

      if (!nodeType || !currentWorkflow) return

      const position = {
        x: event.clientX - 200,
        y: event.clientY - 100,
      }

      const newNode = {
        id: `${nodeType}-${Date.now()}`,
        type: "custom",
        position,
        data: {
          ...nodeData,
          config: {},
        },
      }

      // Apply change through collaboration system
      if (collaborationSession) {
        const result = await applyChange("node_add", {
          node: newNode,
        })

        if (result.success) {
          addNode(newNode)
          setNodes((nds) => [...nds, newNode])
        } else if (result.conflicts) {
          console.log("Node add conflicts:", result.conflicts)
        }
      } else {
        addNode(newNode)
        setNodes((nds) => [...nds, newNode])
      }
    },
    [currentWorkflow, addNode, setNodes, collaborationSession, applyChange],
  )

  const handleSave = async () => {
    if (!currentWorkflow) return

    setSaving(true)
    try {
      const updatedWorkflow = {
        ...currentWorkflow,
        nodes,
        connections: edges,
      }
      setCurrentWorkflow(updatedWorkflow)
      await saveWorkflow()
    } catch (error) {
      console.error("Failed to save workflow:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleAdvancedExecution = async () => {
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
        alert("Advanced workflow execution completed successfully!")
      } else {
        alert(`Workflow execution failed: ${result.error}`)
      }
    } catch (error) {
      console.error("Failed to execute workflow:", error)
      alert("Failed to execute workflow")
    } finally {
      setExecuting(false)
    }
  }

  if (!currentWorkflow) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-lg font-medium text-slate-900 mb-2">No workflow selected</div>
            <div className="text-sm text-slate-500">
              Create a new workflow or select an existing one to start building
            </div>
          </div>
        </div>
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="h-full flex flex-col">
        {/* Enhanced Toolbar with Collaboration Status */}
        <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200">
          <div className="flex items-center space-x-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{currentWorkflow.name}</h1>
              <p className="text-sm text-slate-500">{currentWorkflow.description}</p>
            </div>

            {/* Collaboration Status */}
            {collaborationSession && (
              <div className="flex items-center space-x-2">
                <Badge variant="outline" className="flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {activeCollaborators.length} collaborator{activeCollaborators.length !== 1 ? "s" : ""}
                </Badge>

                {pendingChanges.length > 0 && (
                  <Badge variant="secondary">
                    {pendingChanges.length} pending change{pendingChanges.length !== 1 ? "s" : ""}
                  </Badge>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <WorkflowToolbar />

            <Button
              variant="outline"
              size="sm"
              onClick={handleAdvancedExecution}
              disabled={executing}
              className="flex items-center gap-2"
            >
              {executing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Advanced Execute
                </>
              )}
            </Button>

            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Conflict Alert */}
        {conflicts.length > 0 && (
          <Alert className="m-4 border-orange-200 bg-orange-50">
            <GitBranch className="h-4 w-4" />
            <AlertDescription>
              {conflicts.length} conflict{conflicts.length !== 1 ? "s" : ""} detected.
              <Button variant="link" className="p-0 h-auto ml-2" onClick={() => setShowConflictDialog(true)}>
                Resolve now
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <div className="flex-1 flex">
          {/* Node Palette */}
          <NodePalette />

          {/* Collaborative Canvas */}
          <div className="flex-1 relative" ref={reactFlowWrapper} onMouseMove={handleMouseMove}>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onDragOver={onDragOver}
              onDrop={onDrop}
              nodeTypes={nodeTypes}
              fitView
              className="bg-slate-50"
            >
              <Background />
              <Controls />
              <MiniMap />

              {/* Collaborator Cursors Overlay */}
              {collaborationSession && <CollaboratorCursors collaborators={activeCollaborators} />}

              {/* Execution Monitor */}
              {executionEvents.length > 0 && (
                <Panel position="top-right">
                  <ExecutionMonitor events={executionEvents} />
                </Panel>
              )}
            </ReactFlow>
          </div>

          {/* Configuration Panel */}
          <ConfigurationPanel />
        </div>
      </div>

      {/* Conflict Resolution Dialog */}
      <ConflictResolutionDialog
        open={showConflictDialog}
        onOpenChange={setShowConflictDialog}
        conflicts={conflicts}
        onResolve={resolveConflict}
      />
    </AppLayout>
  )
}
