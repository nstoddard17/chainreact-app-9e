import { initializeDiscordGateway, discordGateway } from '@/lib/integrations/discordGateway'

/**
 * Initialize Discord bot on app startup
 */
export async function initializeDiscordBot(): Promise<void> {
  try {
    console.log("Starting Discord bot initialization...")
    
    // Check if Discord bot credentials are configured
    const botToken = process.env.DISCORD_BOT_TOKEN
    const botUserId = process.env.DISCORD_BOT_USER_ID
    
    if (!botToken || !botUserId) {
      console.warn("Discord bot credentials not configured, skipping initialization")
      return
    }
    
    // Initialize Discord Gateway connection
    await initializeDiscordGateway()
    
    // Set up event listeners
    discordGateway.on('ready', (data) => {
      console.log("Discord bot is ready and online!")
      console.log(`Connected to ${data.guilds.length} guilds`)
    })
    
    discordGateway.on('resumed', () => {
      console.log("Discord bot session resumed")
    })
    
    console.log("Discord bot initialization completed")
    
  } catch (error) {
    console.error("Failed to initialize Discord bot:", error)
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