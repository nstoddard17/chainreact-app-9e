#!/usr/bin/env node

import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env.local') });

async function triggerManualWebhook() {
  console.log('🚀 Manual Webhook Trigger Test\n');
  console.log('========================================\n');
  
  // Get the current user's ID from environment or use a test ID
  const testUserId = process.env.TEST_USER_ID || 'test-user-' + Date.now();
  const testEmail = process.env.TEST_USER_EMAIL || 'test@chainreact.app';
  
  // Create a mock checkout.session.completed event
  const mockEvent = {
    id: 'evt_test_' + Date.now(),
    object: 'event',
    api_version: '2024-12-18',
    created: Math.floor(Date.now() / 1000),
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_test_' + Date.now(),
        object: 'checkout.session',
        customer: 'cus_test_' + Date.now(),
        customer_details: {
          email: testEmail,
          name: 'Test User'
        },
        subscription: 'sub_test_' + Date.now(),
        payment_status: 'paid',
        status: 'complete',
        mode: 'subscription',
        metadata: {
          user_id: testUserId,
          plan_id: 'pro',
          billing_cycle: 'monthly'
        },
        amount_total: 2900,
        currency: 'usd',
        success_url: 'https://chainreact.app/settings?tab=billing&success=true',
        cancel_url: 'https://chainreact.app/settings?tab=billing&canceled=true'
      }
    }
  };
  
  console.log('📋 Test Event Details:');
  console.log('   User ID:', testUserId);
  console.log('   Email:', testEmail);
  console.log('   Plan:', 'pro');
  console.log('   Billing Cycle:', 'monthly');
  console.log('   Subscription ID:', mockEvent.data.object.subscription);
  console.log('\n');
  
  // Test endpoints
  const endpoints = [
    {
      name: 'Logging Endpoint',
      url: 'https://chainreact.app/api/webhooks/stripe-log',
      description: 'Logs all webhooks without verification'
    },
    {
      name: 'Billing Endpoint (No Signature)',
      url: 'https://chainreact.app/api/webhooks/stripe-billing',
      description: 'Production billing endpoint - will fail signature check'
    }
  ];
  
  for (const endpoint of endpoints) {
    console.log(`\n📡 Testing: ${endpoint.name}`);
    console.log(`   URL: ${endpoint.url}`);
    console.log(`   ${endpoint.description}`);
    
    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'stripe-signature': 'test_signature_' + Date.now()
        },
        body: JSON.stringify(mockEvent)
      });
      
      const responseText = await response.text();
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch {
        responseData = responseText;
      }
      
      console.log(`   Status: ${response.status} ${response.statusText}`);
      console.log(`   Response:`, responseData);
      
      if (response.status === 400 && endpoint.name.includes('Billing')) {
        console.log('   ✅ Expected: Signature verification failed (normal for manual test)');
      } else if (response.status === 200) {
        console.log('   ✅ Success: Webhook processed');
      }
      
    } catch (error) {
      console.error(`   ❌ Error:`, error.message);
    }
  }
  
  console.log('\n========================================\n');
  console.log('📊 Next Steps:\n');
  console.log('1. Check production logs for [Stripe Log] entries');
  console.log('2. Check Supabase subscriptions table for test records');
  console.log('3. If logging endpoint works but billing doesn\'t:');
  console.log('   - The issue is likely signature verification');
  console.log('   - Check STRIPE_BILLING_WEBHOOK_SECRET in production');
  console.log('4. Use the logging endpoint URL in Stripe Dashboard temporarily');
  console.log('   to capture real webhook data for debugging\n');
  
  // Also test local endpoints if running locally
  if (process.env.NODE_ENV === 'development') {
    console.log('🏠 Testing Local Endpoints...\n');
    
    const localEndpoints = [
      'http://localhost:3000/api/webhooks/stripe-log',
      'http://localhost:3000/api/webhooks/stripe-billing'
    ];
    
    for (const url of localEndpoints) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'stripe-signature': 'test_local'
          },
          body: JSON.stringify(mockEvent)
        });
        
        console.log(`Local ${url}: ${response.status}`);
      } catch (error) {
        console.log(`Local ${url}: Not available`);
      }
    }
  }
}

triggerManualWebhook();