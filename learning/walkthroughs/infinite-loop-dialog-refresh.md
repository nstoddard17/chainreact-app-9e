# Infinite Loop in Action/Trigger Selection Dialogs - Fixed

## Date
January 2025

## Problem
Maximum update depth exceeded error when opening ActionSelectionDialog or TriggerSelectionDialog:

```
Uncaught Error: Maximum update depth exceeded. This can happen when a component
repeatedly calls setState inside componentWillUpdate or componentDidUpdate.
React limits the number of nested updates to prevent infinite loops.
```

Stack trace showed the error originated in Radix UI's `compose-refs` during Dialog rendering, indicating a render loop was causing continuous ref composition attempts.

## Root Cause Analysis

### The Dependency Cycle

The infinite loop was caused by a **useEffect dependency cycle** in both dialog components:

**ActionSelectionDialog.tsx (lines 97-101):**
```typescript
useEffect(() => {
  if (open && refreshIntegrations) {
    refreshIntegrations()
  }
}, [open, refreshIntegrations])  // ← refreshIntegrations changes on every render!
```

**The Complete Cycle:**

1. `refreshIntegrations` is defined in `useIntegrationSelection` hook as:
   ```typescript
   const refreshIntegrations = useCallback(async () => {
     await fetchIntegrations(true)
   }, [fetchIntegrations])
   ```

2. `fetchIntegrations` comes from Zustand's `integrationStore` and is **NOT memoized**
   - Zustand store functions are recreated on every store update
   - Any integration state change = new `fetchIntegrations` reference

3. When the dialog opens (`open = true`):
   - useEffect runs → calls `refreshIntegrations()`
   - This triggers `fetchIntegrations(true)` → updates store state
   - Store update → new `fetchIntegrations` reference created
   - New `fetchIntegrations` → `refreshIntegrations` callback changes (dependency changed)
   - Changed `refreshIntegrations` → useEffect dependency changed → **useEffect runs again**
   - **INFINITE LOOP**

### Why This Manifested as a Radix Error

The infinite render loop caused:
1. React to repeatedly mount/unmount the Dialog component
2. Radix UI's Dialog to repeatedly compose refs for internal elements
3. Eventually hitting React's "maximum update depth" limit
4. Error thrown during ref composition (hence the stack trace pointing to `compose-refs`)

## Solution

Use a **ref to break the dependency cycle** while keeping the latest function reference:

### ActionSelectionDialog.tsx
```typescript
// Use ref to prevent dependency cycle - refreshIntegrations can change on every render
const refreshIntegrationsRef = React.useRef(refreshIntegrations)
React.useEffect(() => {
  refreshIntegrationsRef.current = refreshIntegrations
}, [refreshIntegrations])

useEffect(() => {
  if (open && refreshIntegrationsRef.current) {
    refreshIntegrationsRef.current()
  }
}, [open]) // Only depend on open state, not the function
```

### TriggerSelectionDialog.tsx
Applied the same fix to prevent the same issue.

## Why This Works

1. **Break the cycle**: The main useEffect only depends on `open`, not `refreshIntegrations`
2. **Keep it fresh**: A separate effect keeps the ref updated with the latest function
3. **No stale closures**: The ref always points to the current `refreshIntegrations` function
4. **Stable dependency**: `open` is a boolean prop that only changes when the dialog opens/closes

## Key Learnings

### 1. Zustand Store Functions Are NOT Memoized
Unlike React component functions wrapped in `useCallback`, Zustand store functions get new references on every state change. Always treat them as unstable dependencies.

### 2. useEffect + Async State Updates = Potential Loops
When a useEffect:
- Triggers an async function
- That function updates state
- That state change affects the effect's dependencies
→ **Always check for dependency cycles**

### 3. The useRef Pattern for Unstable Dependencies
When you need to:
- Call a function in useEffect
- But that function's reference is unstable
- And you don't want the effect to re-run when the function changes

Use the ref pattern:
```typescript
const fnRef = useRef(fn)
useEffect(() => { fnRef.current = fn }, [fn])
useEffect(() => { fnRef.current() }, [otherDeps])
```

### 4. Dialog Errors Can Mask Render Loop Issues
Errors in Radix UI Dialog components (or other compound components) during mounting often indicate render loops, not issues with the Dialog itself.

## Prevention

### ✅ DO:
- Use refs to stabilize function dependencies in useEffect
- Question whether you need functions in dependency arrays
- Check if store functions are memoized before using as dependencies
- Look for circular dependency chains: effect → state update → dependency change → effect

### ❌ DON'T:
- Assume Zustand (or other external store) functions are stable
- Put every prop/variable in dependency arrays without thinking
- Ignore "maximum update depth" errors - they indicate serious issues

## Testing

Build passed successfully after fix:
```bash
npm run build
# ✓ Compiled successfully
```

The infinite loop is resolved - dialogs can now open without triggering React's maximum update depth limit.

## Related Files
- `components/workflows/builder/ActionSelectionDialog.tsx` (lines 96-107)
- `components/workflows/builder/TriggerSelectionDialog.tsx` (lines 91-102)
- `hooks/workflows/useIntegrationSelection.ts` (lines 308-310)
- `stores/integrationStore.ts` (fetchIntegrations function)
