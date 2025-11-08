import { create } from 'zustand'

interface CacheEntry {
  data: any
  timestamp: number
  ttl: number // milliseconds
}

interface ConfigCacheStore {
  cache: Record<string, CacheEntry>

  // Get from cache (returns null if expired or missing)
  get: (key: string) => any | null

  // Set cache entry with TTL
  set: (key: string, data: any, ttl?: number) => void

  // Invalidate specific key
  invalidate: (key: string) => void

  // Invalidate all entries for a provider
  invalidateProvider: (provider: string, integrationId?: string) => void

  // Clear all cache
  clear: () => void

  // Get cache stats for debugging
  getStats: () => {
    totalEntries: number
    validEntries: number
    expiredEntries: number
  }
}

const DEFAULT_TTL = 5 * 60 * 1000 // 5 minutes

export const useConfigCacheStore = create<ConfigCacheStore>((set, get) => ({
  cache: {},

  get: (key: string) => {
    const entry = get().cache[key]
    if (!entry) return null

    const now = Date.now()
    if (now - entry.timestamp > entry.ttl) {
      // Expired - remove it
      set((state) => {
        const newCache = { ...state.cache }
        delete newCache[key]
        return { cache: newCache }
      })
      return null
    }

    return entry.data
  },

  set: (key: string, data: any, ttl = DEFAULT_TTL) => {
    set((state) => ({
      cache: {
        ...state.cache,
        [key]: {
          data,
          timestamp: Date.now(),
          ttl
        }
      }
    }))
  },

  invalidate: (key: string) => {
    set((state) => {
      const newCache = { ...state.cache }
      delete newCache[key]
      return { cache: newCache }
    })
  },

  invalidateProvider: (provider: string, integrationId?: string) => {
    set((state) => {
      const newCache = { ...state.cache }
      const prefix = integrationId
        ? `${provider}:${integrationId}:`
        : `${provider}:`

      Object.keys(newCache).forEach(key => {
        if (key.startsWith(prefix)) {
          delete newCache[key]
        }
      })

      return { cache: newCache }
    })
  },

  clear: () => set({ cache: {} }),

  getStats: () => {
    const cache = get().cache
    const now = Date.now()

    const entries = Object.values(cache)
    const validEntries = entries.filter(entry =>
      now - entry.timestamp <= entry.ttl
    )
    const expiredEntries = entries.filter(entry =>
      now - entry.timestamp > entry.ttl
    )

    return {
      totalEntries: entries.length,
      validEntries: validEntries.length,
      expiredEntries: expiredEntries.length
    }
  }
}))
