#!/usr/bin/env node

/**
 * Test Discord bot token validity
 * Run with: node scripts/test-discord-token.js
 */

const https = require('https');
require('dotenv').config({ path: '.env.local' });

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error('❌ DISCORD_BOT_TOKEN not found in environment variables');
  console.error('Please set it in your .env.local file');
  process.exit(1);
}

// Remove quotes if present
const cleanToken = token.replace(/^["']|["']$/g, '');

console.log('Testing Discord bot token...');
console.log(`Token preview: ${cleanToken.substring(0, 10)}...${cleanToken.substring(cleanToken.length - 5)}`);

// Test the token by making a simple API call
const options = {
  hostname: 'discord.com',
  port: 443,
  path: '/api/v10/users/@me',
  method: 'GET',
  headers: {
    'Authorization': `Bot ${cleanToken}`,
    'Content-Type': 'application/json'
  }
};

const req = https.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 200) {
      const botInfo = JSON.parse(data);
      console.log('✅ Token is valid!');
      console.log(`Bot Name: ${botInfo.username}#${botInfo.discriminator || '0'}`);
      console.log(`Bot ID: ${botInfo.id}`);

      if (process.env.DISCORD_BOT_USER_ID !== botInfo.id) {
        console.warn(`⚠️ Warning: DISCORD_BOT_USER_ID (${process.env.DISCORD_BOT_USER_ID}) doesn't match actual bot ID (${botInfo.id})`);
        console.warn('Consider updating DISCORD_BOT_USER_ID in .env.local');
      }
    } else if (res.statusCode === 401) {
      console.error('❌ Token is invalid or expired (401 Unauthorized)');
      console.error('You need to:');
      console.error('1. Go to https://discord.com/developers/applications');
      console.error('2. Select your application');
      console.error('3. Go to the "Bot" section');
      console.error('4. Click "Reset Token" to generate a new token');
      console.error('5. Copy the new token and update DISCORD_BOT_TOKEN in .env.local');
    } else {
      console.error(`❌ Unexpected response: ${res.statusCode}`);
      console.error('Response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
});

req.end();