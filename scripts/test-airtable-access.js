#!/usr/bin/env node

/**
 * Test script to verify Airtable access and list available bases
 *
 * Usage: node scripts/test-airtable-access.js
 */

const fetch = require('node-fetch');

async function testAirtableAccess() {
  console.log('🧪 Testing Airtable Access\n');

  // You'll need to get these values from your database
  // Run this SQL query in Supabase to get your encrypted token:
  // SELECT access_token FROM integrations WHERE provider = 'airtable' AND user_id = 'YOUR_USER_ID';

  const encryptedToken = process.env.AIRTABLE_ENCRYPTED_TOKEN; // Set this from database
  const encryptionKey = process.env.ENCRYPTION_KEY;

  if (!encryptedToken || !encryptionKey) {
    console.log('⚠️  Please set AIRTABLE_ENCRYPTED_TOKEN and ENCRYPTION_KEY environment variables');
    console.log('\nTo get your encrypted token, run this SQL in Supabase:');
    console.log("SELECT access_token FROM integrations WHERE provider = 'airtable' AND user_id = 'YOUR_USER_ID';");
    return;
  }

  // Decrypt the token
  const crypto = require('crypto');
  function decrypt(encryptedData, key) {
    const [ivHex, encrypted] = encryptedData.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key, 'base64'), iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  const token = decrypt(encryptedToken, encryptionKey);
  console.log('✅ Token decrypted successfully\n');

  // Test 1: Get current user info
  console.log('1️⃣ Getting current user info...');
  try {
    const userRes = await fetch('https://api.airtable.com/v0/meta/whoami', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (userRes.ok) {
      const userData = await userRes.json();
      console.log('✅ User info:', userData);
      console.log(`   - User ID: ${userData.id}`);
      console.log(`   - Email: ${userData.email}`);
      console.log(`   - Scopes: ${JSON.stringify(userData.scopes)}`);

      // Check for webhook:manage scope
      if (userData.scopes?.includes('webhook:manage')) {
        console.log('   ✅ webhook:manage scope is present');
      } else {
        console.log('   ❌ webhook:manage scope is MISSING');
      }
    } else {
      const error = await userRes.text();
      console.log('❌ Failed to get user info:', error);
      return;
    }
  } catch (error) {
    console.log('❌ Error getting user info:', error.message);
    return;
  }

  // Test 2: List all bases
  console.log('\n2️⃣ Listing all accessible bases...');
  try {
    const basesRes = await fetch('https://api.airtable.com/v0/meta/bases', {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (basesRes.ok) {
      const basesData = await basesRes.json();
      console.log(`✅ Found ${basesData.bases.length} bases:\n`);

      basesData.bases.forEach(base => {
        console.log(`   📊 ${base.name}`);
        console.log(`      - ID: ${base.id}`);
        console.log(`      - Permission: ${base.permissionLevel}`);
      });

      // Test 3: Check specific base
      const testBaseId = 'app2KiMxZofDhMOmZ'; // The base from your error
      console.log(`\n3️⃣ Checking specific base: ${testBaseId}`);

      const matchingBase = basesData.bases.find(b => b.id === testBaseId);
      if (matchingBase) {
        console.log(`✅ Base ${testBaseId} found: ${matchingBase.name}`);
        console.log(`   - Permission: ${matchingBase.permissionLevel}`);

        // Test webhook creation
        console.log('\n4️⃣ Testing webhook creation...');
        const webhookPayload = {
          notificationUrl: 'https://example.com/webhook',
          specification: {
            options: {
              filters: {
                dataTypes: ["tableData"]
              }
            }
          }
        };

        const webhookRes = await fetch(`https://api.airtable.com/v0/bases/${testBaseId}/webhooks`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(webhookPayload)
        });

        if (webhookRes.ok) {
          const webhookData = await webhookRes.json();
          console.log('✅ Webhook can be created! (test webhook created)');
          console.log(`   - Webhook ID: ${webhookData.id}`);

          // Clean up test webhook
          const deleteRes = await fetch(`https://api.airtable.com/v0/bases/${testBaseId}/webhooks/${webhookData.id}`, {
            method: 'DELETE',
            headers: {
              Authorization: `Bearer ${token}`
            }
          });

          if (deleteRes.ok) {
            console.log('   - Test webhook cleaned up');
          }
        } else {
          const error = await webhookRes.text();
          console.log('❌ Cannot create webhook:', error);
        }
      } else {
        console.log(`❌ Base ${testBaseId} NOT found in your accessible bases`);
        console.log('   This is why you\'re getting the error!');
        console.log('\n   Available base IDs you can use:');
        basesData.bases.forEach(base => {
          console.log(`   - ${base.id} (${base.name})`);
        });
      }
    } else {
      const error = await basesRes.text();
      console.log('❌ Failed to list bases:', error);
    }
  } catch (error) {
    console.log('❌ Error listing bases:', error.message);
  }
}

// Run the test
testAirtableAccess().catch(console.error);