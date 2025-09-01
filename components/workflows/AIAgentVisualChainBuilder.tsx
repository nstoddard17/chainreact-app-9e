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
  Panel,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { 
  Plus, Settings, Trash2, Bot, Zap, Workflow,
  PlusCircle, TestTube, Loader2, Layers
} from 'lucide-react'
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
  hasAddButton?: boolean
  config?: Record<string, any>
  onConfigure?: (id: string) => void
  onDelete?: (id: string) => void
  onAddAction?: () => void
  error?: string
  executionStatus?: 'pending' | 'running' | 'completed' | 'error' | null
  isActiveExecution?: boolean
  isListening?: boolean
  errorMessage?: string
  errorTimestamp?: string
}

const AIAgentCustomNode = memo(({ id, data, selected }: NodeProps) => {
  const {
    title,
    description,
    type,
    providerId,
    isTrigger,
    isAIAgent,
    hasAddButton,
    config,
    onConfigure,
    onDelete,
    onAddAction,
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
      className={`relative w-[400px] bg-card rounded-lg shadow-sm border ${
        selected ? "border-primary" : error ? "border-destructive" : "border-border"
      } hover:shadow-md transition-all duration-200 ${
        nodeHasConfiguration() ? "cursor-pointer" : ""
      }`}
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
            ) : type === 'chain_placeholder' ? (
              <Layers className="h-8 w-8 text-muted-foreground" />
            ) : isTrigger ? (
              <Zap className="h-8 w-8 text-foreground" />
            ) : isAIAgent ? (
              <Bot className="h-8 w-8 text-foreground" />
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
              {/* Add Action button for chain placeholders */}
              {type === 'chain_placeholder' && hasAddButton && onAddAction && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    onAddAction()
                  }}
                  className="mt-2 gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Action
                </Button>
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
                      aria-label={`Configure ${title}`}
                    >
                      <Settings className="w-4 h-4" />
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
                      aria-label={`Delete ${title}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top">Delete {title}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      </div>

      {/* Handles - matching main CustomNode.tsx exactly */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-muted-foreground border-2 border-background"
          style={{
            visibility: isTrigger ? "hidden" : "visible",
          }}
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

// Custom Edge with Plus Button - matching main workflow builder
const CustomEdgeWithButton = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
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
      <BaseEdge path={edgePath} style={style} />
      {onAddNode && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="group"
          >
            <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-6 w-6 rounded-full bg-background border-muted-foreground/20 hover:border-primary hover:bg-primary/10 shadow-sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        onAddNode({ x: labelX, y: labelY })
                      }}
                      aria-label="Insert node between connections"
                    >
                      <Plus className="w-3 h-3 text-muted-foreground" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Insert action here</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
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
  const { fitView, getZoom, setViewport } = useReactFlow()

  // Declare handleDeleteNode early for use in initialization
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

  const handleConfigureNode = useCallback((nodeId: string) => {
    toast({
      title: "Configure Node",
      description: `Configure settings for node ${nodeId}`
    })
  }, [toast])

  // Declare placeholder for handleAddToChain - will be defined later but needed in initialization
  const handleAddToChainRef = React.useRef<(nodeId: string) => void>()
  const handleAddToChain = useCallback((nodeId: string) => {
    if (handleAddToChainRef.current) {
      handleAddToChainRef.current(nodeId)
    }
  }, [])

  // Declare placeholder for handleAddActionToChain
  const handleAddActionToChainRef = React.useRef<(chainId: string, action: any) => void>()
  const handleAddActionToChain = useCallback((chainId: string, action: any) => {
    if (handleAddActionToChainRef.current) {
      handleAddActionToChainRef.current(chainId, action)
    }
  }, [])

  // Initialize with trigger, AI agent, and default chain - centered
  useEffect(() => {
    const centerX = 400 // Center of typical viewport
    const defaultChainId = 'chain-default'
    
    const initialNodes: Node[] = [
      {
        id: 'trigger',
        type: 'custom',
        position: { x: centerX, y: 50 },
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
        position: { x: centerX, y: 200 },
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
      },
      {
        id: defaultChainId,
        type: 'custom',
        position: { x: centerX, y: 400 },
        data: {
          title: 'Chain 1',
          description: 'Add actions to build your workflow',
          type: 'chain_placeholder',
          isTrigger: false,
          hasAddButton: true,
          config: {},
          onConfigure: () => {
            if (onOpenActionDialog) {
              onOpenActionDialog()
            }
          },
          onDelete: () => handleDeleteNode(defaultChainId),
          onAddToChain: (nodeId: string) => handleAddToChain(nodeId),
          onAddAction: () => {
            if (onOpenActionDialog) {
              onOpenActionDialog()
              if (onActionSelect) {
                onActionSelect((action: any) => {
                  handleAddActionToChain(defaultChainId, action)
                })
              }
            }
          },
          isLastInChain: true
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
        style: { 
          stroke: '#94a3b8', 
          strokeWidth: 2,
        },
        data: {
          onAddNode: (position: { x: number, y: number }) => {
            handleAddNodeBetween('trigger', 'ai-agent', position)
          }
        }
      },
      {
        id: 'e-ai-agent-chain-default',
        source: 'ai-agent',
        target: defaultChainId,
        type: 'custom',
        style: { 
          stroke: '#94a3b8',
          strokeWidth: 2 
        },
        data: {
          onAddNode: (position: { x: number, y: number }) => {
            handleAddNodeBetween('ai-agent', defaultChainId, position)
          }
        }
      }
    ]

    setNodes(initialNodes)
    setEdges(initialEdges)
    
    // Center view after initial load
    setTimeout(() => {
      fitView({ padding: 0.2, duration: 400 })
    }, 100)
  }, [fitView])

  // Update the ref with the actual implementation
  React.useEffect(() => {
    handleAddActionToChainRef.current = (chainId: string, action: any) => {
      const chainNode = nodes.find(n => n.id === chainId)
      if (!chainNode) return
      
      const newNodeId = `node-${Date.now()}`
      
      // Create the action node at the same position as the chain placeholder
      const newNode: Node = {
        id: newNodeId,
        type: 'custom',
        position: { ...chainNode.position },
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
      
      // Update nodes - replace the placeholder with the actual action
      setNodes((nds) => nds.map(n => n.id === chainId ? newNode : n))
      
      // Update edges to point to the new node
      setEdges((eds) => eds.map(e => {
        if (e.target === chainId) {
          return { ...e, target: newNodeId }
        }
        if (e.source === chainId) {
          return { ...e, source: newNodeId }
        }
        return e
      }))
    }
  }, [nodes, handleConfigureNode, handleDeleteNode, handleAddToChain])

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
                style: { 
                  stroke: '#94a3b8',
                  strokeWidth: 2 
                },
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
                style: { 
                  stroke: '#94a3b8',
                  strokeWidth: 2 
                },
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
      id: `e-${params.source}-${params.target}`,
      source: params.source!,
      target: params.target!,
      sourceHandle: params.sourceHandle,
      targetHandle: params.targetHandle,
      type: 'custom',
      animated: false,
      style: { 
        stroke: '#94a3b8',
        strokeWidth: 2 
      },
      data: {
        onAddNode: (position: { x: number, y: number }) => {
          handleAddNodeBetween(params.source!, params.target!, position)
        }
      }
    }
    setEdges((eds) => addEdge(newEdge, eds))
  }, [handleAddNodeBetween])

  // Update the handleAddToChain ref with actual implementation
  React.useEffect(() => {
    handleAddToChainRef.current = (lastNodeId: string) => {
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
            style: { 
              stroke: '#94a3b8',
              strokeWidth: 2 
            },
            data: {
              onAddNode: (pos: { x: number, y: number }) => {
                handleAddNodeBetween(lastNodeId, newNodeId, pos)
              }
            }
          }])
        })
      }
    }
    }
  }, [nodes, onOpenActionDialog, onActionSelect, handleConfigureNode, handleDeleteNode, handleAddNodeBetween])

  // Create a new chain branching from AI Agent
  const handleCreateChain = useCallback(() => {
    const newChainId = `chain-${Date.now()}`
    const newNodeId = `${newChainId}-start`
    
    // Find AI agent node position
    const aiAgentNode = nodes.find(n => n.id === 'ai-agent')
    if (!aiAgentNode) return
    
    // Find existing chain nodes (exclude trigger and ai-agent)
    const chainNodes = nodes.filter(n => 
      n.id !== 'trigger' && 
      n.id !== 'ai-agent'
    )
    
    // Calculate position - place chains in a grid pattern below AI agent
    const chainsPerRow = 3
    const chainIndex = chainNodes.length
    const row = Math.floor(chainIndex / chainsPerRow)
    const col = chainIndex % chainsPerRow
    
    // Position calculation
    const horizontalSpacing = 250
    const verticalSpacing = 200
    const startX = aiAgentNode.position.x - ((chainsPerRow - 1) * horizontalSpacing / 2)
    const newX = startX + (col * horizontalSpacing)
    const newY = aiAgentNode.position.y + 200 + (row * verticalSpacing)
    
    // Create a placeholder chain start node
    const newNode: Node = {
      id: newNodeId,
      type: 'custom',
      position: { x: newX, y: newY },
      data: {
        title: `Chain ${chainNodes.length + 1}`,
        description: 'Add actions to build your workflow',
        type: 'chain_placeholder',
        isTrigger: false,
        hasAddButton: true,
        config: {},
        onConfigure: () => {
          if (onOpenActionDialog) {
            onOpenActionDialog()
          }
        },
        onDelete: () => handleDeleteNode(newNodeId),
        onAddToChain: (nodeId: string) => handleAddToChain(nodeId),
        onAddAction: () => {
          if (onOpenActionDialog) {
            onOpenActionDialog()
            if (onActionSelect) {
              onActionSelect((action: any) => {
                handleAddActionToChain(newNodeId, action)
              })
            }
          }
        },
        isLastInChain: true
      }
    }

    setNodes((nds) => [...nds, newNode])

    // Connect from AI agent to the new chain
    setEdges((eds) => [...eds, {
      id: `e-ai-agent-${newNodeId}`,
      source: 'ai-agent',
      target: newNodeId,
      type: 'custom',
      style: { 
        stroke: '#94a3b8',
        strokeWidth: 2 
      },
      data: {
        onAddNode: (pos: { x: number, y: number }) => {
          handleAddNodeBetween('ai-agent', newNodeId, pos)
        }
      }
    }])

    // Auto-zoom to fit all nodes with animation
    setTimeout(() => {
      fitView({ 
        padding: 0.15, 
        duration: 500,
        maxZoom: 1.5,
        minZoom: 0.3
      })
    }, 50)

    toast({
      title: "New Chain Added",
      description: "Click the + button on connections to add actions to your chain"
    })
  }, [nodes, edges, setNodes, setEdges, handleDeleteNode, handleAddToChain, handleAddNodeBetween, fitView, toast])

  return (
    <div className="h-[calc(95vh-400px)] min-h-[400px] w-full bg-slate-50 rounded-lg border relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{
          padding: 0.2,
          includeHiddenNodes: false,
          maxZoom: 1.2,
          minZoom: 0.3,
        }}
        snapToGrid
        snapGrid={[15, 15]}
        className="bg-slate-50"
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          type: 'custom',
          style: { 
            stroke: '#94a3b8',
            strokeWidth: 2 
          },
        }}
      >
        <Background gap={15} color="#e2e8f0" />
        <Controls />
        
        {/* Add New Chain Button - matching main workflow builder style */}
        <div className="absolute top-4 right-4 z-10">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={handleCreateChain}
                  className="shadow-lg bg-primary text-primary-foreground hover:bg-primary/90"
                  aria-label="Add New Chain"
                >
                  <PlusCircle className="w-4 h-4 mr-2" />
                  Add New Chain
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                <p>Add a new action chain to the AI Agent</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        
        {/* Zoom Level Indicator */}
        <Panel position="top-left">
          <div className="bg-card/90 backdrop-blur px-2 py-1 rounded shadow-sm text-xs text-muted-foreground">
            AI Agent Chain Builder
          </div>
        </Panel>
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
