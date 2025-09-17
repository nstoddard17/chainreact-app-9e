// Test script to verify Discord bot singleton connection
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

// Test the Discord gateway connection
async function testDiscordConnection() {
  console.log('\n🧪 Testing Discord Bot Singleton Connection\n');
  console.log('=' .repeat(50));

  // Check configuration
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const botUserId = process.env.DISCORD_BOT_USER_ID;

  if (!botToken || !botUserId) {
    console.error('❌ Discord bot credentials not configured');
    console.log('Please set DISCORD_BOT_TOKEN and DISCORD_BOT_USER_ID in .env.local');
    return;
  }

  console.log('✅ Discord bot credentials found');
  console.log(`Bot Token: ${botToken.substring(0, 10)}...${botToken.substring(botToken.length - 5)}`);
  console.log(`Bot User ID: ${botUserId}`);

  try {
    // Import the Discord gateway module
    const { initializeDiscordGateway, discordGateway } = await import('./lib/integrations/discordGateway.ts');

    console.log('\n📡 Attempting first connection...');
    await initializeDiscordGateway();

    // Wait a moment for connection to establish
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Check status
    let status = discordGateway.getStatus();
    console.log('First connection status:', status);

    // Try to initialize again (should be prevented by singleton)
    console.log('\n🔄 Attempting second connection (should be blocked)...');
    await initializeDiscordGateway();

    // Wait and check status again
    await new Promise(resolve => setTimeout(resolve, 2000));
    status = discordGateway.getStatus();
    console.log('Status after second attempt:', status);

    // Try a third time
    console.log('\n🔄 Attempting third connection (should be blocked)...');
    await initializeDiscordGateway();

    // Final status check
    await new Promise(resolve => setTimeout(resolve, 2000));
    status = discordGateway.getStatus();
    console.log('Final status:', status);

    console.log('\n✅ Test complete! Only one connection should have been made.');
    console.log('=' .repeat(50));

    // Keep the connection open for monitoring
    console.log('\n⏳ Keeping connection open for 30 seconds to monitor...');
    console.log('Watch for multiple connection messages above.');
    console.log('You should only see ONE successful connection.\n');

    // Monitor for 30 seconds
    let monitoringSeconds = 0;
    const monitorInterval = setInterval(() => {
      monitoringSeconds += 5;
      const currentStatus = discordGateway.getStatus();
      console.log(`[${monitoringSeconds}s] Status:`, {
        connected: currentStatus.isConnected ? '✅' : '❌',
        sessionId: currentStatus.sessionId ? '✓' : '✗',
        reconnectAttempts: currentStatus.reconnectAttempts
      });

      if (monitoringSeconds >= 30) {
        clearInterval(monitorInterval);
        console.log('\n🏁 Monitoring complete. Disconnecting...');
        discordGateway.disconnect();
        console.log('✅ Discord bot disconnected cleanly.');
        process.exit(0);
      }
    }, 5000);

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testDiscordConnection().catch(console.error);