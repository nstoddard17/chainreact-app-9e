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
import { AddActionNode } from './AddActionNode'

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

      {/* Centered Add Action button for chain placeholders */}
      {type === 'chain_placeholder' && hasAddButton && onAddAction && (
        <div className="px-4 pb-4 flex justify-center">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation()
              onAddAction()
            }}
            className="gap-2 w-full max-w-[200px]"
          >
            <Plus className="w-4 h-4" />
            Add Action
          </Button>
        </div>
      )}

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
  const [isHovered, setIsHovered] = React.useState(false)

  return (
    <g 
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{ cursor: onAddNode ? 'pointer' : 'default' }}
    >
      {/* Invisible wider path for better hover detection */}
      <path
        d={edgePath}
        fill="none"
        strokeWidth={40}
        stroke="transparent"
        style={{ pointerEvents: 'stroke' }}
      />
      
      {/* Visible edge */}
      <BaseEdge path={edgePath} style={style} />
      
      {/* Plus button that appears on hover */}
      {onAddNode && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              opacity: isHovered ? 1 : 0,
              transition: 'opacity 200ms'
            }}
          >
            <div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7 rounded-full bg-white border-2 border-blue-500 hover:border-blue-600 hover:bg-blue-50 shadow-md transition-all"
                      onClick={(e) => {
                        e.stopPropagation()
                        onAddNode({ x: labelX, y: labelY })
                      }}
                      aria-label="Insert node between connections"
                    >
                      <Plus className="w-4 h-4 text-blue-600" />
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
    </g>
  )
}

const nodeTypes: NodeTypes = {
  custom: AIAgentCustomNode,
  addAction: AddActionNode as React.ComponentType<NodeProps>
}

const edgeTypes: EdgeTypes = {
  custom: CustomEdgeWithButton
}

// Main Visual Chain Builder Component
interface AIAgentVisualChainBuilderProps {
  chains?: any[]
  onChainsChange?: (chains: any[]) => void
  onOpenActionDialog?: () => void
  onActionSelect?: (callback: (actionType: string, providerId: string, config?: any) => void) => void
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
}

function AIAgentVisualChainBuilder({
  chains = [],
  onChainsChange = () => {},
  onOpenActionDialog,
  onActionSelect,
  workflowData,
  currentNodeId
}: AIAgentVisualChainBuilderProps) {
  const { toast } = useToast()
  const [nodes, setNodes, onNodesChangeBase] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const { fitView, getZoom, setViewport } = useReactFlow()
  
  // Store previous chains to prevent unnecessary updates
  const previousChainsRef = React.useRef<string>('')
  
  // Convert nodes and edges to chains format for parent component
  const syncChainsToParent = useCallback(() => {
    // Extract chains from the current node/edge structure
    const extractedChains = []
    const processedNodes = new Set()
    
    // Find all chain start nodes (connected directly to AI agent)
    const aiAgentEdges = edges.filter(e => e.source === 'ai-agent')
    
    aiAgentEdges.forEach(edge => {
      const chain = []
      let currentNodeId = edge.target
      
      // Walk through the chain
      while (currentNodeId && !processedNodes.has(currentNodeId)) {
        const node = nodes.find(n => n.id === currentNodeId)
        if (!node || node.type === 'addAction') break
        
        // Skip chain placeholder nodes - only include actual actions
        if (node.data?.type !== 'chain_placeholder') {
          chain.push({
            id: node.id,
            type: node.data?.type,
            providerId: node.data?.providerId,
            config: node.data?.config || {},
            title: node.data?.title,
            description: node.data?.description,
            // Include position information for exact placement
            position: {
              x: node.position.x,
              y: node.position.y
            }
          })
        }
        
        processedNodes.add(currentNodeId)
        
        // Find next node in chain
        const nextEdge = edges.find(e => e.source === currentNodeId && !e.target.includes('add-action'))
        currentNodeId = nextEdge?.target || null
      }
      
      if (chain.length > 0) {
        extractedChains.push(chain)
      }
    })
    
    // Get AI Agent node position for reference
    const aiAgentNode = nodes.find(n => n.id === 'ai-agent')
    
    // Include layout information with chains
    const chainsWithLayout = {
      chains: extractedChains,
      aiAgentPosition: aiAgentNode ? {
        x: aiAgentNode.position.x,
        y: aiAgentNode.position.y
      } : { x: 250, y: 200 }
    }
    
    // Only update if chains actually changed
    const chainsString = JSON.stringify(chainsWithLayout)
    if (chainsString !== previousChainsRef.current) {
      previousChainsRef.current = chainsString
      onChainsChange(chainsWithLayout)
    }
  }, [nodes, edges, onChainsChange])
  
  // Custom onNodesChange to handle Add Action nodes following their parent
  const onNodesChange = useCallback((changes: any) => {
    // Apply the base changes first
    onNodesChangeBase(changes)
    
    // Check if any position changes occurred (both during and after dragging)
    const positionChanges = changes.filter((change: any) => change.type === 'position')
    
    if (positionChanges.length > 0) {
      setNodes((nds) => {
        const updatedNodes = [...nds]
        
        // For each position change, update connected Add Action nodes
        positionChanges.forEach((change: any) => {
          const parentNodeIndex = updatedNodes.findIndex(n => n.id === change.id)
          if (parentNodeIndex !== -1) {
            // Update the parent node's position
            if (change.position) {
              updatedNodes[parentNodeIndex] = {
                ...updatedNodes[parentNodeIndex],
                position: change.position
              }
              
              // Trigger immediate sync for position changes
              setTimeout(() => syncChainsToParent(), 0)
            }
            
            // Find and update Add Action nodes that should follow this parent
            const addActionIndex = updatedNodes.findIndex(n => 
              n.type === 'addAction' && n.data?.parentId === change.id
            )
            
            if (addActionIndex !== -1 && change.position) {
              // Update Add Action node position to follow parent
              updatedNodes[addActionIndex] = {
                ...updatedNodes[addActionIndex],
                position: {
                  x: change.position.x,
                  y: change.position.y + 160
                }
              }
            }
          }
        })
        
        return updatedNodes
      })
    }
  }, [onNodesChangeBase, setNodes, syncChainsToParent])

  // Sync chains whenever nodes or edges change - with minimal debouncing for real-time updates
  React.useEffect(() => {
    // Only sync if we have meaningful nodes (not just AI agent and placeholders)
    const hasActualActions = nodes.some(n => 
      n.id !== 'ai-agent' && 
      n.type !== 'addAction' && 
      n.data?.type !== 'chain_placeholder'
    )
    
    // Use a very short timeout to prevent infinite loops but keep it responsive
    const timeoutId = setTimeout(() => {
      if (hasActualActions || nodes.length > 1) {
        syncChainsToParent()
      }
    }, 10) // Reduced from 100ms to 10ms for near real-time updates
    
    return () => clearTimeout(timeoutId)
  }, [nodes, edges, syncChainsToParent]) // Watch actual arrays, not just lengths

  // Forward declare refs to avoid circular dependencies
  const handleAddToChainRef = React.useRef<(nodeId: string) => void>()
  const handleAddActionToChainRef = React.useRef<(chainId: string, actionType: string, providerId: string, config?: any) => void>()
  const handleDeleteNodeRef = React.useRef<(nodeId: string) => void>()
  const handleAddNodeBetweenRef = React.useRef<(sourceId: string, targetId: string, position: { x: number, y: number }) => void>()
  
  // Forward declare handleConfigureNode
  const handleConfigureNode = useCallback((nodeId: string) => {
    toast({
      title: "Configure Node",
      description: `Configure settings for node ${nodeId}`
    })
  }, [toast])
  
  // Declare handleAddNodeBetween before handleDeleteNode to avoid initialization error
  const handleAddNodeBetween = useCallback((sourceId: string, targetId: string, position: { x: number, y: number }) => {
    // Open action dialog to select a node to add
    if (onOpenActionDialog) {
      onOpenActionDialog()
      if (onActionSelect) {
        onActionSelect((actionType: string, providerId: string, config?: any) => {
          const newNodeId = `node-${Date.now()}`
          const actionComponent = ALL_NODE_COMPONENTS.find(n => n.type === actionType)
          const newNode: Node = {
            id: newNodeId,
            type: 'custom',
            position,
            data: {
              title: actionComponent?.title || actionType,
              description: actionComponent?.description || '',
              type: actionType,
              providerId: providerId,
              config: config || {},
              onConfigure: () => handleConfigureNode(newNodeId),
              onDelete: () => handleDeleteNodeRef.current?.(newNodeId),
              onAddToChain: (nodeId: string) => handleAddToChainRef.current?.(nodeId),
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
          
          // Auto-center the view to show all nodes after adding the node
          setTimeout(() => {
            fitView({ 
              padding: 0.2, 
              includeHiddenNodes: false,
              duration: 400,
              maxZoom: 1.5,
              minZoom: 0.1
            })
          }, 150)
        })
      }
    }
  }, [onOpenActionDialog, onActionSelect, fitView, setNodes, setEdges, handleConfigureNode])
  
  // Set the ref after the function is defined
  React.useEffect(() => {
    handleAddNodeBetweenRef.current = handleAddNodeBetween
  }, [handleAddNodeBetween])

  // Now declare handleDeleteNode which can safely reference handleAddNodeBetween
  const handleDeleteNode = useCallback((nodeId: string) => {
    // Find edges connected to this node
    const edgesFromNode = edges.filter(e => e.source === nodeId)
    const edgesToNode = edges.filter(e => e.target === nodeId)
    
    // Check if this is an Add Action node - if so, just remove it
    const nodeToDelete = nodes.find(n => n.id === nodeId)
    if (nodeToDelete?.type === 'addAction') {
      setNodes((nds) => nds.filter(n => n.id !== nodeId))
      setEdges((eds) => eds.filter(e => e.source !== nodeId && e.target !== nodeId))
      return
    }
    
    // If the node is in the middle of a chain, reconnect the chain
    if (edgesFromNode.length > 0 && edgesToNode.length > 0) {
      const previousNodeId = edgesToNode[0].source
      const nextNodeId = edgesFromNode[0].target
      
      // Create new edge to reconnect the chain
      const newEdge: Edge = {
        id: `e-${previousNodeId}-${nextNodeId}`,
        source: previousNodeId,
        target: nextNodeId,
        type: 'custom',
        style: { 
          stroke: '#94a3b8',
          strokeWidth: 2 
        },
        data: {
          onAddNode: (pos: { x: number, y: number }) => {
            handleAddNodeBetween(previousNodeId, nextNodeId, pos)
          }
        }
      }
      
      // Update edges - remove old ones and add the reconnection
      setEdges((eds) => [
        ...eds.filter(e => e.source !== nodeId && e.target !== nodeId),
        newEdge
      ])
      
      // Remove the node
      setNodes((nds) => nds.filter(n => n.id !== nodeId))
    } else {
      // Node is at the end or beginning of chain
      if (edgesFromNode.length === 0 && edgesToNode.length > 0) {
        // This was the last node in a chain
        const previousNodeId = edgesToNode[0].source
        
        // Check if previous node should have an Add Action node
        const previousNode = nodes.find(n => n.id === previousNodeId)
        if (previousNode && previousNode.type !== 'ai_agent' && previousNode.type !== 'trigger') {
          // Create Add Action node after the previous node
          const addActionNodeId = `add-action-${previousNodeId}`
          const addActionNode: Node = {
            id: addActionNodeId,
            type: 'addAction',
            position: { 
              x: previousNode.position.x, 
              y: previousNode.position.y + 160 
            },
            data: {
              parentId: previousNodeId,
              onClick: () => {
                handleAddToChainRef.current?.(previousNodeId)
              }
            }
          }
          
          // Update nodes - remove deleted node, mark previous as last, add Add Action
          setNodes((nds) => [
            ...nds.filter(n => n.id !== nodeId).map(n => 
              n.id === previousNodeId 
                ? { ...n, data: { ...n.data, isLastInChain: true } }
                : n
            ),
            addActionNode
          ])
          
          // Add edge to Add Action node
          const newEdge: Edge = {
            id: `e-${previousNodeId}-${addActionNodeId}`,
            source: previousNodeId,
            target: addActionNodeId,
            type: 'straight',
            animated: true,
            style: { 
              stroke: '#b1b1b7', 
              strokeWidth: 2, 
              strokeDasharray: '5,5' 
            }
          }
          
          setEdges((eds) => [
            ...eds.filter(e => e.source !== nodeId && e.target !== nodeId),
            newEdge
          ])
        } else {
          // Just remove the node and edges
          setNodes((nds) => nds.filter(n => n.id !== nodeId))
          setEdges((eds) => eds.filter(e => e.source !== nodeId && e.target !== nodeId))
        }
      } else {
        // Node is at the beginning or isolated - just remove it
        setNodes((nds) => nds.filter(n => n.id !== nodeId))
        setEdges((eds) => eds.filter(e => e.source !== nodeId && e.target !== nodeId))
      }
    }
  }, [edges, nodes, handleAddNodeBetween, setNodes, setEdges])
  
  // Set the ref after the function is defined
  React.useEffect(() => {
    handleDeleteNodeRef.current = handleDeleteNode
  }, [handleDeleteNode])

  // Wrapper functions for refs
  const handleAddToChain = useCallback((nodeId: string) => {
    if (handleAddToChainRef.current) {
      handleAddToChainRef.current(nodeId)
    }
  }, [])
  const handleAddActionToChain = useCallback((chainId: string, actionType: string, providerId: string, config?: any) => {
    if (handleAddActionToChainRef.current) {
      handleAddActionToChainRef.current(chainId, actionType, providerId, config)
    }
  }, [])

  // Track if we've initialized to prevent re-initialization
  const initializedRef = React.useRef(false)
  
  // Helper function for default initialization
  const initializeDefaultSetup = useCallback(() => {
    const centerX = 400 // Center of typical viewport
    const defaultChainId = 'chain-default'
    
    // Try to get trigger from workflow data if available
    let triggerNode = null
    if (workflowData?.nodes) {
      const workflowTrigger = workflowData.nodes.find(n => n.data?.isTrigger)
      if (workflowTrigger) {
        // Use the actual trigger from the workflow
        const triggerComponent = ALL_NODE_COMPONENTS.find(c => c.type === workflowTrigger.data?.type)
        triggerNode = {
          id: 'trigger',
          type: 'custom',
          position: { x: centerX, y: 50 },
          data: {
            ...workflowTrigger.data,
            title: triggerComponent?.title || workflowTrigger.data?.title || 'Trigger',
            description: triggerComponent?.description || workflowTrigger.data?.description || 'When workflow starts',
            onConfigure: () => {
              toast({
                title: "Trigger Configuration",
                description: "Trigger is configured in the main workflow"
              })
            }
          }
        }
      }
    }
    
    // Default trigger if none found
    if (!triggerNode) {
      triggerNode = {
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
      }
    }
    
    const initialNodes: Node[] = [
      triggerNode,
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
          onDelete: () => handleDeleteNodeRef.current?.(defaultChainId),
          onAddToChain: (nodeId: string) => handleAddToChainRef.current?.(nodeId),
          onAddAction: () => {
            if (onOpenActionDialog) {
              onOpenActionDialog()
              if (onActionSelect) {
                onActionSelect((actionType: string, providerId: string, config?: any) => {
                  handleAddActionToChainRef.current?.(defaultChainId, actionType, providerId, config)
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
            handleAddNodeBetweenRef.current?.('trigger', 'ai-agent', position)
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
            handleAddNodeBetweenRef.current?.('ai-agent', defaultChainId, position)
          }
        }
      }
    ]

    setNodes(initialNodes)
    setEdges(initialEdges)
    
    // Center view after initial load to show all nodes
    setTimeout(() => {
      if (fitView) {
        fitView({ 
          padding: 0.2, 
          includeHiddenNodes: false,
          duration: 400,
          maxZoom: 1.5,
          minZoom: 0.1
        })
      }
    }, 100)
  }, [setNodes, setEdges, fitView, toast, onOpenActionDialog, onActionSelect, workflowData])
  
  // Initialize with workflow data or default setup
  useEffect(() => {
    // Only initialize once
    if (initializedRef.current) return
    initializedRef.current = true
    
    // If we have workflow data, use it to initialize
    if (workflowData?.nodes && workflowData?.edges) {
      console.log('🔄 [AIAgentVisualChainBuilder] Initializing with workflow data:', workflowData)
      
      // Find AI Agent node and its children from workflow data
      const aiAgentNode = workflowData.nodes.find(n => n.id === currentNodeId || n.data?.type === 'ai_agent')
      if (!aiAgentNode) {
        console.warn('⚠️ [AIAgentVisualChainBuilder] No AI Agent node found in workflow data')
        // Fall back to default initialization
        initializeDefaultSetup()
        return
      }
      
      // Filter nodes that are part of the AI Agent's chains
      const relevantNodes = workflowData.nodes.filter(n => {
        // Include the AI Agent node itself
        if (n.id === aiAgentNode.id) return true
        // Include nodes that are children of the AI Agent
        if (n.data?.parentAIAgentId === aiAgentNode.id) return true
        // Include the trigger node if it exists
        if (n.data?.isTrigger) return true
        // Include nodes connected to AI Agent through edges
        const hasConnectionToAIAgent = workflowData.edges.some(e => 
          (e.source === aiAgentNode.id && e.target === n.id) ||
          (e.target === aiAgentNode.id && e.source === n.id)
        )
        if (hasConnectionToAIAgent) return true
        // Include Add Action nodes for AI Agent chains
        if (n.type === 'addAction' && n.data?.parentAIAgentId === aiAgentNode.id) return true
        return false
      })
      
      // Map the nodes to ensure they have the correct handlers
      const mappedNodes = relevantNodes.map(node => ({
        ...node,
        data: {
          ...node.data,
          onConfigure: node.data?.type !== 'trigger' && node.data?.type !== 'ai_agent' 
            ? () => handleConfigureNode(node.id) 
            : node.data?.onConfigure,
          onDelete: node.data?.type !== 'trigger' && node.data?.type !== 'ai_agent'
            ? () => handleDeleteNode(node.id)
            : undefined,
          onAddToChain: node.data?.hasAddButton 
            ? (nodeId: string) => handleAddToChain(nodeId)
            : undefined
        }
      }))
      
      // Filter edges that connect relevant nodes
      const relevantEdges = workflowData.edges.filter(e => {
        const sourceRelevant = relevantNodes.some(n => n.id === e.source)
        const targetRelevant = relevantNodes.some(n => n.id === e.target)
        return sourceRelevant && targetRelevant
      })
      
      // Deduplicate edges by keeping only the first occurrence of each ID
      const seenEdgeIds = new Set()
      const uniqueEdges = relevantEdges.filter(edge => {
        if (seenEdgeIds.has(edge.id)) {
          console.log(`⚠️ [AIAgentVisualChainBuilder] Filtering duplicate edge: ${edge.id}`)
          return false
        }
        seenEdgeIds.add(edge.id)
        return true
      })
      
      // Map edges to include handlers
      const mappedEdges = uniqueEdges.map(edge => ({
        ...edge,
        type: edge.type || 'custom',
        data: {
          ...edge.data,
          onAddNode: (position: { x: number, y: number }) => {
            handleAddNodeBetween(edge.source, edge.target, position)
          }
        }
      }))
      
      // Set the nodes and edges from workflow data
      setNodes(mappedNodes)
      setEdges(mappedEdges)
      
      // Center view after loading
      setTimeout(() => {
        fitView({
          padding: 0.2,
          includeHiddenNodes: false,
          duration: 400,
          maxZoom: 1.5,
          minZoom: 0.1
        })
      }, 100)
      
      return
    }
    
    // Fall back to default initialization if no workflow data
    initializeDefaultSetup()
  }, [workflowData, currentNodeId, initializeDefaultSetup, setNodes, setEdges, fitView, handleConfigureNode, handleDeleteNode, handleAddToChain, handleAddNodeBetween])

  // Update the ref with the actual implementation
  React.useEffect(() => {
    handleAddActionToChainRef.current = (chainId: string, actionType: string, providerId: string, config?: any) => {
      const chainNode = nodes.find(n => n.id === chainId)
      if (!chainNode) return
      
      const newNodeId = `node-${Date.now()}`
      
      // Find the action details from ALL_NODE_COMPONENTS
      const actionComponent = ALL_NODE_COMPONENTS.find(n => n.type === actionType)
      
      // Create the action node at the same position as the chain placeholder
      const newNode: Node = {
        id: newNodeId,
        type: 'custom',
        position: { ...chainNode.position },
        data: {
          title: actionComponent?.title || actionType,
          description: actionComponent?.description || '',
          type: actionType,
          providerId: providerId,
          config: config || {},  // Include the AI config or manual config
          onConfigure: () => handleConfigureNode(newNodeId),
          onDelete: () => handleDeleteNode(newNodeId),
          onAddToChain: (nodeId: string) => handleAddToChain(nodeId),
          isLastInChain: true
        }
      }
      
      // Create Add Action node after the new action
      const addActionNodeId = `add-action-${newNodeId}`
      const addActionNode: Node = {
        id: addActionNodeId,
        type: 'addAction',
        position: { 
          x: chainNode.position.x, 
          y: chainNode.position.y + 160 
        },
        data: {
          parentId: newNodeId,
          onClick: () => {
            if (onOpenActionDialog) {
              onOpenActionDialog()
              if (onActionSelect) {
                onActionSelect((actionType: string, providerId: string, config?: any) => {
                  // This will add the action after the current node
                  handleAddToChainRef.current?.(newNodeId)
                })
              }
            }
          }
        }
      }
      
      // Update nodes - replace the placeholder with the actual action and add the Add Action node
      setNodes((nds) => [
        ...nds.filter(n => n.id !== chainId),
        newNode,
        addActionNode
      ])
      // Trigger immediate sync for real-time updates
      setTimeout(() => syncChainsToParent(), 0)
      
      // Update edges to point to the new node and connect to Add Action node
      setEdges((eds) => [
        ...eds.map(e => {
          if (e.target === chainId) {
            return { ...e, target: newNodeId }
          }
          if (e.source === chainId) {
            return { ...e, source: newNodeId }
          }
          return e
        }),
        // Add edge from new node to Add Action node
        {
          id: `e-${newNodeId}-${addActionNodeId}`,
          source: newNodeId,
          target: addActionNodeId,
          type: 'straight',
          animated: true,
          style: { 
            stroke: '#b1b1b7', 
            strokeWidth: 2, 
            strokeDasharray: '5,5' 
          }
        }
      ])
      
      // Auto-center the view to show all nodes after adding the action
      setTimeout(() => {
        fitView({ 
          padding: 0.2, 
          includeHiddenNodes: false,
          duration: 400,
          maxZoom: 1.5,
          minZoom: 0.1
        })
      }, 150)
    }
  }, [nodes, handleConfigureNode, handleDeleteNode, handleAddToChain, fitView, syncChainsToParent])

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
        onActionSelect((actionType: string, providerId: string, config?: any) => {
          const newNodeId = `node-${Date.now()}`
          const lastNode = nodes.find(n => n.id === lastNodeId)
          
          if (!lastNode) return
          
          const actionComponent = ALL_NODE_COMPONENTS.find(n => n.type === actionType)
          
          const newNode: Node = {
            id: newNodeId,
            type: 'custom',
            position: { 
              x: lastNode.position.x + 200, 
              y: lastNode.position.y 
            },
            data: {
              title: actionComponent?.title || actionType,
              description: actionComponent?.description || '',
              type: actionType,
              providerId: providerId,
              config: config || {},
              onConfigure: () => handleConfigureNode(newNodeId),
              onDelete: () => handleDeleteNodeRef.current?.(newNodeId),
              onAddToChain: (nodeId: string) => handleAddToChainRef.current?.(nodeId),
              isLastInChain: true
            }
          }

          // Create Add Action node after the new node
          const addActionNodeId = `add-action-${newNodeId}`
          const addActionNode: Node = {
            id: addActionNodeId,
            type: 'addAction',
            position: { 
              x: newNode.position.x, 
              y: newNode.position.y + 160 
            },
            data: {
              parentId: newNodeId,
              onClick: () => {
                handleAddToChainRef.current?.(newNodeId)
              }
            }
          }

          // Update the previous last node to not be last anymore and add both new nodes
          setNodes((nds) => [
            ...nds.map(n => 
              n.id === lastNodeId 
                ? { ...n, data: { ...n.data, isLastInChain: false } }
                : n
            ),
            newNode,
            addActionNode
          ])
          // Trigger immediate sync for real-time updates
          setTimeout(() => syncChainsToParent(), 0)

          // Connect from last node to new node and from new node to Add Action
          setEdges((eds) => [...eds, 
            {
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
            },
            {
              id: `e-${newNodeId}-${addActionNodeId}`,
              source: newNodeId,
              target: addActionNodeId,
              type: 'straight',
              animated: true,
              style: { 
                stroke: '#b1b1b7', 
                strokeWidth: 2, 
                strokeDasharray: '5,5' 
              }
            }
          ])
          
          // Auto-center the view to show all nodes after adding the action
          setTimeout(() => {
            fitView({ 
              padding: 0.2, 
              includeHiddenNodes: false,
              duration: 400,
              maxZoom: 1.5,
              minZoom: 0.1
            })
          }, 150)
        })
      }
    }
    }
  }, [nodes, onOpenActionDialog, onActionSelect, handleConfigureNode, handleDeleteNode, handleAddNodeBetween, fitView, syncChainsToParent])

  // Create a new chain branching from AI Agent
  const handleCreateChain = useCallback(() => {
    const newChainId = `chain-${Date.now()}`
    const newNodeId = `${newChainId}-start`
    
    // Find AI agent node position
    const aiAgentNode = nodes.find(n => n.id === 'ai-agent')
    if (!aiAgentNode) return
    
    // Find existing chain placeholder nodes only (not action nodes within chains)
    const chainPlaceholders = nodes.filter(n => 
      n.data?.type === 'chain_placeholder'
    )
    
    // Find the farthest right node of ANY type (not just chain placeholders)
    const allNonAIAgentNodes = nodes.filter(n => n.id !== 'ai-agent' && n.type !== 'addAction')
    
    // Calculate position - place chains with proper spacing
    const horizontalSpacing = 150  // Further reduced spacing between chains (was 250, originally 500)
    const baseY = aiAgentNode.position.y + 200
    let newX: number
    let newY: number
    
    if (allNonAIAgentNodes.length === 0) {
      // First chain - directly below AI agent
      newX = aiAgentNode.position.x
      newY = baseY
    } else {
      // Find the absolute farthest right node
      const rightmostNode = allNonAIAgentNodes.reduce((rightmost, node) => {
        const rightmostRight = rightmost.position.x + (rightmost.width || 400)
        const nodeRight = node.position.x + (node.width || 400)
        return nodeRight > rightmostRight ? node : rightmost
      })
      
      // Place new chain to the right of the farthest node with more reasonable spacing
      newX = rightmostNode.position.x + (rightmostNode.width || 400) + horizontalSpacing
      newY = baseY  // Keep consistent Y level for chain starts
    }
    
    // Create a placeholder chain start node
    const newNode: Node = {
      id: newNodeId,
      type: 'custom',
      position: { x: newX, y: newY },
      data: {
        title: `Chain ${chainPlaceholders.length + 1}`,
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
              onActionSelect((actionType: string, providerId: string, config?: any) => {
                handleAddActionToChain(newNodeId, actionType, providerId, config)
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

    // Auto-zoom to show all nodes with animation
    setTimeout(() => {
      fitView({ 
        padding: 0.2, 
        includeHiddenNodes: false,
        duration: 400,
        maxZoom: 1.5,
        minZoom: 0.1
      })
    }, 50)

    toast({
      title: "New Chain Added",
      description: "Click the + button on connections to add actions to your chain"
    })
  }, [nodes, edges, setNodes, setEdges, handleDeleteNode, handleAddToChain, handleAddNodeBetween, fitView, toast, syncChainsToParent])

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
