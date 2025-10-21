# Page Preloading System

**Created**: 2025-10-20
**Status**: Implemented
**Affects**: All major pages (Workflows, AI Assistant, Settings, Templates, Apps)

## Overview

The page preloading system ensures that all necessary data is loaded **before** the page content is displayed to the user. This eliminates the jarring experience of seeing spinning loaders appear after the page has already loaded.

## Problem Solved

**Before**:
- Page loads immediately
- Then each component shows individual loading spinners as data loads
- User sees content shifting and loaders appearing/disappearing
- Poor UX, feels unpolished

**After**:
- Full-screen loading overlay appears
- All data loads in background (workflows, integrations, organizations, etc.)
- Page only displays once everything is ready
- Smooth, professional experience

## Architecture

### 1. Core Hook: `usePageDataPreloader`

**Location**: `/hooks/usePageDataPreloader.ts`

```typescript
const { isLoading, isReady, error, loadingMessage } = usePageDataPreloader(
  "workflows",  // Page type
  {
    skipWorkflows: false,
    skipIntegrations: false,
    skipOrganizations: false,
    customLoaders: []
  }
)
```

**Features**:
- Preloads data based on page type
- Shows progressive loading messages
- Handles errors gracefully
- Waits for auth initialization
- Executes loaders sequentially with feedback

**Page Types**:
- `workflows` - Loads workflows + integrations
- `ai-assistant` - Loads integrations + conversation history
- `settings` - Loads integrations + organizations
- `templates` - Loads workflows + integrations
- `analytics` - Loads workflows + integrations
- `teams` - Loads organizations + integrations
- `apps` - Loads integrations only (skips workflows)

### 2. Wrapper Component: `PagePreloader`

**Location**: `/components/common/PagePreloader.tsx`

Wraps page content and shows loading screen until data is ready:

```typescript
<PagePreloader
  pageType="workflows"
  loadingTitle="Loading Workflows"
  loadingDescription="Fetching your workflows and connected integrations..."
>
  <YourPageContent />
</PagePreloader>
```

**Features**:
- Full-screen loading overlay during data fetch
- Error state with retry button
- Seamless transition to content when ready

### 3. Loading Screen Components

**Location**: `/components/ui/loading-screen.tsx`

- `LoadingScreen` - Base component with lightning loader
- `FullScreenLoadingScreen` - Full-screen overlay version
- Specialized screens: `DataLoadingScreen`, `WorkflowLoadingScreen`, etc.

## Implementation Guide

### For New Pages

**Option 1: Wrapper in Page Component** (Recommended for simple pages)

```typescript
// app/your-page/page.tsx
import { PagePreloader } from "@/components/common/PagePreloader"

export default async function YourPage() {
  await requireUsername()

  return (
    <PagePreloader
      pageType="workflows"
      loadingTitle="Loading Your Page"
      loadingDescription="Fetching data..."
    >
      <YourPageLayout>
        <YourContent />
      </YourPageLayout>
    </PagePreloader>
  )
}
```

**Option 2: Wrapper Export** (Recommended for complex content components)

```typescript
// components/YourContent.tsx
export function YourContent() {
  // Your content component
}

// Add at bottom of file
import { PagePreloader } from "@/components/common/PagePreloader"

export function YourContentWithPreloader() {
  return (
    <PagePreloader
      pageType="workflows"
      loadingTitle="Loading"
      loadingDescription="Loading data..."
    >
      <YourContent />
    </PagePreloader>
  )
}

// app/your-page/page.tsx
import { YourContentWithPreloader } from "@/components/YourContent"

export default async function YourPage() {
  return <YourContentWithPreloader />
}
```

### Custom Data Loaders

For pages that need custom data beyond the standard sets:

```typescript
<PagePreloader
  pageType="workflows"
  customLoaders={[
    async () => {
      // Load custom data
      const data = await fetchCustomData()
      setCustomData(data)
    },
    async () => {
      // Load another dataset
      const more = await fetchMoreData()
      setMoreData(more)
    }
  ]}
>
  <YourContent />
</PagePreloader>
```

### Skip Standard Loaders

```typescript
<PagePreloader
  pageType="apps"
  skipWorkflows={true}  // Apps page doesn't need workflows
  skipOrganizations={true}
>
  <AppsContent />
</PagePreloader>
```

## Data Loading Strategy

### What Gets Loaded

1. **Always** (unless skipped):
   - User auth state (automatic)
   - Integration connections

2. **Page-specific**:
   - `workflows`, `templates`, `analytics`: Workflows list
   - `teams`, `settings`: Organizations/workspaces
   - `ai-assistant`: Conversation history

### Loading Order

All loaders execute **sequentially** with progress updates:

1. Integrations → "Loading connected apps..."
2. Workflows → "Loading your workflows..."
3. Organizations → "Loading workspaces..."
4. Custom loaders → "Loading additional data..."
5. Finalization → "Finalizing..." (150ms for state sync)

### Error Handling

**Strict Loading with Auto-Retry** - The system ensures ALL data loads successfully before showing the page:

1. **All-or-Nothing Approach**:
   - Page will NOT load until ALL data fetches succeed with 200 responses
   - If any loader fails, the entire sequence retries
   - Ensures page always has complete data when shown

2. **Automatic Retry with Exponential Backoff**:
   - Failed requests automatically retry (up to 50 attempts)
   - Retry delays: 1s → 2s → 4s → 5s (capped at 5 seconds)
   - User sees: "Connection issue detected. Retrying in Xs..."
   - Keeps trying until network connection is restored

3. **Network Resilience**:
   - Handles temporary network issues automatically
   - User doesn't need to manually refresh
   - Loading screen shows retry countdown
   - Works through brief connectivity drops

4. **Philosophy**: Wait for complete data, never show partial/broken page
   - Loading screen stays until everything is ready
   - No empty states or missing data scenarios
   - User gets full experience or waits for connection
   - Better to wait than show incomplete page

## Pages Updated

✅ **Workflows** (`/workflows`) - HomeContent with preloader
✅ **AI Assistant** (`/ai-assistant`) - Full page wrapper
✅ **Settings** (`/settings`) - SettingsContent with preloader
✅ **Templates** (`/templates`) - Full page wrapper
✅ **Apps** (`/apps`) - Full page wrapper (skips workflows)

## Migration Checklist

When adding preloading to a new page:

- [ ] Identify what data the page needs
- [ ] Choose appropriate `pageType` or use custom loaders
- [ ] Decide on Option 1 (page wrapper) vs Option 2 (content wrapper)
- [ ] Add `PagePreloader` wrapper with descriptive loading messages
- [ ] Test: Verify loading screen shows before content
- [ ] Test: Verify no spinners appear after content loads
- [ ] Test: Verify error handling works (simulate failed fetch)

## Performance Considerations

### Pros
- ✅ Better UX - no content shifting or post-load spinners
- ✅ Perceived performance - feels faster even if same total time
- ✅ Professional appearance
- ✅ Centralized loading logic

### Cons
- ⚠️ Slightly longer time to first content (acceptable tradeoff)
- ⚠️ Sequential loading (but with progress feedback)

### Optimization Tips

1. **Skip unnecessary data**:
   ```typescript
   skipWorkflows={true}  // If page doesn't use workflows
   ```

2. **Use specialized page types**:
   - Don't use `workflows` type for pages that don't need workflows
   - `apps` type is optimized to skip workflows

3. **Keep custom loaders focused**:
   - Only load what's immediately needed
   - Defer nice-to-have data to component mount

4. **Cache at store level**:
   - Stores (workflowStore, integrationStore) cache results
   - Subsequent page visits are instant

## Troubleshooting

### Loading screen stays visible with "Retrying" message

**Symptoms**: Page shows loading screen with retry countdown

**Common Causes**:
1. **Network connectivity issue**: Check your internet connection
2. **API endpoint down**: Check if Supabase/backend is accessible
3. **Authentication expired**: Session may have timed out
4. **CORS or network policy**: Corporate firewall blocking requests

**What's Happening**:
- System is automatically retrying failed requests
- Will keep retrying up to 50 times with exponential backoff
- Check browser console to see which specific API call is failing

**Solution**:
- Wait for network to restore (system will auto-recover)
- Check browser console for specific error
- Refresh page if auth session expired
- Check Network tab to identify failing endpoint

### Loading screen stays at specific message

**Symptoms**: Loading stuck at "Loading connected apps..." or "Loading workflows..."

**Diagnosis**: That specific loader is failing repeatedly

**Steps**:
1. Open browser DevTools → Network tab
2. Look for failed requests (red status codes)
3. Check request details for error message
4. Common issues:
   - 401 Unauthorized → Session expired, refresh page
   - 403 Forbidden → Permission issue
   - 500 Server Error → Backend issue
   - Failed to fetch → Network/CORS issue

### Data still showing spinners after load

**Cause**: Component has its own data fetching in useEffect
**Fix**: Move that data fetching to a custom loader in PagePreloader

### Auth not initialized error

**Cause**: Preloader running before auth is ready
**Fix**: Hook already waits for `authInitialized` - check auth store

### Build errors about missing exports

**Cause**: Forgot to export wrapper component
**Fix**: Make sure `YourContentWithPreloader` is exported

## Implementation History

### 2025-10-20: Strict Loading with Auto-Retry

**User Requirement**: "Make it wait until everything loads successfully with 200 response before showing page"

**Approach**: All-or-nothing loading with automatic retry

**Implementation**:
1. ✅ Removed timeout - page waits indefinitely for successful load
2. ✅ Removed individual try-catch - failures trigger full retry
3. ✅ Added retry loop with exponential backoff (up to 50 attempts)
4. ✅ Shows countdown timer during retries
5. ✅ Only shows page when ALL data loads successfully

**Code Changes**:
- `/hooks/usePageDataPreloader.ts`:
  - Added while loop for retry logic
  - Exponential backoff: 1s → 2s → 4s → 5s (capped)
  - Retry counter shows in loading message
  - No timeout - waits for success

**Behavior**:
- ✅ Page guaranteed to have all data when shown
- ✅ Automatic recovery from temporary network issues
- ✅ User sees retry progress
- ✅ No partial/broken page states

**Result**: Page only loads when 100% of data is available

## Future Enhancements

1. **Parallel loading**: Execute independent loaders in parallel
2. **Progress bar**: Show % complete based on loader count
3. **Smart caching**: Skip re-fetching recently loaded data
4. **Prefetch on hover**: Start loading data when user hovers over nav links
5. **Route transitions**: Animate between loading screen and content

## Related Files

- `/hooks/usePageDataPreloader.ts` - Main hook
- `/components/common/PagePreloader.tsx` - Wrapper component
- `/components/ui/loading-screen.tsx` - Loading UI components
- `/stores/*Store.ts` - Data stores with fetch methods

## References

- Next.js Loading UI: https://nextjs.org/docs/app/building-your-application/routing/loading-ui-and-streaming
- UX Best Practices: Skeleton screens vs spinners vs full-screen loaders
- This implementation: Full-screen approach for better UX
