# Loop Progress Tracking Guide

## Overview

The Loop node provides comprehensive real-time progress tracking during workflow execution. This allows users to monitor loop iterations, see estimated completion times, and track which items are being processed.

## Architecture

### Components

1. **Database Layer** (`loop_executions` table)
   - Stores loop execution metadata
   - Tracks iteration count, status, timing
   - Enables real-time subscriptions

2. **Execution Engine** (`advancedExecutionEngine.ts`)
   - Manages loop execution
   - Updates progress in real-time
   - Handles errors and completion

3. **Action Handler** (`lib/workflows/actions/logic/loop.ts`)
   - Processes loop config
   - Returns iteration metadata
   - Provides progress indicators

4. **UI Component** (`LoopProgressIndicator.tsx`)
   - Displays real-time progress
   - Shows time estimates
   - Subscribes to updates

## Database Schema

```sql
CREATE TABLE loop_executions (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES workflow_execution_sessions(id),
  node_id TEXT NOT NULL,
  max_iterations INT NOT NULL DEFAULT 100,
  iteration_count INT NOT NULL DEFAULT 0,
  current_item_index INT,
  status TEXT CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  loop_data JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Loop Output Schema

Each loop iteration provides rich metadata:

```typescript
{
  currentItem: any,          // Current item being processed
  index: number,              // Zero-based index (0, 1, 2, ...)
  iteration: number,          // One-based iteration (1, 2, 3, ...)
  totalItems: number,         // Total array length
  isFirst: boolean,           // True on first iteration
  isLast: boolean,            // True on last iteration
  batch: any[],               // Items in current batch (if batchSize > 1)
  batchSize: number,          // Size of each batch
  allItems: any[],            // Complete array (for reference)
  progressPercentage: number, // 0-100
  remainingItems: number      // Items left to process
}
```

## Usage Patterns

### Basic Loop

```
┌─────────────────┐
│ Find Dropbox    │
│ Files           │ → files array
└─────────────────┘
         ↓
┌─────────────────┐
│ Loop            │
│ items: {{Find   │
│  Dropbox Files. │
│  files}}        │
│ batchSize: 1    │
└─────────────────┘
         ↓
┌─────────────────┐
│ Upload to Drive │
│ file: {{Loop.   │
│  currentItem}}  │
└─────────────────┘
```

### Batch Processing

```
┌─────────────────┐
│ Get Customers   │ → 100 customers
└─────────────────┘
         ↓
┌─────────────────┐
│ Loop            │
│ batchSize: 10   │ → Process 10 at a time
└─────────────────┘
         ↓
┌─────────────────┐
│ Send Batch Email│
│ recipients:     │
│ {{Loop.batch}}  │
└─────────────────┘
```

### Conditional Processing

```
┌─────────────────┐
│ Loop            │
└─────────────────┘
         ↓
┌─────────────────┐
│ Filter          │
│ condition:      │
│ {{Loop.current  │
│  Item.status}}  │
│ == "active"     │
└─────────────────┘
         ↓
┌─────────────────┐
│ Process Active  │
│ Items Only      │
└─────────────────┘
```

## Progress Indication

### Real-Time Updates

The `LoopProgressIndicator` component subscribes to the `loop_executions` table and displays:

1. **Current Status**
   - Pending/Running/Completed/Failed
   - Visual status indicator with color coding

2. **Progress Bar**
   - Current iteration / total iterations
   - Percentage complete (0-100%)

3. **Time Estimates**
   - Elapsed time
   - Estimated remaining time (based on average iteration time)
   - Total completion time (on finish)

4. **Current Item Info**
   - Item index being processed
   - Batch information (if applicable)

### Display Modes

**Compact Mode** (inline):
```tsx
<LoopProgressIndicator
  sessionId={executionId}
  nodeId={loopNodeId}
  compact={true}
/>
```
Shows: `⟳ 5/10 (50%)`

**Full Mode** (card):
```tsx
<LoopProgressIndicator
  sessionId={executionId}
  nodeId={loopNodeId}
/>
```
Shows complete progress card with all details.

## Integration Points

### Workflow Execution Logs

Loop progress appears in:
1. **Live Execution Panel** - Real-time node status
2. **Execution History** - Completed loop summaries
3. **Admin Debug Panel** - Detailed loop iterations

### Variable Picker

Loop node outputs are available in subsequent nodes:

```
{{Loop.currentItem}}      // Current item
{{Loop.index}}            // Zero-based index
{{Loop.iteration}}        // One-based iteration
{{Loop.totalItems}}       // Total count
{{Loop.isFirst}}          // Boolean
{{Loop.isLast}}           // Boolean
{{Loop.batch}}            // Current batch array
{{Loop.progressPercentage}} // 0-100
{{Loop.remainingItems}}   // Count remaining
```

## Performance Considerations

### Safety Limits

- **Max Iterations**: 100 by default (configurable via node config)
- **Batch Size**: 1-1000 (to prevent memory issues)
- **Timeout**: Standard workflow timeout applies to entire loop

### Best Practices

1. **Use Batch Processing** for large arrays (100+ items)
   - Set `batchSize: 10` or `batchSize: 20`
   - Process groups instead of individual items

2. **Add Delays** for API rate limits
   - Insert Delay node after API calls in loop
   - Prevents hitting provider rate limits

3. **Filter Before Looping** when possible
   - Use Filter node to reduce array size
   - Only loop over items that need processing

4. **Monitor Progress** in long-running workflows
   - Check execution logs
   - View LoopProgressIndicator
   - Set up error notifications

### Example: Rate-Limited Processing

```
┌──────────────────┐
│ Get 1000 Emails  │
└──────────────────┘
        ↓
┌──────────────────┐
│ Filter: Unread   │ → Reduce to 200 emails
└──────────────────┘
        ↓
┌──────────────────┐
│ Loop             │
│ batchSize: 10    │ → 20 iterations
└──────────────────┘
        ↓
┌──────────────────┐
│ Process Batch    │
└──────────────────┘
        ↓
┌──────────────────┐
│ Delay 1 second   │ → Rate limit protection
└──────────────────┘
```

## Error Handling

### Loop Failures

When a loop iteration fails:
1. Loop status → 'failed'
2. Error message stored in `loop_executions.error_message`
3. Workflow execution stops (by default)
4. User notified via execution logs

### Partial Success

To allow partial success (continue on error):
- Wrap loop actions in try-catch (future feature)
- Or use Filter node to validate items first

## Testing

### Manual Testing

1. Create workflow with Loop node
2. Connect to array-producing node (Find Files, Get Records, etc.)
3. Add action after loop that uses `{{Loop.currentItem}}`
4. Run workflow
5. Monitor progress in:
   - Live execution panel
   - Execution logs
   - Loop progress indicator

### Test Checklist

- [ ] Loop processes all items
- [ ] Progress updates in real-time
- [ ] Time estimates are reasonable
- [ ] Batch processing works correctly
- [ ] Error handling stops execution
- [ ] Completed status shows correctly
- [ ] Variable references work (`{{Loop.currentItem}}`)

## Migration

To add loop progress tracking to existing database:

```bash
# Apply migration
supabase db push

# Verify table created
supabase db inspect

# Check RLS policies
supabase db show loop_executions
```

## Future Enhancements

1. **Parallel Loop Processing**
   - Process multiple items simultaneously
   - Configurable concurrency limit
   - Progress for parallel branches

2. **Loop Controls**
   - Break condition (exit early)
   - Continue condition (skip items)
   - Retry failed iterations

3. **Advanced Progress**
   - Per-item timing
   - Throughput metrics (items/sec)
   - Memory usage tracking

4. **Progress Notifications**
   - Send notification at 25%, 50%, 75%, 100%
   - Custom webhook on completion
   - Email digest for long-running loops

## Related Documentation

- [Workflow Execution Guide](/learning/docs/workflow-execution-implementation-guide.md)
- [Variable Resolution](/learning/docs/variable-resolution-guide.md)
- [Dropbox Find Files](/learning/docs/dropbox-find-files.md)
- [Action Implementation](/learning/docs/action-trigger-implementation-guide.md)

## Troubleshooting

### Progress Not Updating

**Problem**: Loop executes but progress indicator shows no updates

**Causes**:
1. Table `loop_executions` doesn't exist → Run migration
2. RLS policies blocking access → Check Supabase auth
3. Realtime not enabled → Enable in Supabase dashboard

**Fix**:
```bash
# Check if table exists
supabase db inspect loop_executions

# Verify RLS policies
SELECT * FROM pg_policies WHERE tablename = 'loop_executions';

# Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE loop_executions;
```

### Loop Not Executing

**Problem**: Loop node shows in workflow but doesn't run

**Causes**:
1. Handler not registered in `actions/registry.ts`
2. Import path incorrect
3. ExecutionContext wrapper missing

**Fix**:
```typescript
// Verify registration in registry.ts
"loop": createExecutionContextWrapper(executeLoop),

// Check import
import { executeLoop } from './logic/loop'
```

### Performance Issues

**Problem**: Loop takes too long or times out

**Solutions**:
1. Reduce array size with Filter node first
2. Increase batch size (10-50 items per batch)
3. Add delay between iterations for rate limits
4. Split into multiple workflows for >1000 items

## Implementation Checklist

When implementing loop support for a new workflow:

- [ ] Migration applied (`loop_executions` table exists)
- [ ] Loop handler registered in `actions/registry.ts`
- [ ] Loop node added to workflow builder palette
- [ ] Output schema defined with all metadata fields
- [ ] Progress indicator component imported where needed
- [ ] Test workflow with 5-10 item array
- [ ] Test workflow with 100+ item array
- [ ] Error handling tested (invalid array, empty array)
- [ ] Variable references tested (`{{Loop.currentItem}}`)
- [ ] Documentation updated

## Summary

Loop progress tracking provides:
- ✅ Real-time iteration updates
- ✅ Time estimates (elapsed, remaining)
- ✅ Visual progress bar
- ✅ Item-by-item or batch processing
- ✅ Rich metadata for downstream nodes
- ✅ Error tracking and reporting

This enables users to confidently process large arrays while monitoring progress and understanding how long operations will take.
