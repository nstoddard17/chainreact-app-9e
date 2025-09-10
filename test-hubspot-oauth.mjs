/**
 * Test HubSpot OAuth Flow
 * This simulates the OAuth connection process
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import crypto from 'crypto';
import fetch from 'node-fetch';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testHubSpotOAuth() {
  console.log('🔍 Testing HubSpot OAuth Configuration...\n');
  
  // Check environment variables
  console.log('1️⃣ Checking environment variables...');
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  
  console.log('   Client ID:', clientId ? `${clientId.substring(0, 10)}...` : '❌ MISSING');
  console.log('   Client Secret:', clientSecret ? '✅ Present' : '❌ MISSING');
  
  if (!clientId || !clientSecret) {
    console.error('\n❌ HubSpot OAuth credentials are not configured in environment variables');
    return;
  }
  
  // Get or create test user
  console.log('\n2️⃣ Getting test user from database...');
  const { data: users, error: userError } = await supabase
    .from('user_profiles')
    .select('id')
    .limit(1);
  
  if (userError || !users || users.length === 0) {
    console.error('❌ No users found in database');
    return;
  }
  
  const userId = users[0].id;
  console.log('   Using user ID:', userId);
  
  // Check existing integration
  console.log('\n3️⃣ Checking existing HubSpot integration...');
  const { data: existingIntegration } = await supabase
    .from('integrations')
    .select('*')
    .eq('provider', 'hubspot')
    .eq('user_id', userId)
    .single();
  
  if (existingIntegration) {
    console.log('   Found existing integration:', {
      id: existingIntegration.id,
      status: existingIntegration.status,
      hasToken: !!existingIntegration.access_token,
      updatedAt: existingIntegration.updated_at
    });
  } else {
    console.log('   No existing HubSpot integration found');
  }
  
  // Generate OAuth URL
  console.log('\n4️⃣ Generating OAuth URL...');
  const state = btoa(JSON.stringify({
    userId,
    provider: 'hubspot',
    reconnect: !!existingIntegration,
    integrationId: existingIntegration?.id,
    timestamp: Date.now()
  }));
  
  const scopes = [
    'oauth',
    'crm.lists.read',
    'crm.lists.write',
    'crm.objects.companies.read',
    'crm.objects.companies.write',
    'crm.objects.contacts.read',
    'crm.objects.contacts.write',
    'crm.objects.deals.read',
    'crm.objects.deals.write'
  ];
  
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/integrations/hubspot/callback`,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    state: state
  });
  
  const authUrl = `https://app.hubspot.com/oauth/authorize?${params.toString()}`;
  console.log('\n📋 OAuth URL generated:');
  console.log(authUrl);
  
  // Test the OAuth endpoint directly
  console.log('\n5️⃣ Testing OAuth endpoint accessibility...');
  try {
    const response = await fetch(authUrl, {
      method: 'HEAD',
      redirect: 'manual'
    });
    
    if (response.status === 302 || response.status === 303) {
      console.log('✅ OAuth endpoint is accessible and redirecting as expected');
      const location = response.headers.get('location');
      if (location) {
        console.log('   Redirect location:', location.substring(0, 50) + '...');
      }
    } else {
      console.log(`⚠️ Unexpected response status: ${response.status}`);
    }
  } catch (error) {
    console.error('❌ Failed to reach OAuth endpoint:', error.message);
  }
  
  // Check callback route
  console.log('\n6️⃣ Checking callback route configuration...');
  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/integrations/hubspot/callback`;
  console.log('   Callback URL:', callbackUrl);
  
  // Simulate what happens after authorization
  console.log('\n7️⃣ What happens after authorization:');
  console.log('   1. User authorizes the app on HubSpot');
  console.log('   2. HubSpot redirects to:', callbackUrl);
  console.log('   3. Callback exchanges code for access token');
  console.log('   4. Token is encrypted and stored in database');
  console.log('   5. Popup closes and sends success message to parent window');
  
  // Check for common issues
  console.log('\n8️⃣ Checking for common issues...');
  
  // Check if state is stored properly
  const { data: pkceData, error: pkceError } = await supabase
    .from('pkce_flow')
    .select('*')
    .eq('provider', 'hubspot')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (pkceData && pkceData.length > 0) {
    console.log(`   Found ${pkceData.length} recent OAuth state entries`);
    console.log('   Latest entry:', {
      provider: pkceData[0].provider,
      hasState: !!pkceData[0].state,
      hasCodeVerifier: !!pkceData[0].code_verifier,
      createdAt: pkceData[0].created_at
    });
  } else {
    console.log('   No recent OAuth state entries found');
  }
  
  // Check popup blocker
  console.log('\n9️⃣ Common popup issues:');
  console.log('   - Browser popup blocker might be active');
  console.log('   - Cross-origin policies might block messages');
  console.log('   - Popup might close before success message is sent');
  console.log('   - OAuth redirect might be too fast for popup detection');
  
  console.log('\n🔟 Testing with simulated authorization code...');
  
  // Simulate token exchange (won't work with fake code, but shows the process)
  const fakeCode = 'test-code-123';
  const tokenUrl = 'https://api.hubapi.com/oauth/v1/token';
  
  console.log('   Token exchange URL:', tokenUrl);
  console.log('   Would send:');
  console.log('     - grant_type: authorization_code');
  console.log('     - client_id:', clientId.substring(0, 10) + '...');
  console.log('     - client_secret: [REDACTED]');
  console.log('     - redirect_uri:', callbackUrl);
  console.log('     - code: [AUTH_CODE_FROM_HUBSPOT]');
  
  console.log('\n✨ Recommendations:');
  console.log('1. Make sure popups are allowed for localhost:3000');
  console.log('2. Try using Chrome with popups enabled');
  console.log('3. Check browser console for postMessage errors');
  console.log('4. Ensure the OAuth flow completes fully before closing');
  console.log('5. Try clearing browser cache and cookies for HubSpot');
}

console.log('====================================');
console.log('HubSpot OAuth Flow Test');
console.log('====================================\n');

testHubSpotOAuth().then(() => {
  console.log('\n====================================');
  console.log('Test Complete');
  console.log('====================================');
}).catch(error => {
  console.error('Fatal error:', error);
});