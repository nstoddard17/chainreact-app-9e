import { create } from "zustand"
import { persist } from "zustand/middleware"

// Generic Cache Store Template
export const createCacheStore = <T>(name: string) => {
  // Define the store state interface
  interface CacheState<T> {
    data: T | null
    loading: boolean
    error: string | null
    lastFetched: number | null
    
    // Methods
    setData: (data: T) => void
    clearData: () => void
    setLoading: (loading: boolean) => void
    setError: (error: string | null) => void
    isStale: (maxAge?: number) => boolean
  }

  return create<CacheState<T>>()(
    persist(
      (set, get) => ({
        data: null,
        loading: false,
        error: null,
        lastFetched: null,
        
        setData: (data: T) => set({ 
          data, 
          lastFetched: Date.now(), 
          loading: false,
          error: null 
        }),
        
        clearData: () => set({ 
          data: null, 
          lastFetched: null,
          error: null 
        }),
        
        setLoading: (loading: boolean) => set({ loading }),
        
        setError: (error: string | null) => set({ 
          error,
          loading: false
        }),
        
        isStale: (maxAge = 5 * 60 * 1000) => {
          const { lastFetched } = get()
          if (!lastFetched) return true
          return Date.now() - lastFetched > maxAge
        }
      }),
      {
        name: `chainreact-cache-${name}`,
        storage: typeof window !== 'undefined' 
          ? {
              getItem: (name) => {
                const value = localStorage.getItem(name)
                return value ? JSON.parse(value) : null
              },
              setItem: (name, value) => {
                localStorage.setItem(name, JSON.stringify(value))
              },
              removeItem: (name) => {
                localStorage.removeItem(name)
              },
            }
          : undefined,
      }
    )
  )
}

// Helper function for loading data once
export async function loadOnce<T>({
  getter,
  setter,
  fetcher,
  options = {},
}: {
  getter: () => T | null
  setter: (data: T) => void
  fetcher: () => Promise<T>
  options?: {
    maxAge?: number
    forceRefresh?: boolean
    onError?: (error: any) => void
    onSuccess?: (data: T) => void
    setLoading?: (loading: boolean) => void
    checkStale?: () => boolean
  }
}): Promise<T | null> {
  const { 
    maxAge = 5 * 60 * 1000, // 5 minutes default
    forceRefresh = false,
    onError,
    onSuccess,
    setLoading,
    checkStale 
  } = options

  // Get current data from store
  const currentData = getter()
  
  // Determine if we need to fetch
  const isStale = checkStale ? checkStale() : false
  const shouldFetch = forceRefresh || !currentData || isStale

  if (!shouldFetch) {
    return currentData
  }

  // Set loading state if provided
  if (setLoading) {
    setLoading(true)
  }

  try {
    // Fetch data
    const data = await fetcher()
    
    // Update store
    setter(data)
    
    // Call success callback if provided
    if (onSuccess) {
      onSuccess(data)
    }
    
    return data
  } catch (error) {
    // Call error callback if provided
    if (onError) {
      onError(error)
    }
    
    console.error("Error loading data:", error)
    return null
  } finally {
    // Clear loading state
    if (setLoading) {
      setLoading(false)
    }
  }
}

// Registry of stores for auth-based clearing
const storeRegistry: Array<{ clearData: () => void }> = []

// Register a store for auth-based clearing
export function registerStore(store: { clearData: () => void }) {
  storeRegistry.push(store)
  return () => {
    const index = storeRegistry.indexOf(store)
    if (index !== -1) {
      storeRegistry.splice(index, 1)
    }
  }
}

// Clear all registered stores
export function clearAllStores() {
  storeRegistry.forEach(store => {
    store.clearData()
  })
} 