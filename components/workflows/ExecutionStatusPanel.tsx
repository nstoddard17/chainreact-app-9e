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
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4 sm:px-6">
      <div className="pointer-events-auto w-full max-w-3xl rounded-2xl border border-gray-800 bg-gray-950/90 p-4 shadow-2xl backdrop-blur-sm sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
              {isListening && (
                <div className="flex items-start gap-3">
                  <div className="relative flex h-3 w-3 flex-shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-blue-500"></span>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-white">
                      Listening for {webhookTriggerType?.replace(/_/g, ' ') || 'webhook'} trigger...
                    </p>
                    <p className="text-xs text-gray-400">
                      Waiting for a real event or skip to run with test data
                    </p>
                  </div>
                </div>
              )}

              {isExecuting && (
                <div className="flex items-start gap-3">
                  <Activity className="h-5 w-5 flex-shrink-0 animate-pulse text-purple-400" />
                  <div className="flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-sm font-medium text-white">
                        {runningNodeData
                          ? `Executing: ${runningNodeData.data?.title || runningNodeData.data?.type}`
                          : 'Executing workflow...'}
                      </p>
                      {usingTestData && (
                        <Badge variant="outline" className="border-yellow-500 text-xs text-yellow-500">
                          Using Test Data
                        </Badge>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                      <Progress value={progressPercentage} className="h-2 flex-1" />
                      <div className="flex items-center gap-3">
                        <span className="text-xs tabular-nums text-gray-400">
                          {completedCount} / {totalNodes} nodes
                        </span>
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
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              {isListening && (
                <Button
                  onClick={() => onSkip(nodes, edges)}
                  variant="default"
                  size="sm"
                  className="bg-yellow-600 text-white hover:bg-yellow-700"
                >
                  <SkipForward className="mr-2 h-4 w-4" />
                  Skip to Test Data
                </Button>
              )}
              <Button
                onClick={onStop}
                variant="ghost"
                size="sm"
                className="text-gray-400 hover:text-white"
              >
                <X className="mr-2 h-4 w-4" />
                {isListening ? 'Stop Listening' : 'Close'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
