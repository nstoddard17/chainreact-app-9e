#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  console.log('Checking subscriptions table schema...\n');
  
  // Create a minimal test record to see what fields are accepted
  const testData = {
    user_id: '00000000-0000-0000-0000-000000000000',
    plan_id: 'test',
    stripe_customer_id: 'cus_test',
    stripe_subscription_id: 'sub_test_' + Date.now(),
    status: 'active',
    billing_cycle: 'monthly',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  // Try to insert and see what works
  console.log('Testing basic fields...');
  const { data: basic, error: basicError } = await supabase
    .from('subscriptions')
    .insert(testData)
    .select();
  
  if (basicError) {
    console.log('Basic fields error:', basicError.message);
  } else {
    console.log('✅ Basic fields work!');
    // Clean up
    await supabase.from('subscriptions').delete().eq('stripe_subscription_id', testData.stripe_subscription_id);
  }
  
  // Test additional fields one by one
  const additionalFields = [
    { name: 'price_id', value: 'price_test' },
    { name: 'unit_amount', value: 19.99 },
    { name: 'currency', value: 'usd' },
    { name: 'trial_start', value: new Date().toISOString() },
    { name: 'trial_end', value: new Date().toISOString() },
    { name: 'discount_percentage', value: 10 },
    { name: 'discount_amount', value: 5.00 },
    { name: 'coupon_code', value: 'TEST10' },
    { name: 'default_payment_method', value: 'pm_test' },
    { name: 'customer_email', value: 'test@example.com' },
    { name: 'cancel_at_period_end', value: false }
  ];
  
  console.log('\nTesting additional fields:');
  for (const field of additionalFields) {
    const testDataWithField = {
      ...testData,
      stripe_subscription_id: 'sub_test_' + Date.now() + '_' + field.name,
      [field.name]: field.value
    };
    
    const { error } = await supabase
      .from('subscriptions')
      .insert(testDataWithField)
      .select();
    
    if (error) {
      console.log(`❌ ${field.name}: NOT FOUND`);
    } else {
      console.log(`✅ ${field.name}: EXISTS`);
      // Clean up
      await supabase.from('subscriptions').delete().eq('stripe_subscription_id', testDataWithField.stripe_subscription_id);
    }
  }
}

checkSchema();