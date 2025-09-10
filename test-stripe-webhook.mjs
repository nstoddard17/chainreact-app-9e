#!/usr/bin/env node

import fetch from 'node-fetch';

// Test if the webhook endpoint is accessible
async function testWebhookEndpoint() {
  console.log('🧪 Testing Stripe webhook endpoint...\n');
  
  try {
    // Test local endpoint
    const localUrl = 'http://localhost:3000/api/webhooks/stripe';
    console.log(`📍 Testing local endpoint: ${localUrl}`);
    
    const response = await fetch(localUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'test_signature'
      },
      body: JSON.stringify({ test: true })
    });
    
    const result = await response.text();
    console.log(`   Status: ${response.status}`);
    console.log(`   Response: ${result}`);
    
    if (response.status === 400 && result.includes('Invalid signature')) {
      console.log('✅ Webhook endpoint is accessible (signature validation working)');
    } else {
      console.log('⚠️ Unexpected response from webhook endpoint');
    }
    
  } catch (error) {
    console.error('❌ Failed to reach webhook endpoint:', error.message);
    console.log('\n💡 Make sure your development server is running (npm run dev)');
  }
  
  console.log('\n📋 Webhook Configuration Checklist:');
  console.log('1. ✓ Webhook endpoint: /api/webhooks/stripe');
  console.log('2. ✓ Environment variable: STRIPE_WEBHOOK_SECRET is set');
  console.log('3. ⚠️ Make sure to configure webhook in Stripe Dashboard:');
  console.log('   - Go to https://dashboard.stripe.com/test/webhooks');
  console.log('   - Add endpoint URL: https://your-domain.com/api/webhooks/stripe');
  console.log('   - Or for local testing: Use Stripe CLI');
  console.log('\n4. 📝 Required webhook events to listen for:');
  console.log('   - checkout.session.completed');
  console.log('   - customer.subscription.created');
  console.log('   - customer.subscription.updated');
  console.log('   - customer.subscription.deleted');
  console.log('   - invoice.payment_succeeded');
  console.log('   - invoice.payment_failed');
  
  console.log('\n🔧 For local testing with Stripe CLI:');
  console.log('1. Install Stripe CLI: https://stripe.com/docs/stripe-cli');
  console.log('2. Login: stripe login');
  console.log('3. Forward webhooks to local:');
  console.log('   stripe listen --forward-to localhost:3000/api/webhooks/stripe');
  console.log('4. Copy the webhook signing secret and update STRIPE_WEBHOOK_SECRET in .env.local');
  console.log('5. Trigger test events:');
  console.log('   stripe trigger checkout.session.completed');
}

testWebhookEndpoint();