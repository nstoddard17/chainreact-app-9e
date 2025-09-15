export async function register() {
  // Only run on server side, not during build, and only in Node.js runtime
  if (
    typeof window === 'undefined' &&
    process.env.NODE_ENV !== 'test' &&
    process.env.NEXT_RUNTIME === 'nodejs'
  ) {
    console.log('🚀 Starting server-side instrumentation...')

    // Delay initialization to avoid issues during build
    setTimeout(async () => {
      try {
        // Dynamically import to avoid build-time issues
        const { checkDiscordBotConfig } = await import('@/lib/utils/discordConfig')
        const config = checkDiscordBotConfig()

        if (config.isConfigured) {
          console.log('🤖 Discord bot configured, initializing gateway connection...')

          // Dynamically import Discord gateway
          const { initializeDiscordGateway } = await import('@/lib/integrations/discordGateway')

          // Start the Discord gateway connection
          await initializeDiscordGateway()

          console.log('✅ Discord bot gateway connection initialized')
        } else {
          console.log('⚠️ Discord bot not configured:', config.missingVars.join(', '))
        }
      } catch (error) {
        console.error('❌ Failed to initialize Discord bot:', error)
      }
    }, 1000) // 1 second delay to let the server fully initialize
  }
}