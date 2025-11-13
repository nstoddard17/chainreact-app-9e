import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/**
 * Persistent cache for field options and values across modal opens/closes
 * This allows configuration modals to restore field data without reloading from API
 */

interface FieldOptionsEntry {
  options: any[]
  timestamp: number
  ttl: number
}

interface FieldValuesEntry {
  values: Record<string, any>
  timestamp: number
}

interface FieldPersistenceStore {
  // Field options cache (dropdown options, etc.)
  fieldOptions: Record<string, FieldOptionsEntry>

  // Field values cache (user-selected values by node)
  fieldValues: Record<string, FieldValuesEntry>

  // Get cached options for a field
  getFieldOptions: (cacheKey: string) => any[] | null

  // Set cached options for a field
  setFieldOptions: (cacheKey: string, options: any[], ttl?: number) => void

  // Get cached field values for a node
  getFieldValues: (nodeId: string) => Record<string, any> | null

  // Set cached field values for a node
  setFieldValues: (nodeId: string, values: Record<string, any>) => void

  // Invalidate specific field options
  invalidateFieldOptions: (cacheKey: string) => void

  // Invalidate all field options for a provider
  invalidateProviderOptions: (provider: string, integrationId?: string) => void

  // Clear all cached data
  clearAll: () => void

  // Get stats for debugging
  getStats: () => {
    totalOptions: number
    totalValues: number
    expiredOptions: number
  }
}

const DEFAULT_TTL = 30 * 60 * 1000 // 30 minutes (longer than config cache for persistence)

export const useFieldPersistenceStore = create<FieldPersistenceStore>()(
  persist(
    (set, get) => ({
      fieldOptions: {},
      fieldValues: {},

      getFieldOptions: (cacheKey: string) => {
        const entry = get().fieldOptions[cacheKey]
        if (!entry) return null

        const now = Date.now()
        if (now - entry.timestamp > entry.ttl) {
          // Expired - remove it
          set((state) => {
            const newOptions = { ...state.fieldOptions }
            delete newOptions[cacheKey]
            return { fieldOptions: newOptions }
          })
          return null
        }

        return entry.options
      },

      setFieldOptions: (cacheKey: string, options: any[], ttl = DEFAULT_TTL) => {
        set((state) => ({
          fieldOptions: {
            ...state.fieldOptions,
            [cacheKey]: {
              options,
              timestamp: Date.now(),
              ttl
            }
          }
        }))
      },

      getFieldValues: (nodeId: string) => {
        const entry = get().fieldValues[nodeId]
        if (!entry) return null

        // Field values don't expire - they persist until manually cleared
        return entry.values
      },

      setFieldValues: (nodeId: string, values: Record<string, any>) => {
        set((state) => ({
          fieldValues: {
            ...state.fieldValues,
            [nodeId]: {
              values,
              timestamp: Date.now()
            }
          }
        }))
      },

      invalidateFieldOptions: (cacheKey: string) => {
        set((state) => {
          const newOptions = { ...state.fieldOptions }
          delete newOptions[cacheKey]
          return { fieldOptions: newOptions }
        })
      },

      invalidateProviderOptions: (provider: string, integrationId?: string) => {
        set((state) => {
          const newOptions = { ...state.fieldOptions }
          const prefix = integrationId
            ? `${provider}:${integrationId}:`
            : `${provider}:`

          Object.keys(newOptions).forEach(key => {
            if (key.startsWith(prefix)) {
              delete newOptions[key]
            }
          })

          return { fieldOptions: newOptions }
        })
      },

      clearAll: () => set({ fieldOptions: {}, fieldValues: {} }),

      getStats: () => {
        const options = get().fieldOptions
        const values = get().fieldValues
        const now = Date.now()

        const optionEntries = Object.values(options)
        const expiredOptions = optionEntries.filter(entry =>
          now - entry.timestamp > entry.ttl
        )

        return {
          totalOptions: optionEntries.length,
          totalValues: Object.keys(values).length,
          expiredOptions: expiredOptions.length
        }
      }
    }),
    {
      name: 'field-persistence-storage',
      // Only persist the options and values, not the functions
      partialize: (state) => ({
        fieldOptions: state.fieldOptions,
        fieldValues: state.fieldValues
      })
    }
  )
)
