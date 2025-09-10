/**
 * Test HubSpot OAuth Flow - Simulates the production flow
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fetch from 'node-fetch';
import open from 'open';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testHubSpotOAuthFlow() {
  console.log('🔍 Testing HubSpot OAuth Flow...\n');
  
  // Check environment
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  const baseUrl = 'https://chainreact.app';
  
  console.log('📋 Configuration:');
  console.log('   Client ID:', clientId ? `${clientId.substring(0, 10)}...` : '❌ MISSING');
  console.log('   Base URL:', baseUrl);
  console.log('   Callback URL:', `${baseUrl}/api/integrations/hubspot/callback`);
  
  // Get a test user
  const { data: users } = await supabase
    .from('user_profiles')
    .select('id')
    .limit(1);
  
  const userId = users?.[0]?.id || 'test-user-id';
  
  // Create state for OAuth
  const state = Buffer.from(JSON.stringify({
    userId,
    provider: 'hubspot',
    reconnect: false,
    timestamp: Date.now()
  })).toString('base64');
  
  // Store state in database
  console.log('\n📝 Storing OAuth state in database...');
  const { error: stateError } = await supabase
    .from('pkce_flow')
    .insert({ 
      state,
      code_verifier: 'test-verifier',
      provider: 'hubspot' 
    });
  
  if (stateError) {
    console.error('❌ Failed to store state:', stateError);
  } else {
    console.log('✅ State stored successfully');
  }
  
  // Build OAuth URL with all required scopes
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
    redirect_uri: `${baseUrl}/api/integrations/hubspot/callback`,
    response_type: 'code',
    scope: scopes.join(' '),
    access_type: 'offline',
    state: state
  });
  
  const authUrl = `https://app.hubspot.com/oauth/authorize?${params.toString()}`;
  
  console.log('\n🔗 OAuth URL:');
  console.log(authUrl);
  
  // Test if HubSpot OAuth endpoint is accessible
  console.log('\n🌐 Testing HubSpot OAuth endpoint...');
  try {
    const response = await fetch(authUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    console.log('   Status:', response.status);
    console.log('   Status Text:', response.statusText);
    
    if (response.status === 302 || response.status === 303) {
      const location = response.headers.get('location');
      console.log('   Redirect to:', location ? location.substring(0, 100) + '...' : 'none');
      
      // Check if it's redirecting to login
      if (location && location.includes('login')) {
        console.log('   ℹ️ Redirecting to login - user needs to authenticate with HubSpot');
      } else if (location && location.includes('oauth/authorize')) {
        console.log('   ℹ️ Redirecting to authorization page');
      }
    }
    
    // Get response body to check for errors
    const body = await response.text();
    if (body.includes('error') || body.includes('Error')) {
      console.log('\n⚠️ Response contains error indicators');
      if (body.includes('scope')) {
        console.log('   Possible scope mismatch issue');
      }
      if (body.includes('client_id')) {
        console.log('   Possible client ID issue');
      }
    }
    
  } catch (error) {
    console.error('❌ Failed to test OAuth endpoint:', error.message);
  }
  
  // Check HubSpot app configuration
  console.log('\n🔍 Checking HubSpot App Configuration...');
  console.log('   Please verify in your HubSpot app settings:');
  console.log('   1. Redirect URL is exactly:', `${baseUrl}/api/integrations/hubspot/callback`);
  console.log('   2. All these scopes are enabled:');
  scopes.forEach(scope => {
    console.log(`      - ${scope}`);
  });
  console.log('   3. App is not in development/test mode (if applicable)');
  
  // Test the callback endpoint
  console.log('\n🔍 Testing callback endpoint...');
  try {
    const callbackUrl = `${baseUrl}/api/integrations/hubspot/callback?code=test&state=${state}`;
    const callbackResponse = await fetch(callbackUrl, {
      method: 'GET',
      redirect: 'manual'
    });
    
    console.log('   Callback endpoint status:', callbackResponse.status);
    
    if (callbackResponse.status === 200) {
      const body = await callbackResponse.text();
      if (body.includes('oauth-success')) {
        console.log('   ✅ Callback endpoint is working');
      } else if (body.includes('oauth-error')) {
        console.log('   ⚠️ Callback returned error response');
      }
    }
  } catch (error) {
    console.error('   ❌ Callback endpoint test failed:', error.message);
  }
  
  console.log('\n📌 Possible Issues:');
  console.log('1. The "Connect Account" button appearing suggests HubSpot is asking for re-authorization');
  console.log('2. The quick redirect might mean:');
  console.log('   - HubSpot remembers a previous authorization but with different scopes');
  console.log('   - The app might be in a different HubSpot account than expected');
  console.log('   - There might be a cookie/session issue');
  console.log('\n💡 Solutions to try:');
  console.log('1. Clear all HubSpot cookies and try again');
  console.log('2. Try in an incognito/private browser window');
  console.log('3. Log out of HubSpot completely, then try the OAuth flow');
  console.log('4. Check if the HubSpot app is installed in the correct HubSpot account');
  console.log('5. Remove and re-add the redirect URL in HubSpot app settings');
  
  // Check for recent OAuth attempts in the database
  console.log('\n📊 Recent OAuth attempts:');
  const { data: recentAttempts } = await supabase
    .from('pkce_flow')
    .select('*')
    .eq('provider', 'hubspot')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (recentAttempts && recentAttempts.length > 0) {
    console.log(`   Found ${recentAttempts.length} recent attempts`);
    recentAttempts.forEach((attempt, i) => {
      console.log(`   ${i + 1}. Created: ${attempt.created_at}, Has state: ${!!attempt.state}`);
    });
  }
  
  console.log('\n🔗 To manually test the flow:');
  console.log('1. Open this URL in a browser:');
  console.log(`   ${authUrl}`);
  console.log('2. Complete the authorization');
  console.log('3. Check the browser console for any errors');
  console.log('4. Check the network tab for the callback request');
}

console.log('====================================');
console.log('HubSpot OAuth Flow Test');
console.log('====================================\n');

testHubSpotOAuthFlow().then(() => {
  console.log('\n====================================');
  console.log('Test Complete');
  console.log('====================================');
}).catch(error => {
  console.error('Fatal error:', error);
});