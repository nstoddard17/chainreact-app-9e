"use client"

import React, { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Play, Radio, Shield, Rocket, Clock, Info } from "lucide-react"
import { MockDataVariationPicker } from "./MockDataVariationPicker"
import { TestModeConfig, TriggerTestMode, ActionTestMode } from "@/lib/services/testMode/types"
import { cn } from "@/lib/utils"

type ExecutionMode = 'test' | 'live'

interface TestModeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  triggerType?: string
  onRunTest: (config: TestModeConfig, mockVariation?: string) => void
  isExecuting?: boolean
  isListening?: boolean
  listeningTimeRemaining?: number
}

export function TestModeDialog({
  open,
  onOpenChange,
  workflowId,
  triggerType,
  onRunTest,
  isExecuting = false,
  isListening = false,
  listeningTimeRemaining
}: TestModeDialogProps) {
  const [executionMode, setExecutionMode] = useState<ExecutionMode>('test')
  const [includeTrigger, setIncludeTrigger] = useState(true)
  const [mockVariation, setMockVariation] = useState<string | undefined>()

  const handleRunTest = () => {
    const config: TestModeConfig = {
      triggerMode: includeTrigger ? TriggerTestMode.WAIT_FOR_REAL : TriggerTestMode.USE_MOCK_DATA,
      actionMode: executionMode === 'live' ? ActionTestMode.EXECUTE_ALL : ActionTestMode.INTERCEPT_WRITES,
      triggerTimeout: 60000,
      showDetailedSteps: true,
      captureStepData: true
    }
    onRunTest(config, mockVariation)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader className="pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Play className="w-4 h-4" />
            Run Workflow
          </DialogTitle>
          <DialogDescription className="text-xs">
            Choose execution mode and trigger options
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Mode Selection - Compact toggle buttons */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Execution Mode</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setExecutionMode('test')}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-all",
                  executionMode === 'test'
                    ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300"
                    : "border-border hover:border-muted-foreground/30 text-muted-foreground"
                )}
              >
                <Shield className="w-4 h-4" />
                Test Mode
              </button>
              <button
                type="button"
                onClick={() => setExecutionMode('live')}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-all",
                  executionMode === 'live'
                    ? "border-green-500 bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300"
                    : "border-border hover:border-muted-foreground/30 text-muted-foreground"
                )}
              >
                <Rocket className="w-4 h-4" />
                Live Mode
              </button>
            </div>
          </div>

          {/* Trigger Option - Compact switch */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="include-trigger" className="text-sm font-medium">
                  Wait for real trigger
                </Label>
                <p className="text-xs text-muted-foreground">
                  {includeTrigger ? "Listen up to 60s" : "Use mock data"}
                </p>
              </div>
              <Switch
                id="include-trigger"
                checked={includeTrigger}
                onCheckedChange={setIncludeTrigger}
              />
            </div>

            {includeTrigger && (
              <div className="flex items-start gap-2 p-2 bg-amber-50 dark:bg-amber-950/20 rounded-md border border-amber-200 dark:border-amber-800">
                <Radio className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-800 dark:text-amber-200">
                  Trigger the event in your service after starting.
                </p>
              </div>
            )}

            {!includeTrigger && triggerType && (
              <MockDataVariationPicker
                triggerType={triggerType}
                selectedVariation={mockVariation}
                onVariationChange={setMockVariation}
                compact
              />
            )}
          </div>

          {/* Mode Summary - Compact inline */}
          <div className={cn(
            "flex items-center gap-2 p-2 rounded-md text-xs",
            executionMode === 'live'
              ? "bg-orange-50 dark:bg-orange-950/20 text-orange-700 dark:text-orange-300"
              : "bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-300"
          )}>
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            <span>
              {executionMode === 'live'
                ? "Actions will be executed for real"
                : "Actions captured, not sent externally"
              }
            </span>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mr-auto">
            {isListening && listeningTimeRemaining !== undefined && (
              <>
                <Clock className="w-3 h-3 animate-pulse" />
                <span>{listeningTimeRemaining}s</span>
              </>
            )}
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              disabled={isExecuting || isListening}
            >
              {isListening ? 'Cancel' : 'Close'}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleRunTest}
              disabled={isExecuting || isListening}
              className={cn(
                executionMode === 'live' && "bg-green-600 hover:bg-green-700"
              )}
            >
              {isExecuting || isListening ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                  {isListening ? 'Listening...' : 'Running...'}
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                  {executionMode === 'live' ? 'Run Live' : 'Run Test'}
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
