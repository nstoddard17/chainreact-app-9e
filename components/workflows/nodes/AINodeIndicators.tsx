/**
 * AI Node Indicators
 * Visual indicators for AI-powered nodes in the workflow builder
 */

import React from 'react'
import { Bot, Sparkles, Brain, Wand2, Zap } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

/**
 * Indicator for nodes that have AI-generated field values
 */
export function AIFieldNodeIndicator({
  config,
  className = ''
}: {
  config: Record<string, any>
  className?: string
}) {
  // Check if any field uses AI
  const hasAIFields = Object.values(config || {}).some(value =>
    typeof value === 'string' && value.includes('{{AI_FIELD:')
  )

  if (!hasAIFields) return null

  return (
    <div className={`absolute -top-2 -right-2 z-10 ${className}`}>
      <div className="relative group">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-purple-400 rounded-full blur opacity-75 group-hover:opacity-100 transition-opacity"></div>
        <div className="relative bg-white rounded-full p-1.5 shadow-lg">
          <Bot className="w-4 h-4 text-blue-600" />
        </div>
      </div>
    </div>
  )
}

/**
 * Indicator for AI Agent nodes
 */
export function AIAgentNodeIndicator({
  className = ''
}: {
  className?: string
}) {
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <div className="relative">
        <Brain className="w-5 h-5 text-purple-600" />
        <Sparkles className="w-3 h-3 text-yellow-500 absolute -top-1 -right-1" />
      </div>
      <span className="text-xs font-semibold text-purple-700">AI Agent</span>
    </div>
  )
}

/**
 * Indicator for nodes in AI Agent chains
 */
export function AIChainNodeIndicator({
  chainIndex,
  chainName,
  className = ''
}: {
  chainIndex?: number
  chainName?: string
  className?: string
}) {
  if (chainIndex === undefined && !chainName) return null

  return (
    <Badge
      variant="outline"
      className={`
        absolute -top-3 left-1/2 transform -translate-x-1/2
        bg-gradient-to-r from-purple-50 to-blue-50
        text-purple-700 text-xs font-medium
        border border-purple-200/50
        ${className}
      `}
    >
      <Wand2 className="w-3 h-3 mr-1" />
      Chain {chainIndex !== undefined ? `#${chainIndex + 1}` : ''}
    </Badge>
  )
}

/**
 * Animated AI processing indicator
 */
export function AIProcessingIndicator({
  isProcessing = false,
  className = ''
}: {
  isProcessing?: boolean
  className?: string
}) {
  if (!isProcessing) return null

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="relative">
        <Zap className="w-5 h-5 text-blue-600 animate-pulse" />
        <div className="absolute inset-0 bg-blue-400 rounded-full blur-md opacity-50 animate-ping"></div>
      </div>
      <span className="text-sm text-blue-700 font-medium">AI Processing...</span>
    </div>
  )
}

/**
 * Helper to determine if a node has AI capabilities
 */
export function hasAICapabilities(node: any): boolean {
  // Check if it's an AI agent node
  if (node.data?.type === 'ai_agent') return true

  // Check if it has AI fields
  const config = node.data?.config || {}
  const hasAIFields = Object.values(config).some(value =>
    typeof value === 'string' && value.includes('{{AI_FIELD:')
  )

  // Check if it's part of an AI chain
  const isInAIChain = node.data?.parentAIAgentId || node.data?.parentChainIndex !== undefined

  return hasAIFields || isInAIChain
}

/**
 * Combined node indicator that shows all AI features
 */
export function NodeAIIndicator({ node }: { node: any }) {
  const isAIAgent = node.data?.type === 'ai_agent'
  const hasAIFields = Object.values(node.data?.config || {}).some(value =>
    typeof value === 'string' && value.includes('{{AI_FIELD:')
  )
  const isInChain = node.data?.parentChainIndex !== undefined

  // Don't show anything if no AI features
  if (!isAIAgent && !hasAIFields && !isInChain) return null

  return (
    <div className="absolute -top-3 right-0 flex items-center gap-1">
      {isAIAgent && (
        <Badge className="bg-purple-600 text-white text-xs">
          <Brain className="w-3 h-3 mr-1" />
          AI Agent
        </Badge>
      )}
      {hasAIFields && !isAIAgent && (
        <Badge className="bg-blue-600 text-white text-xs">
          <Bot className="w-3 h-3 mr-1" />
          AI Fields
        </Badge>
      )}
      {isInChain && (
        <Badge className="bg-purple-100 text-purple-900 border border-purple-300 text-xs font-medium">
          Chain #{(node.data?.parentChainIndex || 0) + 1}
        </Badge>
      )}
    </div>
  )
}