// Test Discord workflow execution
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env.local') });

async function testDiscordWorkflow(guildId, channelId) {
  try {
    console.log('Testing Discord workflow execution...');
    console.log('Guild ID:', guildId);
    console.log('Channel ID:', channelId);

    const response = await fetch('http://localhost:3000/api/test-discord', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        guildId: guildId,
        channelId: channelId,
        message: `Test message from ChainReact at ${new Date().toISOString()}`
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('API Error:', response.status, error);
      return;
    }

    const result = await response.json();
    console.log('API Response:', result);

    if (result.success) {
      console.log('✅ Discord message sent successfully!');
      console.log('Message ID:', result.output?.messageId);
      console.log('Channel ID:', result.output?.channelId);
    } else {
      console.log('❌ Failed to send Discord message');
      console.log('Error:', result.message);
    }
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Get command line arguments
const guildId = process.argv[2];
const channelId = process.argv[3];

if (!guildId || !channelId) {
  console.log('Usage: node test-discord-workflow.mjs <GUILD_ID> <CHANNEL_ID>');
  console.log('');
  console.log('Example:');
  console.log('  node test-discord-workflow.mjs 123456789 987654321');
  process.exit(1);
}

testDiscordWorkflow(guildId, channelId);