# handleFieldChange Refactoring Plan

## Current State
The `handleFieldChange` function in `ConfigurationForm.tsx` is approximately **1,300 lines long** (lines 2098-3377). This massive function handles:

1. **Provider-specific logic** (Discord, Airtable, Google Sheets, etc.)
2. **Bubble management** for multi-select fields
3. **Field dependencies** and dynamic loading
4. **File/attachment handling**
5. **Validation and error handling**
6. **Special UI behaviors** (progressive disclosure, etc.)

## Problems with Current Implementation
- **Unmaintainable**: 1,300 lines in a single function is extremely difficult to understand and modify
- **High coupling**: Mixes UI concerns, business logic, and API calls
- **Hard to test**: Too many branches and dependencies
- **Performance issues**: Re-renders entire form on every field change
- **Duplicate logic**: Similar patterns repeated for different providers

## Refactoring Strategy

### Phase 1: Extract Helper Hooks (COMPLETED)
✅ Created `useDiscordState` - Discord-specific state management
✅ Created `useAirtableState` - Airtable-specific state management  
✅ Created `useGoogleSheetsState` - Google Sheets-specific state management
✅ Created `useBubbleManagement` - Bubble UI state management
✅ Created `useFieldChangeHandlers` - Provider-specific field change handlers

### Phase 2: Identify Core Sections (IN PROGRESS)
The handleFieldChange function has these main sections:

1. **Lines 2098-2120**: Initial setup and field detection
2. **Lines 2121-2435**: Bubble management for Airtable update fields
3. **Lines 2436-2612**: Record ID handling for Airtable
4. **Lines 2613-2837**: File/attachment field handling
5. **Lines 2838-2910**: Google Docs preview handling
6. **Lines 2911-3104**: Discord field dependencies
7. **Lines 3105-3191**: Google Sheets field dependencies
8. **Lines 3192-3376**: Airtable field dependencies

### Phase 3: Extraction Plan

#### 3.1 Extract File Handling (Priority: HIGH) ✅ COMPLETED
- Created `useFileFieldHandler` hook
- Moved lines 2613-2837 (224 lines extracted!)
- Handles file uploads, base64 conversion, type detection
- Manages image previews and bubble creation for attachments
- Successfully integrated into ConfigurationForm

#### 3.2 Extract Bubble Logic (Priority: HIGH) ✅ COMPLETED
- Created `useAirtableBubbleHandler` hook specifically for Airtable bubble logic
- Moved lines 2143-2477 (334 lines extracted!)
- Handles UPDATE RECORD and CREATE RECORD bubble creation
- Manages linked fields, select fields, and multi-value fields
- Successfully integrated with proper TypeScript types

#### 3.3 Extract Provider Handlers (Priority: MEDIUM) ✅ COMPLETED
- Created unified `useProviderFieldHandlers` hook
- Extracted Discord handling: Lines 2879-3078 (199 lines)
- Extracted Google Sheets handling: Lines 3081-3135 (54 lines)
- Extracted Airtable handling: Lines 3168-3349 (181 lines)
- Total: 434 lines extracted into clean, provider-specific handlers
- Successfully integrated with proper field dependency management

#### 3.4 Create Main Dispatcher (Priority: LOW)
```typescript
const handleFieldChange = (fieldName, value, options) => {
  // Route to appropriate handler based on provider
  const handler = getFieldHandler(nodeInfo.providerId);
  return handler(fieldName, value, options);
}
```

### Phase 4: Testing Strategy
1. Create unit tests for each extracted hook
2. Test provider-specific behaviors in isolation
3. Integration tests for field dependencies
4. UI tests for bubble management
5. End-to-end tests for complete workflows

### Phase 5: Migration Path
1. **Keep existing function temporarily** - rename to `handleFieldChangeLegacy`
2. **Gradual migration** - route specific providers to new handlers
3. **Feature flags** - toggle between old and new implementations
4. **Monitor and fix** - track errors, fix edge cases
5. **Remove legacy** - once all paths tested and stable

## Implementation Notes

### Current Dependencies
The handleFieldChange function depends on:
- 30+ state variables
- 15+ helper functions
- Multiple API calls
- Complex conditional logic

### Key Patterns to Preserve
1. **Field dependency clearing** - when parent changes, clear child fields
2. **Loading states** - show loading while fetching dynamic options
3. **Bubble management** - maintain multi-select UI behavior
4. **Progressive disclosure** - Discord's step-by-step field reveal
5. **Value formatting** - handle arrays, objects, strings consistently

### Risk Mitigation
- **No UI/UX changes** - maintain exact same behavior
- **Incremental refactoring** - small, testable changes
- **Fallback to legacy** - keep old code available
- **Comprehensive testing** - before removing legacy code
- **Documentation** - update as we refactor

## Success Metrics
- [ ] Function reduced from 1,300 lines to <100 lines
- [ ] Each handler <200 lines
- [ ] 80%+ test coverage
- [ ] No regressions in functionality
- [ ] Improved performance (fewer re-renders)
- [ ] Easier to add new providers

## Next Steps
1. Start with file handling extraction (most self-contained)
2. Test with existing workflows
3. Move to bubble management
4. Extract provider-specific handlers
5. Create unified dispatcher
6. Remove legacy code

## Timeline Estimate
- Phase 1: ✅ COMPLETED
- Phase 2: 1 day (analysis and planning)
- Phase 3: 3-5 days (extraction and refactoring)
- Phase 4: 2-3 days (testing)
- Phase 5: 2-3 days (migration and monitoring)

Total: ~10-14 days for complete refactoring