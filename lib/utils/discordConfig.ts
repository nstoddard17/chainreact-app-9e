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
 * Get Discord bot invite URL
 */
export function getDiscordBotInviteUrl(): string {
  const clientId = process.env.DISCORD_CLIENT_ID || "1378595955212812308"
  const scopes = ["bot", "applications.commands"]
  const permissions = "8" // Administrator
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=${scopes.join("%20")}&permissions=${permissions}`
}

 