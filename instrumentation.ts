// Track initialization to prevent multiple attempts
let isDiscordInitialized = false

export async function register() {
  // Only run on server side, not during build, and only in Node.js runtime
  if (
    typeof window === 'undefined' &&
    process.env.NODE_ENV !== 'test' &&
    process.env.NEXT_RUNTIME === 'nodejs'
  ) {
    console.log('🚀 Starting server-side instrumentation...')

    // Prevent multiple initializations (Next.js may call register multiple times)
    if (isDiscordInitialized) {
      console.log('⏭️ Discord bot already initialized, skipping...')
      return
    }

    // Check if Discord bot should be disabled (for development without Discord)
    if (process.env.DISABLE_DISCORD_BOT === 'true') {
      console.log('⚠️ Discord bot disabled via DISABLE_DISCORD_BOT environment variable')
      return
    }

    // Non-blocking Discord initialization - don't await, let it run in background
    setTimeout(() => {
      // Run Discord initialization in background without blocking the server
      (async () => {
        try {
          // Double-check we haven't initialized in the meantime
          if (isDiscordInitialized) {
            return
          }

          // Dynamically import to avoid build-time issues
          const { checkDiscordBotConfig } = await import('@/lib/utils/discordConfig')
          const config = checkDiscordBotConfig()

          if (config.isConfigured) {
            console.log('🤖 Discord bot configured, initializing gateway connection in background...')

            // Mark as initialized BEFORE attempting connection
            isDiscordInitialized = true

            // Dynamically import Discord gateway
            const { initializeDiscordGateway } = await import('@/lib/integrations/discordGateway')

            // Start the Discord gateway connection in background (non-blocking)
            // Don't await - let it complete in the background
            initializeDiscordGateway()
              .then(() => {
                console.log('✅ Discord bot gateway connection initialized')
              })
              .catch((error) => {
                console.warn('⚠️ Discord bot connection failed (non-critical):', error.message)
                // Don't reset the flag - we don't want to retry on every request
              })
          }
        } catch (error) {
          console.warn('⚠️ Discord bot initialization skipped (non-critical):', error)
          // This is not critical for the application to function
        }
      })() // Execute immediately without blocking
    }, 1000) // 1 second delay to let the server fully initialize
  }
}