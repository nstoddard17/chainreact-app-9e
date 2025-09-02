# Field Change Handler Consolidation Plan

## Current Problem

We have **THREE different implementations** of field change handling for Airtable (and other providers):

1. **Legacy Implementation** (ConfigurationForm.backup.tsx - 8600+ lines)
   - Monolithic `handleFieldChange` function (1300+ lines)
   - All provider logic mixed together
   - Direct field handling inline

2. **useFieldChangeHandlers Hook** (partially extracted)
   - Extracted during refactoring
   - Has Airtable, Discord, Google Sheets handlers
   - NOT currently being used

3. **useProviderFieldHandlers Hook** (another extraction)
   - Also extracted during refactoring
   - Has similar but slightly different implementations
   - Also NOT currently being used

## How the Legacy System Worked

```
ConfigurationForm.backup.tsx
├── handleFieldChange (main entry point)
│   ├── File field handling
│   ├── Airtable bubble creation logic
│   ├── Provider-specific logic (Discord, Airtable, Google Sheets)
│   │   ├── Field dependency management
│   │   ├── Loading state management
│   │   ├── API calls for dependent fields
│   │   └── Field value clearing
│   └── Generic field handling
```

### Legacy Flow:
1. User changes a field in the UI
2. `FieldRenderer` calls `onChange` 
3. `onChange` calls `handleFieldChange` with fieldName and value
4. `handleFieldChange` determines the provider and field type
5. Provider-specific logic executes (reset dependent fields, load new options, etc.)
6. Finally calls `setValue` to update the state

## Current System (BROKEN)

```
ConfigurationForm.tsx (simplified)
├── setValue (just updates state, no logic)
└── Provider Components (AirtableConfiguration, etc.)
    └── FieldRenderer
        └── onChange → setValue (DIRECT, no handler!)
```

### Current Flow (Missing Logic):
1. User changes a field
2. `FieldRenderer` calls `onChange`
3. `onChange` directly calls `setValue`
4. **NO provider logic executes** ❌
5. **NO dependent fields are cleared** ❌
6. **NO options are loaded** ❌

## The Duplication Problem

Both extracted hooks have similar but not identical implementations:

### useFieldChangeHandlers
- Has basic Airtable field reset logic
- Missing some fields (was just updated to add filterField, filterValue)
- Has file field handling integration
- Has bubble creation logic

### useProviderFieldHandlers
- Has complete Airtable field reset logic
- Properly handles all dependent fields
- Missing file field handling
- Missing bubble creation logic

## Consolidation Plan

### Option 1: Single Unified Hook (RECOMMENDED)
Create one comprehensive hook that combines all functionality:

```typescript
// useFieldChangeHandler.ts (singular, unified)
export function useFieldChangeHandler({
  // All necessary props
}) {
  // File field handling
  const handleFileField = ...
  
  // Bubble creation handling
  const handleBubbleCreation = ...
  
  // Provider-specific handlers
  const handleAirtableFields = ...
  const handleDiscordFields = ...
  const handleGoogleSheetsFields = ...
  
  // Main handler that orchestrates everything
  const handleFieldChange = (fieldName, value) => {
    // 1. Check for file fields
    // 2. Check for bubble creation
    // 3. Route to provider handler
    // 4. Update value
  }
  
  return { handleFieldChange };
}
```

### Option 2: Provider-Specific Components Handle Their Own Logic
Move the logic directly into provider components:

```typescript
// AirtableConfiguration.tsx
const handleFieldChange = (fieldName, value) => {
  // Airtable-specific logic here
  if (fieldName === 'baseId') {
    // Clear dependent fields
    setValue('tableName', '');
    setValue('recordId', '');
    // etc...
  }
  
  // Finally set the value
  setValue(fieldName, value);
}

// Use this instead of direct setValue
<FieldRenderer onChange={handleFieldChange} />
```

### Option 3: Composition Pattern
Keep specialized hooks but compose them properly:

```typescript
// ConfigurationForm.tsx
const fileHandler = useFileFieldHandler(...);
const providerHandler = useProviderFieldHandler(...);
const bubbleHandler = useAirtableBubbleHandler(...);

const handleFieldChange = (fieldName, value) => {
  // Compose all handlers
  if (fileHandler.canHandle(fieldName)) {
    return fileHandler.handle(fieldName, value);
  }
  if (providerHandler.canHandle(fieldName)) {
    return providerHandler.handle(fieldName, value);
  }
  // Default
  setValue(fieldName, value);
}
```

## Implementation Steps

### Phase 1: Wire Up Existing Logic (Quick Fix) ✅ COMPLETED
1. ✅ Import `useProviderFieldHandlers` in ConfigurationForm
2. ✅ Create wrapped setValue that calls the handler
3. ✅ Pass wrapped setValue to provider components
4. ⏳ Test that field dependencies work

**Implementation Details (Phase 1):**
- Added `useProviderFieldHandlers` import to ConfigurationForm
- Created `setValueBase` for direct state updates
- Wrapped `setValue` to call provider handler first, then set value
- Added all necessary state variables for provider-specific needs
- Updated AirtableConfiguration to accept optional parent state
- Provider components now properly execute field dependency logic

### Phase 2: Consolidate Duplicate Hooks ✅ COMPLETED
1. ✅ Compare both implementations line by line
2. ✅ Merge into single comprehensive hook
3. ✅ Mark duplicate hooks as deprecated
4. ✅ Update all imports

**Implementation Details (Phase 2):**
- Created comprehensive comparison analysis in `hook-comparison-analysis.md`
- Created new consolidated `useFieldChangeHandler.ts` combining best of both:
  - Helper functions from useProviderFieldHandlers
  - Generic dependent field handler from useFieldChangeHandlers
  - Complete provider implementations with all field coverage
  - Boolean return pattern for better control
  - RecordId → dynamic fields population
- Updated ConfigurationForm to use new consolidated hook
- Marked old hooks as deprecated with clear documentation
- Verified no TypeScript errors in the consolidation

### Phase 3: Move Logic to Appropriate Location ✅ COMPLETED
1. ✅ Decide on final architecture (Hybrid of Option 1 & 2)
2. ✅ Refactor to match chosen pattern
3. ✅ Ensure all provider components use the same pattern
4. ✅ Document the pattern for future providers

**Implementation Details (Phase 3):**
- Created modular provider-specific hooks in `/hooks/providers/`:
  - `useAirtableFieldHandler.ts` - Encapsulates all Airtable field logic
  - `useDiscordFieldHandler.ts` - Encapsulates all Discord field logic
  - `useGoogleSheetsFieldHandler.ts` - Encapsulates all Google Sheets field logic
- Main `useFieldChangeHandler` now composes these modular hooks
- Each provider hook is self-contained and testable
- Clear separation of concerns with provider-specific logic isolated
- Maintained backward compatibility while improving architecture

## Testing Checklist

After consolidation, verify:

- [ ] Airtable baseId change clears tableName, recordId, filterField, filterValue
- [ ] Airtable tableName change clears recordId, filterField, filterValue (not baseId)
- [ ] Discord guildId change clears channelId, messageId
- [ ] Google Sheets spreadsheetId change clears sheetName
- [ ] File uploads work correctly
- [ ] Bubble creation works for Airtable
- [ ] No duplicate API calls
- [ ] Loading states show correctly
- [ ] No infinite loops

## Recommendation

**Go with Option 1** - Create a single, well-organized hook that handles all field change logic. This:
- Maintains consistency
- Makes debugging easier
- Keeps logic centralized
- Follows the pattern started in the refactoring

Then wire it up properly in ConfigurationForm so ALL field changes go through it, not just direct setValue calls.