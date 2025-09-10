/**
 * Direct HubSpot API Test
 * This script fetches HubSpot credentials from Supabase and tests the API directly
 */

import { createClient } from '@supabase/supabase-js';
import fetch from 'node-fetch';
import { config } from 'dotenv';
import crypto from 'crypto';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function decrypt(encryptedData) {
  try {
    const algorithm = 'aes-256-gcm';
    const key = Buffer.from(process.env.ENCRYPTION_KEY || 'default-encryption-key-change-in-production!!', 'utf8').slice(0, 32);
    
    const encrypted = JSON.parse(encryptedData);
    const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(encrypted.iv, 'hex'));
    decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));
    
    let decrypted = decipher.update(encrypted.encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    console.log('✅ Successfully decrypted token');
    return decrypted;
  } catch (error) {
    console.log('⚠️ Token might not be encrypted, returning as-is');
    console.log('   Raw token starts with:', encryptedData.substring(0, 30));
    // Check if it's a JSON string (double-encrypted)
    try {
      const parsed = JSON.parse(encryptedData);
      if (parsed.encryptedData) {
        console.log('🔍 Token appears to be JSON encrypted data, trying to decrypt...');
        return decrypt(JSON.stringify(parsed));
      }
    } catch (e) {
      // Not JSON, return as-is
    }
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
      updatedAt: integration.updated_at,
      tokenPreview: integration.access_token ? integration.access_token.substring(0, 50) + '...' : 'none'
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
      console.log('   Token preview:', accessToken.substring(0, 20) + '...');
    } catch (decryptError) {
      console.error('❌ Failed to decrypt token:', decryptError.message);
      return;
    }
    
    // Test the HubSpot API
    console.log('\n📡 Testing HubSpot API...');
    
    // Test 1: Get account info
    console.log('\n1️⃣ Testing account info endpoint...');
    try {
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
    } catch (e) {
      console.error('❌ Account request failed:', e.message);
    }
    
    // Test 2: Get lists
    console.log('\n2️⃣ Testing lists endpoint...');
    try {
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
    } catch (e) {
      console.error('❌ Lists request failed:', e.message);
    }
    
    // Test 3: Try with a simple fetch to check connectivity
    console.log('\n3️⃣ Testing basic connectivity...');
    try {
      const testResponse = await fetch('https://api.hubapi.com/crm/v3/objects/contacts?limit=1', {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      });
      
      console.log('   Response status:', testResponse.status);
      if (testResponse.ok) {
        const data = await testResponse.json();
        console.log('✅ Basic API call successful, found', data.results?.length || 0, 'contacts');
      } else {
        const errorText = await testResponse.text();
        console.error('❌ Basic API call failed:', errorText);
      }
    } catch (e) {
      console.error('❌ Basic connectivity test failed:', e.message);
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