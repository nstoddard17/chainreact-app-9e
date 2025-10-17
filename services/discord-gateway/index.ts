/**
 * Discord Gateway Service for HITL
 * Forwards Discord messages to HITL webhook
 *
 * Run this with: npx tsx services/discord-gateway/index.ts
 * Or deploy as a separate service
 */

import { Client, GatewayIntentBits, Events } from 'discord.js'
import { createServer } from 'http'

const HITL_WEBHOOK_URL = process.env.NEXT_PUBLIC_SITE_URL
  ? `${process.env.NEXT_PUBLIC_SITE_URL}/api/webhooks/discord/hitl`
  : 'http://localhost:3000/api/webhooks/discord/hitl'

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN

if (!DISCORD_BOT_TOKEN) {
  console.error('❌ DISCORD_BOT_TOKEN environment variable is required')
  process.exit(1)
}

// Create Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
})

// Ready event
client.on(Events.ClientReady, (c) => {
  console.log(`✅ Discord Gateway connected as ${c.user.tag}`)
  console.log(`📡 Forwarding messages to: ${HITL_WEBHOOK_URL}`)
  console.log(`🟢 Monitoring ${c.guilds.cache.size} servers`)
})

// Message create event - forward to HITL webhook
client.on(Events.MessageCreate, async (message) => {
  // Ignore bot messages to prevent loops
  if (message.author.bot) return

  // Only forward messages from guild channels (not DMs)
  if (!message.guild) return

  try {
    // Forward to HITL webhook
    const response = await fetch(HITL_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        t: 'MESSAGE_CREATE',
        d: {
          id: message.id,
          content: message.content,
          channel_id: message.channel.id,
          guild_id: message.guild.id,
          author: {
            id: message.author.id,
            username: message.author.username,
            discriminator: message.author.discriminator,
            bot: message.author.bot,
          },
          timestamp: message.createdTimestamp,
        },
      }),
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`❌ HITL webhook error:`, error)
    } else {
      const result = await response.json()
      if (result.action === 'resumed') {
        console.log(`✅ Workflow resumed: ${result.executionId}`)
      } else if (result.action === 'continue_conversation') {
        console.log(`💬 Conversation continuing in channel ${message.channel.id}`)
      }
    }
  } catch (error: any) {
    console.error('❌ Failed to forward message to HITL webhook:', error.message)
  }
})

// Error handling with auto-reconnect
client.on(Events.Error, (error) => {
  console.error('❌ Discord client error:', error)
})

// Connection issues - auto reconnect
client.on(Events.ShardDisconnect, () => {
  console.log('⚠️ Disconnected from Discord, will auto-reconnect...')
})

client.on(Events.ShardReconnecting, () => {
  console.log('🔄 Reconnecting to Discord...')
})

client.on(Events.ShardResume, () => {
  console.log('✅ Reconnected to Discord successfully')
})

// Health check server for Railway monitoring
const PORT = process.env.PORT || 3001
const server = createServer((req, res) => {
  if (req.url === '/health') {
    const isConnected = client.isReady()
    res.writeHead(isConnected ? 200 : 503, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({
      status: isConnected ? 'healthy' : 'disconnected',
      uptime: process.uptime(),
      guilds: client.guilds.cache.size,
      timestamp: new Date().toISOString()
    }))
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('Discord Gateway Service - HITL')
  }
})

server.listen(PORT, () => {
  console.log(`📊 Health check server running on port ${PORT}`)
  console.log(`🔍 Health check: http://localhost:${PORT}/health`)
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down Discord gateway...')
  server.close(() => {
    client.destroy()
    process.exit(0)
  })
})

process.on('SIGTERM', () => {
  console.log('\n👋 Shutting down Discord gateway...')
  server.close(() => {
    client.destroy()
    process.exit(0)
  })
})

// Login to Discord
console.log('🔄 Connecting to Discord...')
client.login(DISCORD_BOT_TOKEN)
  .then(() => {
    console.log('✅ Discord bot logged in successfully')
  })
  .catch((error) => {
    console.error('❌ Failed to login to Discord:', error)
    process.exit(1)
  })
