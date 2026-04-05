"use client"

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SidebarState {
  isCollapsed: boolean
  isPanelOpen: boolean
  activeSection: string | null
  toggleSidebar: () => void
  setSidebarCollapsed: (collapsed: boolean) => void
  setActiveSection: (sectionId: string | null) => void
  setPanelOpen: (open: boolean) => void
  togglePanel: () => void
}

/**
 * Global sidebar state management
 * Persists sidebar collapsed state and panel open state to localStorage
 */
export const useSidebarState = create<SidebarState>()(
  persist(
    (set) => ({
      isCollapsed: false,
      isPanelOpen: true,
      activeSection: null,
      toggleSidebar: () => set((state) => ({ isCollapsed: !state.isCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ isCollapsed: collapsed }),
      setActiveSection: (sectionId) => set({ activeSection: sectionId }),
      setPanelOpen: (open) => set({ isPanelOpen: open }),
      togglePanel: () => set((state) => ({ isPanelOpen: !state.isPanelOpen })),
    }),
    {
      name: 'sidebar-state',
      partialize: (state) => ({
        isCollapsed: state.isCollapsed,
        isPanelOpen: state.isPanelOpen,
      }),
    }
  )
)
