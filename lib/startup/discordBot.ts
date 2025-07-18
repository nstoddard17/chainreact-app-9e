import { initializeDiscordGateway, discordGateway } from '@/lib/integrations/discordGateway'

/**
 * Initialize Discord bot on app startup
 */
export async function initializeDiscordBot(): Promise<void> {
  try {
    // Check if Discord bot credentials are configured
    const botToken = process.env.DISCORD_BOT_TOKEN
    const botUserId = process.env.DISCORD_BOT_USER_ID
    
    if (!botToken || !botUserId) {
      return
    }
    
    // Initialize Discord Gateway connection
    await initializeDiscordGateway()
    
    // Set up event listeners
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
      
      // Set up periodic presence updates to keep bot online
      const presenceInterval = setInterval(() => {
        const status = discordGateway.getStatus()
        if (status.isConnected) {
          discordGateway.updatePresence({
            status: 'online',
            activities: [
              {
                name: 'workflows',
                type: 0 // Playing
              }
            ]
          })
        }
      }, 60000) // Update presence every minute
      
      // Store interval for cleanup
      ;(discordGateway as any).presenceInterval = presenceInterval
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
    // Clear presence interval if it exists
    if ((discordGateway as any).presenceInterval) {
      clearInterval((discordGateway as any).presenceInterval)
      ;(discordGateway as any).presenceInterval = null
    }
    
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