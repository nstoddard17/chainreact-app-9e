"use client"

import React, { memo } from "react"
import { Handle, Position, type NodeProps } from "@xyflow/react"
import { GitBranch, Settings, Trash2, TestTube, Loader2, Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { useWorkflowTestStore } from "@/stores/workflowTestStore"
import { cn } from "@/lib/utils"

interface OutputPath {
  id: string
  name: string
  color: string
  description?: string
  chainId?: string
}

interface AIRouterNodeData {
  title: string
  description: string
  type: string
  providerId?: string
  config?: {
    outputPaths?: OutputPath[]
    template?: string
    model?: string
    [key: string]: any
  }
  onConfigure: (id: string) => void
  onDelete: (id: string) => void
  onTest?: (id: string) => void
  executionStatus?: 'pending' | 'listening' | 'running' | 'completed' | 'error' | null
  error?: string
  errorMessage?: string
  selectedPaths?: string[]
  routingDecision?: {
    confidence?: number
    reasoning?: string
  }
}

function AIRouterNode({ id, data, selected }: NodeProps) {
  const {
    title,
    description,
    config,
    onConfigure,
    onDelete,
    onTest,
    executionStatus,
    error,
    errorMessage,
    selectedPaths = [],
    routingDecision
  } = data as AIRouterNodeData

  const outputPaths = config?.outputPaths || []
  const { isNodeInExecutionPath, getNodeTestResult } = useWorkflowTestStore()
  const hasTestData = isNodeInExecutionPath(id)
  const testResult = getNodeTestResult(id)

  // Get node border style based on execution status
  const getNodeStyle = () => {
    switch (executionStatus) {
      case 'listening':
        return "border-2 border-indigo-500 border-dashed animate-pulse shadow-lg shadow-indigo-200"
      case 'running':
        return "border-2 border-yellow-500 shadow-lg shadow-yellow-200"
      case 'completed':
        return "border-2 border-green-500 shadow-lg shadow-green-200"
      case 'error':
        return "border-2 border-red-500 shadow-lg shadow-red-200"
      default:
        return selected ? "border-2 border-blue-500" : "border border-gray-300"
    }
  }

  // Get status indicator
  const getStatusIndicator = () => {
    switch (executionStatus) {
      case 'listening':
        return (
          <div className="absolute -top-2 -right-2 bg-indigo-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1 animate-pulse">
            <div className="w-2 h-2 bg-white rounded-full animate-ping" />
            Listening
          </div>
        )
      case 'running':
        return (
          <div className="absolute -top-2 -right-2 bg-yellow-500 text-white text-xs px-2 py-1 rounded-full flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" />
            Routing
          </div>
        )
      case 'completed':
        return (
          <div className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
            ✓ Routed
          </div>
        )
      case 'error':
        return (
          <div className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">
            ✕ Error
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div className={cn(
      "relative bg-white rounded-lg shadow-lg min-w-[280px] transition-all duration-200",
      getNodeStyle()
    )}>
      {/* Status Indicator */}
      {getStatusIndicator()}

      {/* Input Handle */}
      <Handle
        type="target"
        position={Position.Left}
        className="!bg-gray-400 !w-3 !h-3 !border-2 !border-white"
      />

      {/* Node Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-start justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg text-white">
              <GitBranch className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-2">
                {title || "AI Router"}
                {config?.template && (
                  <Badge variant="secondary" className="text-xs">
                    {config.template}
                  </Badge>
                )}
              </h3>
              <p className="text-xs text-gray-600 mt-0.5">
                {description || "Intelligent routing based on content"}
              </p>
            </div>
          </div>
        </div>

        {/* Model Badge */}
        {config?.model && (
          <div className="mt-2">
            <Badge variant="outline" className="text-xs">
              {config.model}
            </Badge>
          </div>
        )}

        {/* Routing Decision (shown during/after execution) */}
        {routingDecision && (
          <div className="mt-2 p-2 bg-blue-50 rounded-md">
            <div className="text-xs">
              {routingDecision.confidence && (
                <div className="font-medium text-blue-900">
                  Confidence: {Math.round(routingDecision.confidence * 100)}%
                </div>
              )}
              {routingDecision.reasoning && (
                <div className="text-blue-700 mt-1">
                  {routingDecision.reasoning}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mt-2 p-2 bg-red-50 rounded-md">
            <p className="text-xs text-red-700">{error}</p>
          </div>
        )}
      </div>

      {/* Output Paths */}
      <div className="p-3 space-y-2">
        <div className="text-xs font-medium text-gray-700 mb-2">Output Paths:</div>
        {outputPaths.length > 0 ? (
          <div className="space-y-3">
            {outputPaths.map((path, index) => {
              const isSelected = selectedPaths.includes(path.id)
              const handleId = `output-${path.id}`
              
              return (
                <div 
                  key={path.id} 
                  className={cn(
                    "relative flex items-center",
                    isSelected && "animate-pulse"
                  )}
                >
                  {/* Path Info */}
                  <div className="flex-1 flex items-center gap-2">
                    <div 
                      className={cn(
                        "w-3 h-3 rounded-full",
                        isSelected && "ring-2 ring-offset-1"
                      )}
                      style={{ 
                        backgroundColor: path.color,
                        ringColor: isSelected ? path.color : undefined
                      }}
                    />
                    <div>
                      <div className={cn(
                        "text-xs font-medium",
                        isSelected && "text-blue-700"
                      )}>
                        {path.name}
                      </div>
                      {path.description && (
                        <div className="text-xs text-gray-500">
                          {path.description}
                        </div>
                      )}
                      {path.chainId && (
                        <div className="mt-1 inline-flex items-center rounded bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                          Chain: {path.chainId}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Output Handle */}
                  <Handle
                    type="source"
                    position={Position.Right}
                    id={handleId}
                    className={cn(
                      "!w-3 !h-3 !border-2 !border-white transition-all",
                      isSelected ? "!bg-blue-500 !w-4 !h-4" : "!bg-gray-400"
                    )}
                    style={{
                      top: `${85 + (index * 45)}px`,
                      backgroundColor: isSelected ? path.color : undefined
                    }}
                  />

                  {/* Selected Indicator */}
                  {isSelected && (
                    <div 
                      className="absolute -right-8 text-xs font-medium"
                      style={{ color: path.color }}
                    >
                      ✓
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-xs text-gray-500 italic">
            No output paths configured
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-between px-3 pb-3 pt-1 border-t border-gray-100">
        <div className="flex gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onConfigure(id)}
                  className="h-7 w-7 p-0"
                >
                  <Settings className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Configure Router</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          {onTest && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onTest(id)}
                    className="h-7 w-7 p-0"
                    disabled={executionStatus === 'running' || executionStatus === 'listening'}
                  >
                    {executionStatus === 'running' || executionStatus === 'listening' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Test Routing</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(id)}
                className="h-7 w-7 p-0 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Delete Node</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Test Data Indicator */}
      {hasTestData && (
        <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2">
          <Badge variant="secondary" className="text-xs">
            Test data available
          </Badge>
        </div>
      )}
    </div>
  )
}

export default memo(AIRouterNode)
