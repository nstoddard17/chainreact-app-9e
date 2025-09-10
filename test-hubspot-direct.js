/**
 * Direct HubSpot API Test
 * This script fetches HubSpot credentials from Supabase and tests the API directly
 */

const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function decrypt(encryptedData) {
  try {
    const crypto = require('crypto');
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production!!', 'utf8').slice(0, 32);
    
    const encrypted = JSON.parse(encryptedData);
    const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(encrypted.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.log('⚠️ Token might not be encrypted, returning as-is');
    return encryptedData;
  }
}

async function testHubSpotConnection() {
  console.log('🔍 Fetching HubSpot integration from database...\n');
  
  try {
    // Fetch HubSpot integration
    const { data: integration, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('provider', 'hubspot')
      .eq('status', 'connected')
      .single();
    
    if (error || !integration) {
      console.error('❌ No connected HubSpot integration found:', error);
      return;
    }
    
    console.log('✅ Found HubSpot integration:', {
      id: integration.id,
      user_id: integration.user_id,
      status: integration.status,
      hasToken: !!integration.access_token,
      tokenLength: integration.access_token?.length,
      createdAt: integration.created_at,
      updatedAt: integration.updated_at
    });
    
    if (!integration.access_token) {
      console.error('❌ Integration has no access token');
      return;
    }
    
    // Decrypt the token
    console.log('\n🔐 Decrypting access token...');
    let accessToken;
    try {
      accessToken = await decrypt(integration.access_token);
      console.log('✅ Token decrypted successfully');
    } catch (decryptError) {
      console.error('❌ Failed to decrypt token:', decryptError.message);
      return;
    }
    
    // Test the HubSpot API
    console.log('\n📡 Testing HubSpot API...');
    
    // Test 1: Get account info
    console.log('\n1️⃣ Testing account info endpoint...');
    const accountResponse = await fetch('https://api.hubapi.com/account-info/v3/details', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (accountResponse.ok) {
      const accountData = await accountResponse.json();
      console.log('✅ Account info retrieved:', {
        portalId: accountData.portalId,
        companyName: accountData.companyName,
        timeZone: accountData.timeZone
      });
    } else {
      console.error('❌ Account info failed:', accountResponse.status, accountResponse.statusText);
      const errorText = await accountResponse.text();
      console.error('Error details:', errorText);
    }
    
    // Test 2: Get lists
    console.log('\n2️⃣ Testing lists endpoint...');
    const listsResponse = await fetch('https://api.hubapi.com/contacts/v1/lists?count=10', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (listsResponse.ok) {
      const listsData = await listsResponse.json();
      console.log('✅ Lists retrieved successfully:');
      console.log(`   Total lists: ${listsData.lists?.length || 0}`);
      
      if (listsData.lists && listsData.lists.length > 0) {
        console.log('\n   First 5 lists:');
        listsData.lists.slice(0, 5).forEach((list, index) => {
          console.log(`   ${index + 1}. ${list.name} (ID: ${list.listId}, Type: ${list.listType}, Size: ${list.size || 0})`);
        });
        
        const manualLists = listsData.lists.filter(list => 
          list.listType === 'MANUAL' || list.listType === 'STATIC'
        );
        console.log(`\n   Manual/Static lists (can add contacts): ${manualLists.length}`);
      }
    } else {
      console.error('❌ Lists request failed:', listsResponse.status, listsResponse.statusText);
      const errorText = await listsResponse.text();
      console.error('Error details:', errorText);
      
      if (listsResponse.status === 401) {
        console.error('\n⚠️ Authentication failed. The token might be expired or invalid.');
        console.error('The user needs to reconnect their HubSpot account.');
      }
    }
    
    // Test 3: Check scopes
    console.log('\n3️⃣ Checking token scopes...');
    const tokenInfoResponse = await fetch(`https://api.hubapi.com/oauth/v1/access-tokens/${accessToken}`);
    
    if (tokenInfoResponse.ok) {
      const tokenInfo = await tokenInfoResponse.json();
      console.log('✅ Token info:', {
        app_id: tokenInfo.app_id,
        expires_in: tokenInfo.expires_in,
        scopes: tokenInfo.scopes?.slice(0, 5) // Show first 5 scopes
      });
    } else {
      console.log('⚠️ Could not retrieve token info (this endpoint might require different permissions)');
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
}

// Run the test
console.log('====================================');
console.log('Direct HubSpot API Test');
console.log('====================================\n');

testHubSpotConnection().then(() => {
  console.log('\n====================================');
  console.log('Test Complete');
  console.log('====================================');
}).catch(error => {
  console.error('Fatal error:', error);
});