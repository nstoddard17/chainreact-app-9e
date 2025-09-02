# Hook Comparison Analysis: useFieldChangeHandlers vs useProviderFieldHandlers

## Overview
Comparing two duplicate implementations to identify unique features and create consolidation plan.

## useFieldChangeHandlers (393 lines)
### Unique Features:
1. **Generic dependent field handler** (`handleDependentFieldChange`)
   - Handles ANY field with `dependsOn` property
   - Loads options for all dependent fields in parallel
   - More generic approach

2. **Main routing function** (`handleFieldChange`)
   - Routes to appropriate provider handler
   - Has `skipBubbleCreation` parameter (though not used)
   - Checks for file/attachment fields first

3. **Discord features**:
   - Loads reactions for remove_reaction action
   - Has message field dependency logic

4. **Airtable features**:
   - Handles `recordId` change to populate dynamic fields from selected record
   - Handles dynamic `airtable_field_*` fields directly

5. **Extra props**:
   - `activeBubbles`, `fieldSuggestions`, `originalBubbleValues` (for bubble UI)
   - `isLoadingInitialConfig`
   - `loadAirtableRecords`
   - `currentNodeId`, `getWorkflowId`

## useProviderFieldHandlers (517 lines)
### Unique Features:
1. **Helper functions**:
   - `clearDependentFields` - generic helper to clear any dependent field
   - `loadDependentFieldOptions` - generic helper to load options

2. **More comprehensive Discord handling**:
   - Separate handling for `filterAuthor` field
   - Bot status checking for actions vs triggers
   - Channel bot status checking

3. **More comprehensive Google Sheets**:
   - Handles `action` field changes
   - Clears `updateMapping.*` fields
   - Manages sort fields and selected rows

4. **More comprehensive Airtable**:
   - Has `filterField` and `filterValue` handling for list_records
   - More detailed state clearing

5. **Returns boolean** from handlers indicating if field was handled

6. **Extra state props**:
   - `tableSearchQuery`, `setTableSearchQuery`
   - `googleSheetsSortField`, `setGoogleSheetsSortField`
   - `googleSheetsSortDirection`, `setGoogleSheetsSortDirection`
   - `googleSheetsSelectedRows`, `setGoogleSheetsSelectedRows`

## Key Differences:

### Architecture:
- **useFieldChangeHandlers**: Has a main `handleFieldChange` that routes to providers
- **useProviderFieldHandlers**: Has `handleProviderFieldChange` that tries each provider

### Return Values:
- **useFieldChangeHandlers**: Handlers don't return anything, always call setValue
- **useProviderFieldHandlers**: Handlers return boolean, caller decides when to setValue

### Completeness:
- **useFieldChangeHandlers**: Missing some field handling (filterField, filterValue, action)
- **useProviderFieldHandlers**: More complete field coverage but missing bubble UI integration

### Generic Handling:
- **useFieldChangeHandlers**: Has generic dependent field handler
- **useProviderFieldHandlers**: Has helper functions but no generic handler

## Consolidation Strategy:

### Keep from useFieldChangeHandlers:
1. Generic `handleDependentFieldChange` for non-provider fields
2. Main routing function pattern
3. Bubble UI related props (if needed elsewhere)
4. RecordId → dynamic fields population

### Keep from useProviderFieldHandlers:
1. Helper functions (`clearDependentFields`, `loadDependentFieldOptions`)
2. More complete provider implementations
3. Boolean return pattern for better control
4. Additional state props for table management

### New Consolidated Hook Structure:
```typescript
export function useFieldChangeHandler({
  // All necessary props from both
}) {
  // Helper functions
  const clearDependentFields = ...
  const loadDependentFieldOptions = ...
  
  // Provider handlers (complete versions)
  const handleDiscordFieldChange = ... // from useProviderFieldHandlers
  const handleGoogleSheetsFieldChange = ... // from useProviderFieldHandlers
  const handleAirtableFieldChange = ... // from useProviderFieldHandlers + recordId logic
  
  // Generic handler for non-provider fields
  const handleGenericDependentField = ... // from useFieldChangeHandlers
  
  // Main orchestrator
  const handleFieldChange = async (fieldName, value) => {
    // Try provider handlers first
    const handled = await handleProviderFieldChange(fieldName, value);
    
    // If not handled by provider, try generic
    if (!handled && field?.dependsOn) {
      await handleGenericDependentField(fieldName, value);
    }
    
    // Always set the value
    setValue(fieldName, value);
  }
  
  return { handleFieldChange };
}
```

## Action Items:
1. Create new consolidated hook with best of both
2. Remove duplicate hooks
3. Update ConfigurationForm to use new hook
4. Test all provider field dependencies
5. Document the consolidated pattern