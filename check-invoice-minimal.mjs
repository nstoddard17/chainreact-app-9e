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

async function checkMinimalSchema() {
  console.log('Checking minimal invoices table fields...\n');
  
  // Test minimal fields one by one
  const minimalFields = [
    { name: 'id', value: 'test-id-' + Date.now() },
    { name: 'stripe_invoice_id', value: 'in_test_' + Date.now() },
    { name: 'invoice_id', value: 'in_test_' + Date.now() },
    { name: 'user_id', value: '00000000-0000-0000-0000-000000000000' },
    { name: 'customer_id', value: 'cus_test' },
    { name: 'stripe_customer_id', value: 'cus_test' },
    { name: 'amount', value: 19.99 },
    { name: 'total', value: 19.99 },
    { name: 'status', value: 'paid' },
    { name: 'created_at', value: new Date().toISOString() },
    { name: 'updated_at', value: new Date().toISOString() }
  ];
  
  console.log('Testing each field individually:');
  const workingFields = [];
  
  for (const field of minimalFields) {
    const testData = {
      [field.name]: field.value
    };
    
    const { error } = await supabase
      .from('invoices')
      .insert(testData)
      .select();
    
    if (!error || error.message.includes('null value')) {
      console.log(`✅ ${field.name}: EXISTS (or nullable)`);
      workingFields.push(field.name);
    } else if (error.message.includes('column') && error.message.includes('does not exist')) {
      console.log(`❌ ${field.name}: NOT FOUND`);
    } else {
      console.log(`⚠️  ${field.name}: ${error.message.substring(0, 50)}...`);
    }
  }
  
  // Now try to find actual records
  console.log('\n📊 Checking for existing invoice records...');
  const { data: invoices, error: fetchError } = await supabase
    .from('invoices')
    .select('*')
    .limit(1);
  
  if (!fetchError && invoices && invoices.length > 0) {
    console.log('\nFound invoice record with these fields:');
    const invoice = invoices[0];
    Object.keys(invoice).forEach(key => {
      const value = invoice[key];
      const type = value === null ? 'null' : typeof value;
      console.log(`  - ${key}: ${type}`);
    });
  } else if (fetchError) {
    console.log('Error fetching invoices:', fetchError.message);
  } else {
    console.log('No existing invoice records found');
  }
}

checkMinimalSchema();