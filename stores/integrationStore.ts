import { defineStore } from "pinia"
import { supabase } from "@/supabase"

interface IntegrationState {
  loading: boolean
  error: string | null
}

export const useIntegrationStore = defineStore("integration", {
  state: (): IntegrationState => ({
    loading: false,
    error: null,
  }),
  actions: {
    setLoading(loading: boolean) {
      this.loading = loading
    },
    setError(error: string | null) {
      this.error = error
    },
    clearError() {
      this.error = null
    },
    async connectIntegration(provider: string, reconnect = false, integrationId?: string) {
      try {
        this.setLoading(true)
        this.clearError()

        // Get current user
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          throw new Error("User not authenticated")
        }

        console.log(`Connecting to ${provider} for user ${user.id}`)

        // Generate auth URL with user ID
        let authUrl: string

        switch (provider) {
          case "google":
          case "google-calendar":
          case "gmail":
            const { GoogleOAuthService } = await import("@/lib/oauth/google")
            authUrl = GoogleOAuthService.generateAuthUrl(
              window.location.origin,
              reconnect,
              integrationId,
              user.id, // Pass user ID
            )
            break
          // Add other providers here
          default:
            throw new Error(`Unsupported provider: ${provider}`)
        }

        // Redirect to auth URL
        window.location.href = authUrl
      } catch (error: any) {
        console.error(`Error connecting to ${provider}:`, error)
        this.setError(error.message)
      } finally {
        this.setLoading(false)
      }
    },
  },
})
