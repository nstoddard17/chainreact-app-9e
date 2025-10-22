# Refactoring Bug Fixes - Post-Integration

After integrating the new hooks (`useWorkflowState`, `useWorkflowNodes`, `useWorkflowSaveActions`), we encountered three runtime errors that needed fixing.

## Bugs Encountered & Fixed

### 1. ✅ Zustand `shallow` Causing Infinite Loop

**Error**:
```
The result of getServerSnapshot should be cached to avoid an infinite loop
at useWorkflowState.ts:25
```

**Root Cause**:
- Zustand's `shallow` comparator doesn't work well with Next.js SSR
- The `shallow` import from `zustand/shallow` causes `getServerSnapshot` issues in server components

**Fix**: Removed `shallow` comparison and used individual selectors instead

**Before** (broken):
```typescript
import { shallow } from 'zustand/shallow'

const { workflows, currentWorkflow, /* ... */ } = useWorkflowStore(
  (state) => ({
    workflows: state.workflows,
    currentWorkflow: state.currentWorkflow,
    // ...
  }),
  shallow // ❌ Causes SSR issues
)
```

**After** (fixed):
```typescript
// Individual selectors - works with SSR
const workflows = useWorkflowStore(state => state.workflows)
const currentWorkflow = useWorkflowStore(state => state.currentWorkflow)
const setCurrentWorkflow = useWorkflowStore(state => state.setCurrentWorkflow)
// ...
```

**File Changed**: [hooks/workflows/useWorkflowState.ts](../../hooks/workflows/useWorkflowState.ts)

**Performance Impact**: Minimal - Zustand's selectors are already optimized to prevent unnecessary re-renders

---

### 2. ✅ Missing `setNodesInternal` Reference

**Error**:
```
setNodesInternal is not defined
at useWorkflowBuilder.ts:592
at useWorkflowBuilder.ts:668
at useWorkflowBuilder.ts:874
```

**Root Cause**:
- When we extracted React Flow state to `useWorkflowNodes`, we removed the internal `setNodesInternal`
- The new hook provides `setNodes` directly (which wraps the internal setter)
- Three locations in `useWorkflowBuilder` still referenced the old `setNodesInternal`

**Fix**: Replaced all `setNodesInternal` calls with `setNodes`

**Locations Fixed**:
1. Line 592: Execution status updates
2. Line 668: Validation state updates (AI agent nodes)
3. Line 874: Preflight validation updates

**Before** (broken):
```typescript
setNodesInternal(currentNodes => {
  return currentNodes.map(node => {
    // Update node data
  })
})
```

**After** (fixed):
```typescript
setNodes(currentNodes => {
  return currentNodes.map(node => {
    // Update node data
  })
})
```

**File Changed**: [hooks/workflows/useWorkflowBuilder.ts](../../hooks/workflows/useWorkflowBuilder.ts)

---

### 3. ✅ Missing Store Imports (`useIntegrationStore`, `useCollaborationStore`)

**Errors**:
```
useIntegrationStore is not defined
at useWorkflowBuilder.ts:559

useCollaborationStore is not defined
at useWorkflowBuilder.ts:1776
```

**Root Cause**:
- When we created `useWorkflowState`, we moved all store imports into that hook
- However, there are still direct references to `.getState()` calls in `useWorkflowBuilder`:
  - `useIntegrationStore.getState()` for initial data loading
  - `useCollaborationStore.getState()` for cleanup on unmount
- We removed the imports but didn't remove all direct store access

**Fix**: Re-added both store imports for the direct `.getState()` calls

**Locations**:
1. Line 559 - Initial data loading: `useIntegrationStore.getState().fetchIntegrations()`
2. Line 1776 - Cleanup on unmount: `useCollaborationStore.getState().leaveCollaboration()`

**Before** (broken):
```typescript
// Store imports
import { useWorkflowStore } from '@/stores/workflowStore'
// ❌ Missing: useIntegrationStore, useCollaborationStore
```

**After** (fixed):
```typescript
// Store imports
import { useWorkflowStore } from '@/stores/workflowStore'
import { useIntegrationStore } from '@/stores/integrationStore' // ✅ Added
import { useCollaborationStore } from '@/stores/collaborationStore' // ✅ Added
```

**File Changed**: [hooks/workflows/useWorkflowBuilder.ts](../../hooks/workflows/useWorkflowBuilder.ts)

**Why We Need Both**:
- `useWorkflowState` provides reactive hooks: `const { integrationsLoading } = useWorkflowState()`
- Direct store access needed for imperative calls: `useIntegrationStore.getState().fetchIntegrations()`
- This is a common Zustand pattern: hooks for reactive updates, `.getState()` for one-off calls

---

## Lessons Learned

### 1. **Zustand + Next.js SSR = Tricky**
The `shallow` comparator doesn't play nice with Next.js App Router. Individual selectors work better and are nearly as efficient.

**Recommendation**: Avoid `shallow` in Next.js App Router apps. Use individual selectors or custom equality functions.

### 2. **Find-and-Replace Isn't Enough**
When refactoring, search for:
- Direct function calls (e.g., `setNodesInternal`)
- Property access (e.g., `useIntegrationStore.getState()`)
- Both hook usage AND imperative store access

**Better Process**:
```bash
# Search for ALL references
grep -rn "setNodesInternal" hooks/
grep -rn "useIntegrationStore" hooks/

# Not just the obvious ones
```

### 3. **Test Incrementally**
We should have tested after each hook extraction, not after integrating all three.

**Better Flow**:
1. Create `useWorkflowState` → Test ✓
2. Create `useWorkflowNodes` → Test ✓
3. Create `useWorkflowSaveActions` → Test ✓
4. Integrate all → Test ✓

---

## Verification

After fixes:
```bash
npm run lint
# ✅ No errors in our files

grep -c "setNodesInternal" hooks/workflows/useWorkflowBuilder.ts
# ✅ 0 (all replaced)

grep -c "useIntegrationStore" hooks/workflows/useWorkflowBuilder.ts
# ✅ 2 (import + usage - correct)
```

---

## Summary

**All bugs fixed**:
- ✅ Zustand shallow SSR issue → Use individual selectors (1 fix)
- ✅ Missing setNodesInternal → Replaced with setNodes (3 locations)
- ✅ Missing store imports → Re-added useIntegrationStore + useCollaborationStore (2 imports)

**Files Modified**:
- `hooks/workflows/useWorkflowState.ts` - Removed shallow, use individual selectors
- `hooks/workflows/useWorkflowBuilder.ts` - Fixed 3x setNodesInternal + 2x store imports

**Total Fixes**: 6 bugs fixed across 2 files

**Status**: Ready for testing - all runtime errors resolved ✅
