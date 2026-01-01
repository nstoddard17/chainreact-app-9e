# useEffect Creation Protocol

## Purpose

This document defines mandatory protocols for creating and managing useEffect hooks in the codebase to prevent race conditions, duplicate logic, and technical debt accumulation.

---

## Root Cause: Why This Protocol Exists

### The Problem Pattern

This codebase previously exhibited a pattern of **reactive band-aid programming**:

1. Bug discovered: "Dependent fields not loading"
2. Quick fix: Add new useEffect to handle dependent fields
3. New bug: "Fields loading twice" (caused by overlapping useEffects)
4. Another band-aid: Add provider-specific hacks to prevent duplicate loads
5. Another bug: "Parallel loading issue"

**This happened in ConfigurationForm.tsx:**
- Started with useEffect #9 (load fields on mount)
- Added useEffect #10 (load fields with saved values + dependent fields)
- Added useEffect #11 (load dependent fields when dependencies satisfied)
- Result: 2-3 useEffects racing to load the same fields, requiring provider-specific hacks

### Evidence

**Lines that prove the problem:**
```typescript
// In useEffect #10:
// Skip fields that have loadOnMount (they're handled by another useEffect)
if (field.loadOnMount) return false;
```

**Provider-specific hacks in useEffect #11:**
```typescript
// Special case: prevent repeated reloads for Google Sheets sheetName when options exist
if (nodeInfo?.providerId === 'google-sheets' && field.name === 'sheetName' && hasOptions) {
  return false;
}
```

These are NOT special cases - they're band-aids to prevent duplicate loads from overlapping useEffects.

---

## MANDATORY Protocol: Before Creating ANY useEffect

### Step 1: Audit Existing useEffects

```bash
# Search for all useEffects in the file
grep -n "useEffect" [filename]
```

### Step 2: Document Purpose and Dependencies

For each existing useEffect, identify:
- **Purpose:** What does it do?
- **Dependencies:** What triggers it?
- **Overlap:** Does it touch the same state/logic as your proposed useEffect?

### Step 3: Decision Tree

```
┌─ New functionality needed?
│
├─ YES → Can it be added to an EXISTING useEffect?
│         │
│         ├─ YES → MODIFY the existing useEffect
│         │        DO NOT create a new one
│         │
│         └─ NO → Why not?
│                  │
│                  ├─ Different dependencies?
│                  │   └─ VERIFY dependencies truly can't be combined
│                  │
│                  ├─ Separation of concerns?
│                  │   └─ VERIFY it's not just avoiding refactoring
│                  │
│                  └─ Only after exhausting modification options:
│                      CREATE new useEffect with clear documentation
│
└─ NO → You don't need a useEffect
```

### Step 4: Red Flags (NEVER Do This)

❌ **Creating useEffect with overlapping dependencies**
```typescript
// BAD: useEffect #1 depends on [values, nodeInfo]
//      useEffect #2 ALSO depends on [values, nodeInfo]
// This WILL cause race conditions!
```

❌ **Adding provider-specific "special cases" to prevent duplicate loads**
```typescript
// BAD: This is a symptom of overlapping useEffects
if (provider === 'google-sheets' && hasOptions) return false;
```

❌ **Comments like "handled by another useEffect"**
```typescript
// BAD: If another useEffect handles it, why are we checking it here?
if (field.loadOnMount) return false; // handled by another useEffect
```

### Step 5: Documentation Requirements

When creating a useEffect, add a comment block:
```typescript
/**
 * PURPOSE: [One-line description]
 * TRIGGERS: [What dependency changes trigger this]
 * LOADS: [What data/options it fetches, or "None" if pure state management]
 * CHECKED EXISTING: [List useEffect line numbers you verified don't overlap]
 */
useEffect(() => {
  // ...
}, [dependencies]);
```

Example from the consolidated ConfigurationForm.tsx:
```typescript
/**
 * PURPOSE: Unified field option loader - handles loadOnMount, saved values, and dependent fields
 * TRIGGERS: Node changes, isInitialLoading, values changes, dynamicOptions changes, connection state
 * LOADS: All dynamic field options (loadOnMount fields, fields with saved values, dependent fields)
 * CONSOLIDATES: Former useEffect #9 (loadOnMount) + useEffect #10 (saved values + dependent fields)
 */
useEffect(() => {
  // ...
}, [nodeInfo?.id, nodeInfo?.type, currentNodeId, isInitialLoading, loadOptionsParallel, needsConnection, reloadCounter, values, dynamicOptions]);
```

---

## Maximum useEffect Limits

**Per file:**
- **Ideal:** 3-5 useEffects
- **Warning threshold:** 8 useEffects
- **Refactor required:** 10+ useEffects

**ConfigurationForm.tsx previously had 13 useEffects - this was consolidated to 12.**

---

## Consolidation Strategy

### When to Consolidate

Consolidate when you notice:
1. Multiple useEffects with same dependencies
2. Provider-specific hacks to prevent duplicate operations
3. Comments referencing other useEffects
4. Race conditions between useEffects
5. File exceeds 8 useEffects

### How to Consolidate

1. **One useEffect per concern**
2. **Combine effects with same dependencies**
3. **Extract complex logic to custom hooks** (e.g., `useFieldLoader`)
4. **Use event handlers instead of useEffect when possible**

### Example: ConfigurationForm.tsx Consolidation

**Before:** 3 useEffects handling field loading
- useEffect #9: Load fields with `loadOnMount: true`
- useEffect #10: Load fields with saved values + dependent fields with parent values
- useEffect #11: Load dependent fields when dependencies satisfied

**Problem:** Overlapping dependencies caused race conditions

**After:** 2 useEffects with clear separation
- useEffect (unified): Handles ALL field loading (loadOnMount + saved values + dependent fields)
- useEffect (special cases): Handles Facebook shareToGroups edge case only

**Result:**
- Single pass through field list instead of 2-3 passes
- No race conditions
- Removed provider-specific hacks (Google Sheets, Excel, storage providers)
- Easier to debug and maintain

---

## Custom Hooks: When to Extract

Consider extracting a custom hook when:
- useEffect logic exceeds 50 lines
- Logic is reused across components
- Testing in isolation would be valuable
- State management is complex

### Example

```typescript
// Instead of:
useEffect(() => {
  // 100+ lines of field loading logic
}, [many, dependencies, here]);

// Extract to:
const { loadOptions, resetOptions } = useFieldOptionsLoader(
  nodeInfo,
  values,
  dynamicOptions,
  isInitialLoading,
  needsConnection
);
```

---

## Anti-Patterns to Avoid

### 1. The "Add Another useEffect" Anti-Pattern

❌ **Bad:**
```typescript
// Bug: Fields not loading
// Solution: Add new useEffect
useEffect(() => {
  // Load fields
}, [values]);
```

✅ **Good:**
```typescript
// Bug: Fields not loading
// Solution: Modify existing useEffect that handles field loading
useEffect(() => {
  // Existing logic...

  // ADD: New condition
  if (shouldLoadFields) {
    loadFields();
  }
}, [values, existingDeps]);
```

### 2. The "Provider-Specific Hack" Anti-Pattern

❌ **Bad:**
```typescript
useEffect(() => {
  const fieldsToLoad = fields.filter(f => {
    // Hack to prevent duplicate loads
    if (provider === 'google-sheets') return false;
    if (provider === 'excel') return false;
    // ...
  });
}, [fields]);
```

✅ **Good:**
```typescript
// Consolidate the useEffects causing duplicates
// Remove the need for hacks
useEffect(() => {
  // Unified logic that doesn't create duplicates
}, [fields]);
```

### 3. The "Dependency Explosion" Anti-Pattern

❌ **Bad:**
```typescript
useEffect(() => {
  // ...
}, [dep1, dep2, dep3, dep4, dep5, dep6, dep7, dep8]);
```

✅ **Good:**
```typescript
// Extract to custom hook or useReducer
const state = useFieldLoader({
  dep1, dep2, dep3, dep4, dep5, dep6, dep7, dep8
});
```

---

## Testing useEffects

When refactoring/consolidating useEffects:

1. **Test all providers affected**
2. **Test with fresh data (no saved values)**
3. **Test with saved values (reopening configured nodes)**
4. **Test dependency chains (cascading fields)**
5. **Test edge cases (special provider behavior)**

### Example Test Checklist

From the ConfigurationForm consolidation:

**Google Sheets:**
- [ ] Update Cell: spreadsheet loads on mount, sheet loads after selection
- [ ] Append Row: cascading fields work correctly
- [ ] No parallel loading of dependent fields

**Microsoft Excel:**
- [ ] Workbook loads on mount
- [ ] Dependent fields (table, worksheet) load sequentially

**Trello:**
- [ ] Board selection loads cards and lists
- [ ] Move Card action works correctly

**Storage Providers:**
- [ ] Folder → File cascading works
- [ ] No duplicate loads

---

## Summary

**Key Takeaway:** Before adding a useEffect, **ALWAYS** check if existing useEffects can be modified instead. The extra 5 minutes of analysis prevents hours of debugging race conditions later.

**Remember:**
1. Audit existing useEffects FIRST
2. Consolidate when you see overlap
3. Document your useEffects
4. Extract custom hooks for complex logic
5. Test thoroughly across providers
