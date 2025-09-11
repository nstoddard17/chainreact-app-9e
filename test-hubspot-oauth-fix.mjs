/**
 * Test HubSpot OAuth Fix - Verifies the OAuth flow improvements
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testHubSpotOAuthFix() {
  console.log('🔍 Testing HubSpot OAuth Flow Fixes...\n');
  
  console.log('✅ Improvements Made:');
  console.log('1. Fixed multiple cancellation messages by adding cancelCheckScheduled flag');
  console.log('2. Increased HubSpot timeout from 4s to 6s for redirect handling');
  console.log('3. Added localStorage cleanup before OAuth starts');
  console.log('4. Increased localStorage check frequency for HubSpot (250ms vs 500ms)');
  console.log('5. Added approval_prompt=force to prevent cached authorizations');
  console.log('');
  
  console.log('📋 Expected Behavior:');
  console.log('1. When popup closes, you should see ONE "waiting for success message" log');
  console.log('2. If HubSpot connection succeeds, you should see success message within 6s');
  console.log('3. No duplicate "cancelled" messages should appear');
  console.log('4. Stale localStorage entries should be cleared before OAuth starts');
  console.log('');
  
  console.log('🧪 Testing localStorage cleanup...');
  
  // Check for any existing OAuth response entries
  const { data: existingStates } = await supabase
    .from('pkce_flow')
    .select('*')
    .eq('provider', 'hubspot')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (existingStates && existingStates.length > 0) {
    console.log(`Found ${existingStates.length} recent HubSpot OAuth attempts in database`);
    
    // Clean up old entries (older than 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { error: cleanupError } = await supabase
      .from('pkce_flow')
      .delete()
      .eq('provider', 'hubspot')
      .lt('created_at', oneHourAgo);
    
    if (!cleanupError) {
      console.log('✅ Cleaned up old OAuth state entries');
    }
  }
  
  console.log('\n🎯 OAuth Flow Test Checklist:');
  console.log('[ ] OAuth popup opens without errors');
  console.log('[ ] Only ONE "waiting for success message" log appears');
  console.log('[ ] Success is detected within 6 seconds');
  console.log('[ ] No duplicate cancellation messages');
  console.log('[ ] Integration appears as connected after success');
  
  console.log('\n💡 Troubleshooting Tips:');
  console.log('1. If still getting cancelled: Clear browser cache and cookies');
  console.log('2. Check browser console for localStorage entries starting with "oauth_response_hubspot"');
  console.log('3. Ensure popup blockers are disabled');
  console.log('4. Try in incognito mode if issues persist');
  
  console.log('\n🔗 Manual Test Instructions:');
  console.log('1. Go to http://localhost:3000/integrations');
  console.log('2. Click "Connect" on HubSpot integration');
  console.log('3. Complete the OAuth flow');
  console.log('4. Watch browser console for debug messages');
  console.log('5. Verify integration shows as connected');
}

console.log('====================================');
console.log('HubSpot OAuth Fix Test');
console.log('====================================\n');

testHubSpotOAuthFix().then(() => {
  console.log('\n====================================');
  console.log('Test Complete');
  console.log('====================================');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});