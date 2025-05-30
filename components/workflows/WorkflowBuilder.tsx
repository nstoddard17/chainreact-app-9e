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
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import AppLayout from "@/components/layout/AppLayout"
import { useWorkflowStore } from "@/stores/workflowStore"
import { useAIStore } from "@/stores/aiStore"
import WorkflowToolbar from "./WorkflowToolbar"
import NodePalette from "./NodePalette"
import ConfigurationPanel from "./ConfigurationPanel"
import CustomNode from "./CustomNode"
import { AIWorkflowGenerator } from "@/components/ai/AIWorkflowGenerator"
import { WorkflowOptimizer } from "@/components/ai/WorkflowOptimizer"
import { NodeSuggestions } from "@/components/ai/NodeSuggestions"
import { Button } from "@/components/ui/button"
import { Save, Play, Loader2, Sparkles, Zap, Brain } from "lucide-react"
import { Badge } from "@/components/ui/badge"

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

  const { optimizations, anomalies, fetchOptimizations, fetchAnomalies, isGenerating } = useAIStore()

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showAIGenerator, setShowAIGenerator] = useState(false)
  const [showOptimizer, setShowOptimizer] = useState(false)

  // Load workflow if ID is provided
  useEffect(() => {
    if (workflowId && workflows.length > 0) {
      const workflow = workflows.find((w) => w.id === workflowId)
      if (workflow) {
        setCurrentWorkflow(workflow)
        // Fetch AI insights for this workflow
        fetchOptimizations(workflow.id)
        fetchAnomalies(workflow.id)
      }
    }
  }, [workflowId, workflows, setCurrentWorkflow, fetchOptimizations, fetchAnomalies])

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

  // Handle drag and drop from palette
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
        x: event.clientX - 200, // Adjust for palette width
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

  const handleSave = async () => {
    if (!currentWorkflow) return

    setSaving(true)
    try {
      // Update current workflow with latest nodes and edges
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

  const workflowOptimizations = currentWorkflow ? optimizations[currentWorkflow.id] || [] : []
  const workflowAnomalies = currentWorkflow ? anomalies[currentWorkflow.id] || [] : []

  if (!currentWorkflow) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="text-lg font-medium text-slate-900 mb-2">No workflow selected</div>
            <div className="text-sm text-slate-500 mb-4">
              Create a new workflow or select an existing one to start building
            </div>
            <Button onClick={() => setShowAIGenerator(true)} className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Generate with AI
            </Button>
          </div>
        </div>
        <AIWorkflowGenerator open={showAIGenerator} onOpenChange={setShowAIGenerator} />
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="h-full flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{currentWorkflow.name}</h1>
            <p className="text-sm text-slate-500">{currentWorkflow.description}</p>
          </div>
          <div className="flex items-center space-x-2">
            <WorkflowToolbar />

            {/* AI Features */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAIGenerator(true)}
              className="flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              AI Generate
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowOptimizer(true)}
              className="flex items-center gap-2"
            >
              <Zap className="w-4 h-4" />
              Optimize
            </Button>

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

        {/* AI Insights Bar */}
        {(workflowOptimizations.length > 0 || workflowAnomalies.length > 0) && (
          <div className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 border-b border-slate-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Brain className="w-5 h-5 text-blue-600" />
                  <span className="text-sm font-medium text-slate-900">AI Insights</span>
                </div>
                {workflowOptimizations.length > 0 && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800">
                    {workflowOptimizations.length} optimization{workflowOptimizations.length !== 1 ? "s" : ""}
                  </Badge>
                )}
                {workflowAnomalies.length > 0 && (
                  <Badge variant="destructive">
                    {workflowAnomalies.length} anomal{workflowAnomalies.length !== 1 ? "ies" : "y"}
                  </Badge>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowOptimizer(true)}
                className="text-blue-600 border-blue-200 hover:bg-blue-50"
              >
                View Details
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 flex">
          {/* Node Palette */}
          <NodePalette />

          {/* Canvas */}
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
              className="bg-slate-50"
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>

            {/* Node Suggestions Overlay */}
            {selectedNode && (
              <div className="absolute top-4 right-4 z-10">
                <NodeSuggestions
                  currentNode={selectedNode}
                  workflow={currentWorkflow}
                  onSuggestionSelect={(suggestion) => {
                    // Add suggested node to workflow
                    const newNode = {
                      id: `${suggestion.type}-${Date.now()}`,
                      type: "custom",
                      position: {
                        x: selectedNode.position.x + 200,
                        y: selectedNode.position.y,
                      },
                      data: suggestion,
                    }
                    addNode(newNode)
                    setNodes((nds) => [...nds, newNode])
                  }}
                />
              </div>
            )}
          </div>

          {/* Configuration Panel */}
          <ConfigurationPanel />
        </div>
      </div>

      {/* AI Dialogs */}
      <AIWorkflowGenerator open={showAIGenerator} onOpenChange={setShowAIGenerator} />
      <WorkflowOptimizer open={showOptimizer} onOpenChange={setShowOptimizer} workflow={currentWorkflow} />
    </AppLayout>
  )
}
