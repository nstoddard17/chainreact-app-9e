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

  // Debug logging for title issues
  if (!isTrigger && !isAIAgent && type !== 'chain_placeholder') {
    console.log('🎨 [AIAgentCustomNode] Rendering action node:', {
      id,
      type,
      title,
      description,
      hasTitle: !!title,
      dataKeys: Object.keys(data),
      fullData: data
    })
  }

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
              console.log('🟢 [AIAgentCustomNode] Add Action button clicked in chain placeholder')
              console.log('🟢 [AIAgentCustomNode] onAddAction:', onAddAction ? 'EXISTS' : 'NULL')
              if (onAddAction) {
                onAddAction()
              }
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
  chainsLayout?: any // Full layout data with nodes, edges, positions
  onChainsChange?: (chains: any) => void
  onOpenActionDialog?: () => void
  onActionSelect?: (callback: (action: any, config?: any) => void) => void
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
}

function AIAgentVisualChainBuilder({
  chains = [],
  chainsLayout,
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
  
  // Track which chains have been intentionally emptied to prevent Add Action button recreation
  const [emptiedChains, setEmptiedChains] = React.useState<number[]>([])
  
  // Store previous chains to prevent unnecessary updates
  const previousChainsRef = React.useRef<string>('')
  
  // Convert nodes and edges to chains format for parent component
  const syncChainsToParent = useCallback(() => {
    // Extract chains from the current node/edge structure
    const extractedChains = []
    const processedNodes = new Set()
    
    // Find the AI Agent node (could have different IDs)
    const aiAgentNode = nodes.find(n => n.id === 'ai-agent' || n.data?.type === 'ai_agent' || n.data?.isAIAgent)
    const aiAgentId = aiAgentNode?.id || 'ai-agent'
    
    // Find all chain start nodes (connected directly to AI agent)
    const aiAgentEdges = edges.filter(e => e.source === aiAgentId)
    const chainPlaceholderPositions = [] // Track placeholder positions for empty chains
    
    aiAgentEdges.forEach((edge, index) => {
      const chain = []
      let currentNodeId = edge.target
      let chainHasPlaceholder = false
      let placeholderPosition = null
      
      // Walk through the chain
      while (currentNodeId && !processedNodes.has(currentNodeId)) {
        const node = nodes.find(n => n.id === currentNodeId)
        if (!node || node.type === 'addAction') break
        
        // Check if this is a placeholder
        if (node.data?.type === 'chain_placeholder') {
          chainHasPlaceholder = true
          placeholderPosition = { x: node.position.x, y: node.position.y }
          // Store placeholder position for this chain index
          chainPlaceholderPositions[index] = placeholderPosition
        } else {
          // Include actual actions
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
      
      // Include chains even if they're empty (only have placeholders)
      // This ensures Add Action buttons are created for all chains
      if (chain.length > 0 || chainHasPlaceholder) {
        extractedChains.push(chain)
      }
    })
    
    // Get all action nodes and chain placeholders (exclude system nodes)
    const actionNodes = nodes.filter(n => 
      n.id !== 'trigger' && 
      n.id !== aiAgentId && 
      n.type !== 'addAction' &&
      n.data?.type !== 'ai_agent' &&
      !n.data?.isAIAgent
      // Keep chain_placeholder nodes - they need to be added to the workflow
    )
    
    // Debug: Log what nodes we're including
    console.log('🔍 [AIAgentVisualChainBuilder] Nodes being sent to parent:', actionNodes.map(n => ({
      id: n.id,
      type: n.data?.type,
      title: n.data?.title
    })))
    
    // Get all edges between action nodes (exclude edges to/from AddAction nodes)
    const actionEdges = edges.filter(e => 
      !e.source.includes('add-action') && 
      !e.target.includes('add-action') &&
      e.source !== 'trigger' // Exclude trigger edges
    )
    
    // Create a map to track which chain each node belongs to
    const nodeChainMap = new Map()
    aiAgentEdges.forEach((edge, chainIndex) => {
      let currentNodeId = edge.target
      
      // Walk through the chain and mark each node with its chain index
      while (currentNodeId) {
        const node = nodes.find(n => n.id === currentNodeId)
        if (!node || node.type === 'addAction') break
        
        // Skip placeholders
        if (node.data?.type !== 'chain_placeholder') {
          nodeChainMap.set(node.id, chainIndex)
        }
        
        // Find next node in chain
        const nextEdge = edges.find(e => e.source === currentNodeId && !e.target.includes('add-action'))
        currentNodeId = nextEdge?.target || null
      }
    })
    
    // Build comprehensive layout data with full node/edge structure
    const fullLayoutData = {
      chains: extractedChains,
      chainPlaceholderPositions, // Include placeholder positions for empty chains
      nodes: actionNodes.map(n => ({
        id: n.id,
        type: n.data?.type,
        providerId: n.data?.providerId,
        config: n.data?.config || {},
        title: n.data?.title,
        description: n.data?.description,
        position: n.position,
        parentChainIndex: nodeChainMap.get(n.id) // Add chain index for each node
      })),
      edges: actionEdges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target
      })),
      aiAgentPosition: aiAgentNode ? {
        x: aiAgentNode.position.x,
        y: aiAgentNode.position.y
      } : { x: 400, y: 200 },
      layout: {
        verticalSpacing: 120,  // Spacing between nodes in a chain
        horizontalSpacing: 150  // Spacing between chains
      },
      emptiedChains: emptiedChains  // Include the emptiedChains tracking
    }
    
    // Only update if data actually changed
    const dataString = JSON.stringify(fullLayoutData)
    if (dataString !== previousChainsRef.current) {
      previousChainsRef.current = dataString
      console.log('📤 [AIAgentVisualChainBuilder] Syncing full layout to parent:', {
        chains: extractedChains.length,
        nodes: actionNodes.length,
        edges: actionEdges.length
      })
      console.log('📤 [AIAgentVisualChainBuilder] Full data:', fullLayoutData)
      onChainsChange(fullLayoutData)
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
                  y: change.position.y + 120  // Use consistent 120px spacing
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
  const handleAddActionToChainRef = React.useRef<(chainId: string, action: any, config?: any) => void>()
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
    console.log('🔗 [AIAgentVisualChainBuilder] handleAddNodeBetween called', { sourceId, targetId, position })
    
    // Open action dialog to select a node to add
    if (onOpenActionDialog) {
      // Set the callback first to select a node to add
      if (onActionSelect) {
        const callbackFn = (action: any, config?: any) => {
          console.log('🔗 [AIAgentVisualChainBuilder] handleAddNodeBetween callback invoked', { action, config })
          if (!action || !action.type) {
            console.warn('⚠️ [AIAgentVisualChainBuilder] handleAddNodeBetween callback invoked without valid action')
            return
          }
          const newNodeId = `node-${Date.now()}`
          const actionType = typeof action === 'string' ? action : action.type
          
          // Track if we successfully added the node
          let nodeAdded = false
          let resolvedTargetId = targetId  // Track the actual target ID we'll use
          
          // Use setNodes to access current nodes and update positions
          setNodes((currentNodes) => {
            console.log('🔍 [AIAgentVisualChainBuilder] Current nodes:', currentNodes.map(n => ({ id: n.id, type: n.type, dataType: n.data?.type })))
            console.log('🔍 [AIAgentVisualChainBuilder] Looking for sourceId:', sourceId, 'targetId:', targetId)
            
            // Find the source node
            const sourceNode = currentNodes.find(n => n.id === sourceId || (sourceId === 'ai-agent' && n.data?.type === 'ai_agent'))
            let targetNode = currentNodes.find(n => n.id === targetId)
            
            // Special case: If source is ai-agent-like and target is not found (likely a stale chain ID)
            // Find the action node in the same chain based on click position
            if ((sourceId === 'ai-agent' || sourceNode?.data?.type === 'ai_agent') && !targetNode) {
              console.log('🔍 [AIAgentVisualChainBuilder] Source is AI agent and target not found, looking for action in correct chain')
              console.log('🔍 [AIAgentVisualChainBuilder] Click position:', position)
              const aiAgentNode = sourceNode || currentNodes.find(n => n.data?.type === 'ai_agent')
              if (aiAgentNode) {
                // Find nodes positioned below AI agent that aren't Add Action buttons
                // Filter by X position to find nodes in the correct chain
                const nodesBelow = currentNodes.filter(n => 
                  n.position.y > aiAgentNode.position.y && // Below AI agent
                  n.type !== 'addAction' &&
                  n.id !== aiAgentNode.id &&
                  n.id !== 'trigger' &&
                  n.data?.type !== 'ai_agent'
                )
                
                // Find the node closest to the click position's X coordinate
                // This ensures we select a node from the correct chain
                const nodeInCorrectChain = nodesBelow
                  .sort((a, b) => {
                    // First sort by distance to click X position
                    const distA = Math.abs(a.position.x - position.x)
                    const distB = Math.abs(b.position.x - position.x)
                    if (Math.abs(distA - distB) > 50) { // If significantly different X positions
                      return distA - distB
                    }
                    // If similar X position, sort by Y to get the first node in chain
                    return a.position.y - b.position.y
                  })[0]
                
                if (nodeInCorrectChain) {
                  targetNode = nodeInCorrectChain
                  resolvedTargetId = targetNode.id
                  console.log('🔍 [AIAgentVisualChainBuilder] Found action node in correct chain:', resolvedTargetId, 'at X:', targetNode.position.x)
                }
              }
            }
            
            // If still no target and it looks like a chain ID, find the actual node that replaced it
            if (!targetNode && targetId.includes('chain')) {
              console.log('🔍 [AIAgentVisualChainBuilder] Target looks like a chain, searching for replacement node')
              console.log('🔍 [AIAgentVisualChainBuilder] Using click position for chain detection:', position)
              // Find edges from source to see what it's actually connected to
              const sourceNode = currentNodes.find(n => n.id === sourceId || (sourceId === 'ai-agent' && n.data?.type === 'ai_agent'))
              if (sourceNode) {
                // Find nodes directly below the source, considering click position for chain selection
                const nodesInChain = currentNodes.filter(n =>
                  n.position.y > sourceNode.position.y &&
                  n.type !== 'addAction' &&
                  n.id !== 'trigger'
                )
                
                // Sort by proximity to click position to find the correct chain
                const closestNode = nodesInChain
                  .sort((a, b) => {
                    // First check X distance to click position
                    const distA = Math.abs(a.position.x - position.x)
                    const distB = Math.abs(b.position.x - position.x)
                    if (Math.abs(distA - distB) > 50) {
                      return distA - distB
                    }
                    // If similar X, sort by Y
                    return a.position.y - b.position.y
                  })[0]
                
                if (closestNode) {
                  targetNode = closestNode
                  resolvedTargetId = targetNode.id
                  console.log('🔍 [AIAgentVisualChainBuilder] Found replacement node for chain:', resolvedTargetId, 'at X:', targetNode.position.x)
                }
              }
            }
            
            if (!sourceNode || !targetNode) {
              console.error('❌ [AIAgentVisualChainBuilder] Could not find source or target node')
              console.error('❌ Source node found:', !!sourceNode, 'Target node found:', !!targetNode)
              console.error('❌ Available node IDs:', currentNodes.map(n => n.id))
              
              // Don't crash - just add the node without repositioning others
              // This handles the case where we're adding between dynamically created nodes
              const fallbackPosition = position || { x: 400, y: 300 }
              const newNode: Node = {
                id: newNodeId,
                type: 'custom',
                position: fallbackPosition,
                data: {
                  title: action.title || config?.title || actionType,
                  description: action.description || config?.description || '',
                  type: actionType,
                  providerId: action.providerId || actionType.split('_')[0],
                  config: config || {},
                  onConfigure: () => handleConfigureNode(newNodeId),
                  onDelete: () => handleDeleteNodeRef.current?.(newNodeId),
                  onAddToChain: (nodeId: string) => handleAddToChainRef.current?.(nodeId),
                  isLastInChain: false
                }
              }
              nodeAdded = true  // Mark that we added the node with fallback
              return [...currentNodes, newNode]
            }
            
            // The new node should take the exact position of the target node
            const newNodePosition = {
              x: targetNode.position.x,
              y: targetNode.position.y
            }
            
            nodeAdded = true  // Mark successful node addition
            
            // Calculate minimal spacing - just enough to not overlap
            const verticalShift = 120 // Reduced spacing for tighter layout
            
            // Create the new node
            const newNode: Node = {
              id: newNodeId,
              type: 'custom',
              position: newNodePosition,
              data: {
                title: action.title || config?.title || actionType,
                description: action.description || config?.description || '',
                type: actionType,
                providerId: action.providerId || actionType.split('_')[0],
                config: config || {},
                onConfigure: () => handleConfigureNode(newNodeId),
                onDelete: () => handleDeleteNodeRef.current?.(newNodeId),
                onAddToChain: (nodeId: string) => handleAddToChainRef.current?.(nodeId),
                isLastInChain: false
              }
            }
            
            // Get all nodes that need to be moved down (only nodes in the same chain)
            const nodesToMove = new Set<string>()
            
            // Find nodes in the same chain - same X position and below the target
            currentNodes.forEach(node => {
              // Only move nodes that are:
              // 1. In the same vertical chain (same X position as target)
              // 2. Below or at the target's Y position
              // 3. Not the source or new node
              if (node.position.x === targetNode.position.x && 
                  node.position.y >= targetNode.position.y && 
                  node.id !== sourceId && 
                  node.id !== newNodeId) {
                nodesToMove.add(node.id)
              }
            })
            
            // Update all nodes - add new node and shift others
            const updatedNodes = currentNodes.map(node => {
              if (nodesToMove.has(node.id)) {
                // Move this node down
                return {
                  ...node,
                  position: {
                    ...node.position,
                    y: node.position.y + verticalShift
                  }
                }
              }
              return node
            })
            
            // Add the new node
            return [...updatedNodes, newNode]
          })

        // Update edges to insert the new node between source and target
        // Only update edges if we successfully added the node
        if (nodeAdded) {
          setEdges((eds) => {
            console.log('🔗 [AIAgentVisualChainBuilder] Updating edges with resolvedTargetId:', resolvedTargetId)
            
            // Find the actual source node ID (might be different from sourceId if it's 'ai-agent')
            const actualSourceId = nodes.find(n => n.id === sourceId || (sourceId === 'ai-agent' && n.data?.type === 'ai_agent'))?.id || sourceId
            
            // Remove any edge between source and the resolved target (or original target)
            const updatedEdges = eds.filter(e => 
              !(e.source === actualSourceId && (e.target === targetId || e.target === resolvedTargetId)) &&
              !(e.source === sourceId && (e.target === targetId || e.target === resolvedTargetId))
            )
            
            return [
              ...updatedEdges,
              {
                id: `e-${actualSourceId}-${newNodeId}`,
                source: actualSourceId,
                target: newNodeId,
                type: 'custom',
                style: { 
                  stroke: '#94a3b8',
                  strokeWidth: 2 
                },
                data: {
                  onAddNode: (pos: { x: number, y: number }) => {
                    // Use ref to ensure we always have the latest version
                    handleAddNodeBetweenRef.current?.(actualSourceId, newNodeId, pos)
                  }
                }
              },
              {
                id: `e-${newNodeId}-${resolvedTargetId}`,
                source: newNodeId,
                target: resolvedTargetId,
                type: 'custom',
                style: { 
                  stroke: '#94a3b8',
                  strokeWidth: 2 
                },
                data: {
                  onAddNode: (pos: { x: number, y: number }) => {
                    // Use ref to ensure we always have the latest version
                    handleAddNodeBetweenRef.current?.(newNodeId, resolvedTargetId, pos)
                  }
                }
              }
            ]
          })
        }
        
        // Auto-center the view to show all nodes after adding the node
        setTimeout(() => {
          fitView({ 
            padding: 0.2, 
            includeHiddenNodes: false,
            duration: 400,
            maxZoom: 2,
            minZoom: 0.05
          })
        }, 150)
        }
        
        console.log('🔗 [AIAgentVisualChainBuilder] Setting callback for node between')
        onActionSelect(callbackFn)
      }
      // Then open the dialog (callback will already be set)
      console.log('🔗 [AIAgentVisualChainBuilder] Opening action dialog for node between')
      onOpenActionDialog()
    }
  }, [onOpenActionDialog, onActionSelect, fitView, setNodes, setEdges, handleConfigureNode])
  
  // Set the ref after the function is defined
  React.useEffect(() => {
    handleAddNodeBetweenRef.current = handleAddNodeBetween
  }, [handleAddNodeBetween])

  // Now declare handleDeleteNode which can safely reference handleAddNodeBetween
  const handleDeleteNode = useCallback((nodeId: string) => {
    console.log('🗑️ [AIAgentVisualChainBuilder] Deleting node:', nodeId)
    
    // Use functional updates to get current state values
    setNodes((currentNodes) => {
      setEdges((currentEdges) => {
        // Find edges connected to this node using current state
        const edgesFromNode = currentEdges.filter(e => e.source === nodeId)
        const edgesToNode = currentEdges.filter(e => e.target === nodeId)
        
        console.log('🗑️ [AIAgentVisualChainBuilder] Current edges:', currentEdges)
        console.log('🗑️ [AIAgentVisualChainBuilder] Edges from node:', edgesFromNode)
        console.log('🗑️ [AIAgentVisualChainBuilder] Edges to node:', edgesToNode)
        
        // Check if this is an Add Action node - if so, just remove it
        const nodeToDelete = currentNodes.find(n => n.id === nodeId)
        if (nodeToDelete?.type === 'addAction') {
          // Return filtered edges
          return currentEdges.filter(e => e.source !== nodeId && e.target !== nodeId)
        }
        
        // Check if this is the last action in a chain (has an Add Action button after it)
        const hasAddActionAfter = edgesFromNode.some(e => {
          const targetNode = currentNodes.find(n => n.id === e.target)
          console.log('🗑️ [AIAgentVisualChainBuilder] Checking target node:', e.target, 'type:', targetNode?.type)
          return targetNode?.type === 'addAction'
        })
        
        console.log('🗑️ [AIAgentVisualChainBuilder] Has Add Action after:', hasAddActionAfter)
        
        if (hasAddActionAfter) {
          // This is the last action in the chain - remove both the action and its Add Action button
          const addActionNodeId = edgesFromNode.find(e => {
            const targetNode = currentNodes.find(n => n.id === e.target)
            return targetNode?.type === 'addAction'
          })?.target
          
          // If there's a previous node, we need to add an Add Action button after it
          if (edgesToNode.length > 0) {
            const previousNodeId = edgesToNode[0].source
            const previousNode = currentNodes.find(n => n.id === previousNodeId)
            
            // Check if the previous node is the AI Agent - this means we're deleting the last action in a chain
            if (previousNode && previousNode.id === 'ai-agent') {
              // We're deleting the last node in a chain directly connected to AI Agent
              // Find which chain index this was by checking the edges
              let chainIndex = 0
              const aiAgentEdges = currentEdges.filter(e => e.source === 'ai-agent').sort((a, b) => {
                // Sort by target node position to determine chain order
                const nodeA = currentNodes.find(n => n.id === a.target)
                const nodeB = currentNodes.find(n => n.id === b.target)
                return (nodeA?.position.x || 0) - (nodeB?.position.x || 0)
              })
              
              // Find the index of our edge
              const ourEdgeIndex = aiAgentEdges.findIndex(e => e.target === nodeId)
              if (ourEdgeIndex !== -1) {
                chainIndex = ourEdgeIndex
              }
              
              console.log('✓ [AIAgentVisualChainBuilder] Marking chain', chainIndex, 'as intentionally emptied')
              
              // Mark this chain as intentionally emptied
              setEmptiedChains(prev => {
                const newEmptied = [...prev]
                if (!newEmptied.includes(chainIndex)) {
                  newEmptied.push(chainIndex)
                }
                console.log('✓ [AIAgentVisualChainBuilder] Updated emptiedChains:', newEmptied)
                return newEmptied
              })
              
              // Don't add an Add Action button for AI Agent chains - they were intentionally emptied
              // Just remove the edges
              return currentEdges.filter(e => 
                e.source !== nodeId && 
                e.target !== nodeId && 
                e.source !== addActionNodeId && 
                e.target !== addActionNodeId
              )
            } else if (previousNode && previousNode.id !== 'ai-agent') {
              const newAddActionNodeId = `add-action-${previousNodeId}-${Date.now()}`
              const addActionNode: Node = {
                id: newAddActionNodeId,
                type: 'addAction',
                position: { 
                  x: previousNode.position.x, 
                  y: previousNode.position.y + 120  // Use consistent 120px spacing 
                },
                data: {
                  parentId: previousNodeId,
                  onClick: () => {
                    // Set the callback first
                    if (onActionSelect) {
                      onActionSelect((action: any, config?: any) => {
                        if (action) {
                          handleAddToChainRef.current?.(previousNodeId, action, config)
                        } else {
                          console.warn('⚠️ [AIAgentVisualChainBuilder] Add action callback invoked without action')
                        }
                      })
                    }
                    // Then open the dialog (callback will already be set)
                    if (onOpenActionDialog) {
                      onOpenActionDialog()
                    }
                  }
                }
              }
              
              // Add the new Add Action node
              setTimeout(() => {
                setNodes((nds) => [...nds, addActionNode])
              }, 0)
              
              // Return edges with the new connection
              return [
                ...currentEdges.filter(e => 
                  e.source !== nodeId && 
                  e.target !== nodeId && 
                  e.source !== addActionNodeId && 
                  e.target !== addActionNodeId
                ),
                {
                  id: `e-${previousNodeId}-${newAddActionNodeId}`,
                  source: previousNodeId,
                  target: newAddActionNodeId,
                  type: 'custom',
                  style: { 
                    stroke: '#b1b1b7',
                    strokeWidth: 2,
                    strokeDasharray: '5,5'
                  }
                }
              ]
            }
          }
          
          // Just remove edges connected to deleted nodes
          return currentEdges.filter(e => 
            e.source !== nodeId && 
            e.target !== nodeId && 
            e.source !== addActionNodeId && 
            e.target !== addActionNodeId
          )
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
                handleAddNodeBetweenRef.current?.(previousNodeId, nextNodeId, pos)
              }
            }
          }
          
          // Return edges with reconnection
          return [
            ...currentEdges.filter(e => e.source !== nodeId && e.target !== nodeId),
            newEdge
          ]
        } else {
          // Simply return edges without the deleted node
          return currentEdges.filter(e => e.source !== nodeId && e.target !== nodeId)
        }
      })
      
      // Return nodes without the deleted one (and possibly its Add Action button)
      const nodeToDelete = currentNodes.find(n => n.id === nodeId)
      if (nodeToDelete?.type === 'addAction') {
        return currentNodes.filter(n => n.id !== nodeId)
      }
      
      // Find if there's an Add Action button connected to this node
      const connectedAddActionNode = currentNodes.find(n => 
        n.type === 'addAction' && edges.some(e => e.source === nodeId && e.target === n.id)
      )
      
      if (connectedAddActionNode) {
        // Remove both the node and its Add Action button
        return currentNodes.filter(n => n.id !== nodeId && n.id !== connectedAddActionNode.id)
      } else {
        // Just remove the node
        return currentNodes.filter(n => n.id !== nodeId)
      }
    })
  }, [edges, handleAddNodeBetween, setNodes, setEdges])
  
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
  const handleAddActionToChain = useCallback((chainId: string, action: any, config?: any) => {
    if (handleAddActionToChainRef.current) {
      handleAddActionToChainRef.current(chainId, action, config)
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
            // Capture the chain ID to avoid closure issues
            const chainId = defaultChainId
            console.log('🔥 [AIAgentVisualChainBuilder] onAddAction called for chain:', chainId)
            if (onActionSelect) {
              console.log('🔥 [AIAgentVisualChainBuilder] Setting callback via onActionSelect')
              // Set the callback first - now expecting the full action object
              // Wrap in a function that guards against being called immediately
              const callbackFn = (action: any, config?: any) => {
                console.log('🔥 [AIAgentVisualChainBuilder] Callback invoked with action:', action, 'config:', config, 'for chain:', chainId)
                if (action && action.type) {  // Ensure we have a valid action with a type
                  handleAddActionToChainRef.current?.(chainId, action, config)
                } else {
                  console.warn('⚠️ [AIAgentVisualChainBuilder] Callback invoked without valid action')
                }
              }
              console.log('🔥 [AIAgentVisualChainBuilder] Passing callback function to onActionSelect')
              onActionSelect(callbackFn)
            }
            // Then open the dialog (callback will already be set)
            if (onOpenActionDialog) {
              console.log('🔥 [AIAgentVisualChainBuilder] Opening dialog via onOpenActionDialog')
              onOpenActionDialog()
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
          maxZoom: 2,
          minZoom: 0.05
        })
      }
    }, 200)
  }, [setNodes, setEdges, fitView, toast, onOpenActionDialog, onActionSelect, workflowData])
  
  // Add a separate effect to handle fitView when component becomes visible
  useEffect(() => {
    // Use a timeout to ensure the component has fully rendered
    const timeoutId = setTimeout(() => {
      if (fitView) {
        fitView({
          padding: 0.2,
          includeHiddenNodes: false,
          duration: 400,
          maxZoom: 2,
          minZoom: 0.05
        })
      }
    }, 150)
    
    return () => clearTimeout(timeoutId)
  }, [fitView]) // Run whenever fitView changes (component mounts/remounts)
  
  // Also trigger fitView when nodes change significantly
  useEffect(() => {
    // Skip if we're in the middle of initialization
    if (!initializedRef.current) return
    
    // Check if we have a meaningful number of nodes (more than just AI agent and trigger)
    const hasSignificantNodes = nodes.length > 2
    
    if (hasSignificantNodes && fitView) {
      // Use a short delay to let React Flow process the node changes
      const timeoutId = setTimeout(() => {
        fitView({
          padding: 0.2,
          includeHiddenNodes: false,
          duration: 400,
          maxZoom: 2,
          minZoom: 0.05
        })
      }, 300)
      
      return () => clearTimeout(timeoutId)
    }
  }, [nodes.length, fitView]) // Trigger when number of nodes changes
  
  // Initialize with workflow data or default setup
  useEffect(() => {
    // Only initialize once
    if (initializedRef.current) return
    initializedRef.current = true
    
    // First check if we have chainsLayout data (full layout from saved config)
    if (chainsLayout?.nodes && chainsLayout?.edges && chainsLayout.nodes.length > 0) {
      console.log('🎨 [AIAgentVisualChainBuilder] Initializing with chainsLayout:', chainsLayout)
      
      // Recreate the exact layout from the saved data
      const aiAgentNode: Node = {
        id: 'ai-agent',
        type: 'custom',
        position: chainsLayout.aiAgentPosition || { x: 400, y: 200 },
        data: {
          title: 'AI Agent',
          description: 'Intelligent decision-making agent',
          type: 'ai_agent',
          isAIAgent: true,
          onAddToChain: (nodeId: string) => handleAddToChain(nodeId)
        }
      }
      
      // Map the saved nodes with proper handlers
      const savedNodes = chainsLayout.nodes.map((node: any) => ({
        id: node.id,
        type: 'custom',
        position: node.position,
        data: {
          title: node.title,
          description: node.description,
          type: node.type,
          providerId: node.providerId,
          config: node.config || {},
          onConfigure: () => handleConfigureNode(node.id),
          onDelete: () => handleDeleteNode(node.id),
          onAddToChain: (nodeId: string) => handleAddToChain(nodeId)
        }
      }))
      
      // Create Add Action nodes for the last node in each chain
      const addActionNodes: Node[] = []
      const chainLastNodes = new Map<string, any>() // Track last node per chain
      
      // Group nodes by chain (based on edge connections)
      chainsLayout.edges.forEach((edge: any) => {
        if (edge.source === 'ai-agent') {
          // This is a chain start
          let currentNode = savedNodes.find((n: any) => n.id === edge.target)
          let lastInChain = currentNode
          
          // Follow the chain to find the last node
          let visited = new Set([edge.target])
          while (currentNode) {
            const nextEdge = chainsLayout.edges.find((e: any) => 
              e.source === currentNode.id && !visited.has(e.target)
            )
            if (nextEdge) {
              currentNode = savedNodes.find((n: any) => n.id === nextEdge.target)
              if (currentNode) {
                lastInChain = currentNode
                visited.add(nextEdge.target)
              }
            } else {
              break
            }
          }
          
          if (lastInChain) {
            // Create Add Action node after the last node in the chain
            const addActionNodeId = `add-action-${lastInChain.id}`
            addActionNodes.push({
              id: addActionNodeId,
              type: 'addAction',
              position: { 
                x: lastInChain.position.x, 
                y: lastInChain.position.y + 120 
              },
              data: {
                parentId: lastInChain.id,
                onClick: () => {
                  console.log('🔗 [AIAgentVisualChainBuilder] Add action button clicked for:', lastInChain.id)
                  handleAddToChainRef.current?.(lastInChain.id)
                }
              }
            })
            
            // Add edge to Add Action node
            chainsLayout.edges.push({
              id: `e-${lastInChain.id}-${addActionNodeId}`,
              source: lastInChain.id,
              target: addActionNodeId,
              type: 'custom'
            })
          }
        }
      })
      
      // Map edges with handlers
      const mappedEdges = chainsLayout.edges.map((edge: any) => ({
        ...edge,
        type: edge.type || 'custom',
        data: {
          ...edge.data,
          onAddNode: (position: { x: number, y: number }) => {
            handleAddNodeBetweenRef.current?.(edge.source, edge.target, position)
          }
        }
      }))
      
      // Set all nodes and edges
      setNodes([aiAgentNode, ...savedNodes, ...addActionNodes])
      setEdges(mappedEdges)
      
      // Restore emptiedChains if present
      if (chainsLayout.emptiedChains) {
        setEmptiedChains(new Set(chainsLayout.emptiedChains))
      }
      
      // Center view after loading with slightly longer delay for proper rendering
      setTimeout(() => {
        fitView({
          padding: 0.2,
          includeHiddenNodes: false,
          duration: 400,
          maxZoom: 2,
          minZoom: 0.05
        })
      }, 200)
      
      return // Exit early, we've initialized from chainsLayout
    }
    
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
            handleAddNodeBetweenRef.current?.(edge.source, edge.target, position)
          }
        }
      }))
      
      // Set the nodes and edges from workflow data
      setNodes(mappedNodes)
      setEdges(mappedEdges)
      
      // Center view after loading with slightly longer delay for proper rendering
      setTimeout(() => {
        fitView({
          padding: 0.2,
          includeHiddenNodes: false,
          duration: 400,
          maxZoom: 2,
          minZoom: 0.05
        })
      }, 200)
      
      return
    }
    
    // Fall back to default initialization if no workflow data
    initializeDefaultSetup()
  }, [chainsLayout, workflowData, currentNodeId, initializeDefaultSetup, setNodes, setEdges, fitView, handleConfigureNode, handleDeleteNode, handleAddToChain, handleAddNodeBetween])

  // Update the ref with the actual implementation
  React.useEffect(() => {
    handleAddActionToChainRef.current = (chainId: string, action: any, config?: any) => {
      // Handle null/undefined action
      if (!action) {
        console.error('❌ [AIAgentVisualChainBuilder] handleAddActionToChain called with null/undefined action')
        return
      }
      
      console.log('🔷 [AIAgentVisualChainBuilder] handleAddActionToChain called:', { 
        chainId, 
        actionType: typeof action === 'string' ? action : action.type,  // Handle both object and string for backwards compatibility
        actionTitle: typeof action === 'object' ? action.title : undefined,
        actionProviderId: typeof action === 'object' ? action.providerId : undefined
      })
      console.log('🔷 [AIAgentVisualChainBuilder] Action received:', action)
      console.log('🔷 [AIAgentVisualChainBuilder] Config received:', config)
      
      // Generate IDs outside to use in both setNodes and setEdges
      const newNodeId = `node-${Date.now()}`
      const addActionNodeId = `add-action-${newNodeId}`
      
      // Use setNodes to access current state
      setNodes((currentNodes) => {
        console.log('🔷 [AIAgentVisualChainBuilder] Current nodes:', currentNodes.map(n => ({ id: n.id, type: n.type })))
        console.log('🔷 [AIAgentVisualChainBuilder] Looking for chainId:', chainId)
        const chainNode = currentNodes.find(n => n.id === chainId)
        if (!chainNode) {
          console.error('❌ [AIAgentVisualChainBuilder] Chain node not found:', chainId)
          console.error('❌ Available node IDs:', currentNodes.map(n => n.id))
          return currentNodes
        }
        console.log('✅ [AIAgentVisualChainBuilder] Found chain node:', chainNode.id)
        
        // Handle both action object and string for backwards compatibility
        const actionType = typeof action === 'string' ? action : action.type
        const actionTitle = typeof action === 'object' ? action.title : null
        const actionDescription = typeof action === 'object' ? action.description : null
        const actionProviderId = typeof action === 'object' ? action.providerId : null
        
        // Use title from action object first, then config, then lookup, then fallback
        const title = actionTitle || config?.title || actionType
        const description = actionDescription || config?.description || ''
        const providerId = actionProviderId || config?.providerId || actionType.split('_')[0]
        
        console.log('🔷 [AIAgentVisualChainBuilder] Title resolution:', {
          finalTitle: title,
          actionTitle: actionTitle,
          configTitle: config?.title,
          actionType: actionType,
          titleSource: actionTitle ? 'action object' : (config?.title ? 'config' : 'actionType fallback')
        })
        
        // Create the action node at the same position as the chain placeholder
        const newNode: Node = {
          id: newNodeId,
          type: 'custom',
          position: { ...chainNode.position },
          data: {
            title: title,
            description: description,
            type: actionType,
            providerId: providerId,
            config: config || {},  // Include the AI config or manual config
            onConfigure: () => handleConfigureNode(newNodeId),
            onDelete: () => handleDeleteNode(newNodeId),
            onAddToChain: (nodeId: string) => handleAddToChain(nodeId),
            isLastInChain: true
          }
        }
        
        console.log('🚀 [AIAgentVisualChainBuilder] Creating new node with data:', {
          id: newNodeId,
          title: newNode.data.title,
          description: newNode.data.description,
          type: newNode.data.type,
          providerId: newNode.data.providerId,
          hasTitle: !!newNode.data.title,
          dataKeys: Object.keys(newNode.data)
        })
        
        // Create Add Action node after the new action with consistent spacing
        const addActionNode: Node = {
          id: addActionNodeId,
          type: 'addAction',
          position: { 
            x: chainNode.position.x, 
            y: chainNode.position.y + 120  // Use consistent 120px spacing
          },
          data: {
            parentId: newNodeId,
            onClick: () => {
              // Set the callback first
              console.log('🔥 [AIAgentVisualChainBuilder] Setting up callback for add action after:', newNodeId)
              if (onActionSelect) {
                const callbackFn = (action: any, config?: any) => {
                  console.log('🔥 [AIAgentVisualChainBuilder] Add action callback invoked with:', action, config)
                  // This will add the action after the current node
                  if (action && action.type) {
                    // Call handleAddToChain which expects just the nodeId
                    // It will set up its own callback and open the dialog
                    console.log('🔥 [AIAgentVisualChainBuilder] Processing action to add after node:', newNodeId)
                    
                    // Add the new action node directly here
                    const nextNodeId = `node-${Date.now()}`
                    const actionType = typeof action === 'string' ? action : action.type
                    
                    setNodes((currentNodes) => {
                      const parentNode = currentNodes.find(n => n.id === newNodeId)
                      if (!parentNode) {
                        console.error('❌ [AIAgentVisualChainBuilder] Could not find parent node:', newNodeId)
                        return currentNodes
                      }
                      
                      // Create the new action node with consistent spacing
                      const nextNode: Node = {
                        id: nextNodeId,
                        type: 'custom',
                        position: {
                          x: parentNode.position.x,
                          y: parentNode.position.y + 120  // Use consistent 120px spacing
                        },
                        data: {
                          title: action.title || config?.title || actionType,
                          description: action.description || config?.description || '',
                          type: actionType,
                          providerId: action.providerId || actionType.split('_')[0],
                          config: config || {},
                          onConfigure: () => handleConfigureNode(nextNodeId),
                          onDelete: () => handleDeleteNodeRef.current?.(nextNodeId),
                          isLastInChain: true
                        }
                      }
                      
                      // Create new Add Action node with consistent spacing
                      const nextAddActionId = `add-action-${nextNodeId}`
                      const nextAddActionNode: Node = {
                        id: nextAddActionId,
                        type: 'addAction',
                        position: {
                          x: nextNode.position.x,
                          y: nextNode.position.y + 120  // Use consistent 120px spacing
                        },
                        data: {
                          parentId: nextNodeId,
                          onClick: () => {
                            console.log('🔗 [AIAgentVisualChainBuilder] Add action button clicked for:', nextNodeId)
                            handleAddToChainRef.current?.(nextNodeId)
                          }
                        }
                      }
                      
                      // Remove the old Add Action node and add new nodes
                      return currentNodes
                        .filter(n => n.id !== addActionNodeId)
                        .concat([nextNode, nextAddActionNode])
                    })
                    
                    // Update edges
                    setEdges((currentEdges) => {
                      // Remove edge to old Add Action node
                      const filteredEdges = currentEdges.filter(e => e.target !== addActionNodeId)
                      
                      // Add edges for new nodes
                      return [
                        ...filteredEdges,
                        {
                          id: `e-${newNodeId}-${nextNodeId}`,
                          source: newNodeId,
                          target: nextNodeId,
                          type: 'custom',
                          style: { stroke: '#94a3b8', strokeWidth: 2 },
                          data: {
                            onAddNode: (pos: { x: number, y: number }) => {
                              handleAddNodeBetweenRef.current?.(newNodeId, nextNodeId, pos)
                            }
                          }
                        },
                        {
                          id: `e-${nextNodeId}-add-action-${nextNodeId}`,
                          source: nextNodeId,
                          target: `add-action-${nextNodeId}`,
                          type: 'custom',
                          animated: false,
                          style: { stroke: '#b1b1b7', strokeWidth: 2, strokeDasharray: '5,5' }
                        }
                      ]
                    })
                    
                    // Trigger sync
                    setTimeout(() => syncChainsToParent(), 0)
                    
                    // Auto-center view
                    setTimeout(() => {
                      fitView({ 
                        padding: 0.2, 
                        includeHiddenNodes: false,
                        duration: 400,
                        maxZoom: 2,
                        minZoom: 0.05
                      })
                    }, 150)
                  } else {
                    console.warn('⚠️ [AIAgentVisualChainBuilder] Chain action callback invoked without valid action')
                  }
                }
                onActionSelect(callbackFn)
              }
              // Then open the dialog (callback will already be set)
              if (onOpenActionDialog) {
                onOpenActionDialog()
              }
            }
          }
        }
        
        // Replace the placeholder with the new action and add action nodes
        const updatedNodes = [
          ...currentNodes.filter(n => n.id !== chainId),  // Remove the placeholder
          newNode,
          addActionNode
        ]
        console.log('✅ [AIAgentVisualChainBuilder] Replaced placeholder, returning updated nodes:', updatedNodes.map(n => ({ id: n.id, type: n.type })))
        return updatedNodes
      })
      // Trigger immediate sync for real-time updates
      setTimeout(() => syncChainsToParent(), 0)
      
      // Update edges to point to the new node and connect to Add Action node
      const newEdge = {
        id: `e-${newNodeId}-${addActionNodeId}`,
        source: newNodeId,
        target: addActionNodeId,
        type: 'custom',
        animated: false,
        style: { 
          stroke: '#b1b1b7', 
          strokeWidth: 2, 
          strokeDasharray: '5,5' 
        }
      }
      
      console.log('🔗 [AIAgentVisualChainBuilder] Creating edge from action to Add Action:', newEdge)
      
      setEdges((eds) => {
        const updatedEdges = [
          ...eds.map(e => {
            if (e.target === chainId) {
              // Update the target and the onAddNode callback to use new IDs
              return { 
                ...e, 
                target: newNodeId,
                data: {
                  ...e.data,
                  onAddNode: e.data?.onAddNode ? (position: { x: number, y: number }) => {
                    handleAddNodeBetweenRef.current?.(e.source, newNodeId, position)
                  } : e.data?.onAddNode
                }
              }
            }
            if (e.source === chainId) {
              // Update the source and the onAddNode callback to use new IDs
              return { 
                ...e, 
                source: newNodeId,
                data: {
                  ...e.data,
                  onAddNode: e.data?.onAddNode ? (position: { x: number, y: number }) => {
                    handleAddNodeBetweenRef.current?.(newNodeId, e.target, position)
                  } : e.data?.onAddNode
                }
              }
            }
            return e
          }),
          newEdge
        ]
        console.log('🔗 [AIAgentVisualChainBuilder] Updated edges:', updatedEdges)
        return updatedEdges
      })
      
      // Auto-center the view to show all nodes after adding the action
      setTimeout(() => {
        fitView({ 
          padding: 0.2, 
          includeHiddenNodes: false,
          duration: 400,
          maxZoom: 2,
          minZoom: 0.05
        })
      }, 150)
    }
  }, [handleConfigureNode, handleDeleteNode, handleAddToChain, fitView, syncChainsToParent, setNodes, setEdges, onOpenActionDialog, onActionSelect])

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
          handleAddNodeBetweenRef.current?.(params.source!, params.target!, position)
        }
      }
    }
    setEdges((eds) => addEdge(newEdge, eds))
  }, [handleAddNodeBetween])

  // Update the handleAddToChain ref with actual implementation
  React.useEffect(() => {
    handleAddToChainRef.current = (lastNodeId: string) => {
      console.log('🔥 [AIAgentVisualChainBuilder] handleAddToChain called for node:', lastNodeId)
      if (onActionSelect && onOpenActionDialog) {
        // Set up the callback first, then open the dialog
        const callbackFn = (action: any, config?: any) => {
          console.log('🔥 [AIAgentVisualChainBuilder] handleAddToChain callback invoked with:', action, config)
          if (!action || !action.type) {
            console.warn('⚠️ [AIAgentVisualChainBuilder] handleAddToChain callback invoked without valid action')
            return
          }
          const newNodeId = `node-${Date.now()}`
          const actionType = typeof action === 'string' ? action : action.type
          // Define addActionNodeId here so it's available in both callbacks
          const addActionNodeId = `add-action-${newNodeId}`
          
          // Use functional update to get current nodes state
          setNodes((currentNodes) => {
            const lastNode = currentNodes.find(n => n.id === lastNodeId)
            
            if (!lastNode) {
              console.error('❌ [AIAgentVisualChainBuilder] Could not find last node:', lastNodeId)
              return currentNodes
            }
            
            const newNode: Node = {
              id: newNodeId,
              type: 'custom',
              position: { 
                x: lastNode.position.x, 
                y: lastNode.position.y + 120  // Use consistent 120px spacing 
              },
              data: {
                title: action.title || config?.title || actionType,
                description: action.description || config?.description || '',
                type: actionType,
                providerId: action.providerId || actionType.split('_')[0],
                config: config || {},
                onConfigure: () => handleConfigureNode(newNodeId),
                onDelete: () => handleDeleteNodeRef.current?.(newNodeId),
                onAddToChain: (nodeId: string) => handleAddToChainRef.current?.(nodeId),
                isLastInChain: true
              }
            }

            // Create Add Action node after the new node (using addActionNodeId defined above)
            const addActionNode: Node = {
              id: addActionNodeId,
              type: 'addAction',
              position: { 
                x: newNode.position.x, 
                y: newNode.position.y + 120  // Use consistent 120px spacing 
              },
              data: {
                parentId: newNodeId,
                onClick: () => {
                  console.log('🔗 [AIAgentVisualChainBuilder] Add action button clicked for:', newNodeId)
                  handleAddToChainRef.current?.(newNodeId)
                }
              }
            }

            // Find and remove the old Add Action node that was connected to lastNode
            const oldAddActionId = currentNodes.find(n => 
              n.type === 'addAction' && n.data?.parentId === lastNodeId
            )?.id
            
            // Update nodes: remove old Add Action and add new nodes
            return currentNodes
              .filter(n => n.id !== oldAddActionId)  // Remove old Add Action
              .map(n => 
                n.id === lastNodeId 
                  ? { ...n, data: { ...n.data, isLastInChain: false } }
                  : n
              )
              .concat([newNode, addActionNode])
          })
          
          // Trigger immediate sync for real-time updates
          setTimeout(() => syncChainsToParent(), 0)

          // Update edges: remove old Add Action edge and add new connections
          setEdges((eds) => {
            // Find and remove edge to old Add Action node
            const oldAddActionNode = nodes.find(n => 
              n.type === 'addAction' && n.data?.parentId === lastNodeId
            )
            const filteredEdges = oldAddActionNode 
              ? eds.filter(e => e.target !== oldAddActionNode.id)
              : eds
            
            return [...filteredEdges, 
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
                  handleAddNodeBetweenRef.current?.(lastNodeId, newNodeId, pos)
                }
              }
            },
            {
              id: `e-${newNodeId}-${addActionNodeId}`,
              source: newNodeId,
              target: addActionNodeId,
              type: 'custom',
              animated: false,
              style: { 
                stroke: '#b1b1b7', 
                strokeWidth: 2, 
                strokeDasharray: '5,5' 
              }
            }
          ]
          })
          
          // Auto-center the view to show all nodes after adding the action
          setTimeout(() => {
            fitView({ 
              padding: 0.2, 
              includeHiddenNodes: false,
              duration: 400,
              maxZoom: 2,
              minZoom: 0.05
            })
          }, 150)
        }
        // Now open the dialog after the callback is set
        onActionSelect(callbackFn)
        onOpenActionDialog()
      }
    }
  }, [onActionSelect, onOpenActionDialog, handleConfigureNode, handleAddNodeBetween, fitView, syncChainsToParent, setNodes, setEdges])

  // Create a new chain branching from AI Agent
  const handleCreateChain = useCallback(() => {
    console.log('🔄 [AIAgentVisualChainBuilder] Creating new chain')
    console.log('🔄 [AIAgentVisualChainBuilder] Current nodes:', nodes.map(n => ({ id: n.id, type: n.type, dataType: n.data?.type })))
    const newChainId = `chain-${Date.now()}`
    const newNodeId = `${newChainId}-start`
    
    // Find AI agent node position - check both by id and by type
    let aiAgentNode = nodes.find(n => n.id === 'ai-agent' || n.data?.type === 'ai_agent' || n.data?.isAIAgent)
    if (!aiAgentNode) {
      console.error('❌ [AIAgentVisualChainBuilder] AI Agent node not found in nodes:', nodes)
      return
    }
    console.log('✅ [AIAgentVisualChainBuilder] Found AI Agent node:', aiAgentNode.id)
    
    // Find existing chain placeholder nodes only (not action nodes within chains)
    const chainPlaceholders = nodes.filter(n => 
      n.data?.type === 'chain_placeholder'
    )
    
    // Find all non-AI agent and non-AddAction nodes
    const allNonAIAgentNodes = nodes.filter(n => 
      n.id !== 'ai-agent' && 
      n.type !== 'addAction' &&
      n.id !== 'trigger' &&
      !n.data?.isTrigger
    )
    
    // Calculate position - place chains with proper spacing
    const horizontalSpacing = 550  // Increased gap between chains to prevent overlap
    const baseY = aiAgentNode.position.y + 200
    let newX: number
    let newY: number
    
    if (allNonAIAgentNodes.length === 0) {
      // First chain - directly below AI agent
      newX = aiAgentNode.position.x
      newY = baseY
    } else {
      // Find the rightmost chain by looking at the rightmost node position
      let rightmostX = -Infinity
      
      // Check all nodes to find the rightmost position
      allNonAIAgentNodes.forEach(node => {
        if (node.position.x > rightmostX) {
          rightmostX = node.position.x
        }
      })
      
      // Place new chain to the right of the rightmost position with spacing
      newX = rightmostX + horizontalSpacing
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
          // Capture the chain ID in a local variable to avoid closure issues
          const chainId = newNodeId
          console.log('🎯 [AIAgentVisualChainBuilder] Add Action clicked for chain:', chainId)
          
          // Set the callback first
          if (onActionSelect) {
            onActionSelect((action: any, config?: any) => {
              console.log('🎯 [AIAgentVisualChainBuilder] Action selected for chain:', chainId, 'action:', action)
              if (action) {
                handleAddActionToChainRef.current?.(chainId, action, config)
              } else {
                console.warn('⚠️ [AIAgentVisualChainBuilder] Create chain callback invoked without action')
              }
            })
          }
          // Then open the dialog (callback will already be set)
          if (onOpenActionDialog) {
            onOpenActionDialog()
          }
        },
        isLastInChain: true
      }
    }

    setNodes((nds) => [...nds, newNode])

    // Connect from AI agent to the new chain - use the actual AI Agent node ID
    setEdges((eds) => [...eds, {
      id: `e-${aiAgentNode.id}-${newNodeId}`,
      source: aiAgentNode.id,
      target: newNodeId,
      type: 'custom',
      style: { 
        stroke: '#94a3b8',
        strokeWidth: 2 
      },
      data: {
        onAddNode: (pos: { x: number, y: number }) => {
          handleAddNodeBetweenRef.current?.(aiAgentNode.id, newNodeId, pos)
        }
      }
    }])

    // Auto-zoom to show all nodes with animation
    setTimeout(() => {
      fitView({ 
        padding: 0.2, 
        includeHiddenNodes: false,
        duration: 400,
        maxZoom: 2,
        minZoom: 0.05
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
        onNodeDragStop={(event, node) => {
          // Update the position of any AddAction nodes that are children of the dragged node
          setNodes((nds) => 
            nds.map((n) => {
              // Update the dragged node itself
              if (n.id === node.id) {
                return { ...n, position: node.position }
              }
              // Update any AddAction nodes that have this node as their parent
              if (n.type === 'addAction' && n.data?.parentId === node.id) {
                return {
                  ...n,
                  position: {
                    x: node.position.x,
                    y: node.position.y + 120  // Use consistent 120px spacing
                  }
                }
              }
              return n
            })
          )
        }}
        fitView
        fitViewOptions={{
          padding: 0.2,
          includeHiddenNodes: false,
          maxZoom: 2,
          minZoom: 0.05,
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
