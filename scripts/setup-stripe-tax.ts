import Stripe from 'stripe'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

if (!process.env.STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY not found in environment variables')
  process.exit(1)
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia' as any,
})

async function setupStripeTax() {
  try {
    console.log('🚀 Setting up Stripe Tax for ChainReact...\n')
    
    // Step 1: Check if tax is already configured
    console.log('📋 Checking current tax configuration...')
    try {
      const taxSettings = await stripe.tax.settings.retrieve()
      console.log('Current tax status:', taxSettings.status)
      console.log('Default tax behavior:', taxSettings.defaults?.tax_behavior || 'not set')
      
      if (taxSettings.status === 'active') {
        console.log('✅ Stripe Tax is already active!')
      } else {
        console.log('⚠️  Stripe Tax is not active. Please activate it in your Stripe Dashboard.')
      }
    } catch (error: any) {
      if (error.code === 'tax_settings_not_found') {
        console.log('⚠️  Tax settings not found. Setting up now...')
      } else {
        throw error
      }
    }
    
    // Step 2: Update tax settings
    console.log('\n📝 Updating tax settings...')
    try {
      const updatedSettings = await stripe.tax.settings.update({
        defaults: {
          tax_behavior: 'exclusive', // Tax will be added on top of the price
        },
      })
      console.log('✅ Tax settings updated successfully')
      console.log('   Tax behavior:', updatedSettings.defaults?.tax_behavior)
    } catch (error: any) {
      if (error.raw?.message?.includes('not enabled')) {
        console.log('⚠️  Stripe Tax is not enabled on your account.')
        console.log('\n📌 To enable Stripe Tax:')
        console.log('1. Go to https://dashboard.stripe.com/settings/tax')
        console.log('2. Click "Get started" or "Activate"')
        console.log('3. Complete the tax registration process')
        console.log('4. Run this script again after activation')
      } else {
        console.error('Error updating tax settings:', error.message)
      }
    }
    
    // Step 3: Verify product tax codes
    console.log('\n🏷️  Checking product tax codes...')
    const products = await stripe.products.list({ limit: 10 })
    
    for (const product of products.data) {
      if (product.name?.includes('ChainReact')) {
        console.log(`\nProduct: ${product.name}`)
        console.log(`  ID: ${product.id}`)
        console.log(`  Tax code: ${product.tax_code || 'Not set (will use default: txcd_10000000 - General Software)'}`)
        
        // Update product with tax code if not set
        if (!product.tax_code) {
          try {
            await stripe.products.update(product.id, {
              tax_code: 'txcd_10103000', // Software as a Service (SaaS) - recommended for subscriptions
            })
            console.log('  ✅ Updated with SaaS tax code')
          } catch (error) {
            console.log('  ⚠️  Could not update tax code:', error.message)
          }
        }
      }
    }
    
    console.log('\n' + '='.repeat(60))
    console.log('\n✅ Stripe Tax configuration complete!\n')
    console.log('📌 Important notes:')
    console.log('1. Tax will be automatically calculated based on customer location')
    console.log('2. Customers will see tax added during checkout')
    console.log('3. Tax rates are managed by Stripe based on local regulations')
    console.log('4. You can view tax reports in your Stripe Dashboard')
    
    console.log('\n⚠️  Required Stripe Dashboard Setup:')
    console.log('1. Enable Stripe Tax: https://dashboard.stripe.com/settings/tax')
    console.log('2. Add tax registrations for regions where you have nexus')
    console.log('3. Configure your origin address for accurate calculations')
    
    console.log('\n🧪 Testing:')
    console.log('1. Go to your billing page')
    console.log('2. Click "Upgrade to Pro"')
    console.log('3. Enter an address during checkout')
    console.log('4. Tax will be calculated and shown based on the address')
    console.log('\nCommon tax rates:')
    console.log('  • California, USA: ~8-10% sales tax')
    console.log('  • New York, USA: ~8% sales tax')
    console.log('  • UK: 20% VAT')
    console.log('  • Germany: 19% VAT')
    console.log('  • Canada: 5-15% GST/PST/HST')
    
  } catch (error: any) {
    console.error('\n❌ Error setting up Stripe Tax:', error.message)
    if (error.raw) {
      console.error('Raw error:', error.raw)
    }
    process.exit(1)
  }
}

// Run the setup
setupStripeTax()