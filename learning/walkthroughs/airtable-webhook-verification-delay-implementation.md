# Airtable Webhook Verification Delay Implementation

## Problem
Airtable webhooks were executing multiple times (up to 24 times) for a single field update because Airtable sends webhook events for every keystroke during record creation/editing. This was causing unnecessary workflow executions and Discord messages.

## Solution Implemented
We implemented a configurable verification delay similar to Zapier's approach, which waits 30-60 seconds before processing new records to ensure they're complete and haven't been deleted.

## Key Changes

### 1. Added Verification Delay Configuration to Trigger Nodes
**File**: `/lib/workflows/nodes/providers/airtable/index.ts`

Added a new advanced configuration field to both `airtable_trigger_new_record` and `airtable_trigger_record_updated`:

```typescript
{
  name: "verificationDelay",
  label: "Verification Delay",
  type: "number",
  required: false,
  defaultValue: 30,  // 30s for new records, 0s for updates
  min: 0,
  max: 120,
  step: 5,
  unit: "seconds",
  description: "Wait time before processing records to ensure they're complete",
  advanced: true,
  helpText: "Recommended: 30-60 seconds. Prevents triggering on incomplete records."
}
```

### 2. Implemented Timer-Based Delayed Processing
**File**: `/app/api/workflow/airtable/route.ts`

Key components:
- `pendingRecords` Map to track records scheduled for processing
- `activeTimers` Map to prevent duplicate timers
- `schedulePendingRecord()` function to schedule delayed processing
- `processSinglePendingRecord()` function to process after delay

```typescript
const pendingRecords = new Map<string, {
  workflowId: string;
  recordId: string;
  userId: string;
  triggerData: any;
  scheduledAt: number;
  verificationDelay: number;
}>()

const activeTimers = new Map<string, NodeJS.Timeout>()

function schedulePendingRecord(...) {
  // Check if already scheduled
  if (activeTimers.has(key)) return;

  // Schedule with setTimeout
  const timer = setTimeout(async () => {
    await processSinglePendingRecord(key, pendingRecord)
  }, verificationDelay * 1000)

  activeTimers.set(key, timer)
}
```

### 3. Record Verification Before Processing
**File**: `/lib/integrations/airtable/verification.ts`

Created verification function to check if records still exist before processing:

```typescript
export async function verifyAirtableRecord(
  userId: string,
  baseId: string,
  tableIdOrName: string,
  recordId: string,
  tableName?: string
): Promise<boolean> {
  // Get user's OAuth token
  // Try both table name and table ID when checking Airtable
  // Return false for 401/403/404 responses so deleted or inaccessible records are skipped
}
```

### 4. UI Integration with Slider
**File**: `/components/workflows/configuration/providers/AirtableConfiguration.tsx`

Added rendering of advanced fields section to show the verification delay slider:

```tsx
{/* Advanced fields */}
{advancedFields.length > 0 && (
  <div className="border-t border-slate-200 pt-4 mt-6">
    <h3 className="text-sm font-medium text-slate-700 mb-3">Advanced Settings</h3>
    <div className="space-y-3">
      {renderFields(advancedFields)}
    </div>
  </div>
)}
```

The slider is automatically rendered by `GenericTextInput` component when it detects a number field with min/max/step properties.

## How It Works

1. **Webhook Received**: Airtable sends webhook with multiple payloads (up to 50)
2. **Cross-Payload Merging**: System merges data across all payloads to find complete record data
3. **Delay Scheduling**: If verificationDelay > 0, record is scheduled for processing after delay
4. **Timer Tracking**: Active timers prevent duplicate scheduling
5. **Verification**: After delay, system verifies record still exists via Airtable API
6. **Workflow Execution**: If record exists, workflow is executed; if deleted, it's skipped

## Configuration Options

- **0 seconds**: Process immediately (good for updates)
- **30 seconds** (default for new records): Balance between responsiveness and stability
- **60 seconds**: More conservative, ensures record is complete
- **Up to 120 seconds**: Maximum delay for very slow data entry scenarios

## Database Column Fix
Fixed incorrect column name in verification function:
- Wrong: `access_token_encrypted`
- Correct: `access_token`

## Benefits

1. **Reduced Duplicate Executions**: From 24 executions down to 1
2. **Prevents Incomplete Record Processing**: Waits for user to finish typing
3. **Skips Deleted Records**: Doesn't process records that were created then deleted
4. **User Configurable**: Each workflow can have different delay settings
5. **Zapier-like Behavior**: Familiar pattern for users migrating from Zapier

## Testing

1. Create workflow with Airtable trigger
2. Configure verification delay (30s recommended)
3. Add Discord action to see executions
4. Create record in Airtable
5. Observe single execution after delay (not 24 immediate executions)
6. Try deleting record before delay expires - no execution should occur

## Future Improvements

1. Add visual indicator in UI showing pending records
2. Implement batch processing for multiple records created at once
3. Add telemetry to track optimal delay values
4. Consider smart delay detection based on typing patterns
