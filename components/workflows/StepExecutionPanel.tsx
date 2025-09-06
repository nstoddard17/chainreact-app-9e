"use client"

import React from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Play, Pause, SkipForward, StopCircle, CheckCircle2, XCircle, Loader2, ChevronRight } from 'lucide-react'
import { useWorkflowStepExecutionStore } from '@/stores/workflowStepExecutionStore'
import { cn } from '@/lib/utils'

interface StepExecutionPanelProps {
  totalNodes: number
  currentNodeName?: string
  currentNodeIsTrigger?: boolean
  onContinue: () => void
  onSkip: () => void
  onStop: () => void
}

export function StepExecutionPanel({ 
  totalNodes, 
  currentNodeName,
  currentNodeIsTrigger,
  onContinue,
  onSkip,
  onStop 
}: StepExecutionPanelProps) {
  const {
    isStepMode,
    isPaused,
    currentNodeId,
    nodeStatuses,
    executionPath,
    pauseExecution,
    continueExecution
  } = useWorkflowStepExecutionStore()

  if (!isStepMode) return null

  const completedNodes = Object.values(nodeStatuses).filter(s => s === 'success').length
  const progress = totalNodes > 0 ? (completedNodes / totalNodes) * 100 : 0

  const getCurrentStatus = () => {
    if (currentNodeId && nodeStatuses[currentNodeId]) {
      return nodeStatuses[currentNodeId]
    }
    return 'pending'
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-yellow-600'
      case 'success': return 'text-green-600'
      case 'error': return 'text-red-600'
      case 'waiting': return 'text-blue-600'
      default: return 'text-gray-600'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Loader2 className="h-4 w-4 animate-spin" />
      case 'success': return <CheckCircle2 className="h-4 w-4" />
      case 'error': return <XCircle className="h-4 w-4" />
      case 'waiting': return <Pause className="h-4 w-4" />
      default: return <ChevronRight className="h-4 w-4" />
    }
  }

  return (
    <Card className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 p-4 shadow-lg border-2 border-primary/20 bg-background/95 backdrop-blur-sm">
      <div className="flex items-center gap-4 min-w-[400px]">
        {/* Progress section */}
        <div className="flex-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">
              {executionPath.length === 0 ? 'Ready to start' : `Step ${executionPath.length} of ${totalNodes}`}
            </span>
            <span className="text-sm text-muted-foreground ml-4">
              {Math.round(progress)}% Complete
            </span>
          </div>
          <Progress value={progress} className="h-2 mb-2" />
          
          <div className="flex items-center gap-2">
            {currentNodeName ? (
              <span className={cn("flex items-center gap-1", getStatusColor(getCurrentStatus()))}>
                {getStatusIcon(getCurrentStatus())}
                <span className="text-sm font-medium">
                  {isPaused ? 'Paused at' : 'Executing'}: {currentNodeName}
                </span>
              </span>
            ) : (
              <span className="text-sm font-medium text-muted-foreground">
                Click "Continue" to start execution
              </span>
            )}
          </div>
        </div>

        {/* Controls section */}
        <div className="flex items-center gap-2">
          {isPaused ? (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={() => {
                  continueExecution()
                  onContinue()
                }}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                Continue
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={onSkip}
                className="gap-2"
              >
                <SkipForward className="h-4 w-4" />
                Skip
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={pauseExecution}
              className="gap-2"
            >
              <Pause className="h-4 w-4" />
              Pause
            </Button>
          )}
          
          <Button
            size="sm"
            variant="destructive"
            onClick={onStop}
            className="gap-2"
          >
            <StopCircle className="h-4 w-4" />
            Stop
          </Button>
        </div>
      </div>

      {/* Execution status badges */}
      <div className="flex items-center gap-2 mt-3 pt-3 border-t">
        <Badge variant="outline" className="text-xs">
          <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
          {Object.values(nodeStatuses).filter(s => s === 'success').length} Completed
        </Badge>
        {Object.values(nodeStatuses).filter(s => s === 'error').length > 0 && (
          <Badge variant="outline" className="text-xs">
            <XCircle className="h-3 w-3 mr-1 text-red-600" />
            {Object.values(nodeStatuses).filter(s => s === 'error').length} Failed
          </Badge>
        )}
        {currentNodeIsTrigger && (
          <Badge variant="outline" className="text-xs">
            <div className="w-2 h-2 rounded-full bg-indigo-500 mr-1" />
            Listening for trigger
          </Badge>
        )}
        <Badge variant="outline" className="text-xs">
          Mode: Step-by-Step
        </Badge>
      </div>
    </Card>
  )
}