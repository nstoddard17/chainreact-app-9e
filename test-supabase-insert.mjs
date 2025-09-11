#!/usr/bin/env node

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env.local') });

async function testSupabaseInsert() {
  console.log('🧪 Testing Supabase connection and insert...\n');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env.local');
    console.log('Required:');
    console.log('  NEXT_PUBLIC_SUPABASE_URL');
    console.log('  SUPABASE_SERVICE_ROLE_KEY');
    return;
  }
  
  console.log('✅ Supabase URL:', supabaseUrl);
  console.log('✅ Service key present:', supabaseKey.substring(0, 20) + '...');
  
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  try {
    // Test 1: Check if subscriptions table exists
    console.log('\n📋 Test 1: Checking subscriptions table...');
    const { data: subs, error: subsError } = await supabase
      .from('subscriptions')
      .select('*')
      .limit(1);
    
    if (subsError) {
      console.error('❌ Subscriptions table error:', subsError.message);
    } else {
      console.log('✅ Subscriptions table accessible');
      console.log('   Current records:', subs?.length || 0);
    }
    
    // Test 2: Check if invoices table exists
    console.log('\n📋 Test 2: Checking invoices table...');
    const { data: invoices, error: invoicesError } = await supabase
      .from('invoices')
      .select('*')
      .limit(1);
    
    if (invoicesError) {
      console.error('❌ Invoices table error:', invoicesError.message);
    } else {
      console.log('✅ Invoices table accessible');
      console.log('   Current records:', invoices?.length || 0);
    }
    
    // Test 3: Check if plans table exists and has data
    console.log('\n📋 Test 3: Checking plans table...');
    const { data: plans, error: plansError } = await supabase
      .from('plans')
      .select('*');
    
    if (plansError) {
      console.error('❌ Plans table error:', plansError.message);
    } else {
      console.log('✅ Plans table accessible');
      console.log('   Available plans:', plans?.map(p => `${p.name} (${p.id})`).join(', '));
    }
    
    // Test 4: Try to insert a test subscription (will rollback)
    console.log('\n📋 Test 4: Testing insert capability...');
    const testData = {
      user_id: '00000000-0000-0000-0000-000000000000', // Dummy UUID
      plan_id: 'test_plan',
      stripe_customer_id: 'cus_test_' + Date.now(),
      stripe_subscription_id: 'sub_test_' + Date.now(),
      status: 'active',
      billing_cycle: 'monthly',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    const { data: insertTest, error: insertError } = await supabase
      .from('subscriptions')
      .insert(testData)
      .select();
    
    if (insertError) {
      console.error('❌ Insert test failed:', insertError.message);
      console.log('   This might be due to:');
      console.log('   - Missing columns in the table');
      console.log('   - RLS policies blocking inserts');
      console.log('   - Foreign key constraints');
    } else {
      console.log('✅ Insert test successful!');
      console.log('   Test record created:', insertTest[0].id);
      
      // Clean up test record
      const { error: deleteError } = await supabase
        .from('subscriptions')
        .delete()
        .eq('stripe_subscription_id', testData.stripe_subscription_id);
      
      if (!deleteError) {
        console.log('   Test record cleaned up');
      }
    }
    
    // Test 5: Check table schema
    console.log('\n📋 Test 5: Checking subscriptions table schema...');
    const { data: schema, error: schemaError } = await supabase
      .rpc('get_table_columns', { table_name: 'subscriptions' })
      .single();
    
    if (schemaError) {
      // Try alternative method
      const { data: testInsert, error: testError } = await supabase
        .from('subscriptions')
        .insert({})
        .select();
      
      if (testError?.message.includes('required')) {
        console.log('⚠️ Required columns detected from error:', testError.message);
      }
    } else {
      console.log('✅ Table schema:', schema);
    }
    
  } catch (error) {
    console.error('❌ Unexpected error:', error);
  }
  
  console.log('\n📊 Summary:');
  console.log('1. Check your Stripe Dashboard webhook logs');
  console.log('2. Verify webhook endpoint URL is correct');
  console.log('3. Check server logs for webhook receipt');
  console.log('4. Ensure STRIPE_BILLING_WEBHOOK_SECRET matches Dashboard');
  console.log('5. Verify Supabase tables exist with correct columns');
}

testSupabaseInsert();