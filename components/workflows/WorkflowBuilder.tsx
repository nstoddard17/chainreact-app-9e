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
import { useWorkflowStore, type WorkflowNode, type WorkflowConnection } from "@/stores/workflowStore"
import { useUXStore } from "@/stores/uxStore"
import WorkflowToolbar from "./WorkflowToolbar"
import NodePalette from "./NodePalette"
// ConfigurationPanel import removed - component doesn't exist
import CustomNode from "./CustomNode"
import { WorkflowComments } from "./WorkflowComments"
import { WorkflowVersionControl } from "./WorkflowVersionControl"
import { WorkflowDebugger } from "./WorkflowDebugger"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Save, Play, MessageSquare, GitBranch } from "lucide-react"
import { LightningLoader } from '@/components/ui/lightning-loader'
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const nodeTypes: NodeTypes = {
  custom: CustomNode,
}

export default function WorkflowBuilder() {
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

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [activePanel, setActivePanel] = useState<string>("nodes")
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  // Track unsaved changes
  const checkForUnsavedChanges = useCallback(() => {
    if (!currentWorkflow) {
      return false
    }
    
    const currentNodes = nodes.filter((n: Node) => n.type === 'custom')
    const currentEdges = edges
    
    // Compare nodes
    const savedNodes = currentWorkflow.nodes || []
    const nodesChanged = currentNodes.length !== savedNodes.length ||
      currentNodes.some((node, index) => {
        const savedNode = savedNodes[index]
        if (!savedNode) {
          return true
        }
        
        const positionChanged = node.position.x !== savedNode.position.x || node.position.y !== savedNode.position.y
        const configChanged = JSON.stringify(node.data.config) !== JSON.stringify(savedNode.data.config)
        const typeChanged = node.data.type !== savedNode.data.type
        const idChanged = node.id !== savedNode.id
        
        return idChanged || typeChanged || configChanged || positionChanged
      })
    
    // Compare edges
    const savedEdges = currentWorkflow.connections || []
    const edgesChanged = currentEdges.length !== savedEdges.length ||
      currentEdges.some((edge, index) => {
        const savedEdge = savedEdges[index]
        if (!savedEdge) return true
        return edge.id !== savedEdge.id ||
               edge.source !== savedEdge.source ||
               edge.target !== savedEdge.target
      })
    
    const hasChanges = nodesChanged || edgesChanged
    setHasUnsavedChanges(hasChanges)
    return hasChanges
  }, [currentWorkflow, nodes, edges])

  // Check for unsaved changes whenever nodes or edges change
  useEffect(() => {
    if (currentWorkflow) {
      checkForUnsavedChanges()
    }
  }, [currentWorkflow, nodes, edges, checkForUnsavedChanges])

  // Warn user before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        event.preventDefault()
        event.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
        return 'You have unsaved changes. Are you sure you want to leave?'
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [hasUnsavedChanges])

  // Load workflow and preferences
  useEffect(() => {
    if (workflowId && workflows.length > 0) {
      const workflow = workflows.find((w) => w.id === workflowId)
      if (workflow) {
        // Only set current workflow if it's not already set or if it's a different workflow
        if (!currentWorkflow || currentWorkflow.id !== workflowId) {
          setCurrentWorkflow(workflow)
          fetchComments(workflow.id)
          fetchVersions(workflow.id)
        }
      }
    }
    fetchBuilderPreferences()
  }, [workflowId, workflows, setCurrentWorkflow, fetchComments, fetchVersions, fetchBuilderPreferences, currentWorkflow])

  // Fetch workflows on mount
  useEffect(() => {
    if (workflows.length === 0) {
      fetchWorkflows()
    }
  }, [])

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
    if (event.preventDefault) {
      event.preventDefault()
    }
    event.dataTransfer.dropEffect = "move"
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      if (event.preventDefault) {
        event.preventDefault()
      }

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

    if (!silent) {
      setSaving(true)
    }
    try {
      const oldStatus = currentWorkflow.status
      
      // Create the updated workflow with current nodes and edges
      // Ensure nodes are in the correct format for storage and positions are preserved
      const nodesForStorage = nodes.map(node => {
        return {
          id: node.id,
          type: node.type,
          position: {
            x: node.position.x,
            y: node.position.y
          },
          data: node.data
        };
      })
      
      const updatedWorkflow = {
        ...currentWorkflow,
        nodes: nodesForStorage as any,
        connections: edges as any,
      }
      
      // Update the current workflow in the store
      setCurrentWorkflow(updatedWorkflow)
      
      // Save to database
      await saveWorkflow()
      
      // Clear unsaved changes after successful save
      setHasUnsavedChanges(false)
      
      // Check if status changed and show notification
      if (!silent && currentWorkflow.status !== oldStatus) {
        const { toast } = await import('@/hooks/use-toast')
        toast({
          title: "Workflow Status Updated",
          description: `Workflow is now ${currentWorkflow.status === 'active' ? 'active and ready to run' : 'marked as draft'}`,
          variant: currentWorkflow.status === 'active' ? 'default' : 'destructive',
        })
      }
    } catch (error) {
      console.error("Failed to save workflow:", error)
    } finally {
      if (!silent) {
        setSaving(false)
      }
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
      <AppLayout title="Workflow Builder">
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
    <AppLayout title="Workflow Builder">
      <div className="h-full flex flex-col">
        {/* Enhanced Toolbar */}
        <div className="flex items-center justify-between p-4 bg-card border-b border-border">
          <div className="flex items-center space-x-4">
            <div>
              <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                {currentWorkflow.name}
                {hasUnsavedChanges && (
                  <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                    Unsaved Changes
                  </Badge>
                )}
              </h1>
              <p className="text-sm text-slate-500">{currentWorkflow.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge 
                variant={
                  currentWorkflow.status === "active" 
                    ? "default" 
                    : currentWorkflow.status === "paused" 
                    ? "secondary" 
                    : "outline"
                }
                className={`flex items-center gap-1 ${
                  currentWorkflow.status === "active" 
                    ? "bg-green-100 text-green-800 border-green-200" 
                    : currentWorkflow.status === "paused" 
                    ? "bg-yellow-100 text-yellow-800 border-yellow-200" 
                    : "bg-gray-100 text-gray-800 border-gray-200"
                }`}
              >
                {currentWorkflow.status === "active" && <div className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                {currentWorkflow.status === "paused" && <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />}
                {currentWorkflow.status === "draft" && <div className="w-1.5 h-1.5 rounded-full bg-gray-500" />}
                <span className="capitalize">{currentWorkflow.status}</span>
              </Badge>
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
          </div>
          <div className="flex items-center space-x-2">
            <WorkflowToolbar />
            <Button variant="outline" size="sm" onClick={handleTest} disabled={testing}>
              {testing ? (
                <>
                  <LightningLoader size="sm" className="mr-2" />
                  Testing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Test
                </>
              )}
            </Button>
            <Button 
              size="sm" 
              onClick={() => handleSave()} 
              disabled={saving}
              variant={hasUnsavedChanges ? "default" : "outline"}
              className={hasUnsavedChanges ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              {saving ? (
                <>
                  <LightningLoader size="sm" className="mr-2" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {hasUnsavedChanges ? "Save Changes" : "Save"}
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="flex-1 flex">
          {/* Enhanced Side Panel */}
          <div className="w-80 border-r border-border bg-card">
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
              onNodeDrag={(event, node) => {
                // Update position in real-time during drag
                setNodes((nds) => 
                  nds.map((n) => 
                    n.id === node.id 
                      ? { ...n, position: { x: node.position.x, y: node.position.y } } 
                      : n
                  )
                );
              }}
              onNodeDragStop={(event, node) => {
                // Final position update
                setNodes((nds) => 
                  nds.map((n) => 
                    n.id === node.id 
                      ? { ...n, position: { x: node.position.x, y: node.position.y } } 
                      : n
                  )
                );
                // Trigger unsaved changes check
                setTimeout(() => {
                  checkForUnsavedChanges();
                }, 50);
              }}
              nodeTypes={nodeTypes}
              fitView={false}
              snapToGrid={builderPreferences?.snap_to_grid}
              snapGrid={[15, 15]}
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
                <div className="bg-card px-2 py-1 rounded shadow text-xs text-muted-foreground">
                  Zoom: {Math.round((builderPreferences?.zoom_level || 1) * 100)}%
                </div>
              </Panel>
            </ReactFlow>
          </div>

          {/* Configuration Panel */}
          {/* ConfigurationPanel removed - component doesn't exist */}
        </div>
      </div>
    </AppLayout>
  )
}
