"use client"

import type React from "react"

import { useEffect, useCallback, useState } from "react"
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
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

import AppLayout from "@/components/layout/AppLayout"
import { useWorkflowStore } from "@/stores/workflowStore"
import { useAIStore } from "@/stores/aiStore"
import { AIChatAssistant } from "@/components/ai/AIChatAssistant"
import NodePalette from "./NodePalette"
import ConfigurationPanel from "./ConfigurationPanel"
import CustomNode from "./CustomNode"
import { WorkflowOptimizer } from "@/components/ai/WorkflowOptimizer"
import { NodeSuggestions } from "@/components/ai/NodeSuggestions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Save, Play, Loader2, Sparkles, Zap, Brain, ArrowLeft, Undo, Redo } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"

const nodeTypes: NodeTypes = {
  custom: CustomNode,
}

export default function WorkflowBuilder() {
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
    generateWorkflowWithAI,
  } = useWorkflowStore()

  const { optimizations, anomalies, fetchOptimizations, fetchAnomalies, isGenerating } = useAIStore()

  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [showAIGenerator, setShowAIGenerator] = useState(false)
  const [showOptimizer, setShowOptimizer] = useState(false)
  const [showExitDialog, setShowExitDialog] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [aiPrompt, setAiPrompt] = useState("")
  const [generatingAI, setGeneratingAI] = useState(false)
  const { toast } = useToast()

  // Track changes to detect unsaved state
  useEffect(() => {
    if (currentWorkflow && (nodes.length > 0 || edges.length > 0)) {
      const currentNodes = JSON.stringify(nodes)
      const currentEdges = JSON.stringify(edges)
      const savedNodes = JSON.stringify(currentWorkflow.nodes || [])
      const savedEdges = JSON.stringify(currentWorkflow.connections || [])

      setHasUnsavedChanges(currentNodes !== savedNodes || currentEdges !== savedEdges)
    }
  }, [nodes, edges, currentWorkflow])

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

  const handleBack = () => {
    if (hasUnsavedChanges) {
      setShowExitDialog(true)
    } else {
      router.push("/workflows")
    }
  }

  const handleSaveAndExit = async () => {
    await handleSave()
    setShowExitDialog(false)
    router.push("/workflows")
  }

  const handleDiscardAndExit = () => {
    setShowExitDialog(false)
    router.push("/workflows")
  }

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
      setHasUnsavedChanges(false)
      toast({
        title: "Success",
        description: "Workflow saved successfully",
      })
    } catch (error) {
      console.error("Failed to save workflow:", error)
      toast({
        title: "Error",
        description: "Failed to save workflow",
        variant: "destructive",
      })
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
        toast({
          title: "Success",
          description: "Workflow test completed successfully!",
        })
      } else {
        toast({
          title: "Error",
          description: `Workflow test failed: ${result.error}`,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Failed to test workflow:", error)
      toast({
        title: "Error",
        description: "Failed to test workflow",
        variant: "destructive",
      })
    } finally {
      setTesting(false)
    }
  }

  const handleGenerateWithAI = async () => {
    if (!aiPrompt.trim()) return

    setGeneratingAI(true)
    try {
      const workflow = await generateWorkflowWithAI(aiPrompt)
      setAiPrompt("")
      setShowAIGenerator(false)
      toast({
        title: "Success",
        description: "AI workflow generated successfully!",
      })
      // Navigate to the new workflow
      window.location.href = `/workflows/builder?id=${workflow.id}`
    } catch (error) {
      console.error("Failed to generate workflow:", error)
      toast({
        title: "Error",
        description: "Failed to generate workflow with AI",
        variant: "destructive",
      })
    } finally {
      setGeneratingAI(false)
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
            <Button
              onClick={() => setShowAIGenerator(true)}
              className="flex items-center gap-2 hover:shadow-lg hover:scale-105 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
            >
              <Sparkles className="w-4 h-4" />
              Generate with AI
            </Button>
          </div>
        </div>

        {/* AI Generation Dialog */}
        <Dialog open={showAIGenerator} onOpenChange={setShowAIGenerator}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Generate Workflow with AI</DialogTitle>
              <DialogDescription>
                Describe what you want your workflow to do, and AI will create it for you.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Textarea
                placeholder="e.g., Send Slack notifications when new emails arrive from important clients"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                rows={4}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowAIGenerator(false)}
                  className="flex-1 hover:bg-slate-50 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-all duration-200"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleGenerateWithAI}
                  disabled={!aiPrompt.trim() || generatingAI}
                  className="flex-1 hover:shadow-lg focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
                >
                  {generatingAI ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Generate
                    </>
                  )}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <AIChatAssistant />
      </AppLayout>
    )
  }

  return (
    <AppLayout>
      <div className="h-full flex flex-col">
        {/* Toolbar */}
        <div className="flex items-center justify-between p-4 bg-white border-b border-slate-200 shadow-sm">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleBack}
              className="hover:bg-slate-50 hover:shadow-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
                {currentWorkflow.name}
                {hasUnsavedChanges && <span className="w-2 h-2 bg-orange-400 rounded-full" title="Unsaved changes" />}
              </h1>
              <p className="text-sm text-slate-500">{currentWorkflow.description}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {/* Undo/Redo buttons */}
            <Button
              variant="outline"
              size="sm"
              className="hover:bg-slate-50 hover:shadow-sm hover:scale-105 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-all duration-200"
              disabled
            >
              <Undo className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="hover:bg-slate-50 hover:shadow-sm hover:scale-105 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-all duration-200"
              disabled
            >
              <Redo className="w-4 h-4" />
            </Button>

            {/* AI Features */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAIGenerator(true)}
              className="flex items-center gap-2 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200 hover:shadow-sm hover:scale-105 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
            >
              <Sparkles className="w-4 h-4" />
              AI Generate
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowOptimizer(true)}
              className="flex items-center gap-2 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200 hover:shadow-sm hover:scale-105 focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 transition-all duration-200"
            >
              <Zap className="w-4 h-4" />
              Optimize
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleTest}
              disabled={testing}
              className="hover:bg-green-50 hover:text-green-600 hover:border-green-200 hover:shadow-sm hover:scale-105 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-all duration-200"
            >
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
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 hover:shadow-lg hover:scale-105 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
            >
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
                className="text-blue-600 border-blue-200 hover:bg-blue-50 hover:shadow-sm focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
              >
                View Details
              </Button>
            </div>
          </div>
        )}

        <div className="flex-1 flex overflow-hidden">
          {/* Node Palette */}
          <div className="w-64 bg-white border-r border-slate-200 overflow-y-auto">
            <NodePalette />
          </div>

          {/* Canvas */}
          <div className="flex-1 relative bg-slate-50">
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
              <Background variant="dots" gap={20} size={1} color="#e2e8f0" className="opacity-50" />
              <Controls className="bg-white border border-slate-200 rounded-lg shadow-sm" />
              <MiniMap
                className="bg-white border border-slate-200 rounded-lg shadow-sm"
                nodeColor="#3b82f6"
                maskColor="rgba(0, 0, 0, 0.1)"
              />
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
          <div className="w-80 bg-white border-l border-slate-200 overflow-y-auto">
            <ConfigurationPanel />
          </div>
        </div>
      </div>

      {/* Exit Confirmation Dialog */}
      <Dialog open={showExitDialog} onOpenChange={setShowExitDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes. Do you want to save as a draft or discard before exiting?
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setShowExitDialog(false)}
              className="flex-1 hover:bg-slate-50 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-all duration-200"
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={handleDiscardAndExit}
              className="flex-1 hover:bg-red-50 hover:text-red-600 hover:border-red-200 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-all duration-200"
            >
              Discard
            </Button>
            <Button
              onClick={handleSaveAndExit}
              className="flex-1 hover:shadow-lg focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
            >
              Save and Exit
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Generation Dialog */}
      <Dialog open={showAIGenerator} onOpenChange={setShowAIGenerator}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Workflow with AI</DialogTitle>
            <DialogDescription>
              Describe what you want your workflow to do, and AI will create it for you.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              placeholder="e.g., Send Slack notifications when new emails arrive from important clients"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              rows={4}
              className="focus:ring-blue-500 focus:border-blue-500"
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setShowAIGenerator(false)}
                className="flex-1 hover:bg-slate-50 focus:ring-2 focus:ring-slate-500 focus:ring-offset-2 transition-all duration-200"
              >
                Cancel
              </Button>
              <Button
                onClick={handleGenerateWithAI}
                disabled={!aiPrompt.trim() || generatingAI}
                className="flex-1 hover:shadow-lg focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all duration-200"
              >
                {generatingAI ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 mr-2" />
                    Generate
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Dialogs */}
      <WorkflowOptimizer open={showOptimizer} onOpenChange={setShowOptimizer} workflow={currentWorkflow} />

      <AIChatAssistant />
    </AppLayout>
  )
}
