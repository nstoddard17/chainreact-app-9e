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
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Play, Settings, Layers, AlertTriangle } from "lucide-react"
import { TestModeConfigSelector } from "./TestModeConfigSelector"
import { MockDataVariationPicker } from "./MockDataVariationPicker"
import { InterceptedActionsDisplay } from "./InterceptedActionsDisplay"
import { TestModeConfig, TriggerTestMode } from "@/lib/services/testMode/types"
import { createDefaultTestConfig } from "@/lib/services/testMode"

interface TestModeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workflowId: string
  triggerType?: string
  onRunTest: (config: TestModeConfig, mockVariation?: string) => void
  interceptedActions?: any[]
  isExecuting?: boolean
}

export function TestModeDialog({
  open,
  onOpenChange,
  workflowId,
  triggerType,
  onRunTest,
  interceptedActions,
  isExecuting = false
}: TestModeDialogProps) {
  const [testModeConfig, setTestModeConfig] = useState<TestModeConfig>(
    createDefaultTestConfig()
  )
  const [mockVariation, setMockVariation] = useState<string | undefined>()
  const [activeTab, setActiveTab] = useState("config")

  // Debug logging
  React.useEffect(() => {
    console.log('🧪 [TestModeDialog] open prop changed:', open, {
      workflowId,
      triggerType,
      hasInterceptedActions: interceptedActions?.length || 0
    })
  }, [open, workflowId, triggerType, interceptedActions])

  const handleRunTest = () => {
    onRunTest(testModeConfig, mockVariation)
    // Switch to results tab if we have intercepted actions
    if (interceptedActions && interceptedActions.length > 0) {
      setActiveTab("results")
    }
  }

  const showMockVariations = triggerType && testModeConfig.triggerMode === TriggerTestMode.USE_MOCK_DATA

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Play className="w-5 h-5" />
            Test Workflow
            <Badge variant="outline" className="ml-2">Sandbox Mode</Badge>
          </DialogTitle>
          <DialogDescription>
            Configure and run your workflow in a safe testing environment
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="config" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Configuration
            </TabsTrigger>
            <TabsTrigger value="variations" className="flex items-center gap-2" disabled={!showMockVariations}>
              <Layers className="w-4 h-4" />
              Mock Data
            </TabsTrigger>
            <TabsTrigger value="results" className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Results
              {interceptedActions && interceptedActions.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {interceptedActions.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Configuration Tab */}
          <TabsContent value="config" className="flex-1 overflow-auto mt-4">
            <TestModeConfigSelector
              value={testModeConfig}
              onChange={setTestModeConfig}
            />
          </TabsContent>

          {/* Mock Data Variations Tab */}
          <TabsContent value="variations" className="flex-1 overflow-auto mt-4">
            {showMockVariations && triggerType ? (
              <MockDataVariationPicker
                triggerType={triggerType}
                selectedVariation={mockVariation}
                onVariationChange={setMockVariation}
              />
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                <div className="text-center space-y-2">
                  <Layers className="w-12 h-12 mx-auto opacity-50" />
                  <p className="text-sm">
                    Mock data variations are only available when using "Use Mock Data" trigger mode
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          {/* Results Tab */}
          <TabsContent value="results" className="flex-1 overflow-auto mt-4">
            {interceptedActions && interceptedActions.length > 0 ? (
              <InterceptedActionsDisplay actions={interceptedActions} />
            ) : (
              <div className="flex items-center justify-center h-64 text-muted-foreground">
                <div className="text-center space-y-2">
                  <AlertTriangle className="w-12 h-12 mx-auto opacity-50" />
                  <p className="text-sm">
                    No intercepted actions yet. Run a test to see results here.
                  </p>
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {testModeConfig.triggerMode === TriggerTestMode.WAIT_FOR_REAL
              ? `Will wait up to ${Math.round((testModeConfig.triggerTimeout || 300000) / 60000)} min for trigger`
              : "Using mock data for instant testing"
            }
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isExecuting}
            >
              Close
            </Button>
            <Button
              type="button"
              onClick={handleRunTest}
              disabled={isExecuting}
              className="min-w-[100px]"
            >
              {isExecuting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Test
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
