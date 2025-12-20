import { NextRequest, NextResponse } from 'next/server'
import { discordGateway } from '@/lib/integrations/discordGateway'
import { checkDiscordBotConfig } from '@/lib/utils/discordConfig'
import { logger } from '@/lib/utils/logger'

/**
 * Diagnostic endpoint to check Discord Gateway WebSocket connection status
 * Use this to verify the Gateway is connected and can receive messages
 */
export async function GET(request: NextRequest) {
  try {
    // Check if Discord bot is configured
    const config = checkDiscordBotConfig()

    // Get Gateway status
    const status = discordGateway.getStatus()
    const diagnostics = discordGateway.getDiagnostics()

    const response = {
      configured: config.isConfigured,
      missingVars: config.missingVars,
      gateway: {
        isConnected: status.isConnected,
        sessionId: status.sessionId,
        reconnectAttempts: status.reconnectAttempts,
        lastSuccessfulConnection: diagnostics.lastSuccessfulConnection,
        timeSinceLastSuccess: diagnostics.timeSinceLastSuccess,
        heartbeatAck: diagnostics.heartbeatAck
      },
      intentsRequired: [
        'GUILDS',
        'GUILD_MEMBERS',
        'GUILD_INVITES',
        'GUILD_MESSAGES',
        'MESSAGE_CONTENT (REQUIRED for receiving message content)'
      ],
      troubleshooting: !status.isConnected ? [
        '1. Check server logs for "🎉 Discord bot ready!" message on startup',
        '2. Verify DISCORD_BOT_TOKEN is set correctly in .env.local',
        '3. Ensure MESSAGE_CONTENT intent is enabled in Discord Developer Portal:',
        '   - Go to https://discord.com/developers/applications',
        '   - Select your bot application',
        '   - Go to "Bot" section',
        '   - Scroll down to "Privileged Gateway Intents"',
        '   - Enable "MESSAGE CONTENT INTENT"',
        '   - Save changes',
        '4. Check that DISABLE_DISCORD_BOT is not set to "true"',
        '5. Restart the Next.js dev server after making changes'
      ] : []
    }

    logger.info('🔍 Gateway status check:', response)

    return NextResponse.json(response)
  } catch (error: any) {
    logger.error('Error checking Gateway status:', error)
    return NextResponse.json({
      error: error.message,
      configured: false,
      gateway: { isConnected: false }
    }, { status: 500 })
  }
}
