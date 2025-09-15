// Test script to check Slack token decryption
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { decrypt, safeDecrypt } from './lib/security/encryption.js';
import { getSecret } from './lib/secrets.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load env
dotenv.config({ path: join(__dirname, '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSlackDecryption() {
  console.log('🔍 Testing Slack token decryption...\n');
  
  try {
    // Get a Slack integration
    const { data: integrations, error } = await supabase
      .from('integrations')
      .select('*')
      .eq('provider', 'slack')
      .limit(1);
    
    if (error) {
      console.error('❌ Error fetching integration:', error);
      return;
    }
    
    if (!integrations || integrations.length === 0) {
      console.log('❌ No Slack integrations found in database');
      return;
    }
    
    const integration = integrations[0];
    console.log('✅ Found Slack integration');
    console.log('  - Token is encrypted:', integration.access_token.includes(':'));
    console.log('  - Token length:', integration.access_token.length);
    
    // Try to decrypt the token
    const secret = await getSecret("encryption_key");
    console.log('\n🔐 Encryption secret available:', !!secret);
    
    if (secret) {
      try {
        const decryptedToken = safeDecrypt(integration.access_token, secret);
        console.log('\n✅ Token decrypted successfully');
        console.log('  - Decrypted length:', decryptedToken.length);
        console.log('  - Starts with xoxb-:', decryptedToken.startsWith('xoxb-'));
        console.log('  - Starts with xoxp-:', decryptedToken.startsWith('xoxp-'));
        console.log('  - First 10 chars:', decryptedToken.substring(0, 10));
        
        // Test the decrypted token with Slack API
        console.log('\n📡 Testing Slack API with decrypted token...');
        const response = await fetch('https://slack.com/api/auth.test', {
          headers: {
            'Authorization': `Bearer ${decryptedToken}`,
          }
        });
        
        const data = await response.json();
        console.log('Response:', {
          status: response.status,
          ok: data.ok,
          error: data.error,
          team: data.team,
          user: data.user,
          user_id: data.user_id
        });
        
        // If auth.test works, try conversations.list
        if (data.ok) {
          console.log('\n📡 Testing conversations.list with decrypted token...');
          const channelsResponse = await fetch(
            'https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=5',
            {
              headers: {
                'Authorization': `Bearer ${decryptedToken}`,
              }
            }
          );
          
          const channelsData = await channelsResponse.json();
          console.log('Channels response:', {
            status: channelsResponse.status,
            ok: channelsData.ok,
            error: channelsData.error,
            channelCount: channelsData.channels?.length || 0,
            sampleChannels: channelsData.channels?.slice(0, 3).map(c => c.name)
          });
        }
        
      } catch (decryptError) {
        console.error('❌ Decryption failed:', decryptError.message);
      }
    } else {
      console.log('⚠️  No encryption secret found, assuming token is not encrypted');
      // Try with raw token
      const response = await fetch('https://slack.com/api/auth.test', {
        headers: {
          'Authorization': `Bearer ${integration.access_token}`,
        }
      });
      
      const data = await response.json();
      console.log('Response with raw token:', {
        status: response.status,
        ok: data.ok,
        error: data.error
      });
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSlackDecryption();