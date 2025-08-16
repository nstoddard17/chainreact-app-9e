#!/usr/bin/env tsx

/**
 * Test script for Discord Gateway connection
 * Run with: npx tsx scripts/test-discord-gateway.ts
 */

import { discordGateway, initializeDiscordGateway } from '../lib/integrations/discordGateway'
import { checkDiscordBotConfig } from '../lib/utils/discordConfig'

async function testDiscordGateway() {
  console.log('🔍 Testing Discord Gateway connection...\n')
  
  // Check configuration
  console.log('1. Checking Discord bot configuration...')
  const config = checkDiscordBotConfig()
  
  if (!config.isConfigured) {
    console.error('❌ Discord bot not configured!')
    console.error('Missing variables:', config.missingVars)
    console.log('\nPlease set the following environment variables:')
    config.missingVars.forEach(varName => {
      console.log(`   ${varName}`)
    })
    process.exit(1)
  }
  
  console.log('✅ Discord bot configuration is valid')
  console.log(`   Bot Token: ${config.botToken?.substring(0, 20)}...`)
  console.log(`   Bot User ID: ${config.botUserId}`)
  
  // Test connection
  console.log('\n2. Testing Gateway connection...')
  
  // Set up event listeners for monitoring
  discordGateway.on('ready', (data) => {
    console.log('✅ Discord Gateway READY event received')
    console.log(`   Bot User: ${data.user?.username}#${data.user?.discriminator}`)
    console.log(`   Session ID: ${data.session_id}`)
    console.log(`   Guilds: ${data.guilds?.length || 0}`)
    
    // Get diagnostics after connection
    setTimeout(() => {
      const diagnostics = discordGateway.getDiagnostics()
      console.log('\n3. Connection diagnostics:')
      console.log(`   Connected: ${diagnostics.isConnected}`)
      console.log(`   Session ID: ${diagnostics.sessionId}`)
      console.log(`   Heartbeat ACK: ${diagnostics.heartbeatAck}`)
      console.log(`   Reconnect attempts: ${diagnostics.reconnectAttempts}`)
      console.log(`   Last success: ${new Date(diagnostics.lastSuccessfulConnection).toISOString()}`)
      
      console.log('\n✅ Discord Gateway test completed successfully!')
      process.exit(0)
    }, 2000)
  })
  
  discordGateway.on('message', (messageData) => {
    console.log(`📩 Message received: ${messageData.content} (from ${messageData.author?.username})`)
  })
  
  try {
    await initializeDiscordGateway()
    
    // Wait a bit for connection to establish
    console.log('⏳ Waiting for connection to establish...')
    
    // Timeout after 30 seconds
    setTimeout(() => {
      const diagnostics = discordGateway.getDiagnostics()
      if (!diagnostics.isConnected) {
        console.error('❌ Failed to establish Discord Gateway connection within 30 seconds')
        console.error('Diagnostics:', diagnostics)
        process.exit(1)
      }
    }, 30000)
    
  } catch (error) {
    console.error('❌ Failed to initialize Discord Gateway:', error)
    process.exit(1)
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Discord Gateway test...')
  discordGateway.disconnect()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down Discord Gateway test...')
  discordGateway.disconnect()
  process.exit(0)
})

// Run the test
testDiscordGateway().catch(error => {
  console.error('Test failed:', error)
  process.exit(1)
})