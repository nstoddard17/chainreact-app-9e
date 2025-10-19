"use client"

import React, { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Zap, Clock, Database, SkipForward, Info, Settings2
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { TriggerTestMode, ActionTestMode, TestModeConfig } from "@/lib/services/testMode/types"

interface TestModeConfigSelectorProps {
  value?: TestModeConfig
  onChange: (config: TestModeConfig) => void
  className?: string
}

export function TestModeConfigSelector({
  value,
  onChange,
  className
}: TestModeConfigSelectorProps) {
  const [triggerMode, setTriggerMode] = useState<TriggerTestMode>(
    value?.triggerMode || TriggerTestMode.USE_MOCK_DATA
  )
  const [actionMode, setActionMode] = useState<ActionTestMode>(
    value?.actionMode || ActionTestMode.INTERCEPT_WRITES
  )
  const [triggerTimeout, setTriggerTimeout] = useState<number>(
    value?.triggerTimeout || 300000 // 5 minutes default
  )

  const handleChange = (updates: Partial<TestModeConfig>) => {
    const newConfig: TestModeConfig = {
      triggerMode: updates.triggerMode ?? triggerMode,
      actionMode: updates.actionMode ?? actionMode,
      triggerTimeout: updates.triggerTimeout ?? triggerTimeout,
      showDetailedSteps: true,
      captureStepData: true
    }
    onChange(newConfig)
  }

  const handleTriggerModeChange = (mode: TriggerTestMode) => {
    setTriggerMode(mode)
    handleChange({ triggerMode: mode })
  }

  const handleActionModeChange = (mode: ActionTestMode) => {
    setActionMode(mode)
    handleChange({ actionMode: mode })
  }

  const handleTimeoutChange = (minutes: number) => {
    const timeoutMs = minutes * 60 * 1000
    setTriggerTimeout(timeoutMs)
    handleChange({ triggerTimeout: timeoutMs })
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Trigger Mode Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            Trigger Mode
          </CardTitle>
          <CardDescription className="text-xs">
            Choose how the workflow trigger behaves during testing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={triggerMode}
            onValueChange={(value) => handleTriggerModeChange(value as TriggerTestMode)}
            className="space-y-3"
          >
            {/* Use Mock Data */}
            <div className="flex items-start space-x-3 space-y-0">
              <RadioGroupItem value={TriggerTestMode.USE_MOCK_DATA} id="mock" />
              <div className="flex-1">
                <Label
                  htmlFor="mock"
                  className="flex items-center gap-2 cursor-pointer font-medium"
                >
                  <Zap className="w-4 h-4 text-yellow-500" />
                  Use Mock Data (Instant)
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Skip the trigger and use realistic sample data immediately. Perfect for rapid testing.
                </p>
              </div>
            </div>

            {/* Wait for Real Trigger */}
            <div className="flex items-start space-x-3 space-y-0">
              <RadioGroupItem value={TriggerTestMode.WAIT_FOR_REAL} id="wait" />
              <div className="flex-1">
                <Label
                  htmlFor="wait"
                  className="flex items-center gap-2 cursor-pointer font-medium"
                >
                  <Clock className="w-4 h-4 text-blue-500" />
                  Wait for Real Trigger
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Wait for actual webhook/trigger to fire and use real data. Great for testing with live integrations.
                </p>

                {/* Show timeout input when this mode is selected */}
                {triggerMode === TriggerTestMode.WAIT_FOR_REAL && (
                  <div className="mt-3 space-y-2">
                    <Label htmlFor="timeout" className="text-xs">
                      Timeout (minutes)
                    </Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="timeout"
                        type="number"
                        min="1"
                        max="60"
                        value={triggerTimeout / 60000}
                        onChange={(e) => handleTimeoutChange(Number(e.target.value))}
                        className="w-24 h-8 text-sm"
                      />
                      <span className="text-xs text-muted-foreground">
                        Wait up to {Math.round(triggerTimeout / 60000)} minute(s)
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Action Mode Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Database className="w-4 h-4" />
            Action Mode
          </CardTitle>
          <CardDescription className="text-xs">
            Choose how workflow actions execute during testing
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={actionMode}
            onValueChange={(value) => handleActionModeChange(value as ActionTestMode)}
            className="space-y-3"
          >
            {/* Intercept Writes */}
            <div className="flex items-start space-x-3 space-y-0">
              <RadioGroupItem value={ActionTestMode.INTERCEPT_WRITES} id="intercept" />
              <div className="flex-1">
                <Label
                  htmlFor="intercept"
                  className="flex items-center gap-2 cursor-pointer font-medium"
                >
                  <Database className="w-4 h-4 text-green-500" />
                  Pull Real Data, Intercept Sends
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="w-3 h-3 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">
                          Read/fetch operations execute normally to get real data from APIs.
                          Write/send/create operations are intercepted and shown to you instead of being sent.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Test with real API data without actually sending emails, messages, or creating records. Recommended for most testing.
                </p>
                <div className="mt-2 p-2 bg-green-50 dark:bg-green-950/20 rounded text-xs space-y-1">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500"></div>
                    <span>Reads: Execute normally (get real data)</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500"></div>
                    <span>Writes: Intercepted (shown but not sent)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Skip All */}
            <div className="flex items-start space-x-3 space-y-0">
              <RadioGroupItem value={ActionTestMode.SKIP_ALL} id="skip" />
              <div className="flex-1">
                <Label
                  htmlFor="skip"
                  className="flex items-center gap-2 cursor-pointer font-medium"
                >
                  <SkipForward className="w-4 h-4 text-purple-500" />
                  Skip All External Actions
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Skip all external API calls entirely and use mock responses. Fastest execution for UI demos.
                </p>
                <div className="mt-2 p-2 bg-purple-50 dark:bg-purple-950/20 rounded text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-purple-500"></div>
                    <span>All actions: Skipped (instant mock responses)</span>
                  </div>
                </div>
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Info Box */}
      <Card className="border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
            <div className="space-y-1 text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                Safe Testing Mode
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {triggerMode === TriggerTestMode.USE_MOCK_DATA
                  ? "Using sample data means no real webhooks are triggered. "
                  : "Real trigger data will be captured, but "}
                {actionMode === ActionTestMode.INTERCEPT_WRITES
                  ? "Read operations will fetch real data, but writes (emails, messages, records) will be intercepted and shown to you instead of being sent."
                  : "all external actions will be skipped for the fastest possible execution."}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
