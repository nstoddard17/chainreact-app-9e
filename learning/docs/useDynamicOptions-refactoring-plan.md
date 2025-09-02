# useDynamicOptions.ts Refactoring Plan

## Current State Analysis

The `useDynamicOptions.ts` file has grown to **1657 lines** and handles multiple responsibilities:
- Dynamic field option loading for various providers (Discord, Gmail, Airtable, Google Sheets, etc.)
- Request deduplication and abort handling
- Caching logic
- Provider-specific data fetching
- Field mapping and formatting
- State management for loading states

## Key Issues Identified

1. **Single Responsibility Violation**: The file handles too many concerns
2. **Large Function Bodies**: The `loadOptions` function is over 1000 lines
3. **Hardcoded Provider Logic**: Provider-specific logic is scattered throughout
4. **Complex Field Mapping**: The `getResourceTypeForField` function contains a massive 1500+ line mapping object
5. **Duplicate Logic**: Similar patterns repeated for different providers
6. **Poor Maintainability**: Adding new providers requires modifying multiple places

## Refactoring Strategy

### Phase 1: Extract Configuration and Mappings

#### 1.1 Create Field Mapping Configuration
**File**: `components/workflows/configuration/config/fieldMappings.ts`
- Extract the entire `fieldToResourceMap` object from `getResourceTypeForField`
- Create a typed configuration structure
- Group by provider for better organization

#### 1.2 Create Field Formatters
**File**: `components/workflows/configuration/utils/fieldFormatters.ts`
- Extract `formatOptionsForField` function
- Create individual formatter functions per field type
- Add unit tests for each formatter

### Phase 2: Extract Provider-Specific Logic

#### 2.1 Create Provider Handlers
**Directory**: `components/workflows/configuration/providers/`

Individual files:
- `discord/discordOptionsLoader.ts` - Discord-specific loading logic
- `airtable/airtableOptionsLoader.ts` - Airtable-specific logic including linked records
- `gmail/gmailOptionsLoader.ts` - Gmail-specific logic
- `googleSheets/googleSheetsOptionsLoader.ts` - Google Sheets logic

Each provider handler should implement a common interface:
```typescript
interface ProviderOptionsLoader {
  canHandle(fieldName: string, providerId: string): boolean;
  loadOptions(params: LoadOptionsParams): Promise<OptionData[]>;
  formatOptions(data: any[]): FormattedOption[];
}
```

#### 2.2 Create Provider Registry
**File**: `components/workflows/configuration/providers/registry.ts`
- Register all provider handlers
- Provide a unified interface for loading options

### Phase 3: Extract Request Management

#### 3.1 Create Request Manager
**File**: `components/workflows/configuration/utils/requestManager.ts`
- Extract abort controller management
- Extract request deduplication logic
- Extract request tracking logic

#### 3.2 Create Cache Manager
**File**: `components/workflows/configuration/utils/cacheManager.ts`
- Extract caching logic
- Implement cache invalidation strategies
- Add TTL support for cached data

### Phase 4: Simplify Main Hook

#### 4.1 Refactor useDynamicOptions Hook
- Reduce to ~200 lines
- Delegate to extracted modules
- Focus on state management and coordination

### Phase 5: Add Tests and Documentation

#### 5.1 Unit Tests
- Test each extracted module independently
- Test provider handlers
- Test formatters
- Test request management

#### 5.2 Integration Tests
- Test the refactored hook with mocked providers
- Test caching behavior
- Test abort/cancellation behavior

## Implementation Plan

### Step 1: Create New Directory Structure
```
components/workflows/configuration/
├── hooks/
│   └── useDynamicOptions.ts (refactored, ~200 lines)
├── providers/
│   ├── discord/
│   │   └── discordOptionsLoader.ts
│   ├── airtable/
│   │   ├── airtableOptionsLoader.ts
│   │   └── linkedRecordsHandler.ts
│   ├── gmail/
│   │   └── gmailOptionsLoader.ts
│   ├── googleSheets/
│   │   └── googleSheetsOptionsLoader.ts
│   ├── types.ts
│   └── registry.ts
├── config/
│   ├── fieldMappings.ts
│   └── providerConfigs.ts
└── utils/
    ├── fieldFormatters.ts
    ├── requestManager.ts
    ├── cacheManager.ts
    └── optionsHelpers.ts
```

### Step 2: Extract Configuration (Low Risk)
1. Create `fieldMappings.ts` with the field-to-resource mappings
2. Create `fieldFormatters.ts` with formatting logic
3. Update `useDynamicOptions.ts` to import and use these

### Step 3: Extract Provider Logic (Medium Risk)
1. Create provider handler interfaces
2. Implement Discord handler (simplest)
3. Implement Airtable handler (most complex)
4. Implement remaining providers
5. Create provider registry

### Step 4: Extract Request Management (Medium Risk)
1. Create `requestManager.ts` with abort and deduplication logic
2. Create `cacheManager.ts` with caching logic
3. Update hook to use these utilities

### Step 5: Final Refactoring (High Risk)
1. Refactor main hook to use all extracted modules
2. Remove duplicated code
3. Simplify main `loadOptions` function

## Benefits After Refactoring

1. **Better Maintainability**: Each module has a single responsibility
2. **Easier Testing**: Isolated units can be tested independently
3. **Improved Extensibility**: Adding new providers is straightforward
4. **Reduced Complexity**: Main hook becomes much simpler
5. **Better Type Safety**: Typed interfaces for providers and options
6. **Performance**: Better caching and request management

## Risk Mitigation

1. **Incremental Refactoring**: Do one module at a time
2. **Maintain Backward Compatibility**: Keep the same API surface
3. **Test Coverage**: Add tests before and after each change
4. **Feature Flags**: Use flags to switch between old/new implementations
5. **Monitoring**: Add logging to track any issues

## Success Metrics

- [ ] Main hook reduced from 1657 to ~200 lines
- [ ] All provider logic isolated in separate modules
- [ ] Field mappings externalized to configuration
- [ ] Request management extracted and reusable
- [ ] No regression in functionality
- [ ] Improved load times due to better caching
- [ ] Easier to add new providers (< 30 minutes)

## Timeline Estimate

- Phase 1 (Configuration): 2 hours
- Phase 2 (Providers): 4 hours
- Phase 3 (Request Management): 2 hours
- Phase 4 (Main Hook): 3 hours
- Phase 5 (Testing): 3 hours

**Total: ~14 hours of focused development**

## Next Steps

1. Review and approve this plan
2. Create feature branch for refactoring
3. Start with Phase 1 (lowest risk)
4. Test each phase thoroughly before moving to next
5. Deploy with feature flag for gradual rollout