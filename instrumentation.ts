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

    // Delay initialization to avoid issues during build
    setTimeout(async () => {
      try {
        // Double-check we haven't initialized in the meantime
        if (isDiscordInitialized) {
          return
        }

        // Dynamically import to avoid build-time issues
        const { checkDiscordBotConfig } = await import('@/lib/utils/discordConfig')
        const config = checkDiscordBotConfig()

        if (config.isConfigured) {
          console.log('🤖 Discord bot configured, initializing gateway connection...')

          // Mark as initialized BEFORE attempting connection
          isDiscordInitialized = true

          // Dynamically import Discord gateway
          const { initializeDiscordGateway } = await import('@/lib/integrations/discordGateway')

          // Start the Discord gateway connection (with singleton protection)
          await initializeDiscordGateway()

          console.log('✅ Discord bot gateway connection initialized')
        } else {
          console.log('⚠️ Discord bot not configured:', config.missingVars.join(', '))
        }
      } catch (error) {
        console.error('❌ Failed to initialize Discord bot:', error)
        // Reset flag on error so it can be retried if needed
        isDiscordInitialized = false
      }
    }, 1000) // 1 second delay to let the server fully initialize
  }
}