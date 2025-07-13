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
    })
    
    discordGateway.on('resumed', () => {
      // Session resumed
    })
    
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