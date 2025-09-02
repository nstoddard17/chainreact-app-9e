# Fix: Airtable Infinite Loop Issue

## Problem Description

An infinite loop was occurring when selecting Airtable base and table. The logs showed continuous reloading:
- Tables were repeatedly fetched after base selection
- Records were continuously loaded after table selection
- The UI became unresponsive due to constant API calls

## Root Cause

The issue was in `AirtableConfiguration.tsx` where a `useEffect` hook was watching `values.tableName` and `values.baseId` directly in its dependency array. This caused the effect to trigger on every render where these values were present, even if they hadn't actually changed.

```typescript
// PROBLEMATIC CODE
useEffect(() => {
  if (values.tableName && values.baseId) {
    // Load schema and records
  }
}, [values.tableName, values.baseId, /* other deps */]);
```

The problem was compounded by:
1. Field change handlers updating the values
2. The useEffect triggering and loading data
3. The data load potentially causing re-renders
4. The cycle repeating

## Solution

Added proper change detection using `useRef` to track previous values and only trigger loads when values actually change:

```typescript
// FIXED CODE
const prevTableName = React.useRef(values.tableName);
const prevBaseId = React.useRef(values.baseId);

useEffect(() => {
  // Only trigger if values actually changed
  const tableChanged = prevTableName.current !== values.tableName;
  const baseChanged = prevBaseId.current !== values.baseId;
  
  // Update refs
  prevTableName.current = values.tableName;
  prevBaseId.current = values.baseId;
  
  // Skip if base changed (table will be cleared and reselected)
  if (baseChanged && !values.tableName) {
    return;
  }
  
  // Only proceed if table actually changed and both values exist
  if (tableChanged && values.tableName && values.baseId) {
    // Load data only when needed
  }
}, [/* deps */]);
```

## Key Changes

1. **Added Previous Value Tracking**: Using `useRef` to store previous values
2. **Change Detection**: Compare current vs previous values to detect actual changes
3. **Skip Logic**: Don't reload when base changes (table will be reselected anyway)
4. **Conditional Loading**: Only load when table actually changes, not on every render

## Prevention Strategy

To prevent similar issues in the future:

1. **Always track previous values** when using `useEffect` with object properties
2. **Use change detection** instead of relying on dependency arrays alone
3. **Consider debouncing** for fields that might change rapidly
4. **Log all API calls** during development to catch unnecessary requests
5. **Test field interactions** thoroughly, especially cascading dropdowns

## Testing Checklist

- [ ] Select base - tables should load once
- [ ] Select table - schema/records should load once
- [ ] Change base - table should clear and new tables load
- [ ] Change table - new schema/records should load
- [ ] No infinite loops or repeated API calls
- [ ] UI remains responsive

## Related Files

- `components/workflows/configuration/providers/AirtableConfiguration.tsx` - Main fix location
- `components/workflows/configuration/hooks/useProviderFieldHandlers.ts` - Field change handlers
- `components/workflows/configuration/hooks/useFieldChangeHandlers.ts` - Alternative handlers (check for duplicates)

## Lessons Learned

1. **useEffect with object properties is dangerous** - Always implement proper change detection
2. **Multiple hooks can conflict** - Check for duplicate handlers (found both useFieldChangeHandlers and useProviderFieldHandlers handling Airtable)
3. **Cascading field updates need careful orchestration** - Parent field changes should properly clear child fields
4. **API call logging is essential** - Helps identify patterns in infinite loops quickly