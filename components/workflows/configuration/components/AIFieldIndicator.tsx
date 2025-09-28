/**
 * AI Field Indicator Component
 * Shows when a field is powered by AI-generated values
 */

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Bot, Sparkles, Wand2 } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

interface AIFieldIndicatorProps {
  value: any
  fieldName: string
  className?: string
  showAnimation?: boolean
}

export function AIFieldIndicator({
  value,
  fieldName,
  className = '',
  showAnimation = true
}: AIFieldIndicatorProps) {
  // Check if value is an AI placeholder
  const isAIField = typeof value === 'string' &&
    (value === `{{AI_FIELD:${fieldName}}}` || value.includes('{{AI_FIELD:'))

  if (!isAIField) return null

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="secondary"
            className={`
              bg-gradient-to-r from-blue-100 to-purple-100
              text-blue-700 text-xs font-medium
              border border-blue-200/50
              ${showAnimation ? 'animate-pulse' : ''}
              ${className}
            `}
          >
            <Bot className="w-3 h-3 mr-1" />
            AI-Powered
            <Sparkles className="w-3 h-3 ml-1" />
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            This field will be automatically filled by AI during execution
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Compact AI indicator for inline use
 */
export function AIFieldIndicatorCompact({
  value,
  fieldName
}: {
  value: any
  fieldName: string
}) {
  const isAIField = typeof value === 'string' &&
    (value === `{{AI_FIELD:${fieldName}}}` || value.includes('{{AI_FIELD:'))

  if (!isAIField) return null

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center ml-2">
            <Bot className="w-4 h-4 text-blue-600 animate-pulse" />
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">AI-generated field</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Check if a value is an AI field
 */
export function isAIField(value: any, fieldName?: string): boolean {
  if (typeof value !== 'string') return false

  if (fieldName) {
    return value === `{{AI_FIELD:${fieldName}}` || value.includes(`{{AI_FIELD:${fieldName}}}`)
  }

  return value.includes('{{AI_FIELD:')
}

/**
 * Get the field name from an AI placeholder
 */
export function getAIFieldName(value: string): string | null {
  const match = value.match(/{{AI_FIELD:(.+?)}}/)
  return match ? match[1] : null
}

/**
 * AI Chain Indicator
 * Shows when a node is part of an AI agent chain
 */
export function AIChainIndicator({
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
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={`
              bg-gradient-to-r from-purple-50 to-blue-50
              text-purple-700 text-xs font-medium
              border border-purple-200/50
              ${className}
            `}
          >
            <Wand2 className="w-3 h-3 mr-1" />
            AI Chain {chainIndex !== undefined ? `#${chainIndex + 1}` : ''}
            {chainName && `: ${chainName}`}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-xs">
            This action is part of an AI agent workflow chain
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}