# Sandbox/Test Mode System

Comprehensive testing system for workflows that allows safe execution without sending real data or waiting for real triggers.

## Overview

The sandbox mode system provides two key capabilities:

### 1. **Trigger Testing Options**

Choose how triggers behave during testing:

- **`WAIT_FOR_REAL`** - Wait for actual trigger/webhook to fire, capture real data, then continue with sandbox mode (no external sends)
- **`USE_MOCK_DATA`** - Skip trigger entirely, use realistic mock data immediately, continue with sandbox mode

### 2. **Action Testing Modes**

Choose how actions execute:

- **`INTERCEPT_WRITES`** - Execute read/fetch operations normally (pull real data), intercept all write/send/create operations
- **`SKIP_ALL`** - Skip all external actions entirely, use mock responses for everything

## Quick Start

### Basic Usage

```typescript
import { createDefaultTestConfig } from '@/lib/services/testMode'

// Default: mock trigger data, intercept writes
const testConfig = createDefaultTestConfig()

// Execute workflow with test mode
await workflowExecutionService.executeWorkflow(
  workflow,
  inputData,
  userId,
  true, // testMode enabled
  workflowData,
  false,
  testConfig // Test configuration
)
```

### Wait for Real Trigger

```typescript
import { createWaitForTriggerConfig } from '@/lib/services/testMode'

// Wait up to 5 minutes for real trigger
const testConfig = createWaitForTriggerConfig(300000)

await workflowExecutionService.executeWorkflow(
  workflow,
  {},
  userId,
  true,
  workflowData,
  false,
  testConfig
)
```

### Full Mock Mode

```typescript
import { createFullMockConfig } from '@/lib/services/testMode'

// Use mock data for everything, skip all external calls
const testConfig = createFullMockConfig()

await workflowExecutionService.executeWorkflow(
  workflow,
  {},
  userId,
  true,
  workflowData,
  false,
  testConfig
)
```

## Test Mode Configuration

```typescript
interface TestModeConfig {
  /** How to handle the trigger */
  triggerMode: TriggerTestMode

  /** How to handle actions */
  actionMode: ActionTestMode

  /** Max time to wait for trigger (ms) - only for WAIT_FOR_REAL */
  triggerTimeout?: number

  /** Show detailed step-by-step execution */
  showDetailedSteps?: boolean

  /** Capture data at each step */
  captureStepData?: boolean
}
```

## Trigger Modes

### `TriggerTestMode.WAIT_FOR_REAL`

**Use Case**: Test with actual live data from real triggers

**Behavior**:
1. Workflow execution starts
2. Waits for real webhook/trigger to fire
3. Captures real trigger data
4. Continues execution in sandbox mode (no external sends)

**Example Scenarios**:
- Testing Gmail integration with actual incoming email
- Testing Stripe webhook with real payment
- Testing Discord bot with actual server event

**Configuration**:
```typescript
{
  triggerMode: TriggerTestMode.WAIT_FOR_REAL,
  triggerTimeout: 300000, // 5 minutes
  actionMode: ActionTestMode.INTERCEPT_WRITES
}
```

### `TriggerTestMode.USE_MOCK_DATA`

**Use Case**: Quick testing without waiting for external events

**Behavior**:
1. Immediately uses realistic mock data for the trigger
2. Continues execution immediately
3. No waiting required

**Example Scenarios**:
- Rapid iteration during workflow development
- Testing workflow logic without external dependencies
- Demo/presentation mode

**Mock Data Available For**:
- Gmail (new email, attachment, label)
- Google Calendar (new event, updated, canceled)
- Google Drive (new file, folder, file updated)
- Discord (new message, member joined/left)
- Slack (new message)
- Notion (page created)
- Airtable (new record, record updated)
- Stripe (payment succeeded)
- HubSpot (contact created)
- Twitter (new mention)
- Webhooks (generic, Stripe, GitHub)
- Schedule triggers
- Manual triggers

**Configuration**:
```typescript
{
  triggerMode: TriggerTestMode.USE_MOCK_DATA,
  actionMode: ActionTestMode.INTERCEPT_WRITES
}
```

## Action Modes

### `ActionTestMode.INTERCEPT_WRITES`

**Use Case**: Test with real read data, prevent actual sends

**Behavior**:
- ✅ Read/fetch operations execute normally (pull real data from APIs)
- 🛡️ Write/send/create operations are intercepted (nothing sent)
- 📊 Intercepted actions captured with full details

**Examples**:

**Allowed (executes normally)**:
- Fetch Gmail emails
- List Slack channels
- Get Google Drive files
- Search Airtable records
- List Discord servers

**Intercepted (captured but not sent)**:
- Send Gmail email
- Post Slack message
- Create Google Drive file
- Create Airtable record
- Send Discord message

**Intercepted Action Data**:
```typescript
{
  intercepted: {
    type: 'gmail_action_send_email',
    nodeId: 'node-123',
    nodeName: 'Send Welcome Email',
    destination: 'user@example.com',
    config: { to: 'user@example.com', subject: '...', body: '...' },
    wouldHaveSent: { /* full email data */ }
  }
}
```

### `ActionTestMode.SKIP_ALL`

**Use Case**: Fastest testing, no external API calls at all

**Behavior**:
- ⏭️ All external actions skipped
- 📝 Mock responses returned
- ⚡ Super fast execution

**Examples**: All integration actions return:
```typescript
{
  success: true,
  output: {
    skipped: true,
    message: 'Test mode: gmail_action_send_email would execute here',
    mockData: true
  }
}
```

## Mock Trigger Data

### Using Mock Data

```typescript
import { getMockTriggerData, getTriggerVariations } from '@/lib/services/testMode'

// Get default mock data for a trigger
const gmailData = getMockTriggerData('gmail_trigger_new_email')

// Get available variations
const variations = getTriggerVariations('webhook')
// Returns: ['Stripe Payment', 'GitHub Push']

// Get specific variation
const stripeData = getMockTriggerData('webhook', 'Stripe Payment')
```

### Mock Data Structure

Every mock trigger includes:
- `type`: Trigger type identifier
- `data`: Realistic data structure matching real trigger payloads
- `description`: What this mock data represents
- `variations`: Optional alternative scenarios

### Adding New Mock Data

Edit `/lib/services/testMode/mockTriggerData.ts`:

```typescript
export const MOCK_TRIGGER_DATA: Record<string, MockTriggerData> = {
  'your_trigger_type': {
    type: 'your_trigger_type',
    description: 'Description of what this represents',
    data: {
      // Realistic data structure
      id: 'test_123',
      field: 'value',
      timestamp: new Date().toISOString()
    },
    variations: [
      {
        name: 'Edge Case',
        description: 'Special scenario',
        data: {
          // Alternative data structure
        }
      }
    ]
  }
}
```

## Execution Flow

### With WAIT_FOR_REAL

```
1. Start execution
2. Initialize test session
3. Wait for trigger webhook/event
   └── Timeout after configured duration
4. Capture real trigger data
5. Execute actions with INTERCEPT_WRITES
   ├── Reads: Execute normally, get real data
   └── Writes: Intercept, capture details
6. Return results with intercepted actions
```

### With USE_MOCK_DATA

```
1. Start execution
2. Load mock trigger data
3. Execute actions with INTERCEPT_WRITES/SKIP_ALL
   ├── INTERCEPT_WRITES:
   │   ├── Reads: Execute normally
   │   └── Writes: Intercept
   └── SKIP_ALL:
       └── All actions: Return mock responses
4. Return results immediately
```

## UI Integration

### Test Mode Selector

The UI should provide options for users to choose:

1. **Trigger Mode**:
   - ⏱️ Wait for real trigger (good for testing live integrations)
   - ⚡ Use mock data (good for quick testing)

2. **Action Mode**:
   - 🔍 Pull real data, don't send (default, most realistic)
   - ⏭️ Skip all external calls (fastest)

3. **Advanced Options**:
   - Trigger timeout (if waiting for real trigger)
   - Mock data variation selection
   - Show detailed step-by-step logs
   - Capture all step data

### Example UI Component

```typescript
import { createDefaultTestConfig, TriggerTestMode, ActionTestMode } from '@/lib/services/testMode'

function TestModeSelector({ onExecute }: Props) {
  const [triggerMode, setTriggerMode] = useState(TriggerTestMode.USE_MOCK_DATA)
  const [actionMode, setActionMode] = useState(ActionTestMode.INTERCEPT_WRITES)

  const handleExecute = () => {
    const config = createDefaultTestConfig({
      triggerMode,
      actionMode
    })
    onExecute(config)
  }

  return (
    <div>
      <select value={triggerMode} onChange={e => setTriggerMode(e.target.value)}>
        <option value={TriggerTestMode.USE_MOCK_DATA}>
          ⚡ Use mock data (instant)
        </option>
        <option value={TriggerTestMode.WAIT_FOR_REAL}>
          ⏱️ Wait for real trigger
        </option>
      </select>

      <select value={actionMode} onChange={e => setActionMode(e.target.value)}>
        <option value={ActionTestMode.INTERCEPT_WRITES}>
          🔍 Pull real data, intercept sends
        </option>
        <option value={ActionTestMode.SKIP_ALL}>
          ⏭️ Skip all external calls
        </option>
      </select>

      <button onClick={handleExecute}>Run Test</button>
    </div>
  )
}
```

## Benefits

### For Developers

- ✅ Safe testing without sending real emails/messages
- ✅ Rapid iteration with mock data
- ✅ Test with real API data when needed
- ✅ See exactly what would be sent

### For Users

- ✅ Test workflows before activating
- ✅ Verify integrations work correctly
- ✅ Preview what automation will do
- ✅ No risk of spam or errors

### For Debugging

- ✅ Detailed interception logs
- ✅ Step-by-step execution tracking
- ✅ Full data capture at each step
- ✅ Clear distinction between test and production

## API Reference

### Types

```typescript
enum TriggerTestMode {
  WAIT_FOR_REAL = 'wait_for_real',
  USE_MOCK_DATA = 'use_mock_data'
}

enum ActionTestMode {
  INTERCEPT_WRITES = 'intercept_writes',
  SKIP_ALL = 'skip_all'
}
```

### Functions

```typescript
// Create configurations
createDefaultTestConfig(options?: Partial<TestModeConfig>): TestModeConfig
createWaitForTriggerConfig(timeoutMs?: number): TestModeConfig
createFullMockConfig(): TestModeConfig

// Mock data access
getMockTriggerData(triggerType: string, variationName?: string): any
getTriggerVariations(triggerType: string): string[]
getTriggerMockDescription(triggerType: string, variationName?: string): string
```

## Examples

### Example 1: Test Gmail Workflow

```typescript
// Test with real Gmail fetch, mock send
const config = createDefaultTestConfig({
  triggerMode: TriggerTestMode.USE_MOCK_DATA, // Use mock incoming email
  actionMode: ActionTestMode.INTERCEPT_WRITES // Fetch real data, don't send
})

const result = await executeWorkflow(gmailWorkflow, {}, userId, true, null, false, config)

// Result includes:
// - Mock trigger data (fake incoming email)
// - Real data from Gmail API fetches
// - Intercepted send email action with full details
```

### Example 2: Wait for Real Webhook

```typescript
// Wait for actual Stripe webhook, test rest of workflow
const config = createWaitForTriggerConfig(60000) // Wait 1 minute

const result = await executeWorkflow(stripeWorkflow, {}, userId, true, null, false, config)

// Workflow waits for real Stripe payment webhook
// Then executes actions in sandbox mode
```

### Example 3: Super Fast Mock Testing

```typescript
// Skip everything, use mocks
const config = createFullMockConfig()

const result = await executeWorkflow(complexWorkflow, {}, userId, true, null, false, config)

// Completes in milliseconds
// All actions return mock responses
// Perfect for UI demos
```

## Troubleshooting

### Trigger Timeout

If waiting for real trigger times out:
- Check webhook URL is correct
- Verify trigger is configured properly
- Check external service is sending webhooks
- Increase timeout duration

### Intercepted Actions Not Showing

If actions aren't being intercepted:
- Verify `testMode` is `true`
- Check `testModeConfig` is provided
- Ensure action is classified as "external" (check `isExternalAction` in nodeExecutionService.ts)

### Mock Data Issues

If mock data doesn't match needs:
- Add custom variation to `MOCK_TRIGGER_DATA`
- Create provider-specific mock data
- Submit PR to enhance mock data registry

## Future Enhancements

- [ ] UI for selecting mock data variations
- [ ] Test session management (pause/resume/replay)
- [ ] Test data recording from real executions
- [ ] Mock data generation from schemas
- [ ] Test assertions and validation
- [ ] Comparison tool (test vs production results)
