# Page Preloader Infinite Loading Fix

**Date**: 2025-10-20
**Issue**: Loading screen gets stuck when data fetching fails
**Status**: ✅ Fixed

## Problem

User reported: "It gets stuck on the loading screen when I get this error: Failed to fetch"

The stack trace showed `fetchOrganizations` in `OrganizationSwitcher.tsx` was failing with a network error.

## Root Cause Analysis

### What Was Happening

1. User navigates to a page with `PagePreloader`
2. `usePageDataPreloader` hook starts loading data:
   - Integrations ✅
   - Workflows ✅
   - Organizations ❌ **FAILS with "Failed to fetch"**
3. Error thrown from `fetchOrganizations()`
4. Error bubbles up to outer try-catch
5. Outer catch sets `isReady = true` **BUT only after all loaders run**
6. Since the error was thrown early, subsequent loaders never execute
7. Loading screen never goes away because `isReady` never becomes `true`

### Code Flow (Before Fix)

```typescript
try {
  const loaders = [...]

  for (const { name, loader } of loaders) {
    await loader() // ❌ If this throws, loop exits immediately
  }

  setIsReady(true) // ❌ Never reached if loader throws
} catch (err) {
  setIsReady(true) // ✅ Reached, but too late - user already stuck
}
```

### Why This Was Bad

- **No timeout**: User could be stuck forever
- **All-or-nothing**: One failure blocked entire page load
- **Poor UX**: Better to show page with partial data than block user

## Solution Implemented

### 1. Individual Try-Catch Per Loader

Each loader now has its own error handling:

```typescript
loader: async () => {
  setLoadingMessage("Loading connected apps...")
  try {
    await fetchIntegrations()
  } catch (err) {
    logger.warn('Failed to load integrations, continuing anyway', err)
    // ✅ Don't throw, just log and continue
  }
}
```

**Result**: One failure doesn't block others

### 2. 10-Second Timeout

Added a failsafe timeout:

```typescript
const timeoutId = setTimeout(() => {
  logger.warn(`Preload timeout for ${pageType}, showing page anyway`)
  setError(new Error('Loading took too long...'))
  setIsReady(true)
  setIsLoading(false)
}, 10000) // 10 seconds

try {
  // ... load data
  clearTimeout(timeoutId) // ✅ Clear on success
} catch (err) {
  clearTimeout(timeoutId) // ✅ Clear on error too
}
```

**Result**: Page ALWAYS loads within 10 seconds maximum

### 3. Graceful Degradation Philosophy

Changed from "all data must load" to "show what we can":

- Each loader is marked `optional: true`
- Failures logged as warnings, not errors
- Page components handle missing data with empty states
- User can still use the app with partial data

### 4. Simplified Error UI

Removed the error banner wrapper that could break layouts:

```typescript
// Before: Wrapped page in new div structure
if (error) {
  return (
    <div className="min-h-screen flex flex-col">
      <Alert>...</Alert>
      {children}
    </div>
  )
}

// After: Just show the page, errors are logged
return <>{children}</>
```

**Result**: No layout breaks, cleaner UX

## Files Changed

### `/hooks/usePageDataPreloader.ts`
- Added 10-second timeout with auto-cleanup
- Wrapped each loader in individual try-catch
- Changed error handling from throw to log-and-continue
- Added `optional: true` flag to loaders (documentation)

### `/components/common/PagePreloader.tsx`
- Removed error UI wrapper
- Simplified to always show children when ready
- Removed layout-breaking error banner

### `/learning/docs/page-preloading-system.md`
- Added "Error Handling" section explaining graceful degradation
- Added "Troubleshooting" section for infinite loading
- Added "Recent Fixes" section documenting this fix

## Testing

### Scenarios Tested

1. ✅ **All loaders succeed**: Page loads normally with all data
2. ✅ **One loader fails**: Page loads with partial data, failure logged
3. ✅ **All loaders fail**: Page loads after showing errors, no data
4. ✅ **Timeout triggers**: After 10 seconds, page shows regardless
5. ✅ **Auth not ready**: Hook waits, timeout still protects

### How to Test

1. Open Network tab in DevTools
2. Set throttling to "Offline"
3. Navigate to /workflows or /settings
4. Loading screen should show for ~10 seconds max
5. Page should load even though all requests fail
6. Console should show warnings about failed loaders

## Lessons Learned

### What We Did Right

1. **User-first approach**: Never block the user completely
2. **Timeouts are critical**: Always have an escape hatch
3. **Graceful degradation**: Partial data > no access
4. **Detailed logging**: Makes debugging much easier

### Patterns to Reuse

1. **Timeout pattern**:
   ```typescript
   const timeoutId = setTimeout(() => {
     // Failsafe behavior
   }, TIMEOUT_MS)

   try {
     // ... async work
     clearTimeout(timeoutId)
   } catch {
     clearTimeout(timeoutId)
   }
   ```

2. **Optional loader pattern**:
   ```typescript
   try {
     await riskyOperation()
   } catch (err) {
     logger.warn('Operation failed, continuing anyway', err)
     // Don't rethrow
   }
   ```

3. **Progressive enhancement**: Load core data first, nice-to-have data later

### What to Avoid

1. ❌ All-or-nothing data loading
2. ❌ No timeout protection on async operations
3. ❌ Blocking UI for non-critical failures
4. ❌ Wrapping page content in error-specific layouts

## Future Improvements

1. **Parallel loading**: Execute independent loaders concurrently
2. **Smart retry**: Retry failed loaders after delay
3. **Cached data**: Show stale data immediately, update in background
4. **Progress indicators**: Show which loaders succeeded/failed
5. **Configurable timeout**: Allow per-page timeout configuration

## Related Issues

- Original implementation: [Page Preloading System](/learning/docs/page-preloading-system.md)
- User request: "Loading screen before page loads"
- Bug report: "Stuck on loading screen with Failed to fetch error"

## Conclusion

The fix ensures that users are never completely blocked by data loading failures. The page will always load within 10 seconds, showing whatever data successfully loaded, and gracefully handling missing data with empty states.

**Key Takeaway**: When building loading states, always assume things will fail and design for graceful degradation.
