"use client"

import React, { useMemo, useCallback, useEffect, useState } from 'react'
import {
  ReactFlow,
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  Position,
  Handle,
  NodeProps,
  BackgroundVariant
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { 
  Bot, Zap, Workflow, ArrowRight, Layers, 
  ZoomIn, ZoomOut, Maximize2, RotateCcw 
} from 'lucide-react'
import { Chain, ChainAction } from './AIAgentChainBuilder'
import { ALL_NODE_COMPONENTS } from '@/lib/workflows/nodes'

interface AIAgentWorkflowPreviewProps {
  chains: Chain[]
  triggerNode?: any
  aiAgentNodeId?: string
  className?: string
}

// Custom node component for the preview
const PreviewNode = ({ data }: NodeProps) => {
  const getNodeIcon = () => {
    if (data.nodeType === 'trigger') return <Zap className="w-4 h-4" />
    if (data.nodeType === 'ai_agent') return <Bot className="w-4 h-4" />
    return <Workflow className="w-4 h-4" />
  }

  return (
    <Card className={cn(
      "min-w-[200px] border-2 transition-all",
      data.isAIAgent && "border-purple-500 bg-gradient-to-br from-purple-50 to-blue-50",
      data.isTrigger && "border-blue-500 bg-gradient-to-br from-blue-50 to-cyan-50",
      data.chainColor && `border-${data.chainColor}-500`
    )}>
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-gray-400 !w-2 !h-2"
        style={{ left: -5 }}
      />
      
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2">
          {getNodeIcon()}
          <span className="font-medium text-sm">{data.label}</span>
        </div>
        
        {data.description && (
          <p className="text-xs text-muted-foreground">{data.description}</p>
        )}
        
        {data.provider && (
          <Badge variant="outline" className="text-xs mt-2">
            {data.provider}
          </Badge>
        )}
        
        {data.aiAutoConfig && (
          <Badge variant="secondary" className="text-xs mt-2 ml-2">
            AI Config
          </Badge>
        )}
        
        {data.chainName && (
          <div className="mt-2 pt-2 border-t">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-2 h-2 rounded-full",
                `bg-${data.chainColor}-500`
              )} />
              <span className="text-xs text-muted-foreground">
                {data.chainName}
              </span>
            </div>
          </div>
        )}
      </div>
      
      <Handle
        type="source"
        position={Position.Right}
        className="!bg-gray-400 !w-2 !h-2"
        style={{ right: -5 }}
      />
    </Card>
  )
}

const nodeTypes = {
  preview: PreviewNode
}

export function AIAgentWorkflowPreview({
  chains,
  triggerNode,
  aiAgentNodeId = 'ai-agent',
  className
}: AIAgentWorkflowPreviewProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [fitViewTrigger, setFitViewTrigger] = useState(0)

  // Build the preview nodes and edges from chains
  useEffect(() => {
    const previewNodes: Node[] = []
    const previewEdges: Edge[] = []
    
    // Add trigger node if provided
    if (triggerNode) {
      previewNodes.push({
        id: 'trigger',
        type: 'preview',
        position: { x: 50, y: 200 },
        data: {
          label: triggerNode.title || 'Trigger',
          description: triggerNode.description,
          nodeType: 'trigger',
          isTrigger: true,
          provider: triggerNode.providerId
        }
      })
      
      // Connect trigger to AI Agent
      previewEdges.push({
        id: 'trigger-ai',
        source: 'trigger',
        target: aiAgentNodeId,
        animated: true,
        style: { stroke: '#6366f1', strokeWidth: 2 }
      })
    }
    
    // Add AI Agent node
    previewNodes.push({
      id: aiAgentNodeId,
      type: 'preview',
      position: { x: 300, y: 200 },
      data: {
        label: 'AI Agent',
        description: 'Analyzes input and routes to appropriate chains',
        nodeType: 'ai_agent',
        isAIAgent: true
      }
    })
    
    // Add chain nodes
    let yOffset = 50
    const xStart = 550
    const ySpacing = 250
    
    chains.forEach((chain, chainIndex) => {
      if (!chain.enabled) return
      
      const chainStartY = yOffset
      let xOffset = xStart
      const xSpacing = 250
      
      // Create nodes for each action in the chain
      chain.actions.forEach((action, actionIndex) => {
        const nodeComponent = ALL_NODE_COMPONENTS.find(n => n.type === action.nodeType)
        const nodeId = `${chain.id}-${action.id}`
        
        previewNodes.push({
          id: nodeId,
          type: 'preview',
          position: { x: xOffset, y: chainStartY },
          data: {
            label: nodeComponent?.title || action.nodeType,
            description: nodeComponent?.description,
            provider: nodeComponent?.providerId,
            aiAutoConfig: action.aiAutoConfig,
            chainName: chain.name,
            chainColor: chain.color
          }
        })
        
        // Connect to previous node
        if (actionIndex === 0) {
          // Connect AI Agent to first action
          previewEdges.push({
            id: `ai-${nodeId}`,
            source: aiAgentNodeId,
            target: nodeId,
            animated: true,
            style: { 
              stroke: getChainColor(chain.color), 
              strokeWidth: 2,
              strokeDasharray: chain.condition ? '5 5' : '0'
            },
            label: chain.condition ? '?' : undefined,
            labelStyle: { fontSize: 12, fontWeight: 700 }
          })
        } else {
          // Connect to previous action
          const prevNodeId = `${chain.id}-${chain.actions[actionIndex - 1].id}`
          previewEdges.push({
            id: `${prevNodeId}-${nodeId}`,
            source: prevNodeId,
            target: nodeId,
            style: { 
              stroke: getChainColor(chain.color), 
              strokeWidth: 2 
            }
          })
        }
        
        xOffset += xSpacing
      })
      
      yOffset += ySpacing
    })
    
    // Add a note if there are conditional chains
    const hasConditionalChains = chains.some(c => c.condition && c.enabled)
    if (hasConditionalChains) {
      previewNodes.push({
        id: 'conditional-note',
        type: 'preview',
        position: { x: 300, y: -50 },
        data: {
          label: 'Conditional Routing',
          description: 'Chains execute based on AI analysis and conditions',
          nodeType: 'note'
        },
        style: { opacity: 0.7 }
      })
    }
    
    setNodes(previewNodes)
    setEdges(previewEdges)
    
    // Trigger fit view after a short delay
    setTimeout(() => setFitViewTrigger(prev => prev + 1), 100)
  }, [chains, triggerNode, aiAgentNodeId])

  // Helper function to get chain color
  const getChainColor = (color?: string) => {
    const colorMap: Record<string, string> = {
      blue: '#3b82f6',
      green: '#10b981',
      purple: '#8b5cf6',
      orange: '#f97316',
      pink: '#ec4899',
      indigo: '#6366f1'
    }
    return colorMap[color || 'blue'] || '#3b82f6'
  }

  return (
    <div className={cn("w-full h-full relative", className)}>
      <div className="absolute top-4 left-4 z-10">
        <Card className="px-3 py-2">
          <div className="flex items-center gap-2 text-xs">
            <Layers className="w-3 h-3" />
            <span className="font-medium">Workflow Preview</span>
            <Badge variant="outline" className="text-xs">
              {chains.filter(c => c.enabled).length} Chains
            </Badge>
          </div>
        </Card>
      </div>
      
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        zoomOnScroll={false}
        zoomOnPinch={false}
        panOnDrag={false}
        preventScrolling={false}
      >
        <Background 
          variant={BackgroundVariant.Dots} 
          gap={12} 
          size={1} 
          color="#e5e7eb" 
        />
        <Controls 
          showZoom={true}
          showFitView={true}
          showInteractive={false}
          position="bottom-right"
        />
      </ReactFlow>
      
      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-10">
        <Card className="px-3 py-2">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span>Trigger</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-purple-500" />
              <span>AI Agent</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-gray-400" />
              <span>Action</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 border-t-2 border-dashed border-gray-400" />
              <span>Conditional</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}