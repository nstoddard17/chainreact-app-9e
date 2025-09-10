/**
 * Script to update Stripe price IDs in the database
 * 
 * INSTRUCTIONS:
 * 1. First, create your products and prices in Stripe Dashboard:
 *    - Go to https://dashboard.stripe.com/products
 *    - Create a "ChainReact Pro" product
 *    - Add two prices:
 *      - Monthly: $19.99/month
 *      - Annual: $179.99/year (or $15/month billed annually)
 * 
 * 2. Copy the price IDs (they start with "price_") and replace the placeholders below
 * 
 * 3. Run this script: npx ts-node scripts/update-stripe-prices.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// Load environment variables
dotenv.config({ path: '.env.local' })

// REPLACE THESE WITH YOUR ACTUAL STRIPE PRICE IDs
// You can find these in your Stripe Dashboard under Products
const STRIPE_PRICE_IDS = {
  // Pro plan - Monthly price ID (starts with price_)
  PRO_MONTHLY: 'price_REPLACE_WITH_YOUR_MONTHLY_PRICE_ID',
  
  // Pro plan - Annual price ID (starts with price_)
  PRO_ANNUAL: 'price_REPLACE_WITH_YOUR_ANNUAL_PRICE_ID',
}

async function updateStripePrices() {
  // Check if price IDs have been updated
  if (STRIPE_PRICE_IDS.PRO_MONTHLY.includes('REPLACE') || STRIPE_PRICE_IDS.PRO_ANNUAL.includes('REPLACE')) {
    console.error('❌ Error: Please update the STRIPE_PRICE_IDS with your actual Stripe price IDs')
    console.log('\nInstructions:')
    console.log('1. Go to https://dashboard.stripe.com/products')
    console.log('2. Create or find your "ChainReact Pro" product')
    console.log('3. Copy the price IDs for monthly and annual billing')
    console.log('4. Replace the placeholders in this script')
    console.log('5. Run the script again')
    process.exit(1)
  }

  // Initialize Supabase client
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  console.log('🔄 Updating Stripe price IDs in database...')

  try {
    // Update the Pro plan with real Stripe price IDs
    const { data, error } = await supabase
      .from('plans')
      .update({
        stripe_price_id_monthly: STRIPE_PRICE_IDS.PRO_MONTHLY,
        stripe_price_id_yearly: STRIPE_PRICE_IDS.PRO_ANNUAL,
      })
      .eq('name', 'Pro')

    if (error) {
      console.error('❌ Error updating database:', error)
      process.exit(1)
    }

    console.log('✅ Successfully updated Pro plan with Stripe price IDs!')
    console.log('\nUpdated prices:')
    console.log(`  Monthly: ${STRIPE_PRICE_IDS.PRO_MONTHLY}`)
    console.log(`  Annual: ${STRIPE_PRICE_IDS.PRO_ANNUAL}`)
    
    // Verify the update
    const { data: verifyData, error: verifyError } = await supabase
      .from('plans')
      .select('name, stripe_price_id_monthly, stripe_price_id_yearly')
      .eq('name', 'Pro')
      .single()

    if (verifyData) {
      console.log('\n✅ Verification successful! Pro plan now has:')
      console.log(`  Monthly Price ID: ${verifyData.stripe_price_id_monthly}`)
      console.log(`  Annual Price ID: ${verifyData.stripe_price_id_yearly}`)
    }

    console.log('\n🎉 You can now test the billing flow!')
    console.log('Navigate to Settings → Billing and try upgrading to Pro')
    
  } catch (error) {
    console.error('❌ Unexpected error:', error)
    process.exit(1)
  }
}

// Run the script
updateStripePrices()