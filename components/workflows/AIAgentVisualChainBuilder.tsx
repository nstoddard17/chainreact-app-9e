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
  PlusCircle, X
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'

import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'
import { useIntegrationStore } from '@/stores/integrationStore'
import { ChainActionConfigModal } from './ChainActionConfigModal'

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
                  <Badge variant="secondary" className="text-xs">
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
              data.onConfigure?.(id)
            }}
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
      }
    ]

    const initialEdges: Edge[] = []

    // If no chains exist, show default starting layout
    if (chains.length === 0) {
      // Add default chain start node centered below AI Agent
      initialNodes.push({
        id: 'chain-start-1',
        type: 'chainStart',
        position: { x: aiAgentPosition.x, y: 250 },
        data: {
          label: 'Chain 1',
          chainId: 'default-chain',
          onAddFirstAction: (chainId: string) => handleRequestAction('default-chain', 0)
        }
      })

      // Connect AI Agent to chain start
      initialEdges.push({
        id: 'ai-agent-to-chain-start',
        source: 'ai-agent',
        target: 'chain-start-1',
        animated: true,
        style: { stroke: '#8b5cf6', strokeWidth: 2 },
        type: 'step'
      })

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
      const baseY = 250
      
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
        
        // Connect AI Agent to chain start
        initialEdges.push({
          id: `ai-${chainStartId}`,
          source: 'ai-agent',
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
          // Connect AI Agent to first action
          initialEdges.push({
            id: `ai-${nodeId}`,
            source: 'ai-agent',
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
    // If chainId is 'default-chain' and no chain exists, create one first
    if (chainId === 'default-chain' && chains.length === 0) {
      const newChain = {
        id: `chain-${Date.now()}`,
        name: `Chain 1`,
        actions: [],
        enabled: true
      }
      onChainsChange([newChain])
      chainId = newChain.id
    }
    
    // Open the main workflow's action selection modal
    if (onOpenActionDialogRef.current) {
      // Store the context for where to add the action
      const actionCallback = (nodeType: string, providerId: string, config?: any) => {
        const newAction: ChainAction = {
          id: `action-${Date.now()}`,
          nodeType: nodeType,
          providerId: providerId,
          config: config || {},
          aiAutoConfig: false
        }
        
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
        
        toast({
          title: "Action Added",
          description: `Added ${nodeType} action to chain`
        })
      }
      
      // Pass the callback to the parent modal
      if (onActionSelectRef.current) {
        onActionSelectRef.current(actionCallback)
      }
      
      // Open the action dialog
      onOpenActionDialogRef.current()
    } else {
      // Fallback: add a placeholder action if dialog handlers not provided
      const placeholderAction: ChainAction = {
        id: `action-${Date.now()}`,
        nodeType: 'logic_action_code',  // Default to a logic code action
        providerId: 'logic',
        config: {},
        aiAutoConfig: true
      }
      
      const chain = chains.find(c => c.id === chainId)
      if (!chain) return
      
      const updatedChain = {
        ...chain,
        actions: [
          ...chain.actions.slice(0, position),
          placeholderAction,
          ...chain.actions.slice(position)
        ]
      }
      
      const updatedChains = chains.map(c => c.id === chainId ? updatedChain : c)
      onChainsChange(updatedChains)
      
      toast({
        title: "Action Added",
        description: "Click the settings icon to configure the action"
      })
    }
  }, [chains, onChainsChange, toast])
  
  const handleAddAction = useCallback((chainId: string, position: number) => {
    handleRequestAction(chainId, position)
  }, [handleRequestAction])

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

  const handleCreateNewChain = useCallback(() => {
    const newChain = {
      id: `chain-${Date.now()}`,
      name: `Chain ${chains.length + 1}`,
      actions: [],
      enabled: true
    }
    onChainsChange([...chains, newChain])
    
    toast({
      title: "New Chain Added",
      description: `Chain ${chains.length + 1} has been created`
    })
  }, [chains, onChainsChange, toast])

  const handleApplyTemplate = useCallback((templateId: string) => {
    const template = CHAIN_TEMPLATES.find(t => t.id === templateId)
    if (!template) return

    // Smart substitution - find available alternatives
    const actions: ChainAction[] = []
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

      actions.push({
        id: `action-${Date.now()}-${index}`,
        nodeType: selectedType,
        providerId: selectedProvider,
        config: {},
        aiAutoConfig: true
      })
    })

    const newChain = {
      id: `chain-${Date.now()}`,
      name: template.name,
      description: template.description,
      actions,
      enabled: true
    }

    onChainsChange([...chains, newChain])
    setSelectedTemplate(null)
    
    toast({
      title: "Template Applied",
      description: `${template.name} chain created with available integrations`
    })
  }, [chains, integrations, onChainsChange, toast])

  return (
    <div className="space-y-4">
      {/* Templates */}
      <div className="flex gap-2 flex-wrap">
        {CHAIN_TEMPLATES.map(template => (
          <Button
            key={template.id}
            variant="outline"
            size="sm"
            onClick={() => handleApplyTemplate(template.id)}
            className="gap-2"
          >
            <span>{template.icon}</span>
            {template.name}
          </Button>
        ))}
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