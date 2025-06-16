import { create } from "zustand"

interface IntegrationState {
  connectedProviders: string[]
  globalPreloadingData: boolean
  preloadStarted: boolean
  connectProvider: (provider: string) => void
  disconnectProvider: (provider: string) => void
  initializeGlobalPreload: () => Promise<void>
}

export const useIntegrationStore = create<IntegrationState>((set, get) => ({
  connectedProviders: [],
  globalPreloadingData: false,
  preloadStarted: false,
  connectProvider: (provider) => {
    set((state) => ({
      connectedProviders: [...state.connectedProviders, provider],
    }))
  },
  disconnectProvider: (provider) => {
    set((state) => ({
      connectedProviders: state.connectedProviders.filter((p) => p !== provider),
    }))
  },
  initializeGlobalPreload: async () => {
    const state = get()

    if (state.globalPreloadingData || state.preloadStarted) {
      console.log("✅ Global preload already started or completed")
      return
    }

    try {
      set({ preloadStarted: true, globalPreloadingData: true })
      console.log("🚀 Starting global data preload...")

      const connectedProviders = state.connectedProviders
      if (connectedProviders.length === 0) {
        console.log("⚠️ No connected providers found for preload")
        set({ globalPreloadingData: false })
        return
      }

      // Import and use the global data preloader
      const { initializePreloadingForUser } = await import("@/lib/integrations/globalDataPreloader")

      const results = await initializePreloadingForUser(connectedProviders, (progress) => {
        console.log("📊 Preload progress:", progress)
      })

      console.log("✅ Global preload completed:", results)
      set({ globalPreloadingData: false })
    } catch (error) {
      console.error("❌ Global preload failed:", error)
      set({ globalPreloadingData: false, preloadStarted: false })
    }
  },
}))
