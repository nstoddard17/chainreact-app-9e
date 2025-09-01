"use client"

import React, { useCallback, useMemo, useState, useEffect } from 'react'
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
  BackgroundVariant,
  Handle,
  Position,
  NodeProps,
  EdgeProps,
  getBezierPath,
  applyNodeChanges,
  applyEdgeChanges,
  OnNodesChange,
  OnEdgesChange,
  useReactFlow,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { 
  Plus, Settings, Trash2, Bot, Workflow,
  PlusCircle, X, Sparkles, Wand2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { useIntegrationStore } from '@/stores/integrationStore'
import { ChainActionConfigModal } from './ChainActionConfigModal'
import { AIAgentActionSelector } from './AIAgentActionSelector'

// Types for chain actions and nodes
interface ChainAction {
  id: string
  nodeType: string
  providerId: string
  config: Record<string, any>
  aiAutoConfig: boolean
}

interface ChainNodeData {
  label: string
  type: string
  providerId?: string
  config?: Record<string, any>
  aiAutoConfig?: boolean
  isAIAgent?: boolean
  onConfigure?: (id: string) => void
  onDelete?: (id: string) => void
  onInsertAfter?: (id: string) => void
  chainId?: string
  actionId?: string
}

// Custom node components matching workflow builder style
const ChainActionNode = ({ id, data, selected }: NodeProps<ChainNodeData>) => {
  const nodeComponent = ALL_NODE_COMPONENTS.find(n => n.type === data.type)
  
  return (
    <div
      className={cn(
        "relative w-[400px] bg-card rounded-lg shadow-sm border",
        selected ? "border-primary" : "border-border",
        "hover:shadow-md transition-all duration-200 cursor-pointer"
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
        style={{ top: -6 }}
      />
      
      <div className="flex items-center justify-between p-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <div className="flex-1">
              <h3 className="font-medium text-sm">{data.label}</h3>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-xs">
                  {data.providerId}
                </Badge>
                {data.aiAutoConfig && (
                  <Badge variant="secondary" className="text-xs bg-purple-100 text-purple-700 border-purple-300">
                    <Sparkles className="w-3 h-3 mr-1" />
                    AI Config
                  </Badge>
                )}
              </div>
            </div>
          </div>
          {nodeComponent?.description && (
            <p className="text-xs text-muted-foreground mt-2">
              {nodeComponent.description}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-1 ml-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation()
              data.onInsertAfter?.(id)
            }}
            title="Add action after this"
          >
            <Plus className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => {
              e.stopPropagation()
              data.onConfigure?.(id)
            }}
            title="Configure action"
          >
            <Settings className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 hover:bg-red-50"
            onClick={(e) => {
              e.stopPropagation()
              data.onDelete?.(id)
            }}
            title="Delete action"
          >
            <Trash2 className="w-4 h-4 text-red-500" />
          </Button>
        </div>
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
        style={{ bottom: -6 }}
      />
    </div>
  )
}

const AIAgentRootNode = ({ data }: NodeProps<ChainNodeData>) => {
  return (
    <div className="relative w-[400px] bg-gradient-to-br from-purple-50 to-blue-50 rounded-lg shadow-sm border-2 border-purple-400 hover:shadow-md transition-all duration-200">
      <div className="p-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm border border-purple-200">
            <Bot className="w-7 h-7 text-purple-600" />
          </div>
          <div className="flex-1">
            <h4 className="font-semibold text-base">AI Agent Trigger</h4>
            <p className="text-xs text-muted-foreground mt-1">
              Analyzes input and routes to appropriate chain
            </p>
          </div>
        </div>
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-purple-500 !border-2 !border-white"
        id="ai-agent-output"
        style={{ bottom: -6 }}
      />
    </div>
  )
}

const AddActionNode = ({ id, data }: NodeProps<ChainNodeData>) => {
  return (
    <div className="w-[400px] flex flex-col items-center justify-center py-4">
      <div className="flex flex-col items-center">
        <div className="w-px h-4 bg-border mb-2" />
        <button
          className="nodrag nopan flex items-center justify-center w-12 h-12 bg-background border-2 border-dashed border-border rounded-full hover:border-primary hover:text-primary transition-colors cursor-pointer"
          onClick={() => data.onInsertAfter?.(id)}
        >
          <Plus className="h-6 w-6" />
        </button>
        <div className="w-px h-4 bg-border mt-2" />
      </div>
      <Handle type="target" position={Position.Top} className="!w-0 !h-0 !-top-1 !bg-transparent !border-none" />
    </div>
  )
}

const ChainStartNode = ({ id, data }: NodeProps<ChainNodeData>) => {
  return (
    <div className="w-[400px] bg-card rounded-lg shadow-sm border-2 border-dashed border-primary/50 hover:border-primary transition-all duration-200 p-6">
      <div className="text-center">
        <Workflow className="w-8 h-8 text-primary mx-auto mb-3" />
        <h3 className="font-medium text-sm mb-2">Start Building Your Chain</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Add actions that will execute when the AI routes to this chain
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => data.onAddFirstAction?.(data.chainId || id)}
          className="gap-2"
        >
          <Plus className="w-4 h-4" />
          Add First Action
        </Button>
      </div>
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-blue-500 !border-2 !border-white"
        style={{ top: -6 }}
      />
    </div>
  )
}

const InsertActionNode = ({ data }: NodeProps<ChainNodeData>) => {
  return (
    <div className="relative">
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 opacity-0 hover:opacity-100 transition-opacity"
        onClick={() => data.onInsertAfter?.('')}
      >
        <PlusCircle className="w-3 h-3" />
      </Button>
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-transparent !border-0 !w-0 !h-0"
      />
    </div>
  )
}

// Custom edge component that properly connects handles
const CustomEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}: EdgeProps) => {
  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <path
      id={id}
      style={style}
      className="react-flow__edge-path"
      d={edgePath}
      markerEnd={markerEnd}
    />
  )
}

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
}

const nodeTypes: NodeTypes = {
  aiAgent: AIAgentRootNode,
  action: ChainActionNode,
  addAction: AddActionNode,
  insertAction: InsertActionNode,
  chainStart: ChainStartNode,
}

// Chain templates with smart substitution
const CHAIN_TEMPLATES = [
  {
    id: 'customer-support',
    name: 'Customer Support',
    icon: '🎫',
    description: 'Handle support tickets efficiently',
    actions: [
      { 
        type: 'airtable_action_create_record', 
        provider: 'airtable',
        alternatives: ['notion_action_create_page', 'google-sheets_action_add_row']
      },
      { 
        type: 'gmail_action_send_email', 
        provider: 'gmail',
        alternatives: ['outlook_action_send_email']
      },
      { 
        type: 'discord_action_send_message', 
        provider: 'discord',
        alternatives: ['slack_action_send_message', 'microsoft-teams_action_send_message']
      }
    ]
  },
  {
    id: 'lead-capture',
    name: 'Lead Capture',
    icon: '🎯',
    description: 'Capture and nurture leads',
    actions: [
      { 
        type: 'hubspot_action_create_contact', 
        provider: 'hubspot',
        alternatives: ['airtable_action_create_record', 'google-sheets_action_add_row']
      },
      { 
        type: 'slack_action_send_message', 
        provider: 'slack',
        alternatives: ['discord_action_send_message', 'microsoft-teams_action_send_message']
      },
      { 
        type: 'gmail_action_send_email', 
        provider: 'gmail',
        alternatives: ['outlook_action_send_email']
      }
    ]
  }
]

interface AIAgentVisualChainBuilderProps {
  chains: any[]
  onChainsChange: (chains: any[]) => void
  onRequestActionSelector?: (callback: (nodeType: string, providerId: string) => void) => void
  onOpenActionDialog?: () => void
  onActionSelect?: (callback: (nodeType: string, providerId: string, config?: any) => void) => void
}

function AIAgentVisualChainBuilderInner({ 
  chains = [], 
  onChainsChange,
  onRequestActionSelector,
  onOpenActionDialog,
  onActionSelect
}: AIAgentVisualChainBuilderProps) {
  const { toast } = useToast()
  const { integrations } = useIntegrationStore()
  const { fitView, getViewport, setViewport } = useReactFlow()
  
  // Store callbacks in refs to avoid dependency issues
  const onOpenActionDialogRef = React.useRef(onOpenActionDialog)
  const onActionSelectRef = React.useRef(onActionSelect)
  
  React.useEffect(() => {
    onOpenActionDialogRef.current = onOpenActionDialog
    onActionSelectRef.current = onActionSelect
  }, [onOpenActionDialog, onActionSelect])
  
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [pendingActionAdd, setPendingActionAdd] = useState<{ chainId: string, position: number } | null>(null)
  const [configuringAction, setConfiguringAction] = useState<ChainAction | null>(null)
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null)
  const [showActionSelector, setShowActionSelector] = useState(false)
  const [actionSelectorContext, setActionSelectorContext] = useState<{ chainId: string, position: number, chainName?: string } | null>(null)
  
  // Force center view when nodes change
  useEffect(() => {
    if (nodes.length > 0) {
      const timer = setTimeout(() => {
        fitView({ 
          padding: 0.2, 
          includeHiddenNodes: false,
          maxZoom: 1,
          minZoom: 0.5,
          duration: 300 
        })
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [nodes, fitView])

  // Initialize with AI Agent root node
  useEffect(() => {
    // Calculate center position for AI Agent based on chains
    const calculateAIAgentPosition = () => {
      if (chains.length === 0) {
        return { x: 200, y: 50 }
      }
      
      // Calculate the center X position based on chain positions
      const chainSpacing = 450
      const totalChains = Math.min(chains.length, 3)
      const totalWidth = (totalChains - 1) * chainSpacing
      const startX = 200
      const centerX = startX + (totalWidth / 2)
      
      return { x: centerX, y: 50 }
    }
    
    const aiAgentPosition = calculateAIAgentPosition()
    
    const initialNodes: Node[] = [
      {
        id: 'ai-agent',
        type: 'aiAgent',
        position: aiAgentPosition,
        data: { 
          label: 'AI Agent Trigger',
          isAIAgent: true
        },
        draggable: true
      },
      // Add action node after AI Agent
      {
        id: 'add-after-ai-agent',
        type: 'addAction',
        position: { x: aiAgentPosition.x, y: aiAgentPosition.y + 120 },
        data: {
          label: 'Add Action',
          onInsertAfter: (id: string) => {
            // If no chains exist, create one and add action
            if (chains.length === 0) {
              handleRequestAction('default-chain', 0)
            } else {
              // Add to first chain by default
              handleRequestAction(chains[0].id, 0)
            }
          }
        }
      }
    ]

    const initialEdges: Edge[] = [
      // Connect AI Agent to Add button
      {
        id: 'ai-agent-to-add',
        source: 'ai-agent',
        target: 'add-after-ai-agent',
        animated: false,
        style: { stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '5 5' },
        type: 'step'
      }
    ]

    // If no chains exist, just show the AI Agent node with add button
    if (chains.length === 0) {
      setNodes(initialNodes)
      setEdges(initialEdges)
      return
    }

    // Add existing chains as branches
    const chainSpacing = 450
    const visibleChains = chains.slice(0, 3) // Only show first 3 chains
    const totalWidth = (visibleChains.length - 1) * chainSpacing
    const startX = aiAgentPosition.x - (totalWidth / 2)
    
    visibleChains.forEach((chain, chainIndex) => {
      const chainX = startX + (chainIndex * chainSpacing)
      const baseY = 280  // Adjusted for add button space
      
      // If chain has no actions, show chain start node
      if (!chain.actions || chain.actions.length === 0) {
        const chainStartId = `chain-start-${chain.id}`
        initialNodes.push({
          id: chainStartId,
          type: 'chainStart',
          position: { x: chainX, y: baseY },
          data: {
            label: chain.name || `Chain ${chainIndex + 1}`,
            chainId: chain.id,
            onAddFirstAction: (chainId: string) => handleRequestAction(chain.id, 0)
          }
        })
        
        // Connect add button to chain start
        initialEdges.push({
          id: `add-${chainStartId}`,
          source: 'add-after-ai-agent',
          target: chainStartId,
          animated: true,
          style: { stroke: '#8b5cf6', strokeWidth: 2 },
          type: 'step'
        })
      }

      // Add chain actions vertically
      let currentY = baseY
      chain.actions?.forEach((action: ChainAction, actionIndex: number) => {
        const nodeId = `${chain.id}-${action.id}`
        const nodeComponent = ALL_NODE_COMPONENTS.find(n => n.type === action.nodeType)
        
        initialNodes.push({
          id: nodeId,
          type: 'action',
          position: { x: chainX, y: currentY },
          data: {
            label: nodeComponent?.title || action.nodeType,
            type: action.nodeType,
            providerId: action.providerId,
            config: action.config,
            aiAutoConfig: action.aiAutoConfig,
            chainId: chain.id,
            actionId: action.id,
            onConfigure: (id: string) => handleConfigureAction(chain.id, action.id),
            onDelete: (id: string) => handleDeleteAction(chain.id, action.id),
            onInsertAfter: (id: string) => handleAddAction(chain.id, actionIndex + 1)
          }
        })
        
        
        // Connect nodes
        if (actionIndex === 0) {
          // Connect add button to first action
          initialEdges.push({
            id: `add-${nodeId}`,
            source: 'add-after-ai-agent',
            target: nodeId,
            animated: true,
            style: { stroke: '#8b5cf6', strokeWidth: 2 },
            type: 'step'
          })
        } else {
          // Connect previous action to current action
          const prevAction = chain.actions[actionIndex - 1]
          initialEdges.push({
            id: `${chain.id}-${prevAction.id}-${action.id}`,
            source: `${chain.id}-${prevAction.id}`,
            target: nodeId,
            style: { stroke: '#6b7280', strokeWidth: 2 },
            type: 'step'
          })
        }
        
        currentY += 160
        
        // Add an add action node after the last action
        if (actionIndex === chain.actions.length - 1) {
          const addId = `add-${chain.id}-${actionIndex + 1}`
          initialNodes.push({
            id: addId,
            type: 'addAction',
            position: { x: chainX, y: currentY },
            data: {
              label: 'Add Action',
              chainId: chain.id,
              onInsertAfter: (id: string) => handleAddAction(chain.id, actionIndex + 1)
            }
          })
          
          // Connect last action to add node
          initialEdges.push({
            id: `${nodeId}-${addId}`,
            source: nodeId,
            target: addId,
            style: { stroke: '#6b7280', strokeWidth: 2, strokeDasharray: '5,5' },
            type: 'step'
          })
        }
      })

    })

    // Add "Start New Chain" button if there are existing chains
    if (chains.length > 0 && chains.length < 3) {
      const newChainX = startX + (visibleChains.length * chainSpacing)
      initialNodes.push({
        id: 'new-chain',
        type: 'chainStart',
        position: { x: newChainX, y: 200 },
        data: {
          label: 'New Chain',
          chainId: 'new-chain',
          onAddFirstAction: () => handleCreateNewChain()
        }
      })
      
      // Connect AI Agent to new chain button
      initialEdges.push({
        id: 'ai-new-chain',
        source: 'ai-agent',
        target: 'new-chain',
        animated: true,
        style: { stroke: '#8b5cf6', strokeWidth: 2, strokeDasharray: '5,5' },
        type: 'step'
      })
    }

    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [chains])

  const handleRequestAction = useCallback((chainId: string, position: number) => {
    let finalChainId = chainId
    let targetChains = chains
    
    // If no chains exist, create a default chain
    if (chains.length === 0) {
      const newChain = {
        id: `chain-${Date.now()}`,
        name: `Chain 1`,
        actions: [],
        enabled: true
      }
      targetChains = [newChain]
      onChainsChange(targetChains)
      finalChainId = newChain.id
    } else if (chainId === 'default-chain' || !chains.find(c => c.id === chainId)) {
      finalChainId = chains[0].id
    }
    
    // Get chain name for context
    const chain = targetChains.find(c => c.id === finalChainId) || targetChains[0]
    const chainName = chain?.name || 'Chain'
    
    // Open our custom AI Agent action selector
    setActionSelectorContext({
      chainId: finalChainId,
      position,
      chainName
    })
    setShowActionSelector(true)
  }, [chains, onChainsChange])
  
  const handleCreateNewChain = useCallback(() => {
    const chainNumber = chains.length + 1
    const newChain = {
      id: `chain-${Date.now()}`,
      name: `Chain ${chainNumber}`,
      actions: [],
      enabled: true
    }
    onChainsChange([...chains, newChain])
    
    toast({
      title: "New Chain Created",
      description: `${newChain.name} has been added`
    })
  }, [chains, onChainsChange, toast])
  
  const handleAddAction = useCallback((chainId: string, position: number) => {
    handleRequestAction(chainId, position)
  }, [handleRequestAction])
  
  const handleActionSelected = useCallback((integration: any, action: any, aiAutoConfig: boolean) => {
    if (!actionSelectorContext) return
    
    const { chainId, position } = actionSelectorContext
    
    // Create the new action with AI config flag
    const newAction: ChainAction = {
      id: `action-${Date.now()}`,
      nodeType: action.type,
      providerId: integration.id,
      config: {},
      aiAutoConfig: aiAutoConfig
    }
    
    // Find the chain and add the action
    const chain = chains.find(c => c.id === chainId)
    if (!chain) return
    
    const updatedChain = {
      ...chain,
      actions: [
        ...chain.actions.slice(0, position),
        newAction,
        ...chain.actions.slice(position)
      ]
    }
    
    const updatedChains = chains.map(c => c.id === chainId ? updatedChain : c)
    onChainsChange(updatedChains)
    
    // Clear context
    setActionSelectorContext(null)
  }, [actionSelectorContext, chains, onChainsChange])

  const handleDeleteAction = useCallback((chainId: string, actionId: string) => {
    // Update chains state
    const updatedChains = chains.map(chain => {
      if (chain.id === chainId) {
        return {
          ...chain,
          actions: chain.actions.filter((a: ChainAction) => a.id !== actionId)
        }
      }
      return chain
    })
    onChainsChange(updatedChains)
  }, [chains, onChainsChange])

  const handleConfigureAction = useCallback((chainId: string, actionId: string) => {
    const chain = chains.find(c => c.id === chainId)
    const action = chain?.actions?.find((a: ChainAction) => a.id === actionId)
    if (action) {
      setConfiguringAction(action)
    }
  }, [chains])

  const handleApplyTemplate = useCallback((templateId: string) => {
    const template = CHAIN_TEMPLATES.find(t => t.id === templateId)
    if (!template) return

    let targetChains = chains
    let targetChainId = chains[0]?.id
    
    // If no chains exist, create a default chain
    if (chains.length === 0) {
      const newChain = {
        id: `chain-${Date.now()}`,
        name: `Chain 1`,
        actions: [],
        enabled: true
      }
      targetChains = [newChain]
      targetChainId = newChain.id
      onChainsChange(targetChains)
    }

    // Smart substitution - find available alternatives
    const newActions: ChainAction[] = []
    template.actions.forEach((templateAction, index) => {
      // Check if primary integration is connected
      let selectedType = templateAction.type
      let selectedProvider = templateAction.provider
      
      const isPrimaryConnected = integrations?.some(
        int => int.provider_id === templateAction.provider && int.is_connected
      )
      
      if (!isPrimaryConnected && templateAction.alternatives) {
        // Find first available alternative
        for (const altType of templateAction.alternatives) {
          const altNode = ALL_NODE_COMPONENTS.find(n => n.type === altType)
          if (altNode) {
            const isAltConnected = integrations?.some(
              int => int.provider_id === altNode.providerId && int.is_connected
            )
            if (isAltConnected) {
              selectedType = altType
              selectedProvider = altNode.providerId
              break
            }
          }
        }
      }

      newActions.push({
        id: `action-${Date.now()}-${index}`,
        nodeType: selectedType,
        providerId: selectedProvider,
        config: {},
        aiAutoConfig: true
      })
    })

    // Add actions to the first/target chain instead of creating a new chain
    const updatedChains = targetChains.map(chain => {
      if (chain.id === targetChainId) {
        return {
          ...chain,
          actions: [...(chain.actions || []), ...newActions]
        }
      }
      return chain
    })

    onChainsChange(updatedChains)
    setSelectedTemplate(null)
    
    toast({
      title: "Template Applied",
      description: `${template.name} actions added to ${targetChains.find(c => c.id === targetChainId)?.name || 'chain'}`
    })
  }, [chains, integrations, onChainsChange, toast])

  console.log('🎨 Rendering AIAgentVisualChainBuilder with', chains.length, 'chains')
  
  return (
    <div className="space-y-3">
      {/* Action Control Bar - Always visible at top */}
      <div className="bg-muted/30 rounded-lg p-3 border">
        <div className="flex gap-3 flex-wrap items-center">
          {/* New Chain Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              console.log('🆕 New Chain clicked')
              handleCreateNewChain()
            }}
            className="gap-2"
            title="Create a new chain"
          >
            <Workflow className="w-4 h-4" />
            New Chain
          </Button>
          
          {/* Separator */}
          <div className="w-px h-6 bg-border" />
          
          {/* Quick Templates - Add actions to current chain */}
          <div className="flex gap-2 items-center">
            <span className="text-xs text-muted-foreground font-medium">Templates:</span>
            {CHAIN_TEMPLATES.map(template => (
              <Button
                key={template.id}
                variant="ghost"
                size="sm"
                onClick={() => handleApplyTemplate(template.id)}
                className="gap-1 h-8 px-2"
                title={`Add ${template.name} actions to current chain`}
              >
                <span className="text-base">{template.icon}</span>
                <span className="text-xs">{template.name}</span>
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Visual Builder - Calculated height to fit within modal */}
      <div className="h-[calc(65vh-200px)] min-h-[350px] max-h-[500px] border rounded-lg bg-gray-50/50 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView={false}
          defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
          proOptions={{ hideAttribution: true }}
          attributionPosition="bottom-right"
          onInit={(instance) => {
            // Force multiple fit attempts to ensure centering
            const attemptFit = () => {
              instance.fitView({ 
                padding: 0.15, 
                includeHiddenNodes: false,
                maxZoom: 1.2,
                minZoom: 0.5,
                duration: 400 
              })
            }
            
            // Try multiple times with increasing delays
            setTimeout(attemptFit, 0)
            setTimeout(attemptFit, 100)
            setTimeout(attemptFit, 300)
            setTimeout(attemptFit, 600)
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
          <Controls />
        </ReactFlow>
        {/* Hide attribution with CSS as backup */}
        <style jsx global>{`
          .react-flow__attribution {
            display: none !important;
          }
        `}</style>
      </div>

      {/* Action Configuration Modal */}
      {configuringAction && (
        <ChainActionConfigModal
          action={configuringAction}
          isOpen={!!configuringAction}
          onClose={() => setConfiguringAction(null)}
          onSave={(actionId, config) => {
            // Update action config
            const updatedChains = chains.map(chain => ({
              ...chain,
              actions: chain.actions?.map((a: ChainAction) => 
                a.id === actionId ? { ...a, config, aiAutoConfig: false } : a
              )
            }))
            onChainsChange(updatedChains)
            setConfiguringAction(null)
          }}
        />
      )}
      
      {/* AI Agent Action Selector Modal */}
      <AIAgentActionSelector
        isOpen={showActionSelector}
        onClose={() => {
          setShowActionSelector(false)
          setActionSelectorContext(null)
        }}
        onActionSelect={handleActionSelected}
        chainId={actionSelectorContext?.chainId}
        chainName={actionSelectorContext?.chainName}
      />
    </div>
  )
}

export function AIAgentVisualChainBuilder(props: AIAgentVisualChainBuilderProps) {
  return (
    <ReactFlowProvider>
      <AIAgentVisualChainBuilderInner {...props} />
    </ReactFlowProvider>
  )
}

export default function AIAgentVisualChainBuilderWrapper(props: AIAgentVisualChainBuilderProps) {
  return (
    <ReactFlowProvider>
      <AIAgentVisualChainBuilderInner {...props} />
    </ReactFlowProvider>
  )
}