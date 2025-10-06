'use client'

import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Radio, SkipForward, X, Loader2, CheckCircle2, XCircle, Activity } from 'lucide-react'
import type { Node, Edge } from '@xyflow/react'

interface ExecutionStatusPanelProps {
  isListening: boolean
  isExecuting: boolean
  webhookTriggerType: string | null
  usingTestData: boolean
  testDataNodes: Set<string>
  nodeStatuses: Record<string, 'pending' | 'running' | 'completed' | 'error'>
  nodes: Node[]
  edges: Edge[]
  onSkip: (nodes: Node[], edges: Edge[]) => void
  onStop: () => void
}

export function ExecutionStatusPanel({
  isListening,
  isExecuting,
  webhookTriggerType,
  usingTestData,
  testDataNodes,
  nodeStatuses,
  nodes,
  edges,
  onSkip,
  onStop,
}: ExecutionStatusPanelProps) {
  if (!isListening && !isExecuting) {
    return null
  }

  const totalNodes = nodes.filter(n => n.type === 'custom' && !n.data?.isTrigger).length
  const completedCount = Object.values(nodeStatuses).filter(s => s === 'completed').length
  const failedCount = Object.values(nodeStatuses).filter(s => s === 'error').length
  const runningNode = Object.entries(nodeStatuses).find(([_, status]) => status === 'running')?.[0]
  const runningNodeData = runningNode ? nodes.find(n => n.id === runningNode) : null
  const progressPercentage = totalNodes > 0 ? Math.round((completedCount / totalNodes) * 100) : 0

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900/95 backdrop-blur-sm border-t border-gray-800 shadow-2xl">
      <div className="max-w-full mx-auto px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          {/* Left side - Status */}
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {isListening && (
              <>
                <div className="relative flex h-3 w-3 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">
                    Listening for {webhookTriggerType?.replace(/_/g, ' ') || 'webhook'} trigger...
                  </p>
                  <p className="text-xs text-gray-400">
                    Waiting for real webhook event or click Skip to use test data
                  </p>
                </div>
              </>
            )}

            {isExecuting && (
              <>
                <Activity className="h-5 w-5 text-purple-400 flex-shrink-0 animate-pulse" />
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-3">
                    <p className="text-sm font-medium text-white">
                      {runningNodeData
                        ? `Executing: ${runningNodeData.data?.title || runningNodeData.data?.type}`
                        : 'Executing workflow...'}
                    </p>
                    {usingTestData && (
                      <Badge variant="outline" className="text-yellow-500 border-yellow-500 text-xs">
                        Using Test Data
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <Progress value={progressPercentage} className="flex-1 h-2" />
                    <span className="text-xs text-gray-400 tabular-nums whitespace-nowrap">
                      {completedCount} / {totalNodes} nodes
                    </span>
                  </div>
                </div>

                {/* Status indicators */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  {completedCount > 0 && (
                    <div className="flex items-center gap-1 text-green-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span className="text-xs tabular-nums">{completedCount}</span>
                    </div>
                  )}
                  {failedCount > 0 && (
                    <div className="flex items-center gap-1 text-red-400">
                      <XCircle className="h-4 w-4" />
                      <span className="text-xs tabular-nums">{failedCount}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right side - Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {isListening && (
              <Button
                onClick={() => onSkip(nodes, edges)}
                variant="default"
                size="sm"
                className="bg-yellow-600 hover:bg-yellow-700 text-white"
              >
                <SkipForward className="h-4 w-4 mr-2" />
                Skip to Test Data
              </Button>
            )}

            <Button
              onClick={onStop}
              variant="ghost"
              size="sm"
              className="text-gray-400 hover:text-white"
            >
              <X className="h-4 w-4 mr-2" />
              {isListening ? 'Stop Listening' : 'Close'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
