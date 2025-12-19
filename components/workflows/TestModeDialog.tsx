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
import { Play, Radio, Clock, AlertTriangle } from "lucide-react"
import { MockDataVariationPicker } from "./MockDataVariationPicker"
import { TestModeConfig, TriggerTestMode, ActionTestMode } from "@/lib/services/testMode/types"

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
  // Manual triggers don't need to wait for real events - they just run immediately
  const isManualTrigger = triggerType === 'manual_trigger'
  const [includeTrigger, setIncludeTrigger] = useState(!isManualTrigger)
  const [mockVariation, setMockVariation] = useState<string | undefined>()

  const handleRunWorkflow = () => {
    const config: TestModeConfig = {
      triggerMode: includeTrigger ? TriggerTestMode.WAIT_FOR_REAL : TriggerTestMode.USE_MOCK_DATA,
      actionMode: ActionTestMode.EXECUTE_ALL,
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
            Configure trigger options and run your workflow
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Warning Banner */}
          <div className="flex items-start gap-2.5 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-200 dark:border-amber-700">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                This will use real data
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Actions like sending emails, posting messages, or creating records will happen for real.
              </p>
            </div>
          </div>

          {/* Trigger Option - Hidden for manual triggers */}
          {!isManualTrigger && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="include-trigger" className="text-sm font-medium">
                    Wait for real trigger
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    {includeTrigger ? "Listen up to 60s for trigger event" : "Use sample data instead"}
                  </p>
                </div>
                <Switch
                  id="include-trigger"
                  checked={includeTrigger}
                  onCheckedChange={setIncludeTrigger}
                />
              </div>

              {includeTrigger && (
                <div className="flex items-start gap-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded-md border border-blue-200 dark:border-blue-800">
                  <Radio className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <p className="text-xs text-blue-800 dark:text-blue-200">
                    Trigger the event in your service after clicking Run.
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
          )}

          {/* Manual trigger info */}
          {isManualTrigger && (
            <div className="flex items-start gap-2 p-2 bg-green-50 dark:bg-green-950/20 rounded-md border border-green-200 dark:border-green-800">
              <Play className="w-3.5 h-3.5 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-green-800 dark:text-green-200">
                Manual trigger will start immediately when you click Run.
              </p>
            </div>
          )}
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
              onClick={handleRunWorkflow}
              disabled={isExecuting || isListening}
            >
              {isExecuting || isListening ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin mr-1.5" />
                  {isListening ? 'Listening...' : 'Running...'}
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 mr-1.5" />
                  Run Workflow
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
