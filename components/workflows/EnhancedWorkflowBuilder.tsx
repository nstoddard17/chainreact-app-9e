"use client"

import type React from "react"
import { useEffect, useCallback, useState } from "react"
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
import { useUXStore } from "@/stores/uxStore"
import WorkflowToolbar from "./WorkflowToolbar"
import NodePalette from "./NodePalette"
import ConfigurationPanel from "./ConfigurationPanel"
import CustomNode from "./CustomNode"
import { WorkflowComments } from "./WorkflowComments"
import { WorkflowVersionControl } from "./WorkflowVersionControl"
import { WorkflowDebugger } from "./WorkflowDebugger"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Save, Play, Loader2, MessageSquare, GitBranch } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const nodeTypes: NodeTypes = {
  custom: CustomNode,
}

export default function EnhancedWorkflowBuilder() {
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
    builderPreferences,
    comments,
    versions,
    debugSession,
    fetchBuilderPreferences,
    fetchComments,
    fetchVersions,
    updateBuilderPreferences,
  } = useUXStore()

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [activePanel, setActivePanel] = useState<string>("nodes")

  // Load workflow and preferences
  useEffect(() => {
    if (workflowId && workflows.length > 0) {
      const workflow = workflows.find((w) => w.id === workflowId)
      if (workflow) {
        setCurrentWorkflow(workflow)
        fetchComments(workflow.id)
        fetchVersions(workflow.id)
      }
    }
    fetchBuilderPreferences()
  }, [workflowId, workflows, setCurrentWorkflow, fetchComments, fetchVersions, fetchBuilderPreferences])

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

  // Auto-save functionality
  useEffect(() => {
    if (builderPreferences?.auto_save && currentWorkflow) {
      const autoSaveInterval = setInterval(() => {
        handleSave(true) // Silent save
      }, 30000) // Auto-save every 30 seconds

      return () => clearInterval(autoSaveInterval)
    }
  }, [builderPreferences?.auto_save, currentWorkflow])

  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: Edge = {
        id: `edge-${Date.now()}`,
        source: params.source!,
        target: params.target!,
        sourceHandle: params.sourceHandle,
        targetHandle: params.targetHandle,
      }
      setEdges((eds) => addEdge(newEdge, eds))
    },
    [setEdges],
  )

  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      setSelectedNode(node as any)
    },
    [setSelectedNode],
  )

  const onPaneClick = useCallback(() => {
    setSelectedNode(null)
  }, [setSelectedNode])

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
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

      addNode(newNode)
      setNodes((nds) => [...nds, newNode])
    },
    [currentWorkflow, addNode, setNodes],
  )

  const handleSave = async (silent = false) => {
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
      if (!silent) {
        // Show success notification
      }
    } catch (error) {
      console.error("Failed to save workflow:", error)
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!currentWorkflow) return

    setTesting(true)
    try {
      const response = await fetch("/api/workflows/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflowId: currentWorkflow.id,
          testMode: true,
        }),
      })

      const result = await response.json()

      if (result.success) {
        alert("Workflow test completed successfully!")
      } else {
        alert(`Workflow test failed: ${result.error}`)
      }
    } catch (error) {
      console.error("Failed to test workflow:", error)
      alert("Failed to test workflow")
    } finally {
      setTesting(false)
    }
  }

  const workflowComments = currentWorkflow ? comments[currentWorkflow.id] || [] : []
  const workflowVersions = currentWorkflow ? versions[currentWorkflow.id] || [] : []

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
        {/* Enhanced Toolbar */}
        <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200">
          <div className="flex items-center space-x-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">{currentWorkflow.name}</h1>
              <p className="text-sm text-slate-500">{currentWorkflow.description}</p>
            </div>
            {workflowVersions.length > 0 && (
              <Badge variant="outline" className="flex items-center gap-1">
                <GitBranch className="w-3 h-3" />v{workflowVersions[0]?.version_number || 1}
              </Badge>
            )}
            {workflowComments.length > 0 && (
              <Badge variant="secondary" className="flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                {workflowComments.length}
              </Badge>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <WorkflowToolbar />
            <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
              {testing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Test
                </>
              )}
            </Button>
            <Button size="sm" onClick={() => handleSave()} disabled={saving}>
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

        <div className="flex-1 flex">
          {/* Enhanced Side Panel */}
          <div className="w-80 border-r border-slate-200 bg-white">
            <Tabs value={activePanel} onValueChange={setActivePanel} className="h-full">
              <TabsList className="grid w-full grid-cols-4 p-1 m-2">
                <TabsTrigger value="nodes" className="text-xs">
                  Nodes
                </TabsTrigger>
                <TabsTrigger value="comments" className="text-xs">
                  Comments
                </TabsTrigger>
                <TabsTrigger value="versions" className="text-xs">
                  Versions
                </TabsTrigger>
                <TabsTrigger value="debug" className="text-xs">
                  Debug
                </TabsTrigger>
              </TabsList>
              <TabsContent value="nodes" className="h-full mt-0">
                <NodePalette />
              </TabsContent>
              <TabsContent value="comments" className="h-full mt-0">
                <WorkflowComments workflowId={currentWorkflow.id} comments={workflowComments} />
              </TabsContent>
              <TabsContent value="versions" className="h-full mt-0">
                <WorkflowVersionControl workflowId={currentWorkflow.id} versions={workflowVersions} />
              </TabsContent>
              <TabsContent value="debug" className="h-full mt-0">
                <WorkflowDebugger workflowId={currentWorkflow.id} debugSession={debugSession} />
              </TabsContent>
            </Tabs>
          </div>

          {/* Enhanced Canvas */}
          <div className="flex-1 relative">
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
              snapToGrid={builderPreferences?.snap_to_grid}
              snapGrid={[15, 15]}
              defaultZoom={builderPreferences?.zoom_level || 1}
              className="bg-slate-50"
            >
              <Background gap={builderPreferences?.grid_enabled ? 15 : 0} />
              <Controls />
              {builderPreferences?.minimap_enabled && (
                <MiniMap
                  nodeStrokeColor="#374151"
                  nodeColor="#f3f4f6"
                  nodeBorderRadius={2}
                  pannable
                  zoomable
                  position="bottom-right"
                />
              )}

              {/* Zoom Level Indicator */}
              <Panel position="bottom-left">
                <div className="bg-white px-2 py-1 rounded shadow text-xs text-slate-600">
                  Zoom: {Math.round((builderPreferences?.zoom_level || 1) * 100)}%
                </div>
              </Panel>
            </ReactFlow>
          </div>

          {/* Configuration Panel */}
          <ConfigurationPanel />
        </div>
      </div>
    </AppLayout>
  )
}
