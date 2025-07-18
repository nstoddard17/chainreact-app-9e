/**
 * Check if Discord bot is properly configured
 */
export function checkDiscordBotConfig(): {
  isConfigured: boolean
  missingVars: string[]
  botToken: string | null
  botUserId: string | null
} {
  const botToken = process.env.DISCORD_BOT_TOKEN
  const botUserId = process.env.DISCORD_BOT_USER_ID
  
  const missingVars: string[] = []
  
  if (!botToken) {
    missingVars.push('DISCORD_BOT_TOKEN')
  }
  
  if (!botUserId) {
    missingVars.push('DISCORD_BOT_USER_ID')
  }
  
  return {
    isConfigured: missingVars.length === 0,
    missingVars,
    botToken: botToken || null,
    botUserId: botUserId || null
  }
}

/**
 * Get Discord bot configuration status with helpful messages
 */
export function getDiscordBotConfigStatus(): {
  status: 'configured' | 'partially_configured' | 'not_configured'
  message: string
  details: string[]
} {
  const config = checkDiscordBotConfig()
  
  if (config.isConfigured) {
    return {
      status: 'configured',
      message: 'Discord bot is properly configured',
      details: [
        'Bot token is set',
        'Bot user ID is set',
        'Bot will appear online in Discord servers'
      ]
    }
  }
  
  if (config.missingVars.length === 1) {
    return {
      status: 'partially_configured',
      message: `Discord bot is partially configured. Missing: ${config.missingVars[0]}`,
      details: [
        `Please set the ${config.missingVars[0]} environment variable`,
        'Bot will not appear online until fully configured'
      ]
    }
  }
  
  return {
    status: 'not_configured',
    message: 'Discord bot is not configured',
    details: [
      'Please set DISCORD_BOT_TOKEN environment variable',
      'Please set DISCORD_BOT_USER_ID environment variable',
      'Bot will not appear online until configured',
      'See Discord Developer Portal to create a bot application'
    ]
  }
}

/**
 * Validate Discord bot token format
 */
export function validateDiscordBotToken(token: string): boolean {
  // Discord bot tokens typically start with a specific format
  // This is a basic validation - in production you'd want more robust validation
  return token.length > 50 && token.includes('.')
}

/**
 * Get Discord bot invite URL with proper permissions
 */
export function getDiscordBotInviteUrl(): string {
  // Use the bot's client ID (should be the same as the bot user ID for most cases)
  // The bot user ID is the client ID for the bot application
  const clientId = process.env.DISCORD_BOT_USER_ID || "1378595955212812308"
  const scopes = ["bot", "applications.commands"]
  
  // Combined permissions integer for all requested Discord bot capabilities
  // This includes: View Audit Log, Manage Server, Manage Roles, Manage Channels, 
  // Kick Members, Ban Members, Create Instant Invite, Change Nickname, 
  // Manage Nicknames, Manage Expressions, Create Expressions, Manage Webhooks, 
  // View Channels, Manage Events, Create Events, Moderate Members, 
  // View Server Insights, View Server Subscription Insights, Send Messages, 
  // Create Public Threads, Create Private Threads, Send Messages in Threads, 
  // Send TTS Messages, Manage Messages, Manage Threads, Embed Links, 
  // Attach Files, Read Message History, Mention Everyone, Use External Emojis, 
  // Use External Stickers, Add Reactions, Use Slash Commands, 
  // Use Embedded Activities, Use External Apps, Create Polls, 
  // Mute Members, Deafen Members, Move Members
  const permissions = "1719631854173431"
  
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=${scopes.join("%20")}&permissions=${permissions}`
}

 