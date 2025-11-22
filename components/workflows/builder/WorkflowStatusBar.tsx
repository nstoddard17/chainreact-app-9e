"use client"

import { useEffect, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { ArrowUpDown, Loader2, Pause, SatelliteDish, StopCircle } from "lucide-react"

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
  activeExecutionNodeName?: string | null
  onStopExecution?: (() => void) | undefined
}

export function WorkflowStatusBar({
  isFlowTesting,
  flowTestStatus,
  onStopFlowTest,
  isExecuting,
  isPaused,
  isListeningForWebhook,
  activeExecutionNodeName,
  onStopExecution,
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

  const showFlowTest = isFlowTesting || Boolean(flowTestStatus)
  const showLiveExecution = !showFlowTest && (isExecuting || isPaused || isListeningForWebhook)

  if (!showFlowTest && !showLiveExecution) {
    return null
  }

  let icon = <Loader2 className="w-4 h-4 text-muted-foreground" />
  let title = ''
  let description = ''
  let action: ReactNode = null

  if (showFlowTest) {
    const total = flowTestStatus?.total ?? 0
    const currentIndex = flowTestStatus?.currentIndex ?? 0
    const nodeLabel = flowTestStatus?.currentNodeLabel

    icon = <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
    title = "Testing workflow"
    description = total
      ? `Running ${Math.min(currentIndex, total)}/${total}${nodeLabel ? ` • ${nodeLabel}` : ''}`
      : "Preparing test run..."
    action = (
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive hover:text-destructive hover:bg-destructive/10"
        onClick={onStopFlowTest}
      >
        <StopCircle className="w-4 h-4 mr-2" />
        Stop test
      </Button>
    )
  } else if (showLiveExecution) {
    const isListening = isListeningForWebhook && !isExecuting
    if (isListening) {
      icon = <SatelliteDish className="w-4 h-4 text-blue-500" />
      title = "Listening for webhook"
      description = "Waiting for trigger event..."
    } else if (isPaused) {
      icon = <Pause className="w-4 h-4 text-amber-500" />
      title = "Execution paused"
      description = activeExecutionNodeName
        ? `Paused on ${activeExecutionNodeName}`
        : "Workflow paused"
    } else {
      icon = <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      title = "Workflow running"
      description = activeExecutionNodeName
        ? `Executing ${activeExecutionNodeName}`
        : "Executing workflow..."
    }

    if (onStopExecution) {
      const stopLabel = isListening ? "Stop listening" : "Stop run"
      action = (
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={onStopExecution}
        >
          <StopCircle className="w-4 h-4 mr-2" />
          {stopLabel}
        </Button>
      )
    }
  }

  const positionClass = position === 'top' ? 'top-6' : 'bottom-6'

  return (
    <div
      className={`absolute ${positionClass} left-1/2 -translate-x-1/2 z-30`}
      style={{ pointerEvents: 'none' }}
    >
      <div className="pointer-events-auto shadow-lg border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 rounded-xl px-4 py-3 flex items-center gap-4 text-sm min-w-[340px] max-w-[420px]">
        <div className="flex items-center gap-3">
          {icon}
          <div className="flex flex-col">
            <span className="font-medium leading-tight">{title}</span>
            <span className="text-xs text-muted-foreground leading-tight">{description}</span>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {action ? (
            action
          ) : showLiveExecution ? (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {isPaused ? 'Pause state' : 'Running'}
            </span>
          ) : null}
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground"
            onClick={togglePosition}
          >
            <ArrowUpDown className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
