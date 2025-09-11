#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fetch from 'node-fetch';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env.local') });

async function testProductionWebhook() {
  console.log('🧪 Testing Production Webhook Setup...\n');
  console.log('========================================\n');
  
  // 1. Test Supabase Connection
  console.log('📋 Test 1: Supabase Connection');
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials');
    return;
  }
  
  console.log('✅ Supabase URL:', supabaseUrl);
  console.log('✅ Service key present:', supabaseKey.substring(0, 20) + '...');
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  // Test subscriptions table
  const { data: subs, error: subsError } = await supabase
    .from('subscriptions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (subsError) {
    console.error('❌ Subscriptions table error:', subsError.message);
  } else {
    console.log('✅ Subscriptions table accessible');
    console.log('   Recent records:', subs?.length || 0);
    if (subs?.length > 0) {
      console.log('   Latest subscription:', {
        id: subs[0].id,
        user_id: subs[0].user_id,
        plan_id: subs[0].plan_id,
        status: subs[0].status,
        created_at: subs[0].created_at
      });
    }
  }
  
  // Test invoices table
  const { data: invoices, error: invoicesError } = await supabase
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (invoicesError) {
    console.error('❌ Invoices table error:', invoicesError.message);
  } else {
    console.log('✅ Invoices table accessible');
    console.log('   Recent records:', invoices?.length || 0);
  }
  
  console.log('\n========================================\n');
  
  // 2. Test Webhook Endpoint
  console.log('📋 Test 2: Webhook Endpoint Accessibility');
  const productionUrl = 'https://chainreact.app';
  
  try {
    // Test GET endpoint
    console.log('Testing GET endpoint...');
    const testResponse = await fetch(`${productionUrl}/api/webhooks/stripe-test`, {
      method: 'GET',
      headers: {
        'User-Agent': 'ChainReact-Webhook-Test'
      }
    });
    
    if (testResponse.ok) {
      const testData = await testResponse.json();
      console.log('✅ Test endpoint accessible');
      console.log('   Environment check:', testData.environment);
      console.log('   Supabase test:', testData.supabaseTest);
    } else {
      console.error('❌ Test endpoint returned:', testResponse.status, testResponse.statusText);
    }
    
    // Test POST to billing endpoint (without signature - will fail but shows accessibility)
    console.log('\nTesting POST to billing endpoint...');
    const billingResponse = await fetch(`${productionUrl}/api/webhooks/stripe-billing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 'test_signature'
      },
      body: JSON.stringify({ test: true })
    });
    
    // We expect 400 (bad signature) which means endpoint is accessible
    if (billingResponse.status === 400) {
      console.log('✅ Billing endpoint accessible (returned 400 for invalid signature as expected)');
    } else {
      console.log('⚠️ Billing endpoint returned unexpected status:', billingResponse.status);
    }
    
  } catch (fetchError) {
    console.error('❌ Failed to reach production endpoints:', fetchError.message);
  }
  
  console.log('\n========================================\n');
  
  // 3. Check Environment Variables
  console.log('📋 Test 3: Environment Variables');
  console.log('STRIPE_SECRET_KEY present:', !!process.env.STRIPE_SECRET_KEY);
  console.log('STRIPE_BILLING_WEBHOOK_SECRET present:', !!process.env.STRIPE_BILLING_WEBHOOK_SECRET);
  console.log('STRIPE_WEBHOOK_SECRET present:', !!process.env.STRIPE_WEBHOOK_SECRET);
  
  if (process.env.STRIPE_BILLING_WEBHOOK_SECRET) {
    console.log('Webhook secret starts with:', process.env.STRIPE_BILLING_WEBHOOK_SECRET.substring(0, 10));
  }
  
  console.log('\n========================================\n');
  
  // 4. Create Test Subscription Record
  console.log('📋 Test 4: Create Test Subscription');
  const testUserId = '00000000-0000-0000-0000-000000000000';
  const testSubId = 'sub_test_' + Date.now();
  
  const { data: testSub, error: testSubError } = await supabase
    .from('subscriptions')
    .insert({
      user_id: testUserId,
      plan_id: 'test_plan',
      stripe_customer_id: 'cus_test_' + Date.now(),
      stripe_subscription_id: testSubId,
      status: 'active',
      billing_cycle: 'monthly',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    })
    .select();
  
  if (testSubError) {
    console.error('❌ Failed to create test subscription:', testSubError.message);
    console.log('   This might be due to RLS policies or missing columns');
  } else {
    console.log('✅ Test subscription created successfully');
    console.log('   Test ID:', testSubId);
    
    // Clean up
    const { error: deleteError } = await supabase
      .from('subscriptions')
      .delete()
      .eq('stripe_subscription_id', testSubId);
    
    if (!deleteError) {
      console.log('   ✅ Test record cleaned up');
    }
  }
  
  console.log('\n========================================\n');
  console.log('📊 Summary and Next Steps:\n');
  console.log('1. ✅ Check Stripe Dashboard webhook logs at:');
  console.log('   https://dashboard.stripe.com/test/webhooks');
  console.log('   Look for your endpoint and check "Webhook attempts" tab\n');
  
  console.log('2. ✅ Verify webhook endpoint URL in Stripe is exactly:');
  console.log('   https://chainreact.app/api/webhooks/stripe-billing\n');
  
  console.log('3. ✅ Ensure webhook signing secret matches:');
  console.log('   Copy from Stripe Dashboard → Reveal signing secret');
  console.log('   Update STRIPE_BILLING_WEBHOOK_SECRET in production\n');
  
  console.log('4. ✅ Check production logs for [Stripe Billing Webhook] entries');
  console.log('   These will show if webhooks are being received\n');
  
  console.log('5. ✅ If still not working, try resending failed webhooks:');
  console.log('   Stripe Dashboard → Webhooks → Select endpoint → Webhook attempts → Resend\n');
}

testProductionWebhook();