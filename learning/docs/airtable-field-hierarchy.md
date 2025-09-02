# Airtable Field Hierarchy Documentation

## Overview

Airtable fields follow a strict hierarchy where changing parent fields resets all dependent child fields to maintain data consistency.

## Field Hierarchy

```
baseId (top level)
  └── tableName
        ├── recordId
        ├── filterField
        │     └── filterValue
        └── airtable_field_* (dynamic fields based on table schema)
```

## Reset Behavior

### When `baseId` Changes
**Resets EVERYTHING:**
- `tableName` → cleared
- `recordId` → cleared
- `filterField` → cleared
- `filterValue` → cleared
- All `airtable_field_*` dynamic fields → cleared
- Table schema → cleared
- Records data → cleared
- Preview data → cleared
- Selected record → cleared

**Actions:**
- Load new tables for the selected base
- Clear all cached options for dependent fields

### When `tableName` Changes
**Resets everything EXCEPT `baseId`:**
- `recordId` → cleared
- `filterField` → cleared
- `filterValue` → cleared
- All `airtable_field_*` dynamic fields → cleared
- Table schema → cleared (will be reloaded)
- Records data → cleared
- Preview data → cleared
- Selected record → cleared

**Actions:**
- Load filter fields for list records action
- Load table schema for create/update actions
- Clear cached options for filter fields

### When `filterField` Changes
**Resets:**
- `filterValue` → cleared

**Actions:**
- Load unique values for the selected field

## Implementation Details

### Files Involved
1. **`useProviderFieldHandlers.ts`** - Primary handler for field changes
2. **`useFieldChangeHandlers.ts`** - Secondary handler (updated to match)
3. **`AirtableConfiguration.tsx`** - Component that uses these handlers

### Key Functions

```typescript
// Handle baseId change
if (fieldName === 'baseId') {
  // Clear ALL dependent fields
  setValue('tableName', '');
  setValue('recordId', '');
  setValue('filterField', '');
  setValue('filterValue', '');
  // Clear all dynamic fields and state...
}

// Handle tableName change
if (fieldName === 'tableName') {
  // Clear all dependent fields EXCEPT baseId
  setValue('recordId', '');
  setValue('filterField', '');
  setValue('filterValue', '');
  // Clear all dynamic fields and state...
}
```

## Common Issues and Solutions

### Issue: Fields not clearing properly
**Solution:** Ensure both handlers (`useProviderFieldHandlers` and `useFieldChangeHandlers`) have identical reset logic

### Issue: Infinite reload loops
**Solution:** Use refs to track previous values and only trigger loads on actual changes (see `fix-airtable-infinite-loop.md`)

### Issue: Cached data showing after parent change
**Solution:** Call `resetOptions()` for all dependent fields when parent changes

## Testing Checklist

- [ ] Select base → all other fields clear
- [ ] Select table → all fields except base clear
- [ ] Select filter field → only filter value clears
- [ ] Change base after selecting table → table and all dependents clear
- [ ] No stale data appears in dropdowns after changes
- [ ] Loading states show appropriately
- [ ] No infinite loops occur

## Best Practices

1. **Always clear child fields when parent changes** - Prevents invalid combinations
2. **Reset cached options** - Ensures fresh data loads
3. **Clear state data** - Prevents stale preview data
4. **Use consistent reset logic** - All handlers should behave identically
5. **Test the full hierarchy** - Verify each level resets properly

## Related Documentation

- [Airtable Infinite Loop Fix](./fix-airtable-infinite-loop.md)
- [Field Implementation Guide](./field-implementation-guide.md)
- [Provider Field Handlers](./provider-field-handlers.md)