/**
 * Test HubSpot OAuth Browser Flow - Simulates the actual browser behavior
 * This test helps diagnose the "Connect Account" button issue
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import fetch from 'node-fetch';
import puppeteer from 'puppeteer';

// Load environment variables
config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testHubSpotBrowserFlow() {
  console.log('🔍 Testing HubSpot OAuth Browser Flow...\n');
  
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const baseUrl = 'https://chainreact.app';
  
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
  console.log('📝 Storing OAuth state in database...');
  const { error: stateError } = await supabase
    .from('pkce_flow')
    .insert({ 
      state,
      code_verifier: 'test-verifier',
      provider: 'hubspot' 
    });
  
  if (stateError) {
    console.error('❌ Failed to store state:', stateError);
    return;
  }
  
  // Build OAuth URL
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
  
  console.log('🔗 OAuth URL:', authUrl);
  
  // Test different scenarios
  console.log('\n📊 Testing Different Scenarios:\n');
  
  // Scenario 1: Check if HubSpot remembers previous authorization
  console.log('1️⃣ Testing for cached authorization...');
  try {
    const response = await fetch(authUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      }
    });
    
    if (response.status === 302 || response.status === 303) {
      const location = response.headers.get('location');
      console.log('   Redirect detected:', location ? location.substring(0, 80) + '...' : 'none');
      
      // Check for different redirect patterns
      if (location) {
        if (location.includes('/login')) {
          console.log('   ✅ Clean state - redirecting to login');
        } else if (location.includes('/oauth/authorize')) {
          console.log('   ⚠️ Redirecting to authorize - might have cached session');
        } else if (location.includes(baseUrl)) {
          console.log('   ⚠️ Redirecting to callback - auto-authorizing with cached credentials');
        }
      }
    }
  } catch (error) {
    console.error('   ❌ Test failed:', error.message);
  }
  
  // Scenario 2: Check with explicit approval_prompt
  console.log('\n2️⃣ Testing with explicit approval prompt...');
  const forceParams = new URLSearchParams(params);
  forceParams.append('approval_prompt', 'force'); // Force re-approval
  const forceAuthUrl = `https://app.hubspot.com/oauth/authorize?${forceParams.toString()}`;
  
  try {
    const response = await fetch(forceAuthUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    console.log('   Status:', response.status);
    if (response.status === 302 || response.status === 303) {
      const location = response.headers.get('location');
      console.log('   With force approval:', location ? location.substring(0, 80) + '...' : 'none');
    }
  } catch (error) {
    console.error('   ❌ Test failed:', error.message);
  }
  
  // Scenario 3: Check for scope changes
  console.log('\n3️⃣ Testing with minimal scopes...');
  const minimalScopes = ['oauth', 'crm.objects.contacts.read'];
  const minimalParams = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${baseUrl}/api/integrations/hubspot/callback`,
    response_type: 'code',
    scope: minimalScopes.join(' '),
    state: state
  });
  const minimalAuthUrl = `https://app.hubspot.com/oauth/authorize?${minimalParams.toString()}`;
  
  try {
    const response = await fetch(minimalAuthUrl, {
      method: 'GET',
      redirect: 'manual',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      }
    });
    
    console.log('   Status with minimal scopes:', response.status);
  } catch (error) {
    console.error('   ❌ Test failed:', error.message);
  }
  
  // Analyze the issue
  console.log('\n📋 Analysis of "Connect Account" Button Issue:\n');
  console.log('The behavior you described suggests:');
  console.log('1. HubSpot recognizes a previous authorization session');
  console.log('2. But the scopes have changed, requiring re-approval');
  console.log('3. HubSpot shows the "Connect Account" button briefly');
  console.log('4. Then auto-approves based on some cached state');
  console.log('');
  console.log('This typically happens when:');
  console.log('- The app was previously connected with different scopes');
  console.log('- HubSpot has cached the approval but needs to update scopes');
  console.log('- The browser has cookies from a previous session');
  
  console.log('\n🔧 Recommended Fixes:\n');
  console.log('1. Add "approval_prompt=force" to OAuth URL to force re-approval');
  console.log('2. Clear HubSpot cookies before starting OAuth flow');
  console.log('3. Use a unique state parameter to prevent caching');
  console.log('4. Add a delay in popup detection to handle the redirect');
  
  console.log('\n💻 Code Changes to Implement:\n');
  console.log('1. In /app/api/integrations/auth/generate-url/route.ts:');
  console.log('   Add approval_prompt=force for HubSpot');
  console.log('');
  console.log('2. In /lib/oauth/popup-manager.ts:');
  console.log('   Increase delay for success detection');
  console.log('   Add special handling for HubSpot redirects');
  console.log('');
  console.log('3. In popup detection logic:');
  console.log('   Don\'t treat quick redirects as cancellation for HubSpot');
}

console.log('====================================');
console.log('HubSpot OAuth Browser Flow Test');
console.log('====================================\n');

testHubSpotBrowserFlow().then(() => {
  console.log('\n====================================');
  console.log('Test Complete');
  console.log('====================================');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});