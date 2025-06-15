connectIntegration: async (providerId: string) => {
  const { setLoading, providers } = get()
  const provider = providers.find((p) => p.id === providerId)

  if (!provider) {
    throw new Error(`Provider ${providerId} not found`)
  }

  if (!provider.isAvailable) {
    throw new Error(`${provider.name} integration is not configured. Missing environment variables.`)
  }

  setLoading(`connect-${providerId}`, true)

  try {
    console.log(`🔗 Connecting to ${providerId}...`)

    const supabase = getSupabaseClient()
    if (!supabase) throw new Error("Supabase client not available")

    const {
      data: { session },
    } = await supabase.auth.getSession()

    if (!session?.access_token) {
      throw new Error("No valid session found. Please log in again.")
    }

    const response = await fetch("/api/integrations/auth/generate-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({
        provider: providerId,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.error || "Failed to generate OAuth URL")
    }

    const data = await response.json()

    if (data.success && data.authUrl) {
      const popup = window.open(data.authUrl, "_blank", "width=600,height=700,scrollbars=yes,resizable=yes")
      if (!popup) throw new Error("Popup blocked. Please allow popups for this site.")

      console.log(`✅ OAuth popup opened for ${providerId}`)

      let closedByMessage = false

      const checkClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkClosed)
          window.removeEventListener("message", messageHandler)

          if (!closedByMessage) {
            console.log(`❌ Popup closed manually for ${providerId}`)
            setLoading(`connect-${providerId}`, false)
            get().fetchIntegrations(true)
          }
        }
      }, 500)

      const messageHandler = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return
        if (event.data?.provider !== providerId) return

        closedByMessage = true
        clearInterval(checkClosed)
        window.removeEventListener("message", messageHandler)

        popup.close()

        if (event.data?.type === "oauth-success") {
          console.log(`✅ OAuth success for ${providerId}`)
          setLoading(`connect-${providerId}`, false)
          get().fetchIntegrations(true)
        } else if (event.data?.type === "oauth-error") {
          console.error(`❌ OAuth error for ${providerId}:`, event.data.error)
          setLoading(`connect-${providerId}`, false)
          set({ error: event.data.error || `Failed to connect ${providerId}` })
        }
      }

      window.addEventListener("message", messageHandler)

      // Final cleanup after 5 minutes in case of nothing happening
      setTimeout(() => {
        if (!popup.closed) {
          clearInterval(checkClosed)
          popup.close()
        }
        window.removeEventListener("message", messageHandler)
        setLoading(`connect-${providerId}`, false)
      }, 300000) // 5 minutes

    } else {
      throw new Error(data.error || "Failed to generate OAuth URL")
    }
  } catch (error: any) {
    console.error(`❌ Failed to connect ${providerId}:`, error)
    set({ error: error.message })
    throw error
  } finally {
    // No-op here — handled dynamically when popup closes
  }
}
