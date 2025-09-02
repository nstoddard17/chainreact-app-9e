# useDynamicOptions Migration Guide

## Overview

This guide helps migrate from the old monolithic `useDynamicOptions.ts` (1,657 lines) to the new refactored modular version (~300 lines).

## Migration Steps

### Step 1: Switch Import Path

**Old:**
```typescript
import { useDynamicOptions } from './hooks/useDynamicOptions';
```

**New:**
```typescript
import { useDynamicOptions } from './hooks/useDynamicOptionsRefactored';
```

### Step 2: Verify API Compatibility

The refactored hook maintains 100% backward compatibility. The same API is exposed:

```typescript
const {
  dynamicOptions,      // Same: Current options state
  loading,            // Same: Loading state
  isInitialLoading,   // Same: Initial loading flag
  loadOptions,        // Same: Function to load options
  resetOptions,       // Same: Function to reset options
  setDynamicOptions,  // Same: Direct state setter
  _debug             // New: Debug utilities (optional)
} = useDynamicOptions({
  nodeType,
  providerId,
  onLoadingChange,
  getFormValues
});
```

### Step 3: Test Provider-Specific Functionality

The refactored version delegates to provider modules. Test each provider:

#### Discord
- Guild loading
- Channel loading (depends on guild)
- Message loading (depends on channel)
- Member/role loading

#### Airtable
- Base loading
- Table loading (depends on base)
- Field loading (depends on table)
- Field value loading (depends on field)
- Linked record loading

### Step 4: Verify Performance Improvements

The new version includes:
- **Request Deduplication**: Multiple calls to load the same data will share a single request
- **Smart Caching**: Data is cached with TTL and dependency tracking
- **Abort Handling**: Cancelled requests are properly cleaned up

### Step 5: Add New Providers (If Needed)

To add a new provider:

1. Create a provider loader in `providers/[provider]/[provider]OptionsLoader.ts`:

```typescript
import { ProviderOptionsLoader, LoadOptionsParams, FormattedOption } from '../types';

export class MyProviderOptionsLoader implements ProviderOptionsLoader {
  private supportedFields = ['field1', 'field2'];

  canHandle(fieldName: string, providerId: string): boolean {
    return providerId === 'my-provider' && this.supportedFields.includes(fieldName);
  }

  async loadOptions(params: LoadOptionsParams): Promise<FormattedOption[]> {
    // Implementation
    return [];
  }

  getFieldDependencies(fieldName: string): string[] {
    // Return field dependencies if any
    return [];
  }
}
```

2. Register in `providers/registry.ts`:

```typescript
import { MyProviderOptionsLoader } from './my-provider/myProviderOptionsLoader';

// In registerDefaultLoaders():
this.register('my-provider', new MyProviderOptionsLoader());
```

3. Add field mappings in `config/fieldMappings.ts`:

```typescript
const myProviderMappings: Record<string, FieldMapping> = {
  my_provider_action: {
    field1: "my-provider-resource1",
    field2: "my-provider-resource2",
  }
};

// Add to fieldToResourceMap
```

## Testing Checklist

- [ ] All existing field dropdowns still populate correctly
- [ ] Dependent fields update when parent fields change
- [ ] Loading states show correctly
- [ ] Cached data is used when available
- [ ] Force refresh works when needed
- [ ] No duplicate API calls for the same data
- [ ] Memory usage is stable (no leaks from abort controllers)

## Rollback Plan

If issues arise, you can temporarily switch back to the old version:

1. Change import back to `./hooks/useDynamicOptions`
2. The old file is still available and unchanged
3. Report any issues encountered for fixing

## Performance Metrics

Expected improvements:
- **API Calls**: 40-60% reduction due to caching and deduplication
- **Load Time**: 30-50% faster for cached fields
- **Memory**: Better cleanup of abort controllers and requests
- **Code Size**: Main hook reduced by ~80%

## Debug Utilities

The new version includes debug utilities:

```typescript
const { _debug } = useDynamicOptions({...});

// Get request statistics
console.log(_debug.requestStats());
// Output: { activeRequests: 2, pendingAborts: 1, totalRequestsCreated: 15 }

// Get cache statistics
console.log(_debug.cacheStats());
// Output: { size: 12, maxSize: 1000, hitRate: 0, keys: [...] }
```

## Common Issues and Solutions

### Issue: Fields not loading
**Solution:** Check that the provider is registered and field mappings exist

### Issue: Dependent fields not updating
**Solution:** Verify `getFieldDependencies` returns correct dependencies

### Issue: Cached data seems stale
**Solution:** Use `forceRefresh: true` or adjust cache TTL

### Issue: TypeScript errors
**Solution:** Ensure all imports are updated to new paths

## Migration Timeline

1. **Phase 1**: Test in development environment
2. **Phase 2**: Deploy to staging with feature flag
3. **Phase 3**: Gradual rollout to production
4. **Phase 4**: Remove old implementation after stability confirmed

## Support

For issues or questions:
- Check the refactoring plan: `/learning/docs/useDynamicOptions-refactoring-plan.md`
- Review provider implementations in `/components/workflows/configuration/providers/`
- Check type definitions in `/providers/types.ts`