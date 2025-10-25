# AI Workflow Builder Error Fix

## Problem
After implementing batch node creation, the workflow builder was throwing an error and stopping:
```
[STREAM] Auto-approving plan, continuing to build immediately
[ERROR] Stream workflow error: {}
POST /api/ai/stream-workflow 200 in 6751ms
```

## Root Cause
The variable `availableNodes` was defined inside the `else` block of the planning phase, but it was being used later in the code regardless of whether we had an approved plan or not.

**Problematic Code Structure:**
```typescript
if (approvedPlan) {
  plan = approvedPlan
  // availableNodes NOT defined here
} else {
  // availableNodes defined here
  const availableNodes = ALL_NODE_COMPONENTS.map(...)
  // ...
}

// Later in code:
const nodeDef = availableNodes.find(...) // ERROR: availableNodes is undefined when autoApprove=true
```

## Solution
Moved the `availableNodes` definition outside and before the conditional blocks, making it available for both paths:

```typescript
// Get available nodes (needed for both approved plans and new plans)
const availableNodes = ALL_NODE_COMPONENTS.map(node => ({
  type: node.type,
  name: node.name,
  providerId: node.providerId,
  isTrigger: node.isTrigger,
  description: node.description || '',
  category: node.category || 'misc',
  schema: node.schema
}))

// Now both paths can use availableNodes
if (approvedPlan) {
  plan = approvedPlan
  // availableNodes is available here
} else {
  // availableNodes is available here too
}
```

## Impact
This fix ensures that:
1. ✅ Auto-approved workflows (React agent) work correctly
2. ✅ Both manual approval and auto-approval paths have access to node definitions
3. ✅ No undefined reference errors when building workflows
4. ✅ The batch node creation feature works as intended

## Testing
The workflow builder should now:
1. Successfully auto-approve and build workflows from the React agent
2. Create all nodes in batch with pending status
3. Configure each node sequentially without errors
4. Complete the entire workflow building process

## File Modified
- `/app/api/ai/stream-workflow/route.ts` - Lines 61-89