# Field Change Handler Architecture

## Overview

The field change handler system manages field dependencies and dynamic option loading in workflow configuration forms. After three phases of refactoring, we've established a clean, modular architecture that's easy to maintain and extend.

## Architecture Pattern

### Three-Layer Architecture

```
┌─────────────────────────────────────────┐
│     ConfigurationForm Component         │
│  (Main form component with all state)   │
└─────────────────┬───────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│      useFieldChangeHandler Hook         │
│   (Orchestrator - routes to providers)  │
└─────────────────┬───────────────────────┘
                  │
        ┌─────────┴─────────┬─────────────┐
        ▼                   ▼              ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ useAirtable  │  │  useDiscord  │  │ useGoogle    │
│FieldHandler │  │FieldHandler │  │ SheetsField  │
│              │  │              │  │   Handler    │
└──────────────┘  └──────────────┘  └──────────────┘
```

### Layer Responsibilities

#### 1. ConfigurationForm Component
- Manages all form state (values, errors, loading states)
- Provides state and setters to hooks
- Renders provider-specific configuration components
- Handles form submission

#### 2. useFieldChangeHandler Hook (Orchestrator)
- Main entry point for all field changes
- Composes provider-specific hooks
- Handles generic dependent fields
- Routes field changes to appropriate handler
- Always calls setValue after processing

#### 3. Provider-Specific Hooks
- Encapsulate all provider-specific logic
- Handle field dependencies for their provider
- Manage loading states for dependent fields
- Clear appropriate fields when parents change
- Return boolean indicating if field was handled

## Implementation Guide

### Adding a New Provider

1. **Create Provider Hook** (`/hooks/providers/useNewProviderFieldHandler.ts`):

```typescript
import { useCallback } from 'react';

interface UseNewProviderFieldHandlerProps {
  nodeInfo: any;
  values: Record<string, any>;
  setValue: (fieldName: string, value: any) => void;
  loadOptions: (fieldName: string, dependsOn?: string, dependsOnValue?: any, forceReload?: boolean) => Promise<void>;
  setLoadingFields: (setter: any) => void;
  resetOptions: (fieldName: string) => void;
  // Add provider-specific state setters as needed
}

export function useNewProviderFieldHandler(props: UseNewProviderFieldHandlerProps) {
  // Handle specific field changes
  const handleFieldChange = useCallback(async (fieldName: string, value: any): Promise<boolean> => {
    if (nodeInfo?.providerId !== 'new-provider') return false;
    
    switch (fieldName) {
      case 'parentField':
        // Clear dependent fields
        setValue('childField', '');
        // Load new options
        if (value) {
          await loadOptions('childField', 'parentField', value, true);
        }
        return true;
      
      default:
        return false;
    }
  }, [/* dependencies */]);
  
  return { handleFieldChange };
}
```

2. **Export from Index** (`/hooks/providers/index.ts`):
```typescript
export { useNewProviderFieldHandler } from './useNewProviderFieldHandler';
```

3. **Add to Main Hook** (`/hooks/useFieldChangeHandler.ts`):
```typescript
import { useNewProviderFieldHandler } from './providers/useNewProviderFieldHandler';

// In the component:
const { handleFieldChange: handleNewProviderField } = useNewProviderFieldHandler({
  // props
});

// In handleProviderFieldChange:
if (await handleNewProviderField(fieldName, value)) {
  return true;
}
```

## Field Dependency Patterns

### Pattern 1: Simple Parent-Child
```typescript
// When parent changes, clear child
if (fieldName === 'parentField') {
  setValue('childField', '');
  if (value) {
    await loadOptions('childField', 'parentField', value);
  }
  return true;
}
```

### Pattern 2: Multiple Dependent Fields
```typescript
// When parent changes, clear all children
if (fieldName === 'parentField') {
  setValue('child1', '');
  setValue('child2', '');
  setValue('child3', '');
  // Load options for all children
  return true;
}
```

### Pattern 3: Cascading Dependencies
```typescript
// baseId → tableName → recordId
if (fieldName === 'baseId') {
  setValue('tableName', '');
  setValue('recordId', ''); // Clear grandchild too
  // Load tables
  return true;
}

if (fieldName === 'tableName') {
  setValue('recordId', ''); // Only clear child
  // Load records
  return true;
}
```

## Best Practices

### 1. Loading States
Always show loading state when fetching options:
```typescript
setLoadingFields(prev => {
  const newSet = new Set(prev);
  newSet.add('fieldName');
  return newSet;
});

// Load options
await loadOptions(...).finally(() => {
  setLoadingFields(prev => {
    const newSet = new Set(prev);
    newSet.delete('fieldName');
    return newSet;
  });
});
```

### 2. Reset Cached Options
Clear cache when parent changes to ensure fresh data:
```typescript
resetOptions('childField');
```

### 3. Use setTimeout for Smooth UX
Add small delay to ensure loading state is visible:
```typescript
setTimeout(() => {
  loadOptions(...);
}, 10);
```

### 4. Return Boolean from Handlers
Always return true if field was handled, false otherwise:
```typescript
if (nodeInfo?.providerId !== 'my-provider') return false;
if (fieldName === 'myField') {
  // Handle field
  return true;
}
return false;
```

## Testing

### Unit Testing Provider Hooks
Each provider hook can be tested in isolation:

```typescript
import { renderHook } from '@testing-library/react-hooks';
import { useAirtableFieldHandler } from './useAirtableFieldHandler';

test('baseId change clears dependent fields', () => {
  const setValue = jest.fn();
  const { result } = renderHook(() => 
    useAirtableFieldHandler({
      nodeInfo: { providerId: 'airtable' },
      values: {},
      setValue,
      // ... other props
    })
  );
  
  result.current.handleFieldChange('baseId', 'base123');
  
  expect(setValue).toHaveBeenCalledWith('tableName', '');
  expect(setValue).toHaveBeenCalledWith('recordId', '');
});
```

### Integration Testing
Test the full flow through ConfigurationForm:

```typescript
test('Airtable field dependencies work end-to-end', () => {
  // Render ConfigurationForm with Airtable node
  // Change baseId
  // Verify tableName is cleared and loading
  // Verify options are fetched
});
```

## Migration from Legacy Code

If you have legacy field change handlers:

1. **Identify all field dependencies** in the old code
2. **Create provider hook** with those dependencies
3. **Test thoroughly** to ensure behavior matches
4. **Remove old implementation** once verified
5. **Update documentation** with any new patterns discovered

## Common Issues and Solutions

### Issue: Fields not clearing
**Solution**: Ensure handler returns `true` and setValue is called

### Issue: Infinite loops
**Solution**: Use useRef to track previous values, only trigger on actual changes

### Issue: Loading states stuck
**Solution**: Always clear loading state in finally block

### Issue: Stale options showing
**Solution**: Call resetOptions() before loading new options

## Future Improvements

1. **Type Safety**: Add TypeScript interfaces for each provider's fields
2. **Validation**: Add field validation logic to provider hooks
3. **Caching**: Implement smarter caching strategies
4. **Performance**: Memoize expensive operations
5. **Testing**: Add comprehensive test coverage for all providers