import { create } from "zustand"
import { useAuthStore } from "./authStore"

interface IntegrationState {
  loading: boolean
  error: string | null
  connectIntegration: (providerId: string) => Promise<void>
}

export const useIntegrationStore = create<IntegrationState>((set) => ({
  loading: false,
  error: null,
  connectIntegration: async (providerId: string) => {
    try {
      set({ loading: true, error: null })

      const userId = useAuthStore.getState().getCurrentUserId()
      if (!userId) {
        throw new Error("User not authenticated")
      }

      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin

      let authUrl: string

      // Handle providers that need async auth URL generation
      if (providerId === "twitter") {
        const { TwitterOAuthService } = await import("@/lib/oauth/twitter")
        authUrl = await TwitterOAuthService.generateAuthUrl(baseUrl, false, undefined, userId)
      } else {
        // Use the regular OAuth provider for other services
        const { getOAuthProvider } = await import("@/lib/oauth")
        const provider = getOAuthProvider(providerId)
        authUrl = provider.generateAuthUrl(baseUrl, false, undefined, userId)
      }

      console.log(`Opening auth URL for ${providerId}:`, authUrl)

      // Open the auth URL in a new tab
      const authWindow = window.open(authUrl, "_blank", "width=600,height=700,scrollbars=yes,resizable=yes")

      if (!authWindow) {
        throw new Error("Please allow popups for this site to connect integrations")
      }

      // Focus the auth window
      authWindow.focus()

      set({ loading: false })
    } catch (error: any) {
      console.error(`Failed to connect ${providerId}:`, error)
      set({
        loading: false,
        error: error.message || `Failed to connect ${providerId}`,
      })
      throw error
    }
  },
}))
