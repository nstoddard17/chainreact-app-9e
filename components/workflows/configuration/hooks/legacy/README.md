# Legacy Hooks - Deprecated

This folder contains deprecated hooks that have been replaced by the new modular architecture. These files are kept for reference only and should NOT be used in new code.

## Deprecated Files

### useFieldChangeHandlers.deprecated.ts
- **Deprecated on**: September 1, 2025
- **Replaced by**: `useFieldChangeHandler.ts` (consolidated version)
- **Reason**: Duplicate implementation with incomplete field coverage
- **Original purpose**: Extracted from monolithic handleFieldChange during initial refactoring
- **Lines of code**: 393

### useProviderFieldHandlers.deprecated.ts  
- **Deprecated on**: September 1, 2025
- **Replaced by**: `useFieldChangeHandler.ts` (consolidated version)
- **Reason**: Duplicate implementation with different approach
- **Original purpose**: Another extraction attempt from monolithic handleFieldChange
- **Lines of code**: 517

### useDynamicOptionsRefactored.unused.ts
- **Created on**: September 1, 2025
- **Status**: Created but never integrated
- **Reason**: Refactored version of useDynamicOptions that was not adopted
- **Original purpose**: Attempt to modularize the 1,600+ line useDynamicOptions hook
- **Note**: The original useDynamicOptions.ts is still in use

## Migration Path

If you find code still using these deprecated hooks:

1. Replace imports:
```typescript
// OLD
import { useFieldChangeHandlers } from './hooks/useFieldChangeHandlers';
import { useProviderFieldHandlers } from './hooks/useProviderFieldHandlers';

// NEW
import { useFieldChangeHandler } from './hooks/useFieldChangeHandler';
```

2. Update hook usage:
```typescript
// OLD
const { handleFieldChange } = useFieldChangeHandlers({...});
// or
const { handleProviderFieldChange } = useProviderFieldHandlers({...});

// NEW
const { handleFieldChange } = useFieldChangeHandler({...});
```

## New Architecture

The new architecture uses:
- **Main orchestrator**: `/hooks/useFieldChangeHandler.ts`
- **Provider-specific hooks**: `/hooks/providers/`
  - `useAirtableFieldHandler.ts`
  - `useDiscordFieldHandler.ts`
  - `useGoogleSheetsFieldHandler.ts`

See `/learning/docs/field-change-handler-architecture.md` for complete documentation.

## Why Keep These Files?

1. **Historical reference**: Shows the evolution of the refactoring
2. **Debugging**: If issues arise, we can compare old vs new behavior
3. **Learning**: Documents what NOT to do (duplicate implementations)
4. **Rollback**: Emergency fallback if critical issues found (temporary only)

## Deletion Timeline

These files should be permanently deleted after:
- ✅ All features tested and working with new architecture
- ⏳ No issues reported for 2 weeks (Target: September 15, 2025)
- ⏳ All team members aware of new architecture
- ⏳ Documentation fully updated

**DO NOT USE THESE FILES IN NEW CODE!**