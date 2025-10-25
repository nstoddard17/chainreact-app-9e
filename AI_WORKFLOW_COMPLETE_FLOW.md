# AI Workflow Builder - Complete Flow & Implementation

## Desired User Experience

### 1. Starting Point: `/workflows/ai-agent`
- User types a request like "when I get an email, send it to Slack"
- Clicks send

### 2. Redirect to Workflow Builder
- Creates new workflow
- Redirects to `/workflows/builder/{id}?aiChat=true&initialPrompt={encoded}`

### 3. Workflow Building Process

#### Phase 1: Planning
- Shows "Analyzing your request..."
- AI generates workflow plan
- With `autoApprove: true`, skips approval dialog

#### Phase 2: Batch Node Creation
- Message: "Creating workflow structure..."
- **ALL nodes appear at once**:
  - Dashed gray borders
  - 60% opacity
  - "Pending" badge
  - Collapsed state
- **ALL edges/connections appear**
- Users see complete workflow structure immediately

#### Phase 3: Sequential Configuration
- Progress indicator shows: "Node 1 of 2: New Email Trigger"
- **For each node sequentially**:
  1. **Pending → Preparing** (solid gray border)
  2. **Preparing → Configuring** (blue border)
  3. Fields appear one by one in real-time
  4. **Configuring → Testing** (yellow border) - skipped for triggers
  5. **Testing → Complete** (green border)
- Progress bar fills as nodes complete
- Only active node is expanded and fully opaque

#### Phase 4: Completion
- Message: "Workflow complete! Created 2 nodes"
- All nodes show green borders
- Workflow is ready to use

## Current Issues & Fixes

### Issue 1: Stream Workflow Error
**Problem**: Getting empty error `{}` when auto-approving
**Cause**: The `plan` object structure might be inconsistent
**Fix Applied**: Added validation and logging to check plan structure

### Issue 2: Missing Field Configuration Events
**Problem**: Fields weren't appearing during configuration
**Cause**: `field_configured` event handler missing in initial prompt flow
**Fix Applied**: Added handler in NewWorkflowBuilderContent.tsx

### Issue 3: Double-Click Not Working
**Problem**: Nodes showing `hasOnConfigure: false`
**Cause**: Missing callbacks when nodes created
**Fix Applied**: Added `onConfigure` and `onDelete` to node data

## File Structure & Key Components

### Backend: `/app/api/ai/stream-workflow/route.ts`
```typescript
// Key flow:
1. Receive prompt with autoApprove: true
2. Generate plan using AI
3. Skip approval, send auto_building_plan event
4. Create all nodes with pending status
5. Create all edges
6. For each node:
   - Send configuration_progress
   - Change to preparing
   - Configure fields one by one
   - Test (if not trigger)
   - Mark complete
```

### Frontend: `/components/workflows/NewWorkflowBuilderContent.tsx`
```typescript
// Event handlers:
- creating_all_nodes: Show structure message
- node_created: Add node (pending or active)
- edge_created: Add connection
- configuration_progress: Update progress bar
- node_preparing: Change from pending to active
- field_configured: Add field to node in real-time
- node_complete: Mark node done
```

### Visual States: `/components/workflows/CustomNode.tsx`
```typescript
// Border styles by status:
- 'pending': "border-2 border-dashed border-gray-400 opacity-60"
- 'preparing': "border-2 border-gray-500 shadow-lg"
- 'configuring': "border-2 border-blue-500 shadow-lg"
- 'testing': "border-2 border-yellow-500 shadow-lg"
- 'ready': "border-2 border-green-500 shadow-lg"
```

### Progress Component: `/components/workflows/ai-builder/WorkflowBuildProgress.tsx`
- Shows current node being configured
- Progress bar with percentage
- Visual dots for each node
- Status indicator with color

## Testing Checklist

- [ ] Navigate to `/workflows/ai-agent`
- [ ] Type "when I get an email, send it to Slack"
- [ ] Click send
- [ ] Verify redirect to workflow builder
- [ ] See all nodes appear at once (pending)
- [ ] See edges connect nodes
- [ ] Watch first node configure (fields appear)
- [ ] Watch second node configure after first completes
- [ ] See progress indicator update throughout
- [ ] Verify all nodes turn green when complete

## Debug Points

1. **Check plan structure**: Console should show plan with nodes array
2. **Verify events flow**: Look for [STREAM] and [INITIAL_PROMPT] logs
3. **Watch field configuration**: Should see field_configured events
4. **Monitor progress**: configuration_progress events update UI

## Next Steps if Still Broken

1. Check if plan.nodes exists and is array
2. Verify autoApprove parameter is being passed
3. Ensure all event handlers are connected
4. Check that nodes have proper callbacks
5. Verify progress state is updating