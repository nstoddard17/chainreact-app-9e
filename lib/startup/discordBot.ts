import { initializeDiscordGateway, discordGateway } from '@/lib/integrations/discordGateway'

// Track if we've already set up the bot
let isDiscordBotInitialized = false

/**
 * Initialize Discord bot on app startup (with singleton protection)
 */
export async function initializeDiscordBot(): Promise<void> {
  // Prevent multiple initializations
  if (isDiscordBotInitialized) {
    console.log('Discord bot already initialized, skipping...')
    return
  }

  try {
    // Check if Discord bot credentials are configured
    const botToken = process.env.DISCORD_BOT_TOKEN
    const botUserId = process.env.DISCORD_BOT_USER_ID

    if (!botToken || !botUserId) {
      return
    }

    // Mark as initialized
    isDiscordBotInitialized = true

    // Initialize Discord Gateway connection (has its own singleton protection)
    await initializeDiscordGateway()

    // Set up event listeners (only once)
    discordGateway.on('ready', (data) => {
      // Bot is ready and online
      console.log('Discord bot is ready and online')
      
      // Set bot to always be online
      discordGateway.updatePresence({
        status: 'online',
        activities: [
          {
            name: 'workflows',
            type: 0 // Playing
          }
        ]
      })
      
      // REMOVED: Periodic presence updates - not needed and causes unnecessary traffic
      // Discord maintains presence automatically after initial set
      // Only update presence when there's an actual status change
    })
    
    discordGateway.on('resumed', () => {
      // Session resumed
      console.log('Discord bot session resumed')
      
      // Ensure bot stays online after resume
      discordGateway.updatePresence({
        status: 'online',
        activities: [
          {
            name: 'workflows',
            type: 0 // Playing
          }
        ]
      })
    })
    
  } catch (error) {
    // Silent error handling
  }
}

/**
 * Cleanup Discord bot resources
 */
export function cleanupDiscordBot(): void {
  try {
    // Disconnect from gateway
    discordGateway.disconnect()
  } catch (error) {
    // Silent error handling
  }
}

/**
 * Get Discord bot status
 */
export function getDiscordBotStatus() {
  return discordGateway.getStatus()
}

/**
 * Update Discord bot presence
 */
export function updateDiscordBotPresence(presence: {
  status?: 'online' | 'idle' | 'dnd' | 'invisible'
  activities?: Array<{
    name: string
    type: number
    url?: string
  }>
}) {
  discordGateway.updatePresence(presence)
} 