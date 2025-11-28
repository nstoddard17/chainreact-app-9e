"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { ArrowUpDown, Loader2, Pause, Play, SatelliteDish, StopCircle } from "lucide-react"

interface FlowTestStatus {
  total: number
  currentIndex: number
  currentNodeLabel?: string
}

interface WorkflowStatusBarProps {
  isFlowTesting: boolean
  flowTestStatus: FlowTestStatus | null
  onStopFlowTest: () => void
  isExecuting: boolean
  isPaused: boolean
  isListeningForWebhook: boolean
  listeningTimeRemaining?: number | null
  activeExecutionNodeName?: string | null
  onStopExecution?: (() => void) | undefined
  // Single node testing
  isNodeTesting?: boolean
  nodeTestingName?: string | null
  onStopNodeTest?: () => void
  // Flow test pause/resume
  isFlowTestPaused?: boolean
  onPauseFlowTest?: () => void
  onResumeFlowTest?: () => void
}

export function WorkflowStatusBar({
  isFlowTesting,
  flowTestStatus,
  onStopFlowTest,
  isExecuting,
  isPaused,
  isListeningForWebhook,
  listeningTimeRemaining,
  activeExecutionNodeName,
  onStopExecution,
  isNodeTesting,
  nodeTestingName,
  onStopNodeTest,
  isFlowTestPaused,
  onPauseFlowTest,
  onResumeFlowTest,
}: WorkflowStatusBarProps) {
  const [position, setPosition] = useState<'top' | 'bottom'>(() => {
    if (typeof window === 'undefined') {
      return 'bottom'
    }
    try {
      const stored = window.localStorage.getItem('workflowStatusWidgetPosition')
      return stored === 'top' ? 'top' : 'bottom'
    } catch {
      return 'bottom'
    }
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem('workflowStatusWidgetPosition', position)
    } catch (error) {
      console.warn('[WorkflowStatusBar] Unable to persist widget position', error)
    }
  }, [position])

  const togglePosition = () => {
    setPosition(prev => (prev === 'top' ? 'bottom' : 'top'))
  }

  const showNodeTest = isNodeTesting
  const showFlowTest = !showNodeTest && (isFlowTesting || Boolean(flowTestStatus))
  const showLiveExecution = !showNodeTest && !showFlowTest && (isExecuting || isPaused || isListeningForWebhook)

  if (!showNodeTest && !showFlowTest && !showLiveExecution) {
    return null
  }

  let icon: ReactNode = <Loader2 className="w-5 h-5 text-muted-foreground" />
  let title = ''
  let description = ''
  let actions: ReactNode = null

  if (showNodeTest) {
    icon = <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
    title = "Testing node"
    description = nodeTestingName
      ? `Running ${nodeTestingName}...`
      : "Executing node test..."

    // Stop button for single node testing
    if (onStopNodeTest) {
      actions = (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onStopNodeTest}
            >
              <StopCircle className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Stop test</TooltipContent>
        </Tooltip>
      )
    }
  } else if (showFlowTest) {
    const total = flowTestStatus?.total ?? 0
    const currentIndex = flowTestStatus?.currentIndex ?? 0
    const nodeLabel = flowTestStatus?.currentNodeLabel

    // Show pause icon when paused, spinner when running
    if (isFlowTestPaused) {
      icon = <Pause className="w-5 h-5 text-amber-500" />
      title = "Test paused"
      description = nodeLabel
        ? `Paused on ${nodeLabel}`
        : `Paused at step ${currentIndex}/${total}`
    } else {
      icon = <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
      title = "Testing workflow"
      description = total
        ? `Running ${Math.min(currentIndex, total)}/${total}${nodeLabel ? ` • ${nodeLabel}` : ''}`
        : "Preparing test run..."
    }

    // Pause/Play and Stop buttons for flow testing
    actions = (
      <div className="flex items-center gap-1">
        {/* Pause/Play button */}
        {isFlowTestPaused ? (
          onResumeFlowTest && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-green-600 hover:text-green-600 hover:bg-green-600/10"
                  onClick={onResumeFlowTest}
                >
                  <Play className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Resume test</TooltipContent>
            </Tooltip>
          )
        ) : (
          onPauseFlowTest && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-amber-500 hover:text-amber-500 hover:bg-amber-500/10"
                  onClick={onPauseFlowTest}
                >
                  <Pause className="w-4 h-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Pause test</TooltipContent>
            </Tooltip>
          )
        )}
        {/* Stop button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onStopFlowTest}
            >
              <StopCircle className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Stop test</TooltipContent>
        </Tooltip>
      </div>
    )
  } else if (showLiveExecution) {
    const isListening = isListeningForWebhook && !isExecuting
    if (isListening) {
      icon = <SatelliteDish className="w-5 h-5 text-amber-500 animate-pulse" />
      title = "Listening for trigger"
      description = listeningTimeRemaining != null
        ? `Waiting for event... ${listeningTimeRemaining}s remaining`
        : "Waiting for trigger event..."
    } else if (isPaused) {
      icon = <Pause className="w-5 h-5 text-amber-500" />
      title = "Execution paused"
      description = activeExecutionNodeName
        ? `Paused on ${activeExecutionNodeName}`
        : "Workflow paused"
    } else {
      icon = <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
      title = "Workflow running"
      description = activeExecutionNodeName
        ? `Executing ${activeExecutionNodeName}`
        : "Executing workflow..."
    }

    if (onStopExecution) {
      const stopLabel = isListening ? "Stop listening" : "Stop run"
      actions = (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={onStopExecution}
            >
              <StopCircle className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{stopLabel}</TooltipContent>
        </Tooltip>
      )
    }
  }

  const positionClass = position === 'top' ? 'top-20' : 'bottom-6'

  return (
    <div
      className={`fixed ${positionClass} left-1/2 -translate-x-1/2 z-50`}
      style={{ pointerEvents: 'none' }}
    >
      <div className="pointer-events-auto shadow-lg border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 rounded-xl px-4 py-2.5 flex items-center gap-3 text-sm">
        {/* Status icon - clickable as pause/play for flow testing */}
        <div className="flex-shrink-0">
          {showFlowTest && (onPauseFlowTest || onResumeFlowTest) ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="p-1 rounded-md hover:bg-accent transition-colors"
                  onClick={isFlowTestPaused ? onResumeFlowTest : onPauseFlowTest}
                >
                  {icon}
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {isFlowTestPaused ? "Resume test" : "Pause test"}
              </TooltipContent>
            </Tooltip>
          ) : (
            icon
          )}
        </div>

        {/* Title and description */}
        <div className="flex flex-col">
          <span className="font-medium leading-tight whitespace-nowrap">{title}</span>
          <span className="text-xs text-muted-foreground leading-tight whitespace-nowrap">{description}</span>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {actions}

          {/* Position toggle button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground"
                onClick={togglePosition}
              >
                <ArrowUpDown className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              Move to {position === 'top' ? 'bottom' : 'top'}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
