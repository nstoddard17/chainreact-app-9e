"use client"

import React, { useCallback, useState, useEffect, memo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  NodeTypes,
  EdgeTypes,
  Controls,
  Background,
  Handle,
  Position,
  NodeProps,
  EdgeProps,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { 
  Plus, Settings, Trash2, Bot, Zap, Workflow,
  PlusCircle, TestTube, Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'

// Custom Node Component - Matches CustomNode.tsx exactly
interface CustomNodeData {
  title: string
  description?: string
  type: string
  providerId?: string
  isTrigger?: boolean
  isAIAgent?: boolean
  config?: Record<string, any>
  onConfigure?: (id: string) => void
  onDelete?: (id: string) => void
  error?: string
}

const AIAgentCustomNode = memo(({ id, data, selected }: NodeProps) => {
  const {
    title,
    description,
    type,
    providerId,
    isTrigger,
    isAIAgent,
    config,
    onConfigure,
    onDelete,
    error
  } = data as CustomNodeData

  const component = ALL_NODE_COMPONENTS.find((c) => c.type === type)
  const hasMultipleOutputs = ["if_condition", "switch_case", "try_catch"].includes(type)
  
  const nodeHasConfiguration = (): boolean => {
    if (!component && !isAIAgent) return false
    if (isTrigger || isAIAgent) return true
    const hasConfigSchema = !!(component?.configSchema && component.configSchema.length > 0)
    return hasConfigSchema
  }

  const handleConfigure = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onConfigure) {
      onConfigure(id)
    }
  }

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (onDelete) {
      onDelete(id)
    }
  }

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (nodeHasConfiguration() && onConfigure) {
      onConfigure(id)
    }
  }

  return (
    <div
      className={cn(
        "relative w-[400px] bg-card rounded-lg shadow-sm border",
        selected ? "border-primary" : error ? "border-destructive" : "border-border",
        "hover:shadow-md transition-all duration-200",
        nodeHasConfiguration() ? "cursor-pointer" : ""
      )}
      data-testid={`node-${id}`}
      onDoubleClick={handleDoubleClick}
    >
      {error && (
        <div className="bg-destructive/10 border-b border-destructive/20 px-4 py-2">
          <p className="text-sm text-destructive font-medium">{error}</p>
        </div>
      )}

      <div className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            {/* Icon/Logo - match CustomNode exactly */}
            {providerId ? (
              <img
                src={`/integrations/${providerId}.svg`}
                alt={`${title || ''} logo`}
                className="w-8 h-8 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : isAIAgent ? (
              <Bot className="h-8 w-8 text-foreground" />
            ) : isTrigger ? (
              <Zap className="h-8 w-8 text-foreground" />
            ) : (
              component?.icon && React.createElement(component.icon, { className: "h-8 w-8 text-foreground" })
            )}
            
            {/* Title and Description */}
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-medium text-foreground">
                {title || (component && component.title) || 'Unnamed Action'}
              </h3>
              {description && (
                <p className="text-muted-foreground">{description}</p>
              )}
            </div>
          </div>
          
          {/* Action Buttons */}
          <div className="flex items-center space-x-2">
            {nodeHasConfiguration() && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleConfigure}
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    >
                      <Settings />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Configure {title} (or double-click)</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {!isTrigger && !isAIAgent && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleDelete}
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Delete {title}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>

      {/* Handles */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-muted-foreground border-2 border-background"
        />
      )}

      {hasMultipleOutputs ? (
        <>
          <Handle type="source" position={Position.Bottom} id="true" className="!w-3 !h-3 !bg-green-500" style={{ left: "25%" }} />
          <Handle type="source" position={Position.Bottom} id="false" className="!w-3 !h-3 !bg-red-500" style={{ left: "75%" }} />
        </>
      ) : (
        <Handle type="source" position={Position.Bottom} className="!w-3 !h-3 !bg-muted-foreground border-2 border-background" />
      )}
    </div>
  )
})

AIAgentCustomNode.displayName = 'AIAgentCustomNode'

// Custom Edge with Plus Button
const CustomEdgeWithButton = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data
}: EdgeProps) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition
  })

  const onAddNode = data?.onAddNode

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={style} />
      {onAddNode && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="opacity-0 hover:opacity-100 transition-opacity"
          >
            <Button
              size="icon"
              variant="outline"
              className="h-6 w-6 rounded-full bg-white border-gray-300 hover:border-primary"
              onClick={(e) => {
                e.stopPropagation()
                onAddNode({ x: labelX, y: labelY })
              }}
            >
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  )
}

const nodeTypes: NodeTypes = {
  custom: AIAgentCustomNode
}

const edgeTypes: EdgeTypes = {
  custom: CustomEdgeWithButton
}

// Main Visual Chain Builder Component
interface AIAgentVisualChainBuilderProps {
  chains?: any[]
  onChainsChange?: (chains: any[]) => void
  onOpenActionDialog?: () => void
  onActionSelect?: (callback: (action: any) => void) => void
}

function AIAgentVisualChainBuilder({
  chains = [],
  onChainsChange = () => {},
  onOpenActionDialog,
  onActionSelect
}: AIAgentVisualChainBuilderProps) {
  const { toast } = useToast()
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])

  // Initialize with only trigger and AI agent nodes
  useEffect(() => {
    const initialNodes: Node[] = [
      {
        id: 'trigger',
        type: 'custom',
        position: { x: 250, y: 50 },
        data: {
          title: 'Trigger',
          description: 'When workflow starts',
          type: 'trigger',
          isTrigger: true,
          onConfigure: () => {
            toast({
              title: "Trigger Configuration",
              description: "Trigger is configured in the main workflow"
            })
          }
        }
      },
      {
        id: 'ai-agent',
        type: 'custom',
        position: { x: 250, y: 200 },
        data: {
          title: 'AI Agent',
          description: 'Analyzes input and routes to appropriate chain',
          type: 'ai_agent',
          isAIAgent: true,
          onConfigure: () => {
            toast({
              title: "AI Agent Configuration",
              description: "Configure the AI agent settings in the tabs above"
            })
          }
        }
      }
    ]

    const initialEdges: Edge[] = [
      {
        id: 'e-trigger-ai',
        source: 'trigger',
        target: 'ai-agent',
        type: 'custom',
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2 },
        data: {
          onAddNode: (position: { x: number, y: number }) => {
            handleAddNodeBetween('trigger', 'ai-agent', position)
          }
        }
      }
    ]

    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [])

  // Forward declare these functions to avoid circular dependencies
  const handleAddNodeBetween = useCallback((sourceId: string, targetId: string, position: { x: number, y: number }) => {
    // Open action dialog to select a node to add
    if (onOpenActionDialog) {
      onOpenActionDialog()
      if (onActionSelect) {
        onActionSelect((action: any) => {
          const newNodeId = `node-${Date.now()}`
          const newNode: Node = {
            id: newNodeId,
            type: 'custom',
            position,
            data: {
              title: action.title || action.name,
              description: action.description,
              type: action.type,
              providerId: action.providerId,
              config: {},
              onConfigure: () => handleConfigureNode(newNodeId),
              onDelete: () => handleDeleteNode(newNodeId),
              onAddToChain: (nodeId: string) => handleAddToChain(nodeId),
              isLastInChain: false
            }
          }

          // Add the new node
          setNodes((nds) => [...nds, newNode])

          // Update edges to insert the new node between source and target
          setEdges((eds) => {
            const updatedEdges = eds.filter(e => !(e.source === sourceId && e.target === targetId))
            return [
              ...updatedEdges,
              {
                id: `e-${sourceId}-${newNodeId}`,
                source: sourceId,
                target: newNodeId,
                type: 'custom',
                data: {
                  onAddNode: (pos: { x: number, y: number }) => {
                    handleAddNodeBetween(sourceId, newNodeId, pos)
                  }
                }
              },
              {
                id: `e-${newNodeId}-${targetId}`,
                source: newNodeId,
                target: targetId,
                type: 'custom',
                data: {
                  onAddNode: (pos: { x: number, y: number }) => {
                    handleAddNodeBetween(newNodeId, targetId, pos)
                  }
                }
              }
            ]
          })
        })
      }
    }
  }, [onOpenActionDialog, onActionSelect])

  const onConnect = useCallback((params: Connection) => {
    const newEdge: Edge = {
      ...params,
      id: `e-${params.source}-${params.target}`,
      type: 'custom',
      animated: false,
      data: {
        onAddNode: (position: { x: number, y: number }) => {
          handleAddNodeBetween(params.source!, params.target!, position)
        }
      }
    }
    setEdges((eds) => addEdge(newEdge, eds))
  }, [handleAddNodeBetween])

  const handleConfigureNode = useCallback((nodeId: string) => {
    toast({
      title: "Configure Node",
      description: `Configure settings for node ${nodeId}`
    })
  }, [toast])

  const handleDeleteNode = useCallback((nodeId: string) => {
    // When deleting a node, check if we need to update isLastInChain for other nodes
    const edgesFromNode = edges.filter(e => e.source === nodeId)
    const edgesToNode = edges.filter(e => e.target === nodeId)
    
    // If this node was in the middle of a chain, the previous node becomes last
    if (edgesFromNode.length === 0 && edgesToNode.length > 0) {
      const previousNodeId = edgesToNode[0].source
      setNodes((nds) => nds.map(n => 
        n.id === previousNodeId 
          ? { ...n, data: { ...n.data, isLastInChain: true } }
          : n
      ).filter(n => n.id !== nodeId))
    } else {
      setNodes((nds) => nds.filter(n => n.id !== nodeId))
    }
    
    setEdges((eds) => eds.filter(e => e.source !== nodeId && e.target !== nodeId))
  }, [edges])

  // Add node to the end of a chain
  const handleAddToChain = useCallback((lastNodeId: string) => {
    if (onOpenActionDialog) {
      onOpenActionDialog()
      if (onActionSelect) {
        onActionSelect((action: any) => {
          const newNodeId = `node-${Date.now()}`
          const lastNode = nodes.find(n => n.id === lastNodeId)
          
          if (!lastNode) return
          
          const newNode: Node = {
            id: newNodeId,
            type: 'custom',
            position: { 
              x: lastNode.position.x + 200, 
              y: lastNode.position.y 
            },
            data: {
              title: action.title || action.name,
              description: action.description,
              type: action.type,
              providerId: action.providerId,
              config: {},
              onConfigure: () => handleConfigureNode(newNodeId),
              onDelete: () => handleDeleteNode(newNodeId),
              onAddToChain: (nodeId: string) => handleAddToChain(nodeId),
              isLastInChain: true
            }
          }

          // Update the previous last node to not be last anymore
          setNodes((nds) => nds.map(n => 
            n.id === lastNodeId 
              ? { ...n, data: { ...n.data, isLastInChain: false } }
              : n
          ).concat(newNode))

          // Connect from last node to new node
          setEdges((eds) => [...eds, {
            id: `e-${lastNodeId}-${newNodeId}`,
            source: lastNodeId,
            target: newNodeId,
            type: 'custom',
            data: {
              onAddNode: (pos: { x: number, y: number }) => {
                handleAddNodeBetween(lastNodeId, newNodeId, pos)
              }
            }
          }])
        })
      }
    }
  }, [nodes, onOpenActionDialog, onActionSelect, handleConfigureNode, handleDeleteNode, handleAddNodeBetween])

  // Create a new chain branching from AI Agent
  const handleCreateChain = useCallback(() => {
    if (onOpenActionDialog) {
      onOpenActionDialog()
      if (onActionSelect) {
        onActionSelect((action: any) => {
          const newNodeId = `node-${Date.now()}`
          
          // Find existing chains to position new chain appropriately
          const aiAgentConnections = edges.filter(e => e.source === 'ai-agent')
          const chainCount = aiAgentConnections.length
          
          // Position new chain to the right and slightly down from AI agent
          const baseX = 450
          const baseY = 200 + (chainCount * 100) // Space chains vertically
          
          const newNode: Node = {
            id: newNodeId,
            type: 'custom',
            position: { x: baseX, y: baseY },
            data: {
              title: action.title || action.name,
              description: action.description,
              type: action.type,
              providerId: action.providerId,
              config: {},
              onConfigure: () => handleConfigureNode(newNodeId),
              onDelete: () => handleDeleteNode(newNodeId),
              onAddToChain: (nodeId: string) => handleAddToChain(nodeId),
              isLastInChain: true
            }
          }

          setNodes((nds) => [...nds, newNode])

          // Connect from AI agent to start new chain
          setEdges((eds) => [...eds, {
            id: `e-ai-agent-${newNodeId}`,
            source: 'ai-agent',
            target: newNodeId,
            type: 'custom',
            data: {
              onAddNode: (pos: { x: number, y: number }) => {
                handleAddNodeBetween('ai-agent', newNodeId, pos)
              }
            }
          }])
        })
      }
    }
  }, [edges, onOpenActionDialog, onActionSelect, handleConfigureNode, handleDeleteNode, handleAddToChain, handleAddNodeBetween])

  return (
    <div className="h-[400px] w-full bg-slate-50 rounded-lg border">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        snapToGrid
        snapGrid={[15, 15]}
        className="bg-slate-50"
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={15} />
        <Controls />
        
        {/* Add Node Button */}
        <div className="absolute top-4 right-4 z-10">
          <Button
            size="sm"
            onClick={handleCreateChain}
            className="shadow-lg"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Chain
          </Button>
        </div>
      </ReactFlow>
    </div>
  )
}

// Wrapper component with ReactFlowProvider
export default function AIAgentVisualChainBuilderWrapper(props: AIAgentVisualChainBuilderProps) {
  return (
    <ReactFlowProvider>
      <AIAgentVisualChainBuilder {...props} />
    </ReactFlowProvider>
  )
}