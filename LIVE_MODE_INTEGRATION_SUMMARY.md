# Live Test Mode Integration Summary

## ✅ What's Been Implemented

### 1. Enhanced `useWorkflowExecution` Hook
**File**: `/hooks/workflows/useWorkflowExecution.ts`

**New State Variables**:
- `isListeningForWebhook` - True when waiting for webhook to trigger
- `webhookTriggerType` - Type of trigger being listened for (e.g., "gmail_trigger_new_email")
- `usingTestData` - True if Skip button was clicked (using test data instead of real webhook)
- `testDataNodes` - Set of node IDs that used test data
- `sessionId` - Current test session ID
- `pollIntervalId` - Interval ID for polling webhook status

**New Functions**:
- `startWebhookListening(nodes)` - Starts listening for webhook events
- `stopWebhookListening()` - Stops listening and cleans up
- `skipToTestData(nodes, edges)` - Skips webhook wait and uses test data
- `monitorExecution(executionId, nodes)` - Monitors live execution progress with real-time node status updates

**Modified Functions**:
- `handleExecuteLive(nodes, edges)` - Now starts webhook listening instead of immediate execution

### 2. Execution Status Panel Component
**File**: `/components/workflows/ExecutionStatusPanel.tsx`

**Features**:
- Shows at bottom of screen when listening or executing
- Displays "Listening for [trigger type]..." with animated pulse
- Shows "Skip to Test Data" button during listening
- Shows execution progress with progress bar during execution
- Displays current node being executed
- Shows completed/failed node counts
- Includes "Stop Listening" and "Close" buttons

### 3. Node Highlighting Infrastructure
**Existing in CustomNode**:
- Already has `executionStatus` prop (pending/running/completed/error)
- Already has `isActiveExecution` prop for highlighting current node
- Ready to receive execution state from workflow builder

### 4. Backend API Endpoints (Already Created)
- `POST /api/workflows/[id]/test-session` - Start test session
- `GET /api/workflows/[id]/test-session` - Get session status
- `DELETE /api/workflows/[id]/test-session` - Stop session
- `GET /api/workflows/[id]/execution-status/[executionId]` - Get execution progress

## 📝 Integration Steps Required

### Step 1: Add ExecutionStatusPanel to CollaborativeWorkflowBuilder

**Location**: Find the return statement in `CollaborativeWorkflowBuilder.tsx`

**Add** at the bottom of the returned JSX (before the closing tag):

```typescript
{/* Execution Status Panel */}
<ExecutionStatusPanel
  isListening={isListeningForWebhook}
  isExecuting={isExecuting}
  webhookTriggerType={webhookTriggerType}
  usingTestData={usingTestData}
  testDataNodes={testDataNodes}
  nodeStatuses={nodeStatuses}
  nodes={nodes}
  edges={edges}
  onSkip={(nodes, edges) => skipToTestData(nodes, edges)}
  onStop={stopWebhookListening}
/>
```

**Import** at the top:
```typescript
import { ExecutionStatusPanel } from './ExecutionStatusPanel'
```

### Step 2: Pass Execution Status to Nodes

**Find** where nodes are mapped to include `data` props (search for where nodes get `onConfigure`, `onDelete`, etc.)

**Add** these props to each node's data:
```typescript
executionStatus: nodeStatuses[node.id] || null,
isActiveExecution: activeExecutionNodeId === node.id,
```

### Step 3: Connect Webhook Listening State

The `useWorkflowBuilder` hook already destructures from `executionHook`, so these should already be available:

**Verify** these are included in the destructured values around line 100:
```typescript
isListeningForWebhook,
webhookTriggerType,
usingTestData,
testDataNodes,
nodeStatuses,
stopWebhookListening,
skipToTestData,
```

**If not present**, add them to the destructuring from `useWorkflowBuilder`.

### Step 4: Update Toolbar to Use New Live Test Mode

The `handleExecuteLive` function is already being passed to WorkflowToolbar. It now automatically:
1. Checks if trigger is webhook-based
2. If yes → starts listening (Option A)
3. If no → executes immediately (Option B)

No changes needed! Just works.

## 🎯 How It Works

### User Flow

1. **User clicks "Live Mode" in Test dropdown**
   → `handleExecuteLive` is called

2. **If webhook-based trigger detected**:
   - Registers webhook with external service
   - Shows ExecutionStatusPanel at bottom: "Listening for gmail trigger..."
   - Polls every 1 second for webhook arrival

3. **User has two options**:

   **Option A: Wait for Real Webhook**
   - User sends test email / creates Airtable record / etc.
   - Webhook arrives, triggers workflow
   - Panel switches to: "Webhook received! Executing with real data..."
   - Nodes highlight as they execute (purple = running, green = completed, red = failed)
   - Progress bar shows completion percentage

   **Option B: Skip to Test Data**
   - User clicks "Skip to Test Data" button
   - Panel shows: "Using test data"
   - Workflow executes immediately with test trigger data
   - Trigger node marked as using test data
   - Same node highlighting during execution

4. **During execution**:
   - Current node highlighted with purple ring
   - Completed nodes show green checkmark
   - Failed nodes show red X
   - Progress bar updates in real-time
   - Panel shows: "Executing: Send Email" (current action name)

5. **After completion**:
   - Panel shows success/failure status
   - Node highlights persist for 5 seconds
   - User can click "Close" to dismiss panel

### Technical Flow

```
Click "Live Mode"
    ↓
handleExecuteLive(nodes, edges)
    ↓
startWebhookListening(nodes)
    ↓
Check if webhook-based trigger
    ↓
┌─────────────────────┬─────────────────────┐
│  Yes (Gmail, etc.)  │   No (Schedule,etc.)│
└─────────┬───────────┴──────────┬──────────┘
          ↓                      ↓
    Register webhook       Execute immediately
          ↓                    (Option B)
  Start polling
   (1sec interval)
          ↓
┌─────────┴─────────┐
│  Webhook arrives  │ or User clicks "Skip"
└────────┬──────────┘
         ↓
  stopWebhookListening()
         ↓
  Start execution
         ↓
  monitorExecution()
  (poll every 1sec)
         ↓
  Update nodeStatuses
  {nodeId: 'running'/'completed'/'error'}
         ↓
  Nodes receive updated
  executionStatus prop
         ↓
  CustomNode highlights
  based on status
         ↓
  Execution completes
         ↓
  Show success/failure
         ↓
  Reset after 5 seconds
```

## 🔍 Testing Checklist

### Webhook Listening
- [ ] Click "Live Mode" with Gmail trigger
- [ ] Panel shows "Listening for gmail trigger new email..."
- [ ] Animated pulse indicator visible
- [ ] "Skip to Test Data" button present
- [ ] "Stop Listening" button present

### Skip to Test Data
- [ ] Click "Skip to Test Data" button
- [ ] Panel switches to execution mode
- [ ] "Using Test Data" badge visible
- [ ] Workflow executes immediately
- [ ] Nodes highlight during execution

### Real Webhook Trigger
- [ ] Send test email while listening
- [ ] Panel shows "Webhook received!"
- [ ] Workflow starts executing
- [ ] No "Using Test Data" badge
- [ ] Nodes highlight during execution

### Node Highlighting
- [ ] Current node shows purple ring/border
- [ ] Completed nodes show green checkmark
- [ ] Failed nodes show red X
- [ ] Highlights persist for 5 seconds after completion

### Progress Tracking
- [ ] Progress bar updates correctly
- [ ] Node counts update (X / Y nodes)
- [ ] Current action name shown
- [ ] Percentage matches actual progress

### Cleanup
- [ ] Stop button stops listening
- [ ] Polling stops when stopped
- [ ] Session cleaned up in database
- [ ] No memory leaks from intervals

## 🐛 Debugging

### If listening doesn't start:
1. Check browser console for errors
2. Verify workflow is saved
3. Check if trigger type is in `webhookTriggers` array
4. Verify `/api/workflows/[id]/test-session` endpoint works

### If nodes don't highlight:
1. Verify `executionStatus` prop is passed to CustomNode
2. Check `nodeStatuses` object in console
3. Verify `monitorExecution` is being called
4. Check if polling is actually running (network tab)

### If skip doesn't work:
1. Check if `handleExecute` is being called
2. Verify nodes and edges are passed correctly
3. Check for execution errors in console

## 📦 Files Modified

1. `/hooks/workflows/useWorkflowExecution.ts` - ✅ Complete
2. `/components/workflows/ExecutionStatusPanel.tsx` - ✅ Complete
3. `/app/api/workflows/[id]/test-session/route.ts` - ✅ Complete
4. `/app/api/workflows/[id]/execution-status/[executionId]/route.ts` - ✅ Complete
5. `/lib/execution/executionProgressTracker.ts` - ✅ Complete
6. `/lib/services/workflowExecutionService.ts` - ✅ Complete
7. `/components/workflows/CollaborativeWorkflowBuilder.tsx` - ⏳ Needs integration (Steps 1-3 above)

## 🚀 Ready to Test!

Once the integration steps above are completed, the feature is ready for end-to-end testing. The heavy lifting is done - just need to wire it into the UI!
