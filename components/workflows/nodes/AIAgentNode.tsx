"use client"

import React, { memo, useState, useCallback } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import { Bot, Settings, Sparkles, Brain, Zap, AlertCircle, CheckCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { AIAgentModal } from '../AIAgentModal'

import { logger } from '@/lib/utils/logger'

interface AIAgentNodeData {
  title?: string
  prompt?: string
  model?: string
  tone?: string
  targetActions?: string[]
  apiSource?: string
  customApiKey?: string
  temperature?: number
  maxTokens?: number
  status?: 'idle' | 'processing' | 'success' | 'error'
  lastResult?: any
  cost?: number
}

interface AIAgentNodeProps extends NodeProps {
  data: AIAgentNodeData
  selected?: boolean
}

const AI_MODEL_LABELS: Record<string, string> = {
  'gpt-4-turbo': 'GPT-4 Turbo',
  'gpt-3.5-turbo': 'GPT-3.5',
  'claude-3-opus': 'Claude Opus',
  'claude-3-sonnet': 'Claude Sonnet',
  'gemini-pro': 'Gemini Pro'
}

const TONE_ICONS: Record<string, any> = {
  professional: '💼',
  casual: '😊',
  friendly: '👋',
  formal: '🎩',
  technical: '🔧',
  conversational: '💬'
}

export const AIAgentNode = memo(({ data, selected, id }: AIAgentNodeProps) => {
  const [showModal, setShowModal] = useState(false)
  const [nodeData, setNodeData] = useState<AIAgentNodeData>(data)

  const handleConfigSave = useCallback((config: any) => {
    setNodeData(prev => ({
      ...prev,
      ...config
    }))
    // In a real implementation, this would update the workflow state
    logger.debug('AI Agent config saved:', config)
  }, [])

  const getStatusIcon = () => {
    switch (nodeData.status) {
      case 'processing':
        return <div className="animate-spin"><Zap className="w-4 h-4 text-yellow-500" /></div>
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      default:
        return <Bot className="w-4 h-4 text-orange-500" />
    }
  }

  const getNodeBorderColor = () => {
    if (selected) return 'border-orange-500 shadow-lg'
    switch (nodeData.status) {
      case 'processing':
        return 'border-yellow-500 animate-pulse'
      case 'success':
        return 'border-green-500'
      case 'error':
        return 'border-red-500'
      default:
        return 'border-gray-300 dark:border-gray-700'
    }
  }

  return (
    <TooltipProvider>
      <Card className={cn(
        'min-w-[280px] max-w-[320px] transition-all duration-200',
        getNodeBorderColor(),
        selected && 'ring-2 ring-orange-500 ring-offset-2'
      )}>
        {/* Input Handle */}
        <Handle
          type="target"
          position={Position.Left}
          className="!bg-orange-500 !w-3 !h-3 !border-2 !border-white"
          style={{ left: -6 }}
        />

        {/* Header */}
        <div className="bg-gradient-to-r from-orange-500 to-rose-500 text-white p-3 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getStatusIcon()}
              <h3 className="font-semibold text-sm">
                {nodeData.title || 'AI Agent'}
              </h3>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-white hover:bg-white/20"
              onClick={() => setShowModal(true)}
            >
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="p-3 space-y-3">
          {/* Prompt Preview */}
          {nodeData.prompt && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Prompt</p>
              <p className="text-xs line-clamp-2 bg-muted p-2 rounded">
                {nodeData.prompt}
              </p>
            </div>
          )}

          {/* Model & Settings */}
          <div className="flex flex-wrap gap-1">
            {nodeData.model && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="secondary" className="text-xs">
                    <Brain className="w-3 h-3 mr-1" />
                    {AI_MODEL_LABELS[nodeData.model] || nodeData.model}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>AI Model</p>
                </TooltipContent>
              </Tooltip>
            )}

            {nodeData.tone && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge variant="secondary" className="text-xs">
                    {TONE_ICONS[nodeData.tone]} {nodeData.tone}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Content Tone</p>
                </TooltipContent>
              </Tooltip>
            )}

            {nodeData.apiSource && (
              <Tooltip>
                <TooltipTrigger>
                  <Badge 
                    variant={nodeData.apiSource === 'custom' ? 'default' : 'outline'} 
                    className="text-xs"
                  >
                    {nodeData.apiSource === 'custom' ? '🔑 Custom' : '⚡ ChainReact'}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{nodeData.apiSource === 'custom' ? 'Using custom API key' : 'Using ChainReact API'}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>

          {/* Target Actions */}
          {nodeData.targetActions && nodeData.targetActions.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                Target Actions ({nodeData.targetActions.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {nodeData.targetActions.slice(0, 3).map((action, idx) => (
                  <Badge key={idx} variant="outline" className="text-xs">
                    {action}
                  </Badge>
                ))}
                {nodeData.targetActions.length > 3 && (
                  <Badge variant="outline" className="text-xs">
                    +{nodeData.targetActions.length - 3} more
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Variables Indicator */}
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1 text-muted-foreground">
              <Sparkles className="w-3 h-3" />
              <span>AI Variables Enabled</span>
            </div>
            {nodeData.cost !== undefined && (
              <span className="text-muted-foreground">
                ~${nodeData.cost.toFixed(4)}
              </span>
            )}
          </div>

          {/* Status Message */}
          {nodeData.status === 'error' && nodeData.lastResult?.error && (
            <div className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 p-2 rounded">
              {nodeData.lastResult.error}
            </div>
          )}

          {nodeData.status === 'success' && nodeData.lastResult && (
            <div className="text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-950/20 p-2 rounded">
              ✓ Processed successfully
            </div>
          )}
        </div>

        {/* Output Handle */}
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-rose-500 !w-3 !h-3 !border-2 !border-white"
          style={{ right: -6 }}
        />

        {/* Configuration Modal */}
        <AIAgentModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onSave={handleConfigSave}
          initialConfig={nodeData}
          nodes={[]} // Would be passed from parent
          currentNodeId={id}
        />
      </Card>
    </TooltipProvider>
  )
})

AIAgentNode.displayName = 'AIAgentNode'