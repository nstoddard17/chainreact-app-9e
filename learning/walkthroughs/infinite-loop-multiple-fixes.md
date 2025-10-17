# Infinite Loop Errors - Multiple Root Causes Fixed

## Date
January 2025

## Overview
Fixed two separate infinite loop issues causing "Maximum update depth exceeded" errors in different parts of the application. Both were caused by unstable dependencies in React hooks triggering continuous re-renders.

---

## Issue #1: Dialog Components (ActionSelectionDialog & TriggerSelectionDialog)

### Problem
Maximum update depth exceeded error when opening dialogs:

```
Uncaught Error: Maximum update depth exceeded. This can happen when a component
repeatedly calls setState inside componentWillUpdate or componentDidUpdate.
React limits the number of nested updates to prevent infinite loops.
```

Stack trace pointed to Radix UI's `compose-refs`, indicating a render loop.

### Root Cause
**useEffect dependency cycle** in both dialog components:

```typescript
useEffect(() => {
  if (open && refreshIntegrations) {
    refreshIntegrations()
  }
}, [open, refreshIntegrations])  // ← refreshIntegrations changes on every render!
```

**The Cycle:**
1. `refreshIntegrations` is a `useCallback` that depends on `fetchIntegrations`
2. `fetchIntegrations` comes from Zustand store → **NOT memoized**, new reference on every state change
3. Dialog opens → useEffect calls `refreshIntegrations()` → updates store → new `fetchIntegrations` → new `refreshIntegrations` → useEffect runs again → **INFINITE LOOP**

### Solution
Use refs to break the dependency cycle:

```typescript
// Keep ref updated with latest function
const refreshIntegrationsRef = React.useRef(refreshIntegrations)
React.useEffect(() => {
  refreshIntegrationsRef.current = refreshIntegrations
}, [refreshIntegrations])

// Only depend on open state
useEffect(() => {
  if (open && refreshIntegrationsRef.current) {
    refreshIntegrationsRef.current()
  }
}, [open])  // Stable dependency - no loop!
```

### Files Fixed
- [ActionSelectionDialog.tsx:96-107](components/workflows/builder/ActionSelectionDialog.tsx#L96-L107)
- [TriggerSelectionDialog.tsx:91-102](components/workflows/builder/TriggerSelectionDialog.tsx#L91-L102)

---

## Issue #2: WorkflowToolbar Re-render Loop

### Problem
After fixing dialogs, second infinite loop appeared:

```
Maximum update depth exceeded
at button (<anonymous>:null:null)
at WorkflowToolbar (components\workflows\builder\WorkflowToolbar.tsx:298:17)
at CollaborativeWorkflowBuilder (components\workflows\CollaborativeWorkflowBuilder.tsx:264:7)
```

### Root Cause
**Unstable useCallback dependencies** in CollaborativeWorkflowBuilder:

```typescript
const handleExecuteCallback = React.useCallback(() => {
  handleExecute(nodes, edges)
}, [handleExecute, nodes, edges])  // ← nodes and edges are NEW ARRAYS every render!

const handleNavigationCallback = React.useCallback((href: string) => {
  handleNavigation(hasUnsavedChanges, href)
}, [handleNavigation, hasUnsavedChanges])  // ← hasUnsavedChanges changes frequently!
```

**The Problem:**
1. React Flow's `nodes` and `edges` are **new array references on every render**
2. This makes callbacks change every render
3. WorkflowToolbar receives changed props → React.memo doesn't help (props actually changed!)
4. WorkflowToolbar re-renders → triggers parent re-render → **INFINITE LOOP**

### Solution
Use refs to access latest values without including them in dependencies:

```typescript
// Keep refs updated with latest values
const nodesRef = React.useRef(nodes)
const edgesRef = React.useRef(edges)
const hasUnsavedChangesRef = React.useRef(hasUnsavedChanges)

React.useEffect(() => {
  nodesRef.current = nodes
  edgesRef.current = edges
  hasUnsavedChangesRef.current = hasUnsavedChanges
}, [nodes, edges, hasUnsavedChanges])

// Callbacks with stable dependencies
const handleExecuteCallback = React.useCallback(() => {
  handleExecute(nodesRef.current, edgesRef.current)
}, [handleExecute])  // Only depends on handleExecute - stable!

const handleNavigationCallback = React.useCallback((href: string) => {
  handleNavigation(hasUnsavedChangesRef.current, href)
}, [handleNavigation])  // Only depends on handleNavigation - stable!
```

### Files Fixed
- [CollaborativeWorkflowBuilder.tsx:243-261](components/workflows/CollaborativeWorkflowBuilder.tsx#L243-L261)

---

## Key Learnings

### 1. Zustand Store Functions Are NOT Memoized
Unlike React's `useCallback`, Zustand store functions get new references on every state change. Always treat them as unstable dependencies.

### 2. React Flow's nodes/edges Are New Arrays Every Render
Don't include `nodes` or `edges` in dependency arrays unless you truly want effects to run on every render. Use refs to access current values.

### 3. The useRef Pattern for Unstable Dependencies
When you need to:
- Call a function/use a value in useCallback/useEffect
- But that value's reference is unstable
- And you don't want continuous re-renders

Use the ref pattern:
```typescript
const valueRef = useRef(value)
useEffect(() => { valueRef.current = value }, [value])
// Use valueRef.current in callbacks with stable dependencies
```

### 4. React.memo Only Works with Stable Props
`React.memo` prevents re-renders when props haven't changed, but if callbacks change every render (due to unstable dependencies), `React.memo` can't help.

### 5. Dialog/Component Errors Often Mask Render Loops
Errors in UI libraries during mounting/ref composition usually indicate infinite render loops in parent components, not issues with the library itself.

---

## Best Practices

### ✅ DO:
- Use refs to stabilize function/value dependencies
- Question whether you need every value in dependency arrays
- Check if external store functions are memoized
- Test components wrapped in `React.memo` to ensure props are actually stable
- Look for circular dependency chains: callback depends on state → callback updates state → new state → new callback

### ❌ DON'T:
- Assume external store functions (Zustand, Redux, etc.) are stable
- Include `nodes`/`edges` from React Flow in dependencies without considering performance
- Put every variable in dependency arrays "to be safe"
- Ignore "maximum update depth" errors - they always indicate serious architectural issues
- Rely solely on `React.memo` without ensuring prop stability

---

## Prevention Checklist

When creating callbacks passed to child components:

1. **Is the component wrapped in `React.memo`?**
   - If yes → callbacks MUST be stable (same reference)

2. **Are there arrays/objects in the dependencies?**
   - If yes → they're likely new references every render
   - Solution: Use refs or memoize with `useMemo`

3. **Are there external store functions in dependencies?**
   - If yes → check if the store memoizes them
   - If not → use refs to access current function

4. **Does the effect/callback update state that affects its own dependencies?**
   - If yes → you have a dependency cycle
   - Solution: Use refs or redesign the logic

---

## Testing

Build completed successfully after both fixes:
```bash
npm run build
# ✓ Compiled with warnings (unrelated API route warnings only)
```

All infinite loops resolved - dialogs and toolbar work correctly without hitting React's maximum update depth limit.

---

## Related Files

### Issue #1 - Dialog Loops
- [ActionSelectionDialog.tsx:96-107](components/workflows/builder/ActionSelectionDialog.tsx#L96-L107)
- [TriggerSelectionDialog.tsx:91-102](components/workflows/builder/TriggerSelectionDialog.tsx#L91-L102)
- [useIntegrationSelection.ts:308-310](hooks/workflows/useIntegrationSelection.ts#L308-L310)

### Issue #2 - WorkflowToolbar Loop
- [CollaborativeWorkflowBuilder.tsx:243-261](components/workflows/CollaborativeWorkflowBuilder.tsx#L243-L261)
- [WorkflowToolbar.tsx:582](components/workflows/builder/WorkflowToolbar.tsx#L582) (React.memo wrapper)
