"use client"

import { create } from "zustand"

interface UXState {
  builderPreferences: any
  comments: Record<string, any[]>
  versions: Record<string, any[]>
  debugSession: any
  loading: boolean
  error: string | null
}

interface UXActions {
  fetchBuilderPreferences: () => Promise<void>
  fetchComments: (workflowId: string) => Promise<void>
  fetchVersions: (workflowId: string) => Promise<void>
  updateBuilderPreferences: (preferences: any) => Promise<void>
}

export const useUXStore = create<UXState & UXActions>((set, get) => ({
  builderPreferences: null,
  comments: {},
  versions: {},
  debugSession: null,
  loading: false,
  error: null,

  fetchBuilderPreferences: async () => {
    set({ loading: true, error: null })
    try {
      // Mock implementation
      set({
        builderPreferences: {
          auto_save: true,
          snap_to_grid: true,
          grid_enabled: true,
          minimap_enabled: true,
          zoom_level: 1,
        },
        loading: false,
      })
    } catch (error: any) {
      set({ error: error.message, loading: false })
    }
  },

  fetchComments: async (workflowId: string) => {
    try {
      // Mock implementation
      set((state) => ({
        comments: {
          ...state.comments,
          [workflowId]: [],
        },
      }))
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  fetchVersions: async (workflowId: string) => {
    try {
      // Mock implementation
      set((state) => ({
        versions: {
          ...state.versions,
          [workflowId]: [],
        },
      }))
    } catch (error: any) {
      set({ error: error.message })
    }
  },

  updateBuilderPreferences: async (preferences: any) => {
    try {
      set({ builderPreferences: preferences })
    } catch (error: any) {
      set({ error: error.message })
    }
  },
}))
