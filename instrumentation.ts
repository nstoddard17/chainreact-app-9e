import { logger } from '@/lib/utils/logger'

// Track initialization to prevent multiple attempts
let isDiscordInitialized = false

export async function register() {
  // Only run on server side, not during build, and only in Node.js runtime
  if (
    typeof window === 'undefined' &&
    process.env.NODE_ENV !== 'test' &&
    process.env.NEXT_RUNTIME === 'nodejs'
  ) {
    logger.debug('🚀 Starting server-side instrumentation...')

    // Initialize console deduplication for cleaner terminal logs
    try {
      const { initConsoleDeduplication } = await import('@/lib/logging/consoleDeduplicator')
      logger.debug('🔧 Initializing console deduplication for cleaner logs...')
      initConsoleDeduplication()
    } catch (error) {
      logger.warn('⚠️ Could not initialize console deduplication:', error)
    }

    // Initialize file logging system
    try {
      const { logger } = await import('@/lib/logging/initLogging')
      logger.debug('📁 File logging system initialized')
    } catch (error) {
      logger.warn('⚠️ Could not initialize file logging:', error)
    }

    // Prevent multiple initializations (Next.js may call register multiple times)
    if (isDiscordInitialized) {
      logger.debug('⏭️ Discord bot already initialized, skipping...')
      return
    }

    // Check if Discord bot should be disabled (for development without Discord)
    if (process.env.DISABLE_DISCORD_BOT === 'true') {
      logger.debug('⚠️ Discord bot disabled via DISABLE_DISCORD_BOT environment variable')
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
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
            console.log('🤖 DISCORD BOT: Initializing Gateway connection...')
            console.log('   Check logs below for connection status.')
            console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
            logger.info('🤖 Discord bot configured, initializing gateway connection in background...')

            // Mark as initialized BEFORE attempting connection
            isDiscordInitialized = true

            // Dynamically import Discord gateway
            const { initializeDiscordGateway } = await import('@/lib/integrations/discordGateway')

            // Start the Discord gateway connection in background (non-blocking)
            // Don't await - let it complete in the background
            initializeDiscordGateway()
              .then(() => {
                console.log('✅ Discord bot gateway connection process completed')
              })
              .catch((error) => {
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
                console.log('⚠️ DISCORD BOT: Connection failed!')
                console.log(`   Error: ${error.message}`)
                console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
                logger.warn('⚠️ Discord bot connection failed (non-critical):', error.message)
                // Don't reset the flag - we don't want to retry on every request
              })
          } else {
            console.log('⚠️ DISCORD BOT: Not configured, skipping Gateway connection')
            console.log('   Missing env vars:', config.missingVars.join(', '))
          }
        } catch (error) {
          logger.warn('⚠️ Discord bot initialization skipped (non-critical):', error)
          // This is not critical for the application to function
        }
      })() // Execute immediately without blocking
    }, 1000) // 1 second delay to let the server fully initialize
  }
}