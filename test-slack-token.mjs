// Test script to check Slack token decryption
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

async function testSlackToken() {
  console.log('🔍 Testing Slack token retrieval and decryption...\n');
  
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
    console.log('✅ Found Slack integration:', {
      id: integration.id,
      user_id: integration.user_id,
      status: integration.status,
      hasAccessToken: !!integration.access_token,
      tokenLength: integration.access_token?.length,
      tokenStartsWith: integration.access_token?.substring(0, 40),
      hasColon: integration.access_token?.includes(':'),
      created_at: integration.created_at,
      updated_at: integration.updated_at
    });
    
    // Check if token looks encrypted
    if (integration.access_token) {
      const isEncrypted = integration.access_token.includes(':');
      console.log('\n📝 Token analysis:');
      console.log('  - Appears encrypted:', isEncrypted);
      console.log('  - Token length:', integration.access_token.length);
      
      if (isEncrypted) {
        const parts = integration.access_token.split(':');
        console.log('  - IV length:', parts[0]?.length);
        console.log('  - Encrypted data length:', parts[1]?.length);
      } else {
        console.log('  - Token format:', integration.access_token.startsWith('xoxb-') ? 'Bot token' : 
                                         integration.access_token.startsWith('xoxp-') ? 'User token' : 'Unknown');
      }
    }
    
    // Try to make a test API call with the raw token
    console.log('\n📡 Testing direct Slack API call with raw token...');
    try {
      const response = await fetch('https://slack.com/api/auth.test', {
        headers: {
          'Authorization': `Bearer ${integration.access_token}`,
        }
      });
      
      const data = await response.json();
      console.log('Response:', {
        status: response.status,
        ok: data.ok,
        error: data.error,
        team: data.team,
        user: data.user
      });
    } catch (apiError) {
      console.error('❌ API call failed:', apiError.message);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSlackToken();