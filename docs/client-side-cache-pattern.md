# Client-Side Caching Pattern

This document explains the reusable client-side caching pattern implemented in the ChainReact application to avoid unnecessary Supabase queries and improve performance.

## Overview

The pattern uses Zustand stores to maintain cached data between page navigations and user sessions. It includes:

1. A reusable cache store template
2. A `loadOnce()` helper function
3. Automatic cache invalidation based on auth state
4. Optional SSR hydration

## Components

### 1. Cache Store Template

The `createCacheStore<T>` function creates a type-safe Zustand store with consistent methods:

```typescript
// From: stores/cacheStore.ts
const useMyStore = createCacheStore<MyDataType>("storeName")

// Access the store
const { data, loading, error, lastFetched } = useMyStore()

// Or access methods
const { setData, clearData, setLoading, setError, isStale } = useMyStore.getState()
```

### 2. loadOnce() Helper

The `loadOnce()` function avoids repeated data fetching by checking if data already exists in the store:

```typescript
// Example usage
await loadOnce({
  getter: () => useMyStore.getState().data, // Get existing data
  setter: (data) => useMyStore.getState().setData(data), // Store new data
  fetcher: fetchFromSupabase, // Function to fetch data if needed
  options: {
    forceRefresh: false, // Optional override to force refresh
    maxAge: 5 * 60 * 1000, // Consider data stale after 5 minutes
    setLoading: (loading) => useMyStore.getState().setLoading(loading),
    onError: (error) => useMyStore.getState().setError(error.message),
    checkStale: () => useMyStore.getState().isStale() // Custom stale check
  }
})
```

### 3. Authentication-based Cache Clearing

Stores can be registered to be automatically cleared on logout:

```typescript
// Register a store to be cleared on logout
registerStore({
  clearData: () => useMyStore.getState().clearData()
})

// Use the cache manager hook in your component
function MyComponent() {
  useCacheManager() // Sets up auth listeners
  // ...
}
```

### 4. SSR Hydration

For optimal performance, data can be pre-fetched on the server and hydrated into the store:

```typescript
// Server Component (App Router)
export default async function MyPage() {
  // Fetch data on the server
  const serverData = await fetchDataOnServer()
  
  // Pass to client component
  return <MyClientComponent serverData={serverData} />
}

// Client Component
export function MyClientComponent({ serverData }) {
  // Hydrate store with server data
  useEffect(() => {
    if (serverData) {
      useMyStore.getState().setData(serverData)
    }
  }, [serverData])
  
  // ...
}
```

## Implementation Examples

- `stores/userProfileStore.ts`: Example store for user profile data
- `components/CachedDataExample.tsx`: Example component using multiple cached data sources
- `hooks/use-cache-manager.ts`: Hook to manage auth-based cache clearing

## Best Practices

1. **Register all stores** for auth-based clearing to prevent stale data after logout
2. **Check for staleness** to refresh data that may be outdated
3. **Use SSR hydration** for initial page loads to improve performance
4. **Use TypeScript generics** for type safety
5. **Implement custom stale checks** for different data types as needed

## Extending the Pattern

To add a new cached data type:

1. Create a new store with `createCacheStore<YourType>("store-name")`
2. Register it for auth-based clearing
3. Create helper functions to load data
4. Use the store in your components

The pattern can be extended with additional features like:

- Time-based automatic refresh
- Offline support with localStorage persistence
- Subscription-based real-time updates 