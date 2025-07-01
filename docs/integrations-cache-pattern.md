# Integrations Caching Pattern

This document explains how to implement client-side caching for integrations data using our reusable Zustand caching pattern.

## Overview

The integrations caching pattern allows your application to:

1. Fetch and store user integrations in client-side cache
2. Avoid redundant API calls between page navigations
3. Clear cached data on logout
4. Optionally hydrate the cache with server-rendered data

## Implementation Components

### 1. Integrations Cache Store

The core of the pattern is the `integrationCacheStore.ts` file which defines:

- A type-safe Zustand store for integrations
- Helper functions for interacting with the store
- Integration with the auth-based cache clearing system

```typescript
// stores/integrationCacheStore.ts
import { createCacheStore, loadOnce, registerStore } from "./cacheStore"

// Create the store
export const useIntegrationsStore = createCacheStore<Integration[]>("userIntegrations")

// Register for auth-based clearing
registerStore({
  clearData: () => useIntegrationsStore.getState().clearData()
})

// Helper for loading with cache
export async function loadIntegrationsOnce(userId: string, forceRefresh = false) {
  return loadOnce({
    getter: () => useIntegrationsStore.getState().data,
    setter: (data) => useIntegrationsStore.getState().setData(data),
    fetcher: () => fetchIntegrations(userId),
    // Additional options...
  })
}
```

### 2. Integrations Cache Hook

A custom hook that provides a clean API for components to interact with the cached data:

```typescript
// hooks/use-integrations-cache.ts
export function useIntegrationsCache() {
  // Initialize cache manager (for auth changes)
  useCacheManager()
  
  // Get store state
  const { data: integrations, loading, error } = useIntegrationsStore()
  
  // Helper functions and state...
  
  return {
    integrations,
    loading,
    error,
    refreshIntegrations,
    // Other methods...
  }
}
```

### 3. Component Usage (Client-side only)

For client-side rendering, simply use the hook in your component:

```tsx
// components/integrations/IntegrationsWithCache.tsx
export function IntegrationsWithCache() {
  const { 
    integrations,
    loading,
    error,
    // Other methods...
  } = useIntegrationsCache()
  
  // Render with cached data
}
```

### 4. SSR with Hydration

For server-side rendering with client hydration:

```tsx
// Server Component
export default async function SSRIntegrationsPage() {
  // Fetch data on the server
  const serverIntegrations = await fetchIntegrationsFromServer()
  
  // Pass to client component for hydration
  return <SSRIntegrationsExample serverIntegrations={serverIntegrations} />
}

// Client Component
export function SSRIntegrationsExample({ serverIntegrations }) {
  const setStoreData = useIntegrationsStore(state => state.setData)
  
  // Hydrate the store with server data
  useEffect(() => {
    if (serverIntegrations?.length) {
      setStoreData(serverIntegrations)
    }
  }, [serverIntegrations, setStoreData])
  
  // Rest of component...
}
```

### 5. Auth State Change Handling

The auth state change handling is managed by the `useCacheManager` hook, which automatically clears all registered caches when a user logs out:

```tsx
// hooks/use-cache-manager.ts
export function useCacheManager() {
  useEffect(() => {
    const { subscription } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        clearAllStores() // Clears all registered stores
      }
    })
    
    return () => subscription.unsubscribe()
  }, [])
}
```

## Integration with Existing Code

When integrating this pattern with existing code, follow these steps:

1. Create the store with `createCacheStore<Integration[]>("userIntegrations")`
2. Register the store with `registerStore({ clearData: () => store.getState().clearData() })`
3. Create a `loadIntegrationsOnce` function using `loadOnce()`
4. Create a hook that uses the store and handles initialization
5. Use the hook in your components

## Benefits

- **Performance**: Reduces API calls and improves perceived performance
- **UX**: Eliminates loading states on subsequent page visits
- **Developer Experience**: Clean API with type safety
- **Security**: Automatic cache clearing on logout

## Best Practices

1. **Always use the hook**: Don't access the store directly from components
2. **Handle loading states**: Always account for loading and error states
3. **Register for cleanup**: Always register stores for auth-based clearing
4. **Consider SSR**: Use server-side rendering for initial page load when possible
5. **Set appropriate stale times**: Configure cache expiration based on data volatility 