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
  ConnectionMode,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Plus, Settings, Trash2, Bot, Zap, Workflow,
  PlusCircle, TestTube, Loader2, Layers, Brain
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { AddActionNode } from './AddActionNode'
import { ChainPlaceholderNode } from './ChainPlaceholderNode'

import { logger } from '@/lib/utils/logger'
import { getIntegrationLogoClasses } from "@/lib/integrations/logoStyles"

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

const AIAgentCustomNode = memo(({ id, data, selected, position, positionAbsolute }: NodeProps) => {
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
    error,
    parentChainIndex
  } = data as CustomNodeData

  // Debug logging for handle positioning
  React.useEffect(() => {
    logger.debug('🔍 [AI Chain Node Handle Debug]', {
      nodeId: id,
      nodeType: type,
      position,
      positionAbsolute,
      isTrigger,
      hasMultipleOutputs: ["if_condition", "switch_case", "try_catch"].includes(type)
    })
  }, [id, type, position, positionAbsolute, isTrigger])

  // Debug logging for title issues
  if (!isTrigger && !isAIAgent && type !== 'chain_placeholder') {
    logger.debug('🎨 [AIAgentCustomNode] Rendering action node:', {
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
      className={`relative w-[480px] bg-card rounded-lg shadow-sm border ${
        selected ? "border-primary" : error ? "border-destructive" : "border-border"
      } hover:shadow-md transition-all duration-200 ${
        nodeHasConfiguration() ? "cursor-pointer" : ""
      }`}
      data-testid={`node-${id}`}
      onDoubleClick={handleDoubleClick}
    >
      {/* Chain badge for nodes that are part of a chain */}
      {parentChainIndex !== undefined && !isTrigger && !isAIAgent && type !== 'chain_placeholder' && (
        <div className="absolute -top-3 right-4 z-10">
          <span className="bg-purple-100 text-purple-900 border border-purple-300 text-xs font-medium px-2 py-0.5 rounded-full">
            Chain #{parentChainIndex + 1}
          </span>
        </div>
      )}
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
                className={getIntegrationLogoClasses(providerId, "w-8 h-8 object-contain")}
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
            ) : type === 'chain_placeholder' ? (
              <Layers className="h-8 w-8 text-muted-foreground" />
            ) : isTrigger ? (
              <Zap className="h-8 w-8 text-foreground" />
            ) : isAIAgent ? (
              <img
                src="/integrations/ai.svg"
                alt="AI Agent"
                className={getIntegrationLogoClasses('ai', "w-8 h-8 object-contain")}
                onError={(e) => {
                  e.currentTarget.style.display = 'none'
                }}
              />
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
              logger.debug('🟢 [AIAgentCustomNode] Add Action button clicked in chain placeholder')
              logger.debug('🟢 [AIAgentCustomNode] onAddAction:', onAddAction ? 'EXISTS' : 'NULL')
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

      {/* Handles for connections */}
      {/* Top handle (input) - show for all nodes except trigger */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
          isConnectable={true}
          style={{ top: -6 }}
          onConnect={() => logger.debug(`🔌 [AI Chain] Target handle connected on node ${id}`)}
        />
      )}

      {/* Bottom handle(s) (output) */}
      {hasMultipleOutputs ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="true"
            className="!w-3 !h-3 !bg-green-500"
            isConnectable={true}
            style={{ left: "25%" }}
            onConnect={() => logger.debug(`🔌 [AI Chain] Source handle 'true' connected on node ${id}`)}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="false"
            className="!w-3 !h-3 !bg-red-500"
            isConnectable={true}
            style={{ left: "75%" }}
            onConnect={() => logger.debug(`🔌 [AI Chain] Source handle 'false' connected on node ${id}`)}
          />
        </>
      ) : (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-muted-foreground !border-2 !border-background"
          isConnectable={true}
          style={{ bottom: -6 }}
          onConnect={() => logger.debug(`🔌 [AI Chain] Source handle connected on node ${id}`)}
        />
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
  data,
  markerEnd,
  source,
  target,
  sourceHandleId,
  targetHandleId
}: EdgeProps & { source?: string; target?: string; sourceHandleId?: string | null; targetHandleId?: string | null }) => {
  // Debug logging for edge positions
  React.useEffect(() => {
    logger.debug('🔍 [AI Chain Edge Debug]', {
      edgeId: id,
      source,
      target,
      sourceHandleId,
      targetHandleId,
      sourceCoords: { x: sourceX, y: sourceY, position: sourcePosition },
      targetCoords: { x: targetX, y: targetY, position: targetPosition }
    })
  }, [id, source, target, sourceX, sourceY, targetX, targetY, sourceHandleId, targetHandleId, sourcePosition, targetPosition])

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

      {/* Visible edge - matching main workflow builder exactly */}
      <path
        id={id}
        style={style}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        strokeWidth={2}
        stroke={style?.stroke || '#94a3b8'}
        strokeDasharray={style?.strokeDasharray}
      />
      
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
  addAction: AddActionNode as React.ComponentType<NodeProps>,
  chainPlaceholder: ChainPlaceholderNode as React.ComponentType<NodeProps>
}

const edgeTypes: EdgeTypes = {
  custom: CustomEdgeWithButton,
  default: undefined // Allow default edge type as well
}

// Main Visual Chain Builder Component
interface AIAgentVisualChainBuilderProps {
  chains?: any[]
  chainsLayout?: any // Full layout data with nodes, edges, positions
  onChainsChange?: (chains: any) => void
  onOpenActionDialog?: () => void
  onActionSelect?: (callback: (action: any, config?: any) => void) => void
  onConfigureNode?: (nodeId: string) => void
  workflowData?: { nodes: any[], edges: any[] }
  currentNodeId?: string
}

function AIAgentVisualChainBuilder({
  chains = [],
  chainsLayout,
  onChainsChange = () => {},
  onOpenActionDialog,
  onActionSelect,
  onConfigureNode: onConfigureNodeProp,
  workflowData,
  currentNodeId
}: AIAgentVisualChainBuilderProps) {
  const { toast } = useToast()
  const [nodes, setNodes, onNodesChangeBase] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const { fitView, getZoom, setViewport } = useReactFlow()
  
  // Track which chains have been intentionally emptied to prevent Add Action button recreation
  const [emptiedChains, setEmptiedChains] = React.useState<number[]>([])
  
  // State for delete confirmation dialog
  const [deletingNode, setDeletingNode] = useState<{ id: string; name: string } | null>(null)
  
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
    
    // Get all action nodes (exclude system nodes and placeholders)
    const actionNodes = nodes.filter(n =>
      n.id !== 'trigger' &&
      n.id !== aiAgentId &&
      n.type !== 'addAction' &&
      n.data?.type !== 'ai_agent' &&
      !n.data?.isAIAgent &&
      n.data?.type !== 'chain_placeholder' // Exclude chain placeholders - they should NOT be sent to workflow
    )
    
    // Debug: Log what nodes we're including
    logger.debug('🔍 [AIAgentVisualChainBuilder] Nodes being sent to parent:', actionNodes.map(n => ({
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
    
    // Include chain placeholders in the saved nodes for proper restoration
    const allNodesToSave = [...actionNodes]

    // Add chain placeholder nodes explicitly to preserve them
    const placeholderNodes = nodes.filter(n => n.data?.type === 'chain_placeholder')
    placeholderNodes.forEach(placeholder => {
      allNodesToSave.push(placeholder)
    })

    // Build comprehensive layout data with full node/edge structure
    const fullLayoutData = {
      chains: extractedChains,
      chainPlaceholderPositions, // Include placeholder positions for empty chains
      nodes: allNodesToSave.map(n => ({
        id: n.id,
        type: n.data?.type,
        providerId: n.data?.providerId,
        config: n.data?.config || {},
        title: n.data?.title,
        description: n.data?.description,
        position: n.position,
        parentChainIndex: n.data?.parentChainIndex ?? nodeChainMap.get(n.id), // Use existing parentChainIndex for placeholders
        // Preserve chain placeholder specific properties
        hasAddButton: n.data?.hasAddButton,
        isLastInChain: n.data?.isLastInChain,
        isTrigger: n.data?.isTrigger
      })),
      edges: actionEdges.map(e => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: e.type || 'custom',
        style: e.style || { stroke: '#94a3b8', strokeWidth: 2 }
      })),
      aiAgentPosition: aiAgentNode ? {
        x: aiAgentNode.position.x,
        y: aiAgentNode.position.y
      } : { x: 400, y: 200 },
      layout: {
        verticalSpacing: 120, // Spacing between nodes in a chain
        horizontalSpacing: 150 // Spacing between chains
      },
      emptiedChains: emptiedChains // Include the emptiedChains tracking
    }
    
    // Only update if data actually changed
    const dataString = JSON.stringify(fullLayoutData)
    if (dataString !== previousChainsRef.current) {
      previousChainsRef.current = dataString
      logger.debug('📤 [AIAgentVisualChainBuilder] Syncing full layout to parent:', {
        chains: extractedChains.length,
        nodes: actionNodes.length,
        edges: actionEdges.length
      })
      logger.debug('📤 [AIAgentVisualChainBuilder] Full data:', fullLayoutData)
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
                draggable: false, // Ensure Add Action nodes remain non-draggable
                position: {
                  x: change.position.x,
                  y: change.position.y + 150 // Use consistent spacing with gap
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
    logger.debug('⚙️ [AIAgentVisualChainBuilder] Configure node:', nodeId)

    // If parent provided a configure handler, use it
    if (onConfigureNodeProp) {
      onConfigureNodeProp(nodeId)
    } else {
      // Fallback to toast if no handler provided
      toast({
        title: "Configure Node",
        description: `Configure settings for node ${nodeId}`
      })
    }
  }, [onConfigureNodeProp, toast])
  
  // Declare handleAddNodeBetween before handleDeleteNode to avoid initialization error
  const handleAddNodeBetween = useCallback((sourceId: string, targetId: string, position: { x: number, y: number }) => {
    logger.debug('🔗 [AIAgentVisualChainBuilder] handleAddNodeBetween called', { sourceId, targetId, position })
    
    // Open action dialog to select a node to add
    if (onOpenActionDialog) {
      // Set the callback first to select a node to add
      if (onActionSelect) {
        const callbackFn = (action: any, config?: any) => {
          logger.debug('🔗 [AIAgentVisualChainBuilder] handleAddNodeBetween callback invoked', { action, config })
          if (!action || !action.type) {
            logger.warn('⚠️ [AIAgentVisualChainBuilder] handleAddNodeBetween callback invoked without valid action')
            return
          }
          const newNodeId = `node-${Date.now()}`
          const actionType = typeof action === 'string' ? action : action.type
          
          // Track if we successfully added the node
          let nodeAdded = false
          let resolvedTargetId = targetId // Track the actual target ID we'll use
          
          // Use setNodes to access current nodes and update positions
          setNodes((currentNodes) => {
            logger.debug('🔍 [AIAgentVisualChainBuilder] Current nodes:', currentNodes.map(n => ({ id: n.id, type: n.type, dataType: n.data?.type })))
            logger.debug('🔍 [AIAgentVisualChainBuilder] Looking for sourceId:', sourceId, 'targetId:', targetId)
            
            // Find the source node
            const sourceNode = currentNodes.find(n => n.id === sourceId || (sourceId === 'ai-agent' && n.data?.type === 'ai_agent'))
            let targetNode = currentNodes.find(n => n.id === targetId)
            
            // Special case: If source is ai-agent-like and target is not found (likely a stale chain ID)
            // Find the action node in the same chain based on click position
            if ((sourceId === 'ai-agent' || sourceNode?.data?.type === 'ai_agent') && !targetNode) {
              logger.debug('🔍 [AIAgentVisualChainBuilder] Source is AI agent and target not found, looking for action in correct chain')
              logger.debug('🔍 [AIAgentVisualChainBuilder] Click position:', position)
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
                  logger.debug('🔍 [AIAgentVisualChainBuilder] Found action node in correct chain:', resolvedTargetId, 'at X:', targetNode.position.x)
                }
              }
            }
            
            // If still no target and it looks like a chain ID, find the actual node that replaced it
            if (!targetNode && targetId.includes('chain')) {
              logger.debug('🔍 [AIAgentVisualChainBuilder] Target looks like a chain, searching for replacement node')
              logger.debug('🔍 [AIAgentVisualChainBuilder] Using click position for chain detection:', position)
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
                  logger.debug('🔍 [AIAgentVisualChainBuilder] Found replacement node for chain:', resolvedTargetId, 'at X:', targetNode.position.x)
                }
              }
            }
            
            if (!sourceNode || !targetNode) {
              logger.error('❌ [AIAgentVisualChainBuilder] Could not find source or target node')
              logger.error('❌ Source node found:', !!sourceNode, 'Target node found:', !!targetNode)
              logger.error('❌ Available node IDs:', currentNodes.map(n => n.id))
              
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
              nodeAdded = true // Mark that we added the node with fallback
              return [...currentNodes, newNode]
            }
            
            // The new node should take the exact position of the target node
            const newNodePosition = {
              x: targetNode.position.x,
              y: targetNode.position.y
            }
            
            nodeAdded = true // Mark successful node addition
            
            // Calculate spacing with gap between nodes
            const verticalShift = 150 // Added gap for better visual separation
            
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
            logger.debug('🔗 [AIAgentVisualChainBuilder] Updating edges with resolvedTargetId:', resolvedTargetId)
            
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
                id: `e-${actualSourceId}-${newNodeId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
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
                id: `e-${newNodeId}-${resolvedTargetId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
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
        
        logger.debug('🔗 [AIAgentVisualChainBuilder] Setting callback for node between')
        onActionSelect(callbackFn)
      }
      // Then open the dialog (callback will already be set)
      logger.debug('🔗 [AIAgentVisualChainBuilder] Opening action dialog for node between')
      onOpenActionDialog()
    }
  }, [onOpenActionDialog, onActionSelect, fitView, setNodes, setEdges, handleConfigureNode])
  
  // Set the ref in a layout effect to ensure it's set before any renders
  React.useLayoutEffect(() => {
    handleAddNodeBetweenRef.current = handleAddNodeBetween
  }, [handleAddNodeBetween])
  
  // Create a ref for handleConfirmDelete that will be set later
  const handleConfirmDeleteRef = React.useRef<(nodeId: string) => void>()
  
  // Actual deletion logic
  const handleConfirmDelete = useCallback((nodeId: string) => {
    logger.debug('🗑️ [AIAgentVisualChainBuilder] Confirming delete for node:', nodeId)
    
    // Clear the deleting state if it exists
    if (deletingNode) {
      setDeletingNode(null)
    }
    
    // Use functional updates to get current state values
    setNodes((currentNodes) => {
      setEdges((currentEdges) => {
        // Find edges connected to this node using current state
        const edgesFromNode = currentEdges.filter(e => e.source === nodeId)
        const edgesToNode = currentEdges.filter(e => e.target === nodeId)
        
        logger.debug('🗑️ [AIAgentVisualChainBuilder] Current edges:', currentEdges)
        logger.debug('🗑️ [AIAgentVisualChainBuilder] Edges from node:', edgesFromNode)
        logger.debug('🗑️ [AIAgentVisualChainBuilder] Edges to node:', edgesToNode)
        
        // Check if this is an Add Action node - if so, just remove it
        const nodeToDelete = currentNodes.find(n => n.id === nodeId)
        if (nodeToDelete?.type === 'addAction') {
          // Return filtered edges
          return currentEdges.filter(e => e.source !== nodeId && e.target !== nodeId)
        }
        
        // Check if this is the last action in a chain (has an Add Action button after it)
        const hasAddActionAfter = edgesFromNode.some(e => {
          const targetNode = currentNodes.find(n => n.id === e.target)
          logger.debug('🗑️ [AIAgentVisualChainBuilder] Checking target node:', e.target, 'type:', targetNode?.type)
          return targetNode?.type === 'addAction'
        })
        
        logger.debug('🗑️ [AIAgentVisualChainBuilder] Has Add Action after:', hasAddActionAfter)
        
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
              // Count how many chains we currently have
              const aiAgentEdges = currentEdges.filter(e => e.source === 'ai-agent')
              const chainCount = aiAgentEdges.length
              
              logger.debug('🔍 [AIAgentVisualChainBuilder] Deleting last action, chain count:', chainCount)
              
              // If this is the only chain, add a chain_placeholder
              if (chainCount === 1) {
                logger.debug('✨ [AIAgentVisualChainBuilder] Only chain emptied, adding chain_placeholder')

                // Create a chain placeholder node
                const placeholderNodeId = `chain-default-${Date.now()}`
                const deletedNodePosition = currentNodes.find(n => n.id === nodeId)?.position || { x: 400, y: 400 }

                // Determine which chain number this was
                const edgeToNode = currentEdges.find(e => e.target === nodeId && e.source === 'ai-agent')
                const chainNumber = edgeToNode ?
                  aiAgentEdges.findIndex(e => e.id === edgeToNode.id) + 1 :
                  1

                const placeholderNode: Node = {
                  id: placeholderNodeId,
                  type: 'custom',
                  position: deletedNodePosition,
                  data: {
                    title: `Chain ${chainNumber}`,
                    description: 'Click + Add Action to add your first action',
                    type: 'chain_placeholder',
                    width: 480,
                    isTrigger: false,
                    hasAddButton: true,
                    config: {},
                    onConfigure: () => {
                      if (onOpenActionDialog) {
                        onOpenActionDialog()
                      }
                    },
                    // No delete for chain placeholder - it should always be present
                    onAddToChain: (nodeId: string) => handleAddToChainRef.current?.(nodeId),
                    onAddAction: () => {
                      const chainId = placeholderNodeId
                      logger.debug('🔥 [AIAgentVisualChainBuilder] onAddAction called for chain:', chainId)
                      if (onActionSelect) {
                        const callbackFn = (action: any, config?: any) => {
                          logger.debug('🔥 [AIAgentVisualChainBuilder] Callback invoked with action:', action, 'config:', config, 'for chain:', chainId)
                          if (action && action.type) {
                            handleAddActionToChainRef.current?.(chainId, action, config)
                          } else {
                            logger.warn('⚠️ [AIAgentVisualChainBuilder] Callback invoked without valid action')
                          }
                        }
                        onActionSelect(callbackFn)
                      }
                      if (onOpenActionDialog) {
                        onOpenActionDialog()
                      }
                    },
                    isLastInChain: true
                  }
                }
                
                // Add the placeholder node
                setTimeout(() => {
                  setNodes((nds) => [...nds, placeholderNode])
                }, 0)
                
                // Return edges with the new placeholder connected to AI Agent
                return [
                  ...currentEdges.filter(e => 
                    e.source !== nodeId && 
                    e.target !== nodeId && 
                    e.source !== addActionNodeId && 
                    e.target !== addActionNodeId
                  ),
                  {
                    id: `e-ai-agent-${placeholderNodeId}`,
                    source: 'ai-agent',
                    target: placeholderNodeId,
                    type: 'custom',
                    style: {
                      stroke: '#94a3b8',
                      strokeWidth: 2
                    },
                    data: {
                      onAddNode: (position: { x: number, y: number }) => {
                        handleAddNodeBetweenRef.current?.('ai-agent', placeholderNodeId, position)
                      }
                    }
                  }
                ]
              } 
                // Multiple chains exist, just remove this one
                logger.debug('✓ [AIAgentVisualChainBuilder] Multiple chains exist, removing chain')
                
                // Find which chain index this was by checking the edges
                let chainIndex = 0
                const sortedAiAgentEdges = aiAgentEdges.sort((a, b) => {
                  // Sort by target node position to determine chain order
                  const nodeA = currentNodes.find(n => n.id === a.target)
                  const nodeB = currentNodes.find(n => n.id === b.target)
                  return (nodeA?.position.x || 0) - (nodeB?.position.x || 0)
                })
                
                // Find the index of our edge
                const ourEdgeIndex = sortedAiAgentEdges.findIndex(e => e.target === nodeId)
                if (ourEdgeIndex !== -1) {
                  chainIndex = ourEdgeIndex
                }
                
                logger.debug('✓ [AIAgentVisualChainBuilder] Marking chain', chainIndex, 'as intentionally emptied')
                
                // Mark this chain as intentionally emptied
                setEmptiedChains(prev => {
                  const newEmptied = [...prev]
                  if (!newEmptied.includes(chainIndex)) {
                    newEmptied.push(chainIndex)
                  }
                  logger.debug('✓ [AIAgentVisualChainBuilder] Updated emptiedChains:', newEmptied)
                  return newEmptied
                })
                
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
                  y: previousNode.position.y + 150 // Use consistent spacing with gap
                },
                draggable: false, // Prevent Add Action nodes from being dragged
                data: {
                  parentId: previousNodeId,
                  onClick: () => {
                    // Set the callback first
                    if (onActionSelect) {
                      onActionSelect((action: any, config?: any) => {
                        if (action) {
                          handleAddToChainRef.current?.(previousNodeId, action, config)
                        } else {
                          logger.warn('⚠️ [AIAgentVisualChainBuilder] Add action callback invoked without action')
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
                  id: `e-${previousNodeId}-${newAddActionNodeId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
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
            id: `e-${previousNodeId}-${nextNodeId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
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
        } 
          // Simply return edges without the deleted node
          return currentEdges.filter(e => e.source !== nodeId && e.target !== nodeId)
        
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
      } 
        // Just remove the node
        return currentNodes.filter(n => n.id !== nodeId)
      
    })
  }, [edges, handleAddNodeBetween, setNodes, setEdges, deletingNode])
  
  // Set the ref in a layout effect to ensure it's set before any renders
  React.useLayoutEffect(() => {
    handleConfirmDeleteRef.current = handleConfirmDelete
  }, [handleConfirmDelete])
  
  // Now declare handleDeleteNode to show confirmation dialog
  const handleDeleteNode = useCallback((nodeId: string) => {
    logger.debug('🗑️ [AIAgentVisualChainBuilder] Delete requested for node:', nodeId)
    
    // Find the node to get its name
    const nodeToDelete = nodes.find(n => n.id === nodeId)
    if (!nodeToDelete) return
    
    // Check if this is an Add Action node - if so, just remove it without confirmation
    if (nodeToDelete.type === 'addAction') {
      if (handleConfirmDeleteRef.current) {
        handleConfirmDeleteRef.current(nodeId)
      }
      return
    }
    
    // For other nodes, show confirmation dialog
    const nodeName = nodeToDelete.data?.title || nodeToDelete.data?.name || 'this node'
    setDeletingNode({ id: nodeId, name: nodeName })
  }, [nodes, setDeletingNode])
  
  // Set the ref in a layout effect to ensure it's set before any renders
  React.useLayoutEffect(() => {
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
    logger.debug('🚀 [AIAgentVisualChainBuilder] initializeDefaultSetup called with workflowData:', workflowData)
    const centerX = 400 // Center of typical viewport
    const defaultChainId = 'chain-default'

    // Try to get AI Agent from workflow data to use its actual position
    let aiAgentPosition = { x: centerX, y: 280 }
    if (workflowData?.nodes) {
      const workflowAIAgent = workflowData.nodes.find(n => n.data?.type === 'ai_agent' || n.id === currentNodeId)
      if (workflowAIAgent?.position) {
        aiAgentPosition = workflowAIAgent.position
      }
    }

    // Try to get trigger from workflow data if available
    let triggerNode = null
    if (workflowData?.nodes) {
      logger.debug('🔍 [initializeDefaultSetup] Looking for trigger in workflowData nodes:', workflowData.nodes)
      const workflowTrigger = workflowData.nodes.find(n => n.data?.isTrigger)
      logger.debug('🔍 [initializeDefaultSetup] Found trigger:', workflowTrigger)
      if (workflowTrigger) {
        // Use the actual trigger from the workflow
        const triggerComponent = ALL_NODE_COMPONENTS.find(c => c.type === workflowTrigger.data?.type)
        triggerNode = {
          id: 'trigger',
          type: 'custom',
          position: workflowTrigger.position || { x: centerX, y: 50 },
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
        position: { x: centerX, y: 100 },
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
        position: aiAgentPosition,
        data: {
          title: 'AI Agent',
          description: 'An AI agent that can use other integrations as tools to accomplish goals',
          type: 'ai_agent',
          providerId: 'ai', // Add providerId to show the AI logo
          isAIAgent: true,
          onConfigure: () => {
            toast({
              title: "AI Agent Configuration",
              description: "Configure the AI agent settings in the tabs above"
            })
          },
          onDelete: () => {} // Add required onDelete handler
        }
      },
      {
        id: defaultChainId,
        type: 'chainPlaceholder',
        position: { x: centerX, y: 460 },
        draggable: false,
        selectable: false,
        data: {
          type: 'chain_placeholder',
          width: 480,
          parentId: 'ai-agent',
          parentAIAgentId: 'ai-agent',
          onClick: () => {
            logger.debug('Chain placeholder clicked in AI Agent builder')
            // Capture the chain ID to avoid closure issues
            const chainId = defaultChainId
            if (onActionSelect) {
              logger.debug('🔥 [AIAgentVisualChainBuilder] Setting callback via onActionSelect')
              // Set the callback first - now expecting the full action object
              const callbackFn = (action: any, config?: any) => {
                logger.debug('🔥 [AIAgentVisualChainBuilder] Callback invoked with action:', action, 'config:', config, 'for chain:', chainId)
                if (action && action.type) { // Ensure we have a valid action with a type
                  handleAddActionToChainRef.current?.(chainId, action, config)
                } else {
                  logger.warn('⚠️ [AIAgentVisualChainBuilder] Callback invoked without valid action')
                }
              }
              logger.debug('🔥 [AIAgentVisualChainBuilder] Passing callback function to onActionSelect')
              onActionSelect(callbackFn)
            }
            // Then open the dialog (callback will already be set)
            if (onOpenActionDialog) {
              logger.debug('🔥 [AIAgentVisualChainBuilder] Opening dialog via onOpenActionDialog')
              onOpenActionDialog()
            }
          }
        }
      }
    ]

    const initialEdges: Edge[] = [
      {
        id: 'e-trigger-ai',
        source: 'trigger',
        sourceHandle: undefined, // Use default source handle
        target: 'ai-agent',
        targetHandle: undefined, // Use default target handle
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
        sourceHandle: undefined, // Use default source handle
        target: defaultChainId,
        targetHandle: undefined, // Use default target handle
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

    logger.debug('🎯 [initializeDefaultSetup] Setting initial nodes:', initialNodes)
    logger.debug('🎯 [initializeDefaultSetup] Node count:', initialNodes.length)
    setNodes(initialNodes)

    // Delay edge creation to ensure nodes are properly rendered with handles
    // This fixes the issue where initial edges (trigger->AI agent and AI agent->chain placeholder)
    // don't connect to handles properly
    setTimeout(() => {
      logger.debug('🎯 [initializeDefaultSetup] Setting initial edges:', initialEdges)
      setEdges(initialEdges)

      // Force ReactFlow to recalculate edge paths after a short delay
      setTimeout(() => {
        setEdges((edges) => edges.map(edge => ({ ...edge })))
      }, 100)
    }, 100) // Increased delay to allow React Flow to properly render nodes and assign handles

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
  }, [setNodes, setEdges, fitView, toast, onOpenActionDialog, onActionSelect, workflowData, currentNodeId])
  
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

    logger.debug('🔍 [AIAgentVisualChainBuilder] Initialization check:', {
      hasWorkflowData: !!workflowData,
      workflowDataNodes: workflowData?.nodes?.length,
      hasChainsLayout: !!chainsLayout,
      chainsLayoutNodes: chainsLayout?.nodes?.length
    })

    // Skip initialization if we're still waiting for data to load
    // This gives time for workflowData to be properly passed from parent
    if (!chainsLayout && !workflowData) {
      logger.debug('⏳ [AIAgentVisualChainBuilder] Waiting for data to load...')
      return
    }

    // Now we can mark as initialized since we have some data
    initializedRef.current = true

    // First check if we have chainsLayout data (full layout from saved config)
    if (chainsLayout?.nodes && chainsLayout?.edges && chainsLayout.nodes.length > 0) {
      logger.debug('🎨 [AIAgentVisualChainBuilder] Initializing with chainsLayout:', chainsLayout)

      // Try to get trigger from workflow data if available
      let triggerNode = null
      if (workflowData?.nodes) {
        logger.debug('🔍 [AIAgentVisualChainBuilder] Looking for trigger in workflowData:', workflowData.nodes)
        const workflowTrigger = workflowData.nodes.find(n => n.data?.isTrigger)
        logger.debug('🔍 [AIAgentVisualChainBuilder] Found trigger:', workflowTrigger)
        if (workflowTrigger) {
          // Use the actual trigger from the workflow
          const triggerComponent = ALL_NODE_COMPONENTS.find(c => c.type === workflowTrigger.data?.type)
          triggerNode = {
            id: 'trigger',
            type: 'custom',
            position: workflowTrigger.position || { x: 400, y: 50 },
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
          position: { x: 400, y: 50 },
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

      // Use exact positions from workflow without any offset
      const workflowAIAgentPos = chainsLayout.aiAgentPosition || { x: 400, y: 280 }
      const chainBuilderAIAgentPosition = { ...workflowAIAgentPos }

      logger.debug('📍 [Position Sync] Using exact workflow positions:', {
        aiAgentPos: chainBuilderAIAgentPosition
      })

      // Recreate the exact layout from the saved data
      const aiAgentNode: Node = {
        id: 'ai-agent',
        type: 'custom',
        position: chainBuilderAIAgentPosition,
        data: {
          title: 'AI Agent',
          description: 'Intelligent decision-making agent',
          type: 'ai_agent',
          isAIAgent: true,
          providerId: 'ai', // Add providerId for icon
          onAddToChain: (nodeId: string) => handleAddToChain(nodeId)
        }
      }

      // Map the saved nodes with proper handlers
      const savedNodes = chainsLayout.nodes.map((node: any) => {
        // Skip trigger and ai-agent nodes as they're handled separately
        if (node.id === 'trigger' || node.id === 'ai-agent') {
          return null
        }

        // Get the node component info for proper title/description
        const nodeType = node.data?.type || node.type
        const nodeComponent = ALL_NODE_COMPONENTS.find(c => c.type === nodeType)

        // Use exact position from workflow without any offset
        const nodePosition = { ...node.position }

        // Special handling for chain placeholders
        // Check both node.data?.type and node.type since saved data might have it at root level
        if (nodeType === 'chain_placeholder') {
          return {
            id: node.id,
            type: 'custom',
            position: nodePosition,
            data: {
              title: node.data?.title || node.title || `Chain ${(node.data?.parentChainIndex ?? node.parentChainIndex ?? 0) + 1}`,
              description: node.data?.description || node.description || 'Click + Add Action to add your first action',
              type: 'chain_placeholder',
              width: node.data?.width || 480,
              isTrigger: node.data?.isTrigger ?? node.isTrigger ?? false,
              hasAddButton: node.data?.hasAddButton ?? node.hasAddButton ?? true,
              config: node.data?.config || node.config || {},
              parentChainIndex: node.data?.parentChainIndex ?? node.parentChainIndex,
              isLastInChain: node.data?.isLastInChain ?? node.isLastInChain ?? true,
              onConfigure: () => {
                if (onOpenActionDialog) {
                  onOpenActionDialog()
                }
              },
              // No delete for chain placeholder
              onAddToChain: (nodeId: string) => handleAddToChain(nodeId),
              onAddAction: () => {
                const chainId = node.id
                logger.debug('🔥 [AIAgentVisualChainBuilder] onAddAction called for chain:', chainId)
                if (onActionSelect) {
                  const callbackFn = (action: any, config?: any) => {
                    logger.debug('🔥 [AIAgentVisualChainBuilder] Callback invoked with action:', action, 'config:', config, 'for chain:', chainId)
                    if (action && action.type) {
                      handleAddActionToChainRef.current?.(chainId, action, config)
                    } else {
                      logger.warn('⚠️ [AIAgentVisualChainBuilder] Callback invoked without valid action')
                    }
                  }
                  onActionSelect(callbackFn)
                }
                if (onOpenActionDialog) {
                  onOpenActionDialog()
                }
              },
              isLastInChain: true
            }
          }
        }

        return {
          id: node.id,
          type: 'custom',
          position: nodePosition,
          data: {
            title: node.data?.title || node.title || nodeComponent?.title || 'Action',
            description: node.data?.description || node.description || nodeComponent?.description || '',
            type: nodeType,
            providerId: node.data?.providerId || node.providerId,
            config: node.data?.config || node.config || {},
            parentChainIndex: node.data?.parentChainIndex ?? node.parentChainIndex,
            label: node.data?.label || node.label,
            onConfigure: () => handleConfigureNode(node.id),
            onDelete: () => handleDeleteNodeRef.current?.(node.id),
            onAddToChain: (nodeId: string) => handleAddToChain(nodeId)
          }
        }
      }).filter(Boolean) // Remove null entries

      // Create Add Action nodes for the last node in each chain
      const addActionNodes: Node[] = []

      // Group nodes by parentChainIndex to identify chains (only chain nodes, not preprocessing nodes)
      const chainGroups = new Map<number, any[]>()
      savedNodes.forEach((node: any) => {
        // Only group actual chain nodes (those with parentChainIndex)
        if (node.data?.parentChainIndex !== undefined) {
          const chainIndex = node.data.parentChainIndex
          if (!chainGroups.has(chainIndex)) {
            chainGroups.set(chainIndex, [])
          }
          chainGroups.get(chainIndex)!.push(node)
        }
      })

      // For each chain, find the last node and add an Add Action node
      chainGroups.forEach((chainNodes, chainIndex) => {
        if (chainNodes.length > 0) {
          // Sort nodes by Y position to find the last one in the chain
          const sortedNodes = [...chainNodes].sort((a, b) => b.position.y - a.position.y)
          const lastInChain = sortedNodes[0] // Node with the highest Y position

          // Only create Add Action node if the last node is NOT a chain placeholder
          if (lastInChain && lastInChain.data?.type !== 'chain_placeholder') {
            const addActionNodeId = `add-action-chain-${chainIndex}-${lastInChain.id}`
            // Find the corresponding saved node to get its position
            const savedNode = savedNodes.find(n => n?.id === lastInChain.id)
            const lastNodePosition = savedNode?.position || lastInChain.position
            const addActionNode = {
              id: addActionNodeId,
              type: 'addAction',
              position: {
                x: lastNodePosition.x,
                y: lastNodePosition.y + 150
              },
              draggable: false, // Prevent Add Action nodes from being dragged
              data: {
                parentId: lastInChain.id,
                parentChainIndex: chainIndex,
                onClick: () => {
                  logger.debug('🔗 [AIAgentVisualChainBuilder] Add action button clicked for chain:', chainIndex, 'node:', lastInChain.id)
                  handleAddToChainRef.current?.(lastInChain.id)
                }
              }
            }
            addActionNodes.push(addActionNode)

            // Add edge from last node to Add Action node
            chainsLayout.edges.push({
              id: `e-${lastInChain.id}-${addActionNodeId}`,
              source: lastInChain.id,
              target: addActionNodeId,
              type: 'custom',
              style: { stroke: '#94a3b8', strokeWidth: 2 }
            })
          }
        }
      })

      // Check if we have any empty chains that need placeholders
      // If there are no nodes in savedNodes but we have chainPlaceholderPositions, create placeholders
      if (savedNodes.length === 0 && chainsLayout.chainPlaceholderPositions?.length > 0) {
        logger.debug('🎯 [AIAgentVisualChainBuilder] Creating chain placeholders from saved positions')
        chainsLayout.chainPlaceholderPositions.forEach((position: any, chainIndex: number) => {
          if (position) {
            const placeholderId = `chain-${chainIndex}-placeholder`
            const placeholderNode = {
              id: placeholderId,
              type: 'custom',
              position: position,
              data: {
                title: `Chain ${chainIndex + 1}`,
                description: 'Click + Add Action to add your first action',
                type: 'chain_placeholder',
                width: 480,
                isTrigger: false,
                hasAddButton: true,
                config: {},
                parentChainIndex: chainIndex,
                onConfigure: () => {
                  if (onOpenActionDialog) {
                    onOpenActionDialog()
                  }
                },
                // No delete for chain placeholder
                onAddToChain: (nodeId: string) => handleAddToChain(nodeId),
                onAddAction: () => {
                  const chainId = placeholderId
                  logger.debug('🔥 [AIAgentVisualChainBuilder] onAddAction called for chain:', chainId)
                  if (onActionSelect) {
                    const callbackFn = (action: any, config?: any) => {
                      logger.debug('🔥 [AIAgentVisualChainBuilder] Callback invoked with action:', action, 'config:', config, 'for chain:', chainId)
                      if (action && action.type) {
                        handleAddActionToChainRef.current?.(chainId, action, config)
                      } else {
                        logger.warn('⚠️ [AIAgentVisualChainBuilder] Callback invoked without valid action')
                      }
                    }
                    onActionSelect(callbackFn)
                  }
                  if (onOpenActionDialog) {
                    onOpenActionDialog()
                  }
                },
                isLastInChain: true
              }
            }
            savedNodes.push(placeholderNode)

            // Add edge from AI Agent to placeholder
            chainsLayout.edges.push({
              id: `e-ai-agent-${placeholderId}`,
              source: 'ai-agent',
              sourceHandle: undefined, // Use default source handle
              target: placeholderId,
              targetHandle: undefined, // Use default target handle
              type: 'custom',
              style: { stroke: '#94a3b8', strokeWidth: 2 }
            })
          }
        })
      }

      // Also check if there are chains directly from AI Agent with no nodes yet
      const aiAgentOutgoingEdges = chainsLayout.edges.filter((e: any) => e.source === 'ai-agent')
      aiAgentOutgoingEdges.forEach((edge: any) => {
        // Check if this edge goes to a chain placeholder
        const targetNode = savedNodes.find((n: any) => n.id === edge.target)
        if (targetNode?.data?.type === 'chain_placeholder') {
          // Chain placeholder already has its own Add button, no need for separate Add Action node
          
        }
      })
      
      // Map edges with handlers
      const mappedEdges = chainsLayout.edges.map((edge: any) => ({
        ...edge,
        type: edge.type || 'custom',
        style: edge.style || {
          stroke: '#94a3b8',
          strokeWidth: 2
        },
        data: {
          ...edge.data,
          onAddNode: (position: { x: number, y: number }) => {
            handleAddNodeBetweenRef.current?.(edge.source, edge.target, position)
          }
        }
      }))
      
      // Set all nodes first (including trigger)
      setNodes([triggerNode, aiAgentNode, ...savedNodes, ...addActionNodes])

      // Add edge from trigger to AI agent if not already present
      const triggerToAIAgentEdge = {
        id: 'e-trigger-ai-agent',
        source: 'trigger',
        sourceHandle: undefined, // Use default source handle
        target: 'ai-agent',
        targetHandle: undefined, // Use default target handle
        type: 'custom',
        style: {
          stroke: '#94a3b8',
          strokeWidth: 2
        }
      }

      // Check if trigger-to-ai-agent edge already exists
      const hasExistingTriggerEdge = mappedEdges.some(e =>
        e.source === 'trigger' && e.target === 'ai-agent'
      )

      const finalEdges = hasExistingTriggerEdge ? mappedEdges : [triggerToAIAgentEdge, ...mappedEdges]

      // Delay edge creation to ensure nodes are properly rendered with handles
      setTimeout(() => {
        setEdges(finalEdges)

        // Force ReactFlow to recalculate edge paths after a short delay
        setTimeout(() => {
          setEdges((edges) => edges.map(edge => ({ ...edge })))
        }, 100)
      }, 100) // Increased delay to allow React Flow to properly render nodes and calculate handle positions
      
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
    
    // If we have workflow data, try to extract chains from it
    // Note: For a new AI Agent, there might be nodes but no relevant edges/chains yet
    if (workflowData?.nodes && workflowData?.edges) {
      logger.debug('🔄 [AIAgentVisualChainBuilder] Checking workflow data for existing chains:', workflowData)

      // Find AI Agent node and its children from workflow data
      const aiAgentNode = workflowData.nodes.find(n => n.id === currentNodeId || n.data?.type === 'ai_agent')

      // Check if this AI Agent has any chain nodes
      const hasChainNodes = aiAgentNode && workflowData.nodes.some(n =>
        n.data?.parentAIAgentId === aiAgentNode.id
      )

      if (!aiAgentNode || !hasChainNodes) {
        logger.debug('📝 [AIAgentVisualChainBuilder] New AI Agent or no chains found, using default setup')
        // Fall back to default initialization (which will still use trigger from workflowData)
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
            ? () => handleDeleteNodeRef.current?.(node.id)
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
          logger.debug(`⚠️ [AIAgentVisualChainBuilder] Filtering duplicate edge: ${edge.id}`)
          return false
        }
        seenEdgeIds.add(edge.id)
        return true
      })
      
      // Map edges to include handlers
      const mappedEdges = uniqueEdges.map(edge => ({
        ...edge,
        type: edge.type || 'custom',
        style: edge.style || {
          stroke: '#94a3b8',
          strokeWidth: 2
        },
        data: {
          ...edge.data,
          onAddNode: (position: { x: number, y: number }) => {
            handleAddNodeBetweenRef.current?.(edge.source, edge.target, position)
          }
        }
      }))
      
      // Set the nodes first from workflow data
      setNodes(mappedNodes)

      // Delay edge creation to ensure nodes are properly rendered with handles
      setTimeout(() => {
        setEdges(mappedEdges)
      }, 50) // Small delay for React Flow to render nodes
      
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
        logger.error('❌ [AIAgentVisualChainBuilder] handleAddActionToChain called with null/undefined action')
        return
      }
      
      logger.debug('🔷 [AIAgentVisualChainBuilder] handleAddActionToChain called:', { 
        chainId, 
        actionType: typeof action === 'string' ? action : action.type, // Handle both object and string for backwards compatibility
        actionTitle: typeof action === 'object' ? action.title : undefined,
        actionProviderId: typeof action === 'object' ? action.providerId : undefined
      })
      logger.debug('🔷 [AIAgentVisualChainBuilder] Action received:', action)
      logger.debug('🔷 [AIAgentVisualChainBuilder] Config received:', config)
      
      // Generate IDs outside to use in both setNodes and setEdges
      const newNodeId = `node-${Date.now()}`
      const addActionNodeId = `add-action-${newNodeId}`
      
      // Use setNodes to access current state
      setNodes((currentNodes) => {
        logger.debug('🔷 [AIAgentVisualChainBuilder] Current nodes:', currentNodes.map(n => ({ id: n.id, type: n.type })))
        logger.debug('🔷 [AIAgentVisualChainBuilder] Looking for chainId:', chainId)
        const chainNode = currentNodes.find(n => n.id === chainId)
        if (!chainNode) {
          logger.error('❌ [AIAgentVisualChainBuilder] Chain node not found:', chainId)
          logger.error('❌ Available node IDs:', currentNodes.map(n => n.id))
          return currentNodes
        }
        logger.debug('✅ [AIAgentVisualChainBuilder] Found chain node:', chainNode.id)
        
        // Handle both action object and string for backwards compatibility
        const actionType = typeof action === 'string' ? action : action.type
        const actionTitle = typeof action === 'object' ? action.title : null
        const actionDescription = typeof action === 'object' ? action.description : null
        const actionProviderId = typeof action === 'object' ? action.providerId : null
        
        // Use title from action object first, then config, then lookup, then fallback
        const title = actionTitle || config?.title || actionType
        const description = actionDescription || config?.description || ''
        const providerId = actionProviderId || config?.providerId || actionType.split('_')[0]
        
        logger.debug('🔷 [AIAgentVisualChainBuilder] Title resolution:', {
          finalTitle: title,
          actionTitle: actionTitle,
          configTitle: config?.title,
          actionType: actionType,
          titleSource: actionTitle ? 'action object' : (config?.title ? 'config' : 'actionType fallback')
        })
        
        // Find which chain this node belongs to by tracing back to AI Agent
        let chainIndex = 0
        setEdges((currentEdges) => {
          const aiAgentEdges = currentEdges.filter(e => e.source === 'ai-agent')
          const edgeToChain = currentEdges.find(e => e.target === chainId && e.source === 'ai-agent')
          if (edgeToChain) {
            chainIndex = aiAgentEdges.findIndex(e => e.id === edgeToChain.id)
          }
          return currentEdges
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
            config: config || {}, // Include the AI config or manual config
            parentChainIndex: chainIndex >= 0 ? chainIndex : undefined, // Add chain index
            onConfigure: () => handleConfigureNode(newNodeId),
            onDelete: () => handleDeleteNodeRef.current?.(newNodeId),
            onAddToChain: (nodeId: string) => handleAddToChain(nodeId),
            isLastInChain: true
          }
        }
        
        logger.debug('🚀 [AIAgentVisualChainBuilder] Creating new node with data:', {
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
            y: chainNode.position.y + 150 // Use consistent spacing with gap
          },
          draggable: false, // Prevent Add Action nodes from being dragged
          data: {
            parentId: newNodeId,
            onClick: () => {
              // Set the callback first
              logger.debug('🔥 [AIAgentVisualChainBuilder] Setting up callback for add action after:', newNodeId)
              if (onActionSelect) {
                const callbackFn = (action: any, config?: any) => {
                  logger.debug('🔥 [AIAgentVisualChainBuilder] Add action callback invoked with:', action, config)
                  // This will add the action after the current node
                  if (action && action.type) {
                    // Call handleAddToChain which expects just the nodeId
                    // It will set up its own callback and open the dialog
                    logger.debug('🔥 [AIAgentVisualChainBuilder] Processing action to add after node:', newNodeId)
                    
                    // Add the new action node directly here
                    const nextNodeId = `node-${Date.now()}`
                    const actionType = typeof action === 'string' ? action : action.type
                    
                    setNodes((currentNodes) => {
                      const parentNode = currentNodes.find(n => n.id === newNodeId)
                      if (!parentNode) {
                        logger.error('❌ [AIAgentVisualChainBuilder] Could not find parent node:', newNodeId)
                        return currentNodes
                      }
                      
                      // Create the new action node with consistent spacing
                      const nextNode: Node = {
                        id: nextNodeId,
                        type: 'custom',
                        position: {
                          x: parentNode.position.x,
                          y: parentNode.position.y + 150 // Use consistent spacing with gap
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
                          y: nextNode.position.y + 150 // Use consistent spacing with gap
                        },
                        draggable: false, // Prevent Add Action nodes from being dragged
                        data: {
                          parentId: nextNodeId,
                          onClick: () => {
                            logger.debug('🔗 [AIAgentVisualChainBuilder] Add action button clicked for:', nextNodeId)
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
                          id: `e-${newNodeId}-${nextNodeId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
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
                    logger.warn('⚠️ [AIAgentVisualChainBuilder] Chain action callback invoked without valid action')
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
          ...currentNodes.filter(n => n.id !== chainId), // Remove the placeholder
          newNode,
          addActionNode
        ]
        logger.debug('✅ [AIAgentVisualChainBuilder] Replaced placeholder, returning updated nodes:', updatedNodes.map(n => ({ id: n.id, type: n.type })))
        return updatedNodes
      })
      // Trigger immediate sync for real-time updates
      setTimeout(() => syncChainsToParent(), 0)
      
      // Update edges to point to the new node and connect to Add Action node
      const newEdge = {
        id: `e-${newNodeId}-${addActionNodeId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
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
      
      logger.debug('🔗 [AIAgentVisualChainBuilder] Creating edge from action to Add Action:', newEdge)
      
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
        logger.debug('🔗 [AIAgentVisualChainBuilder] Updated edges:', updatedEdges)
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
    logger.debug('🔍 [AI Chain onConnect Debug]', {
      source: params.source,
      target: params.target,
      sourceHandle: params.sourceHandle,
      targetHandle: params.targetHandle
    })

    const newEdge: Edge = {
      id: `e-${params.source}-${params.target}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
      source: params.source!,
      target: params.target!,
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
      logger.debug('🔥 [AIAgentVisualChainBuilder] handleAddToChain called for node:', lastNodeId)
      if (onActionSelect && onOpenActionDialog) {
        // Set up the callback first, then open the dialog
        const callbackFn = (action: any, config?: any) => {
          logger.debug('🔥 [AIAgentVisualChainBuilder] handleAddToChain callback invoked with:', action, config)
          if (!action || !action.type) {
            logger.warn('⚠️ [AIAgentVisualChainBuilder] handleAddToChain callback invoked without valid action')
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
              logger.error('❌ [AIAgentVisualChainBuilder] Could not find last node:', lastNodeId)
              return currentNodes
            }
            
            const newNode: Node = {
              id: newNodeId,
              type: 'custom',
              position: { 
                x: lastNode.position.x, 
                y: lastNode.position.y + 150 // Use consistent spacing with gap 
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
                y: newNode.position.y + 150 // Use consistent spacing with gap
              },
              draggable: false, // Prevent Add Action nodes from being dragged
              data: {
                parentId: newNodeId,
                onClick: () => {
                  logger.debug('🔗 [AIAgentVisualChainBuilder] Add action button clicked for:', newNodeId)
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
              .filter(n => n.id !== oldAddActionId) // Remove old Add Action
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
              id: `e-${lastNodeId}-${newNodeId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
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
              id: `e-${newNodeId}-${addActionNodeId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
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
    logger.debug('🔄 [AIAgentVisualChainBuilder] Creating new chain')
    logger.debug('🔄 [AIAgentVisualChainBuilder] Current nodes:', nodes.map(n => ({ id: n.id, type: n.type, dataType: n.data?.type })))
    const newChainId = `chain-${Date.now()}`
    const newNodeId = `${newChainId}-start`
    
    // Find AI agent node position - check both by id and by type
    const aiAgentNode = nodes.find(n => n.id === 'ai-agent' || n.data?.type === 'ai_agent' || n.data?.isAIAgent)
    if (!aiAgentNode) {
      logger.error('❌ [AIAgentVisualChainBuilder] AI Agent node not found in nodes:', nodes)
      return
    }
    logger.debug('✅ [AIAgentVisualChainBuilder] Found AI Agent node:', aiAgentNode.id)
    
    // Count all chains (both placeholders and actual chains with nodes)
    const aiAgentEdges = edges.filter(e => e.source === 'ai-agent')
    const totalChainCount = aiAgentEdges.length

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
    const horizontalSpacing = 550 // Increased gap between chains to prevent overlap
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
      newY = baseY // Keep consistent Y level for chain starts
    }
    
    // Create a placeholder chain start node
    const newNode: Node = {
      id: newNodeId,
      type: 'custom',
      position: { x: newX, y: newY },
      data: {
        title: `Chain ${totalChainCount + 1}`,
        description: 'Click + Add Action to add your first action',
        type: 'chain_placeholder',
        width: 480,
        isTrigger: false,
        hasAddButton: true,
        config: {},
        onConfigure: () => {
          if (onOpenActionDialog) {
            onOpenActionDialog()
          }
        },
        onDelete: () => handleDeleteNodeRef.current?.(newNodeId),
        onAddToChain: (nodeId: string) => handleAddToChain(nodeId),
        onAddAction: () => {
          // Capture the chain ID in a local variable to avoid closure issues
          const chainId = newNodeId
          logger.debug('🎯 [AIAgentVisualChainBuilder] Add Action clicked for chain:', chainId)
          
          // Set the callback first
          if (onActionSelect) {
            onActionSelect((action: any, config?: any) => {
              logger.debug('🎯 [AIAgentVisualChainBuilder] Action selected for chain:', chainId, 'action:', action)
              if (action) {
                handleAddActionToChainRef.current?.(chainId, action, config)
              } else {
                logger.warn('⚠️ [AIAgentVisualChainBuilder] Create chain callback invoked without action')
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
      id: `e-${aiAgentNode.id}-${newNodeId}-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
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

  // Debug: Log current nodes and edges every 2 seconds
  React.useEffect(() => {
    const interval = setInterval(() => {
      logger.debug('📊 [AI Chain State]', {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        nodes: nodes.map(n => ({
          id: n.id,
          type: n.type,
          position: n.position,
          hasTargetHandle: n.type !== 'addAction' && !n.data?.isTrigger,
          hasSourceHandle: true
        })),
        edges: edges.map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: e.type
        }))
      })
    }, 2000)
    return () => clearInterval(interval)
  }, [nodes, edges])

  // Force edge recalculation when nodes change to ensure proper connections
  useEffect(() => {
    if (nodes.length > 0 && edges.length > 0) {
      // Use a small delay to ensure nodes are rendered
      const timeoutId = setTimeout(() => {
        // Force ReactFlow to recalculate all edge paths
        setEdges((currentEdges) =>
          currentEdges.map(edge => ({
            ...edge,
            // Trigger a re-render by creating new object reference
          }))
        )
      }, 150)

      return () => clearTimeout(timeoutId)
    }
  }, [nodes.length]) // Only re-run when number of nodes changes

  return (
    <div className="h-[calc(95vh-400px)] min-h-[400px] w-full bg-slate-50 rounded-lg border relative ai-agent-chain-builder">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionMode="loose"
        defaultEdgeOptions={{
          type: 'custom',
          animated: false,
          style: { stroke: '#94a3b8', strokeWidth: 2 }
        }}
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
                  draggable: false, // Ensure Add Action nodes remain non-draggable
                  position: {
                    x: node.position.x,
                    y: node.position.y + 150 // Use consistent spacing with gap
                  }
                }
              }
              return n
            })
          )
        }}
        fitViewOptions={{
          padding: 0.2,
          includeHiddenNodes: false,
          maxZoom: 2,
          minZoom: 0.05,
        }}
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
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingNode} onOpenChange={(open: boolean) => !open && setDeletingNode(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Action</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deletingNode?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-end space-x-2">
            <Button variant="outline" onClick={() => setDeletingNode(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deletingNode && handleConfirmDeleteRef.current) {
                  handleConfirmDeleteRef.current(deletingNode.id)
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
