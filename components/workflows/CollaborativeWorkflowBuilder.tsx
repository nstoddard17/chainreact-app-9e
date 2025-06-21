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
import { Save, Loader2, Play, ArrowLeft } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { ALL_NODE_COMPONENTS, NodeComponent } from "@/lib/workflows/availableNodes"
import { INTEGRATION_CONFIGS } from "@/lib/integrations/availableIntegrations"
import { useToast } from "@/hooks/use-toast"

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

  const [nodes, setNodes, onNodesChange] = useNodesState<any>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([])
  const { fitView, getNodes, getEdges } = useReactFlow()

  const [isSaving, setIsSaving] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionEvents, setExecutionEvents] = useState<ExecutionEvent[]>([])
  const [workflowName, setWorkflowName] = useState("")
  const [showTriggerDialog, setShowTriggerDialog] = useState(false)
  const [showActionDialog, setShowActionDialog] = useState(false)
  const [selectedIntegration, setSelectedIntegration] = useState<IntegrationInfo | null>(null)
  const [sourceAddNode, setSourceAddNode] = useState<{ id: string; parentId: string } | null>(null)
  const [configuringNode, setConfiguringNode] = useState<{ id: string; integration: any; nodeComponent: NodeComponent; config: Record<string, any> } | null>(null)

  const { toast } = useToast()
  const availableIntegrations = useMemo(() => getIntegrationsFromNodes(), [])

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
    setShowActionDialog(true)
  }, [])

  const recalculateLayout = useCallback(() => {
    const nodeList = getNodes()
    const sequenceNodes = nodeList
      .filter((n) => n.type === "custom" || n.type === "addAction")
      .sort((a, b) => a.position.y - b.position.y)
    if (sequenceNodes.length === 0) return

    const triggerNode = sequenceNodes.find((n) => n.data.isTrigger)
    const basePosition = triggerNode ? { x: triggerNode.position.x, y: triggerNode.position.y } : { x: 400, y: 100 }
    const verticalGap = 160
    let currentY = basePosition.y
    const newNodes = getNodes()
      .map((n) => {
        if (n.type === "custom" || n.type === "addAction") {
          const newY = currentY
          currentY += verticalGap
          return { ...n, position: { x: basePosition.x, y: newY } }
        }
        return n
      })
      .sort((a, b) => a.position.y - b.position.y)
    let runningNodes = newNodes
      .filter((n) => n.type === "custom" || n.type === "addAction")
      .sort((a, b) => a.position.y - b.position.y)
    const newEdges: Edge[] = []
    for (let i = 0; i < runningNodes.length - 1; i++) {
      const source = runningNodes[i]
      const target = runningNodes[i + 1]
      newEdges.push({
        id: `${source.id}-${target.id}`,
        source: source.id,
        target: target.id,
        animated: true,
        style: { stroke: target.type === "addAction" ? "#b1b1b7" : "#8b5cf6", strokeWidth: 2, strokeDasharray: target.type === "addAction" ? "5,5" : undefined },
        type: "straight",
      })
    }
    setNodes(newNodes)
    setEdges(newEdges)
  }, [getNodes, setNodes, setEdges])

  const handleDeleteNode = useCallback((nodeId: string) => {
    const nodeToRemove = getNodes().find((n) => n.id === nodeId)
    if (!nodeToRemove) return
    if (nodeToRemove.data.isTrigger || getNodes().filter((n) => n.type === "custom").length <= 1) {
      setNodes([])
      setEdges([])
      return
    }
    setNodes((prevNodes) => prevNodes.filter((n) => n.id !== nodeId))
    setEdges((prevEdges) => prevEdges.filter((e) => e.source !== nodeId && e.target !== nodeId))
    if (nodeToRemove.type === "custom") {
      const edgeToNode = getEdges().find((e) => e.target === nodeId)
      if (edgeToNode) {
        setNodes((prevNodes) => prevNodes.filter((n) => !(n.type === "addAction" && n.id === edgeToNode.source)))
      }
    }
    setTimeout(recalculateLayout, 50)
  }, [getNodes, getEdges, setNodes, setEdges, recalculateLayout])

  const onConnect = useCallback((params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges])

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
            ...node.data, name: node.data.label, onConfigure: handleConfigureNode,
            onDelete: handleDeleteNode, providerId: node.data.type.split('-')[0]
        },
      }))

      let allNodes = [...customNodes]
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
      setNodes([]); setEdges([]); setShowTriggerDialog(true)
    }
  }, [currentWorkflow, fitView, handleAddActionClick, handleConfigureNode, handleDeleteNode, setCurrentWorkflow, setEdges, setNodes, workflowId])

  const handleTriggerSelect = (integration: IntegrationInfo, trigger: NodeComponent) => {
    const triggerNode: Node = {
      id: "trigger", type: "custom", position: { x: 400, y: 100 },
      data: { ...trigger, name: trigger.name, isTrigger: true, onConfigure: handleConfigureNode, onDelete: handleDeleteNode },
    }
    const addActionNode: Node = {
      id: "add-action-1", type: "addAction", position: { x: 400, y: 260 },
      data: { parentId: "trigger", onClick: () => handleAddActionClick("add-action-1", "trigger") },
    }
    setNodes([triggerNode, addActionNode])
    setEdges([{ id: "trigger-add-action-1", source: "trigger", target: "add-action-1", animated: true, style: { stroke: "#b1b1b7", strokeWidth: 2, strokeDasharray: "5,5" } }])
    setShowTriggerDialog(false)
    setTimeout(recalculateLayout, 50)
  }

  const handleActionSelect = (integration: IntegrationInfo, action: NodeComponent) => {
    if (!sourceAddNode) return
    const parentNode = getNodes().find((n) => n.id === sourceAddNode.parentId)
    if (!parentNode) return
    const newNodeId = `node-${Date.now()}`
    const newActionNode: Node = {
      id: newNodeId, type: "custom", position: { x: parentNode.position.x, y: parentNode.position.y + 160 },
      data: { ...action, onConfigure: handleConfigureNode, onDelete: handleDeleteNode },
    }
    const newAddActionId = `add-action-${Date.now()}`
    const newAddActionNode: Node = {
      id: newAddActionId, type: "addAction", position: { x: parentNode.position.x, y: parentNode.position.y + 320 },
      data: { parentId: newNodeId, onClick: () => handleAddActionClick(newAddActionId, newNodeId) },
    }
    setNodes((prevNodes) => [...prevNodes.filter((n) => n.id !== sourceAddNode.id), newActionNode, newAddActionNode])
    setShowActionDialog(false); setSelectedIntegration(null); setSourceAddNode(null)
    setTimeout(recalculateLayout, 50)
  }

  const handleSaveConfiguration = (context: { id: string }, newConfig: Record<string, any>) => {
    setNodes((nds) => nds.map((node) => (node.id === context.id ? { ...node, data: { ...node.data, config: newConfig } } : node)))
    toast({ title: "Configuration Saved", description: "Your node configuration has been updated." })
    setConfiguringNode(null)
  }

  const handleSave = async () => {
    if (!currentWorkflow) return
    setIsSaving(true)
    const reactFlowNodes = getNodes().filter(n => n.type === 'custom')
    const reactFlowEdges = getEdges().filter(e => reactFlowNodes.some(n => n.id === e.source) && reactFlowNodes.some(n => n.id === e.target))

    const mappedNodes: WorkflowNode[] = reactFlowNodes.map((n) => ({
      id: n.id, type: 'custom', position: n.position,
      data: { label: n.data.name as string, type: n.data.type as string, config: n.data.config || {} },
    }))
    const mappedConnections: WorkflowConnection[] = reactFlowEdges.map((e) => ({
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
    return <img src={config?.logo || `/integrations/${integrationId}.svg`} alt={`${integrationName} logo`} className="w-6 h-6" />
  }

  return {
    nodes, edges, onNodesChange, onEdgesChange, onConnect, workflowName, setWorkflowName, isSaving, handleSave, handleExecute, showTriggerDialog,
    setShowTriggerDialog, showActionDialog, setShowActionDialog, handleTriggerSelect, handleActionSelect, selectedIntegration, setSelectedIntegration,
    availableIntegrations, renderLogo, getWorkflowStatus, currentWorkflow, isExecuting, executionEvents,
    configuringNode, setConfiguringNode, handleSaveConfiguration, collaborators,
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
    nodes, edges, onNodesChange, onEdgesChange, onConnect, workflowName, setWorkflowName, isSaving, handleSave, handleExecute, showTriggerDialog,
    setShowTriggerDialog, showActionDialog, setShowActionDialog, handleTriggerSelect, handleActionSelect, selectedIntegration, setSelectedIntegration,
    availableIntegrations, renderLogo, getWorkflowStatus, currentWorkflow, isExecuting, executionEvents,
    configuringNode, setConfiguringNode, handleSaveConfiguration, collaborators
  } = useWorkflowBuilderState()

  if (!currentWorkflow) {
    return <div className="flex items-center justify-center h-full"><Loader2 className="w-8 h-8 animate-spin" /></div>
  }
  return (
    <div style={{ height: "calc(100vh - 65px)" }}>
      <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} nodeTypes={nodeTypes} fitView className="bg-background" proOptions={{ hideAttribution: true }}>
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <Controls />
        <MiniMap />
        <CollaboratorCursors collaborators={collaborators || []} />
        {isExecuting && executionEvents.length > 0 && <ExecutionMonitor events={executionEvents} />}
        <Panel position="top-left" className="p-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" onClick={() => router.push("/workflows")}><ArrowLeft className="w-5 h-5" /></Button>
            <Input value={workflowName} onChange={(e) => setWorkflowName(e.target.value)} onBlur={handleSave} className="text-xl font-semibold !border-none !outline-none !ring-0 p-0 bg-transparent" style={{ boxShadow: "none" }} />
          </div>
        </Panel>
        <Panel position="top-right" className="p-4 flex items-center space-x-2">
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
        </Panel>
        {configuringNode && <ConfigurationModal
            isOpen={!!configuringNode}
            onClose={() => setConfiguringNode(null)}
            onSave={(config) => handleSaveConfiguration(configuringNode, config)}
            nodeInfo={configuringNode.nodeComponent}
            integrationName={configuringNode.integration.name}
            initialData={configuringNode.config}
        />}
        <Dialog open={showTriggerDialog} onOpenChange={setShowTriggerDialog}>
          <DialogContent className="max-w-4xl">
            <DialogHeader><DialogTitle>Select a Trigger</DialogTitle><DialogDescription>Select an integration to add a trigger to your workflow.</DialogDescription></DialogHeader>
            <div className="py-4">
              <ScrollArea className="h-[50vh]">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pr-4">
                  {availableIntegrations.map((integration) => (
                    <div key={integration.id}>
                      {integration.triggers.length > 0 && (
                        <>
                          <h3 className="font-semibold mb-2 text-sm flex items-center gap-2">{renderLogo(integration.id, integration.name)} {integration.name}</h3>
                          <div className="space-y-2">
                            {integration.triggers.map((trigger) => (
                              <div key={trigger.type} onClick={() => handleTriggerSelect(integration, trigger)} className="p-3 rounded-lg border hover:bg-muted cursor-pointer">
                                <p className="font-medium">{trigger.name}</p><p className="text-sm text-muted-foreground">{trigger.description}</p>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={showActionDialog} onOpenChange={setShowActionDialog}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>{selectedIntegration ? `Select an action for ${selectedIntegration.name}` : "Select an Integration"}</DialogTitle>
              <DialogDescription>{selectedIntegration ? "Choose an action to perform." : "Select an integration to see its available actions."}</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <ScrollArea className="h-[60vh]">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pr-4">
                  {!selectedIntegration ? (availableIntegrations.map((integration) =>
                      integration.actions.length > 0 ? (<div key={integration.id} onClick={() => setSelectedIntegration(integration)} className="p-4 rounded-lg border hover:bg-muted cursor-pointer flex flex-col items-center gap-2">{renderLogo(integration.id, integration.name)}<p className="font-semibold text-center">{integration.name}</p></div>) : null
                  )) : (
                    <>
                      <div className="col-span-1">
                        <Button variant="ghost" onClick={() => setSelectedIntegration(null)} className="mb-4"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Integrations</Button>
                        <div className="p-4 rounded-lg border flex flex-col items-center gap-2">{renderLogo(selectedIntegration.id, selectedIntegration.name)}<p className="font-semibold text-center">{selectedIntegration.name}</p><p className="text-sm text-muted-foreground text-center">{selectedIntegration.description}</p></div>
                      </div>
                      <div className="md:col-span-2">
                        <div className="space-y-3">
                          {selectedIntegration.actions.map((action: NodeComponent) => (
                            <div key={action.type} onClick={() => handleActionSelect(selectedIntegration, action)} className="p-3 rounded-lg border hover:bg-muted cursor-pointer"><p className="font-medium">{action.name}</p><p className="text-sm text-muted-foreground">{action.description}</p></div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </ScrollArea>
            </div>
            {!selectedIntegration && (<DialogFooter><Button variant="outline" onClick={() => { setShowActionDialog(false); setSelectedIntegration(null) }}>Cancel</Button></DialogFooter>)}
          </DialogContent>
        </Dialog>
      </ReactFlow>
    </div>
  )
}
