# Sandbox Mode UI Integration Guide

Complete guide for integrating the new sandbox mode components into your workflow builder.

## Components Created

1. **`TestModeConfigSelector`** - Select trigger and action modes
2. **`InterceptedActionsDisplay`** - Display intercepted actions after test runs
3. **`MockDataVariationPicker`** - Choose specific mock data scenarios
4. **`TestModeDialog`** - All-in-one dialog combining all components

## Quick Integration

### Option 1: Use the All-in-One Dialog (Recommended)

```typescript
import { TestModeDialog } from '@/components/workflows/TestModeDialog'
import { TestModeConfig } from '@/lib/services/testMode/types'
import { useState } from 'react'

function WorkflowBuilder() {
  const [testDialogOpen, setTestDialogOpen] = useState(false)
  const [interceptedActions, setInterceptedActions] = useState([])
  const [isExecuting, setIsExecuting] = useState(false)

  const handleRunTest = async (config: TestModeConfig, mockVariation?: string) => {
    setIsExecuting(true)

    try {
      const response = await fetch('/api/workflows/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflowId: workflow.id,
          testMode: true,
          testModeConfig: config,
          mockVariation,
          workflowData: {
            nodes,
            edges
          },
          skipTriggers: config.triggerMode === 'use_mock_data'
        })
      })

      const result = await response.json()

      // Store intercepted actions
      if (result.interceptedActions) {
        setInterceptedActions(result.interceptedActions)
      }

      // Show success message
      toast({
        title: "Test Complete",
        description: `Workflow executed successfully. ${result.interceptedActions?.length || 0} actions intercepted.`
      })
    } catch (error) {
      toast({
        title: "Test Failed",
        description: error.message,
        variant: "destructive"
      })
    } finally {
      setIsExecuting(false)
    }
  }

  return (
    <>
      {/* Your workflow builder UI */}
      <Button onClick={() => setTestDialogOpen(true)}>
        <Play className="w-4 h-4 mr-2" />
        Test Workflow
      </Button>

      {/* Test Mode Dialog */}
      <TestModeDialog
        open={testDialogOpen}
        onOpenChange={setTestDialogOpen}
        workflowId={workflow.id}
        triggerType={triggerNode?.data?.type}
        onRunTest={handleRunTest}
        interceptedActions={interceptedActions}
        isExecuting={isExecuting}
      />
    </>
  )
}
```

### Option 2: Use Individual Components

For more control, use the components separately:

```typescript
import { TestModeConfigSelector } from '@/components/workflows/TestModeConfigSelector'
import { InterceptedActionsDisplay } from '@/components/workflows/InterceptedActionsDisplay'
import { MockDataVariationPicker } from '@/components/workflows/MockDataVariationPicker'
import { TestModeConfig, TriggerTestMode } from '@/lib/services/testMode/types'
import { createDefaultTestConfig } from '@/lib/services/testMode'
import { useState } from 'react'

function CustomTestPanel() {
  const [config, setConfig] = useState<TestModeConfig>(createDefaultTestConfig())
  const [mockVariation, setMockVariation] = useState<string>()
  const [interceptedActions, setInterceptedActions] = useState([])

  return (
    <div className="space-y-6">
      {/* Configuration Selector */}
      <TestModeConfigSelector
        value={config}
        onChange={setConfig}
      />

      {/* Mock Data Variations (only shown if using mock data) */}
      {config.triggerMode === TriggerTestMode.USE_MOCK_DATA && (
        <MockDataVariationPicker
          triggerType="gmail_trigger_new_email"
          selectedVariation={mockVariation}
          onVariationChange={setMockVariation}
        />
      )}

      {/* Run Test Button */}
      <Button onClick={() => runTest(config, mockVariation)}>
        Run Test
      </Button>

      {/* Results Display */}
      {interceptedActions.length > 0 && (
        <InterceptedActionsDisplay actions={interceptedActions} />
      )}
    </div>
  )
}
```

## API Integration

### Execute Workflow with Test Mode Config

```typescript
const executeWorkflowTest = async (
  workflowId: string,
  config: TestModeConfig,
  mockVariation?: string
) => {
  const response = await fetch('/api/workflows/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workflowId,
      testMode: true,
      testModeConfig: config, // Pass the config
      mockVariation, // Optional: specific mock data scenario
      executionMode: 'sandbox',
      workflowData: {
        nodes: currentNodes,
        edges: currentEdges
      },
      skipTriggers: config.triggerMode === 'use_mock_data',
      inputData: {}
    })
  })

  const result = await response.json()

  return {
    success: result.success,
    interceptedActions: result.interceptedActions || [],
    results: result.results
  }
}
```

### Start Test Session (Wait for Real Trigger)

```typescript
const startTestSession = async (
  workflowId: string,
  config: TestModeConfig
) => {
  const response = await fetch(`/api/workflows/${workflowId}/test-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      testModeConfig: config,
      timeout: config.triggerTimeout || 300000 // 5 minutes default
    })
  })

  const result = await response.json()

  return {
    sessionId: result.sessionId,
    status: result.status,
    expiresIn: result.expiresIn
  }
}
```

## Workflow Builder Integration Points

### 1. Add Test Button to Toolbar

```typescript
// In WorkflowToolbar.tsx or similar
<Button
  variant="outline"
  onClick={handleOpenTestDialog}
  className="flex items-center gap-2"
>
  <Play className="w-4 h-4" />
  Test Workflow
</Button>
```

### 2. Add Test Mode Banner

When a test is running, show a banner:

```typescript
{isTestRunning && (
  <div className="bg-yellow-50 border-b border-yellow-200 px-4 py-2">
    <div className="flex items-center gap-2">
      <Shield className="w-4 h-4 text-yellow-600" />
      <span className="text-sm font-medium text-yellow-900">
        Test Mode Active
      </span>
      <Badge variant="secondary" className="ml-2">
        {testModeConfig.actionMode === 'intercept_writes'
          ? 'Intercepting Writes'
          : 'Skipping All'}
      </Badge>
    </div>
  </div>
)}
```

### 3. Show Results in Sidebar

```typescript
// In a sidebar panel or results drawer
<Tabs>
  <TabsList>
    <TabsTrigger value="execution">Execution Log</TabsTrigger>
    <TabsTrigger value="intercepted">
      Intercepted Actions
      {interceptedActions.length > 0 && (
        <Badge className="ml-2">{interceptedActions.length}</Badge>
      )}
    </TabsTrigger>
  </TabsList>

  <TabsContent value="execution">
    {/* Existing execution logs */}
  </TabsContent>

  <TabsContent value="intercepted">
    <InterceptedActionsDisplay actions={interceptedActions} />
  </TabsContent>
</Tabs>
```

## Complete Example with All Features

```typescript
'use client'

import { useState, useCallback } from 'react'
import { TestModeDialog } from '@/components/workflows/TestModeDialog'
import { TestModeConfig } from '@/lib/services/testMode/types'
import { Button } from '@/components/ui/button'
import { Play, StopCircle } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

function EnhancedWorkflowBuilder({ workflow }) {
  const [testDialogOpen, setTestDialogOpen] = useState(false)
  const [isExecuting, setIsExecuting] = useState(false)
  const [interceptedActions, setInterceptedActions] = useState([])
  const [testSessionId, setTestSessionId] = useState<string | null>(null)
  const { toast } = useToast()

  // Get trigger node from workflow
  const triggerNode = workflow.nodes?.find(n => n.data?.isTrigger)

  const handleRunTest = useCallback(async (
    config: TestModeConfig,
    mockVariation?: string
  ) => {
    setIsExecuting(true)
    setInterceptedActions([])

    try {
      // If waiting for real trigger, start test session first
      if (config.triggerMode === 'wait_for_real') {
        const sessionResponse = await fetch(
          `/api/workflows/${workflow.id}/test-session`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              testModeConfig: config,
              timeout: config.triggerTimeout
            })
          }
        )

        const sessionResult = await sessionResponse.json()
        setTestSessionId(sessionResult.sessionId)

        toast({
          title: "Waiting for Trigger",
          description: `Listening for ${triggerNode?.data?.type}. Session expires in ${Math.round(config.triggerTimeout / 60000)} minutes.`
        })

        // Poll for trigger data...
        // Implementation depends on your polling strategy
      } else {
        // Use mock data - execute immediately
        const response = await fetch('/api/workflows/execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            workflowId: workflow.id,
            testMode: true,
            testModeConfig: config,
            mockVariation,
            executionMode: 'sandbox',
            workflowData: {
              nodes: workflow.nodes,
              edges: workflow.edges
            },
            skipTriggers: true,
            inputData: {}
          })
        })

        const result = await response.json()

        if (result.success) {
          setInterceptedActions(result.interceptedActions || [])

          toast({
            title: "Test Complete",
            description: `${result.interceptedActions?.length || 0} actions intercepted`
          })
        } else {
          throw new Error(result.error || 'Test failed')
        }
      }
    } catch (error) {
      toast({
        title: "Test Failed",
        description: error.message,
        variant: "destructive"
      })
    } finally {
      setIsExecuting(false)
    }
  }, [workflow, toast])

  const handleStopTest = async () => {
    if (testSessionId) {
      await fetch(`/api/workflows/${workflow.id}/test-session`, {
        method: 'DELETE'
      })
      setTestSessionId(null)
      setIsExecuting(false)
      toast({
        title: "Test Stopped",
        description: "Test session ended"
      })
    }
  }

  return (
    <div>
      {/* Workflow Builder UI */}

      {/* Test Controls */}
      <div className="flex gap-2">
        <Button
          onClick={() => setTestDialogOpen(true)}
          disabled={isExecuting}
        >
          <Play className="w-4 h-4 mr-2" />
          Test Workflow
        </Button>

        {isExecuting && testSessionId && (
          <Button
            variant="destructive"
            onClick={handleStopTest}
          >
            <StopCircle className="w-4 h-4 mr-2" />
            Stop Test
          </Button>
        )}
      </div>

      {/* Test Mode Dialog */}
      <TestModeDialog
        open={testDialogOpen}
        onOpenChange={setTestDialogOpen}
        workflowId={workflow.id}
        triggerType={triggerNode?.data?.type}
        onRunTest={handleRunTest}
        interceptedActions={interceptedActions}
        isExecuting={isExecuting}
      />
    </div>
  )
}

export default EnhancedWorkflowBuilder
```

## Styling Customization

All components use Tailwind CSS and accept a `className` prop:

```typescript
<TestModeConfigSelector
  className="max-w-2xl mx-auto"
  value={config}
  onChange={setConfig}
/>

<InterceptedActionsDisplay
  className="shadow-lg"
  actions={actions}
/>

<MockDataVariationPicker
  className="border-2"
  triggerType="gmail_trigger_new_email"
  selectedVariation={variation}
  onVariationChange={setVariation}
/>
```

## TypeScript Types

```typescript
import {
  TriggerTestMode,
  ActionTestMode,
  TestModeConfig,
  TestSessionState,
  MockTriggerData
} from '@/lib/services/testMode/types'

// Create configurations
import {
  createDefaultTestConfig,
  createWaitForTriggerConfig,
  createFullMockConfig
} from '@/lib/services/testMode'

// Access mock data
import {
  getMockTriggerData,
  getTriggerVariations,
  getTriggerMockDescription
} from '@/lib/services/testMode/mockTriggerData'
```

## Testing Workflow

1. User clicks "Test Workflow"
2. TestModeDialog opens
3. User configures:
   - Trigger mode (mock vs wait for real)
   - Action mode (intercept vs skip)
   - Timeout (if waiting for real trigger)
   - Mock data variation (if using mock data)
4. User clicks "Run Test"
5. Workflow executes in sandbox mode
6. Intercepted actions displayed in dialog
7. User reviews what would have been sent
8. User can copy intercepted data for inspection

## Benefits

✅ Safe testing without sending real data
✅ Preview exactly what will be sent
✅ Test with real API data when needed
✅ Quick iteration with mock data
✅ Clear visual feedback
✅ Easy integration
✅ Fully typed with TypeScript

## Next Steps

1. Add the TestModeDialog to your workflow builder
2. Wire up the test execution logic
3. Display intercepted actions to users
4. (Optional) Add polling for real trigger data
5. (Optional) Add test history/replay features
