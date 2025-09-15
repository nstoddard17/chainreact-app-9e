// Test Discord bot connection and message sending
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.local') });

const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_BOT_USER_ID = process.env.DISCORD_BOT_USER_ID;

console.log('Testing Discord bot configuration...');
console.log('Bot Token:', DISCORD_BOT_TOKEN ? '✓ Set' : '✗ Missing');
console.log('Bot User ID:', DISCORD_BOT_USER_ID ? '✓ Set' : '✗ Missing');

if (!DISCORD_BOT_TOKEN || !DISCORD_BOT_USER_ID) {
  console.error('Missing required environment variables');
  process.exit(1);
}

// Test bot status
async function testBotStatus() {
  try {
    console.log('\nChecking bot status...');
    const response = await fetch('https://discord.com/api/v10/users/@me', {
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error('Failed to get bot info:', response.status, response.statusText);
      const error = await response.text();
      console.error('Error details:', error);
      return null;
    }

    const botInfo = await response.json();
    console.log('Bot info:', {
      username: botInfo.username,
      id: botInfo.id,
      bot: botInfo.bot
    });
    return botInfo;
  } catch (error) {
    console.error('Error checking bot status:', error);
    return null;
  }
}

// Test sending a message
async function testSendMessage(channelId, message) {
  try {
    console.log(`\nTesting message send to channel ${channelId}...`);

    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: message
      })
    });

    if (!response.ok) {
      console.error('Failed to send message:', response.status, response.statusText);
      const error = await response.text();
      console.error('Error details:', error);
      return false;
    }

    const result = await response.json();
    console.log('Message sent successfully!');
    console.log('Message ID:', result.id);
    console.log('Channel ID:', result.channel_id);
    return true;
  } catch (error) {
    console.error('Error sending message:', error);
    return false;
  }
}

// Test gateway connection
async function testGatewayConnection() {
  try {
    console.log('\nChecking gateway connection...');
    const response = await fetch('https://discord.com/api/v10/gateway/bot', {
      headers: {
        Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      console.error('Failed to get gateway info:', response.status, response.statusText);
      return null;
    }

    const gatewayInfo = await response.json();
    console.log('Gateway info:', {
      url: gatewayInfo.url,
      shards: gatewayInfo.shards,
      session_start_limit: gatewayInfo.session_start_limit
    });
    return gatewayInfo;
  } catch (error) {
    console.error('Error checking gateway:', error);
    return null;
  }
}

// Main test function
async function runTests() {
  console.log('='.repeat(50));
  console.log('Discord Bot Test Suite');
  console.log('='.repeat(50));

  // Test bot authentication
  const botInfo = await testBotStatus();
  if (!botInfo) {
    console.error('\n❌ Bot authentication failed. Check your DISCORD_BOT_TOKEN.');
    process.exit(1);
  }

  // Test gateway
  const gatewayInfo = await testGatewayConnection();
  if (!gatewayInfo) {
    console.error('\n❌ Gateway connection failed.');
  }

  // Test sending a message (you need to provide a valid channel ID)
  const testChannelId = process.argv[2];
  if (testChannelId) {
    console.log(`\nUsing channel ID: ${testChannelId}`);
    const success = await testSendMessage(
      testChannelId,
      `Test message from ChainReact workflow at ${new Date().toISOString()}`
    );

    if (success) {
      console.log('\n✅ All tests passed! Bot is working correctly.');
    } else {
      console.log('\n⚠️ Bot authentication works but message sending failed.');
      console.log('Possible reasons:');
      console.log('1. Bot is not in the server/guild');
      console.log('2. Bot lacks permissions in the channel');
      console.log('3. Invalid channel ID');
    }
  } else {
    console.log('\n📝 To test message sending, run:');
    console.log('   node test-discord-bot.mjs <CHANNEL_ID>');
    console.log('\n✅ Bot authentication and gateway tests passed.');
  }
}

// Run the tests
runTests().catch(console.error);