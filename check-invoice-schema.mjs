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

async function checkInvoiceSchema() {
  console.log('Checking invoices table schema...\n');
  
  // First check if table exists
  const { data: tables, error: tableError } = await supabase
    .from('invoices')
    .select('*')
    .limit(1);
  
  if (tableError) {
    console.log('Error accessing invoices table:', tableError.message);
    if (tableError.message.includes('relation') && tableError.message.includes('does not exist')) {
      console.log('\n❌ Invoices table does not exist in the database');
      console.log('\nDo you need invoice tracking? Invoices provide:');
      console.log('- Payment history and receipts');
      console.log('- Tax documentation');
      console.log('- Billing audit trail');
      console.log('- Failed payment tracking');
      console.log('\nSubscriptions table alone is sufficient for:');
      console.log('- Current subscription status');
      console.log('- Plan management');
      console.log('- Access control');
      return;
    }
  }
  
  // Create a minimal test record to see what fields are accepted
  const testData = {
    stripe_invoice_id: 'in_test_' + Date.now(),
    user_id: '00000000-0000-0000-0000-000000000000',
    stripe_customer_id: 'cus_test',
    status: 'paid',
    amount_paid: 19.99,
    currency: 'usd',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
  
  // Try to insert and see what works
  console.log('Testing basic invoice fields...');
  const { data: basic, error: basicError } = await supabase
    .from('invoices')
    .insert(testData)
    .select();
  
  if (basicError) {
    console.log('Basic fields error:', basicError.message);
  } else {
    console.log('✅ Basic invoice fields work!');
    // Clean up
    await supabase.from('invoices').delete().eq('stripe_invoice_id', testData.stripe_invoice_id);
  }
  
  // Test additional fields one by one
  const additionalFields = [
    { name: 'subscription_id', value: 'sub_test' },
    { name: 'stripe_subscription_id', value: 'sub_test' },
    { name: 'amount_due', value: 19.99 },
    { name: 'amount_remaining', value: 0 },
    { name: 'subtotal', value: 19.99 },
    { name: 'total', value: 19.99 },
    { name: 'tax_amount', value: 0 },
    { name: 'billing_reason', value: 'subscription_create' },
    { name: 'period_start', value: new Date().toISOString() },
    { name: 'period_end', value: new Date().toISOString() },
    { name: 'due_date', value: new Date().toISOString() },
    { name: 'paid_at', value: new Date().toISOString() },
    { name: 'invoice_pdf', value: 'https://example.com/invoice.pdf' },
    { name: 'hosted_invoice_url', value: 'https://example.com/invoice' },
    { name: 'payment_method_types', value: ['card'] },
    { name: 'payment_intent_id', value: 'pi_test' },
    { name: 'charge_id', value: 'ch_test' }
  ];
  
  console.log('\nTesting additional invoice fields:');
  for (const field of additionalFields) {
    const testDataWithField = {
      ...testData,
      stripe_invoice_id: 'in_test_' + Date.now() + '_' + field.name,
      [field.name]: field.value
    };
    
    const { error } = await supabase
      .from('invoices')
      .insert(testDataWithField)
      .select();
    
    if (error) {
      console.log(`❌ ${field.name}: NOT FOUND`);
    } else {
      console.log(`✅ ${field.name}: EXISTS`);
      // Clean up
      await supabase.from('invoices').delete().eq('stripe_invoice_id', testDataWithField.stripe_invoice_id);
    }
  }
  
  console.log('\n📊 Summary:');
  console.log('If you see fields marked with ✅, those exist in your invoices table.');
  console.log('If all fields show ❌, you may need to create the invoices table.');
  console.log('\nInvoices are useful for:');
  console.log('- Keeping payment history even after subscription cancellation');
  console.log('- Generating receipts and tax documents');
  console.log('- Tracking failed payments and retries');
  console.log('- Providing detailed billing audit trail');
}

checkInvoiceSchema();