import { create } from "zustand"

// Base store interface for shared functionality
export interface BaseStore {
  loading: boolean
  error: string | null
  loadingStates: Record<string, boolean>
  setLoading: (key: string, loading: boolean) => void
  setError: (error: string | null) => void
  clearError: () => void
}

// Generic store creator with common functionality
export const createBaseStore = (initialState: any, actions: any) => {
  return create((set: any, get: any) => ({
    loading: false,
    error: null,
    loadingStates: {},

    setLoading: (key: string, loading: boolean) =>
      set((state: any) => ({
        loadingStates: {
          ...state.loadingStates,
          [key]: loading,
        },
      })),

    setError: (error: string | null) => set({ error }),
    clearError: () => set({ error: null }),

    ...initialState,
    ...actions(set, get),
  }))
}

// Export get and set for direct use
export const get = (store: any) => store.getState()
export const set = (store: any, partial: any) => store.setState(partial)
