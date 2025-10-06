# Live Test Mode Implementation Guide

## Overview
This document outlines the implementation of the "Test in Live Mode" feature that allows users to test workflows with real webhook triggers and see live execution progress.

## Completed Backend Components

### 1. Database Tables (Migration Required)
**File**: `/supabase/migrations/20251005130921_add_live_test_mode_tables.sql`

**Tables Created**:
- `workflow_test_sessions` - Tracks active test sessions
- `execution_progress` - Stores real-time execution progress

**To Apply Migration**:
```sql
-- Run this in Supabase SQL Editor
-- Copy and paste the contents of the migration file
```

### 2. API Endpoints

#### Test Session Management
**File**: `/app/api/workflows/[id]/test-session/route.ts`

**Endpoints**:
- `POST /api/workflows/[id]/test-session` - Start live test (registers webhook)
- `GET /api/workflows/[id]/test-session` - Get current session status
- `DELETE /api/workflows/[id]/test-session` - Stop live test

#### Execution Status Polling
**File**: `/app/api/workflows/[id]/execution-status/[executionId]/route.ts`

**Endpoint**:
- `GET /api/workflows/[id]/execution-status/[executionId]` - Get real-time execution progress

### 3. Execution Tracking
**File**: `/lib/execution/executionProgressTracker.ts`

**Class**: `ExecutionProgressTracker`
- Initializes progress tracking for executions
- Updates progress as nodes execute
- Tracks completed/failed nodes
- Calculates progress percentage

**Integration**: Already integrated into `WorkflowExecutionService` (lines 139-140, 195-226, 237-238)

## Completed Frontend Components

### 1. Live Test Mode Hook
**File**: `/hooks/workflows/useLiveTestMode.ts`

**Hook**: `useLiveTestMode(workflowId: string)`

**Features**:
- Manages live test state (idle, listening, executing, completed, failed)
- Polls for session status (checks if webhook triggered)
- Polls for execution progress (real-time node execution)
- Auto-cleanup on unmount

**Usage**:
```typescript
const {
  status,
  session,
  progress,
  error,
  startLiveTest,
  stopLiveTest,
  isActive,
  isListening,
  isExecuting
} = useLiveTestMode(workflowId)
```

### 2. Live Test Banner Component
**File**: `/components/workflows/LiveTestModeBanner.tsx`

**Component**: `LiveTestModeBanner`

**Features**:
- Shows listening state with animated pulse
- Shows execution progress with spinner and progress bar
- Displays elapsed time
- Shows completed/failed status
- Stop/Dismiss button

## Integration Points for CollaborativeWorkflowBuilder

### Step 1: Import Required Components
Add to imports in `CollaborativeWorkflowBuilder.tsx`:

```typescript
import { useLiveTestMode } from '@/hooks/workflows/useLiveTestMode'
import { LiveTestModeBanner } from './LiveTestModeBanner'
import { Radio } from 'lucide-react' // Icon for live test button
```

### Step 2: Initialize Live Test Hook
Add inside the component (after other hooks):

```typescript
const liveTest = useLiveTestMode(currentWorkflow?.id || '')
```

### Step 3: Add Live Test Button
Find the toolbar section (where Save/Test buttons are) and add:

```typescript
<button
  onClick={() => liveTest.startLiveTest()}
  disabled={liveTest.isActive || !currentWorkflow?.id}
  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
>
  {liveTest.isListening ? (
    <>
      <div className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-300 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
      </div>
      <span>Listening...</span>
    </>
  ) : (
    <>
      <Radio className="h-4 w-4" />
      <span>Test in Live Mode</span>
    </>
  )}
</button>
```

### Step 4: Add Live Test Banner
Add at the top of the return statement (before the main content):

```typescript
return (
  <>
    <LiveTestModeBanner
      status={liveTest.status}
      progress={liveTest.progress}
      onStop={liveTest.stopLiveTest}
      triggerType={liveTest.session?.triggerType}
    />

    {/* Rest of the component */}
    <div className="...">
      {/* Existing content */}
    </div>
  </>
)
```

### Step 5: Add Node Highlighting for Live Execution
Find where nodes are rendered in the ReactFlow component and add this logic:

```typescript
// In the node rendering section, add this className logic
const getNodeClassName = (nodeId: string) => {
  const baseClass = "..." // existing classes

  // Add live execution highlighting
  if (liveTest.isExecuting && liveTest.progress) {
    if (liveTest.progress.currentNodeId === nodeId) {
      return `${baseClass} ring-2 ring-purple-500 ring-offset-2 ring-offset-gray-900`
    }
    if (liveTest.progress.completedNodes.includes(nodeId)) {
      return `${baseClass} ring-2 ring-green-500`
    }
    if (liveTest.progress.failedNodes.some(f => f.nodeId === nodeId)) {
      return `${baseClass} ring-2 ring-red-500`
    }
  }

  return baseClass
}
```

### Step 6: Add Node Status Indicators
Add overlay indicators to show execution status:

```typescript
// Inside each node, add status indicator
{liveTest.isExecuting && liveTest.progress && (
  <>
    {/* Currently executing */}
    {liveTest.progress.currentNodeId === node.id && (
      <div className="absolute -top-1 -right-1 w-3 h-3">
        <div className="animate-spin rounded-full h-3 w-3 border-2 border-purple-500 border-t-transparent" />
      </div>
    )}

    {/* Completed */}
    {liveTest.progress.completedNodes.includes(node.id) && (
      <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </div>
    )}

    {/* Failed */}
    {liveTest.progress.failedNodes.some(f => f.nodeId === node.id) && (
      <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    )}
  </>
)}
```

## How It Works

### User Flow
1. **User clicks "Test in Live Mode"**
   - API registers/ensures webhook is active
   - Test session created in database
   - UI shows "Listening for webhook..." banner
   - Frontend polls session status every 1 second

2. **Webhook event arrives**
   - Webhook triggers workflow execution
   - Session status changes to "executing"
   - Execution ID linked to test session
   - Frontend switches from session polling to execution polling

3. **Workflow executes**
   - Progress tracker updates as each node executes
   - Current node highlighted in purple with spinner
   - Completed nodes show green checkmark
   - Failed nodes show red X
   - Progress bar updates in banner

4. **Execution completes**
   - Banner shows success/failure status
   - All nodes show final state
   - Polling stops
   - User can dismiss banner

5. **User stops test**
   - Test session marked as stopped
   - Polling stops
   - Banner disappears

### Technical Flow
```
Start Live Test
    ↓
POST /api/workflows/[id]/test-session
    ↓
Register/Check Webhook (TriggerLifecycleManager)
    ↓
Create Test Session Record
    ↓
Return Session ID
    ↓
Frontend Polls GET /api/workflows/[id]/test-session (1s interval)
    ↓
Webhook Event Arrives → Triggers Workflow
    ↓
WorkflowExecutionService starts
    ↓
ExecutionProgressTracker.initialize()
    ↓
Links execution_id to test_session
    ↓
Frontend Detects execution_id in session
    ↓
Switches to Execution Polling
    ↓
GET /api/workflows/[id]/execution-status/[executionId] (1s interval)
    ↓
ExecutionProgressTracker.update() (for each node)
    ↓
Frontend Shows Live Progress
    ↓
ExecutionProgressTracker.complete()
    ↓
Frontend Shows Final Status
```

## Supported Trigger Types
- `gmail_trigger_new_email`
- `airtable_trigger_new_record`
- `airtable_trigger_record_updated`
- `github_trigger_new_issue`
- `github_trigger_pr_updated`
- `slack_trigger_new_message`
- `discord_trigger_new_message`
- `notion_trigger_page_updated`
- `trello_trigger_card_moved`

## Testing Checklist

### Backend
- [ ] Migration applied successfully
- [ ] Test session endpoints return correct data
- [ ] Execution status endpoint shows progress
- [ ] Progress tracker initializes correctly
- [ ] Progress updates as nodes execute
- [ ] Webhook registration works

### Frontend
- [ ] Live test button appears in toolbar
- [ ] Button starts test session
- [ ] Banner shows listening state
- [ ] Banner shows execution state when triggered
- [ ] Nodes highlight during execution
- [ ] Progress bar updates correctly
- [ ] Completed nodes show checkmark
- [ ] Failed nodes show error icon
- [ ] Stop button stops test
- [ ] Polling cleanup on unmount

### End-to-End
- [ ] Gmail trigger: Send email → workflow executes with live visualization
- [ ] Airtable trigger: Create record → workflow executes with live visualization
- [ ] Can stop test while listening
- [ ] Can dismiss banner after completion
- [ ] Multiple concurrent tests work correctly
- [ ] Session expires after 30 minutes

## Next Steps

1. **Apply Database Migration**
   - Copy SQL from migration file to Supabase SQL Editor
   - Run migration
   - Verify tables created with proper RLS policies

2. **Integrate into CollaborativeWorkflowBuilder**
   - Follow integration points above
   - Add button to toolbar
   - Add banner component
   - Add node highlighting logic

3. **Test with Real Webhook**
   - Create workflow with Gmail trigger
   - Click "Test in Live Mode"
   - Send test email
   - Verify live execution visualization

4. **Polish UX**
   - Add loading states
   - Add error handling
   - Add tooltips
   - Consider adding sound/notification when webhook arrives
   - Add execution log panel showing real-time logs

## Known Limitations

1. **Polling Overhead**: Current implementation polls every 1 second. Consider WebSocket for production.
2. **30-Minute Timeout**: Test sessions expire after 30 minutes of listening.
3. **No Multi-User Coordination**: If multiple users test same workflow, sessions are independent.
4. **Progress Tracking**: Only tracks top-level nodes, not nested workflows or AI agent chains.

## Future Enhancements

1. **WebSocket Support**: Replace polling with WebSocket for real-time updates
2. **Execution Logs**: Show real-time console logs in UI
3. **Breakpoints**: Allow pausing execution at specific nodes
4. **Step-Through**: Execute one node at a time
5. **Variable Inspector**: Show variable values during execution
6. **Replay Mode**: Replay executions with same data
7. **Test Data Generator**: Generate sample webhook payloads for testing
