"use client"

import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Play,
  Pause,
  SkipForward,
  StopCircle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronRight,
  AlertCircle,
  Clock,
  Zap,
  Shield,
  Bug,
  Settings,
  Activity,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { stepExecutionController } from '@/lib/workflows/testing/stepExecutionController'
import { triggerListeningManager } from '@/lib/workflows/testing/triggerListeningManager'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

import { logger } from '@/lib/utils/logger'

interface EnhancedExecutionPanelProps {
  workflowId: string
  nodes: any[]
  edges: any[]
  mode: 'sandbox' | 'live'
  onNodeHighlight?: (nodeId: string) => void
  onClose?: () => void
}

type ExecutionMode = 'continuous' | 'step-by-step' | 'breakpoint'

export function EnhancedExecutionPanel({
  workflowId,
  nodes,
  edges,
  mode,
  onNodeHighlight,
  onClose
}: EnhancedExecutionPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('step-by-step')
  const [showDataFlow, setShowDataFlow] = useState(true)
  const [executionStatus, setExecutionStatus] = useState({
    isRunning: false,
    isPaused: false,
    currentNode: null as string | null,
    completedNodes: 0,
    totalNodes: 0,
    history: [] as any[]
  })
  const [listenerStatus, setListenerStatus] = useState<'idle' | 'listening' | 'triggered' | 'error'>('idle')
  const [currentNodeData, setCurrentNodeData] = useState<any>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  // Initialize execution controller
  useEffect(() => {
    stepExecutionController.setCallbacks({
      onNodeStart: (nodeId, nodeName) => {
        logger.debug(`🚀 Starting node: ${nodeName}`)
        onNodeHighlight?.(nodeId)
        updateExecutionStatus()
      },
      onNodeComplete: (nodeId, status, result) => {
        logger.debug(`✅ Node complete: ${nodeId}`, status, result)
        setCurrentNodeData(result)
        updateExecutionStatus()
      },
      onNodeError: (nodeId, error) => {
        logger.debug(`❌ Node error: ${nodeId}`, error)
        updateExecutionStatus()
      },
      onExecutionComplete: (history) => {
        logger.debug('🎉 Execution complete!', history)
        setListenerStatus('idle')
        updateExecutionStatus()
      },
      onExecutionPaused: (nodeId) => {
        logger.debug('⏸️ Execution paused at:', nodeId)
        updateExecutionStatus()
      },
      onWaitingForUser: async (nodeId, message) => {
        // This would typically show a modal or prompt
        logger.debug(`⏳ Waiting for user action: ${message}`)
        return 'continue' // Default action
      }
    })

    // Set up trigger listener callbacks
    triggerListeningManager.setCallbacks(
      (event) => {
        logger.debug('⚡ Trigger event received:', event)
        setListenerStatus('triggered')
      },
      (nodeId, status) => {
        logger.debug(`🎧 Listener status change: ${nodeId} - ${status}`)
        setListenerStatus(status as any)
      }
    )
  }, [])

  // Update execution status
  const updateExecutionStatus = () => {
    const status = stepExecutionController.getExecutionStatus()
    setExecutionStatus(status)
  }

  // Start execution
  const handleStart = async () => {
    try {
      // Initialize controller
      stepExecutionController.initialize(workflowId, 'current-user', nodes, edges, mode)
      stepExecutionController.setExecutionMode(executionMode)

      // Start execution
      await stepExecutionController.startExecution()
      updateExecutionStatus()
    } catch (error) {
      logger.error('Failed to start execution:', error)
    }
  }

  // Control actions
  const handleContinue = () => {
    stepExecutionController.continueExecution()
    updateExecutionStatus()
  }

  const handleSkip = () => {
    const currentNode = executionStatus.currentNode
    if (currentNode) {
      stepExecutionController.skipNode(currentNode)
      updateExecutionStatus()
    }
  }

  const handleRetry = () => {
    stepExecutionController.retryNode()
    updateExecutionStatus()
  }

  const handlePause = () => {
    stepExecutionController.pauseExecution()
    updateExecutionStatus()
  }

  const handleStop = async () => {
    await stepExecutionController.stopExecution()
    await triggerListeningManager.stopAllListeners()
    setListenerStatus('idle')
    updateExecutionStatus()
  }

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-yellow-600'
      case 'success': return 'text-green-600'
      case 'error': return 'text-red-600'
      case 'skipped': return 'text-gray-400'
      case 'waiting': return 'text-blue-600'
      default: return 'text-gray-600'
    }
  }

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Loader2 className="h-4 w-4 animate-spin" />
      case 'success': return <CheckCircle2 className="h-4 w-4" />
      case 'error': return <XCircle className="h-4 w-4" />
      case 'skipped': return <SkipForward className="h-4 w-4" />
      case 'waiting': return <Clock className="h-4 w-4" />
      default: return <ChevronRight className="h-4 w-4" />
    }
  }

  const progress = executionStatus.totalNodes > 0
    ? (executionStatus.completedNodes / executionStatus.totalNodes) * 100
    : 0

  const currentStep = executionStatus.history[executionStatus.history.length - 1]

  return (
    <Card className="fixed bottom-4 right-4 z-50 shadow-xl border-2 bg-background/95 backdrop-blur-sm w-[500px]">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {mode === 'sandbox' ? (
              <Shield className="h-5 w-5 text-blue-500" />
            ) : (
              <Zap className="h-5 w-5 text-orange-500" />
            )}
            <h3 className="font-semibold">
              {mode === 'sandbox' ? 'Sandbox Testing' : 'Live Testing'}
            </h3>
            <Badge variant={listenerStatus === 'listening' ? 'default' : 'outline'} className="ml-2">
              {listenerStatus === 'listening' && (
                <div className="w-2 h-2 rounded-full bg-green-500 mr-1 animate-pulse" />
              )}
              {listenerStatus}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="icon"
              variant="ghost"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
            >
              <XCircle className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium">
              {executionStatus.isRunning
                ? `Step ${executionStatus.completedNodes + 1} of ${executionStatus.totalNodes}`
                : executionStatus.completedNodes > 0
                  ? 'Execution Complete'
                  : 'Ready to Start'}
            </span>
            <span className="text-sm text-muted-foreground">
              {Math.round(progress)}% Complete
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Current Node Info */}
        {currentStep && (
          <div className="mt-2 p-2 bg-muted/50 rounded-md">
            <div className={cn("flex items-center gap-2", getStatusColor(currentStep.status))}>
              {getStatusIcon(currentStep.status)}
              <span className="text-sm font-medium">
                {currentStep.status === 'running' ? 'Executing' : 'Last'}: {currentStep.nodeName}
              </span>
              {currentStep.endTime && (
                <span className="text-xs text-muted-foreground ml-auto">
                  {currentStep.endTime - currentStep.startTime}ms
                </span>
              )}
            </div>
            {currentStep.error && (
              <div className="mt-1 text-xs text-red-600 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {currentStep.error}
              </div>
            )}
          </div>
        )}
      </div>

      {isExpanded && (
        <>
          {/* Controls */}
          <div className="p-4 border-b">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {!executionStatus.isRunning ? (
                  <Button
                    size="sm"
                    variant="default"
                    onClick={handleStart}
                    className="gap-2"
                  >
                    <Play className="h-4 w-4" />
                    Start Testing
                  </Button>
                ) : executionStatus.isPaused ? (
                  <>
                    <Button
                      size="sm"
                      variant="default"
                      onClick={handleContinue}
                      className="gap-2"
                    >
                      <Play className="h-4 w-4" />
                      Continue
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleSkip}
                      className="gap-2"
                    >
                      <SkipForward className="h-4 w-4" />
                      Skip
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={handleRetry}
                      className="gap-2"
                    >
                      <RefreshCw className="h-4 w-4" />
                      Retry
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handlePause}
                    className="gap-2"
                  >
                    <Pause className="h-4 w-4" />
                    Pause
                  </Button>
                )}

                <Button
                  size="sm"
                  variant="destructive"
                  onClick={handleStop}
                  className="gap-2"
                  disabled={!executionStatus.isRunning}
                >
                  <StopCircle className="h-4 w-4" />
                  Stop
                </Button>
              </div>

              {/* Execution Mode Selector */}
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <select
                  value={executionMode}
                  onChange={(e) => {
                    const mode = e.target.value as ExecutionMode
                    setExecutionMode(mode)
                    stepExecutionController.setExecutionMode(mode)
                  }}
                  className="text-sm border rounded px-2 py-1"
                  disabled={executionStatus.isRunning}
                >
                  <option value="step-by-step">Step by Step</option>
                  <option value="continuous">Continuous</option>
                  <option value="breakpoint">Breakpoints</option>
                </select>
              </div>
            </div>

            {/* Options */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Switch
                  id="show-data"
                  checked={showDataFlow}
                  onCheckedChange={setShowDataFlow}
                />
                <Label htmlFor="show-data" className="text-sm cursor-pointer">
                  Show Data Flow
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  id="auto-scroll"
                  checked={autoScroll}
                  onCheckedChange={setAutoScroll}
                />
                <Label htmlFor="auto-scroll" className="text-sm cursor-pointer">
                  Auto Scroll
                </Label>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <Tabs defaultValue="history" className="flex-1">
            <TabsList className="px-4 pt-2 grid w-full grid-cols-3">
              <TabsTrigger value="history" className="gap-1">
                <Activity className="h-3 w-3" />
                History
              </TabsTrigger>
              <TabsTrigger value="data" className="gap-1">
                <Eye className="h-3 w-3" />
                Data
              </TabsTrigger>
              <TabsTrigger value="debug" className="gap-1">
                <Bug className="h-3 w-3" />
                Debug
              </TabsTrigger>
            </TabsList>

            {/* History Tab */}
            <TabsContent value="history" className="px-4 pb-4">
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {executionStatus.history.map((step, index) => (
                    <div
                      key={`${step.nodeId}-${index}`}
                      className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                      onClick={() => onNodeHighlight?.(step.nodeId)}
                    >
                      <span className={cn("flex items-center", getStatusColor(step.status))}>
                        {getStatusIcon(step.status)}
                      </span>
                      <span className="text-sm font-medium flex-1">
                        {step.nodeName}
                      </span>
                      {step.retryCount && step.retryCount > 0 && (
                        <Badge variant="outline" className="text-xs">
                          Retry {step.retryCount}
                        </Badge>
                      )}
                      {step.endTime && (
                        <span className="text-xs text-muted-foreground">
                          {step.endTime - step.startTime}ms
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </TabsContent>

            {/* Data Tab */}
            <TabsContent value="data" className="px-4 pb-4">
              <ScrollArea className="h-[200px]">
                {currentNodeData && showDataFlow ? (
                  <pre className="text-xs bg-muted p-2 rounded-md overflow-x-auto">
                    {JSON.stringify(currentNodeData, null, 2)}
                  </pre>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No data to display
                  </p>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Debug Tab */}
            <TabsContent value="debug" className="px-4 pb-4">
              <ScrollArea className="h-[200px]">
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Workflow ID:</span>
                    <span className="font-mono">{workflowId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Mode:</span>
                    <span>{mode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Execution Mode:</span>
                    <span>{executionMode}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total Nodes:</span>
                    <span>{executionStatus.totalNodes}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Active Listeners:</span>
                    <span>{triggerListeningManager.getActiveListeners().length}</span>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>

          {/* Status Badges */}
          <div className="px-4 pb-4 flex items-center gap-2 border-t pt-3">
            <Badge variant="outline" className="text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1 text-green-600" />
              {executionStatus.history.filter(s => s.status === 'success').length} Success
            </Badge>
            {executionStatus.history.filter(s => s.status === 'error').length > 0 && (
              <Badge variant="outline" className="text-xs">
                <XCircle className="h-3 w-3 mr-1 text-red-600" />
                {executionStatus.history.filter(s => s.status === 'error').length} Failed
              </Badge>
            )}
            {executionStatus.history.filter(s => s.status === 'skipped').length > 0 && (
              <Badge variant="outline" className="text-xs">
                <SkipForward className="h-3 w-3 mr-1 text-gray-400" />
                {executionStatus.history.filter(s => s.status === 'skipped').length} Skipped
              </Badge>
            )}
          </div>
        </>
      )}
    </Card>
  )
}