import { createClient } from '@supabase/supabase-js'
import Stripe from 'stripe'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-12-18.acacia' as any,
})

async function setupStripePrices() {
  try {
    console.log('🚀 Setting up Stripe prices for ChainReact...')
    
    // First, get the Pro plan from the database to get its actual ID
    const { data: proPlan, error: planFetchError } = await supabase
      .from('plans')
      .select('*')
      .eq('name', 'Pro')
      .single()
    
    if (planFetchError || !proPlan) {
      console.error('❌ Could not find Pro plan in database:', planFetchError)
      throw new Error('Pro plan not found in database')
    }
    
    console.log('Found Pro plan with ID:', proPlan.id)
    
    // Check if products already exist
    const existingProducts = await stripe.products.list({ limit: 100 })
    let proProduct = existingProducts.data.find(p => 
      p.name === 'ChainReact Pro' || p.metadata?.plan_id === proPlan.id
    )
    
    if (!proProduct) {
      console.log('Creating ChainReact Pro product...')
      proProduct = await stripe.products.create({
        name: 'ChainReact Pro',
        description: 'Advanced workflow automation with unlimited integrations',
        metadata: {
          plan_id: proPlan.id
        }
      })
      console.log('✅ Created product:', proProduct.id)
    } else {
      console.log('✅ Found existing product:', proProduct.id)
    }
    
    // Check for existing prices
    const existingPrices = await stripe.prices.list({ 
      product: proProduct.id,
      limit: 100 
    })
    
    let monthlyPrice = existingPrices.data.find(p => 
      p.recurring?.interval === 'month' && p.unit_amount === 1999
    )
    
    let yearlyPrice = existingPrices.data.find(p => 
      p.recurring?.interval === 'year' && p.unit_amount === 17999
    )
    
    // Create monthly price if it doesn't exist
    if (!monthlyPrice) {
      console.log('Creating monthly price ($19.99/month)...')
      monthlyPrice = await stripe.prices.create({
        product: proProduct.id,
        unit_amount: 1999, // $19.99 in cents
        currency: 'usd',
        recurring: {
          interval: 'month'
        },
        metadata: {
          billing_cycle: 'monthly'
        }
      })
      console.log('✅ Created monthly price:', monthlyPrice.id)
    } else {
      console.log('✅ Found existing monthly price:', monthlyPrice.id)
    }
    
    // Create yearly price if it doesn't exist
    if (!yearlyPrice) {
      console.log('Creating yearly price ($179.99/year)...')
      yearlyPrice = await stripe.prices.create({
        product: proProduct.id,
        unit_amount: 17999, // $179.99 in cents ($15/month when billed annually)
        currency: 'usd',
        recurring: {
          interval: 'year'
        },
        metadata: {
          billing_cycle: 'yearly'
        }
      })
      console.log('✅ Created yearly price:', yearlyPrice.id)
    } else {
      console.log('✅ Found existing yearly price:', yearlyPrice.id)
    }
    
    // Update the database with the actual Stripe price IDs
    console.log('\n📝 Updating database with Stripe price IDs...')
    console.log('   Plan ID:', proPlan.id)
    console.log('   Monthly Price ID:', monthlyPrice.id)
    console.log('   Yearly Price ID:', yearlyPrice.id)
    
    const { error: updateError } = await supabase
      .from('plans')
      .update({
        stripe_price_id_monthly: monthlyPrice.id,
        stripe_price_id_yearly: yearlyPrice.id
      })
      .eq('id', proPlan.id)
    
    if (updateError) {
      console.error('❌ Error updating database:', updateError)
      throw updateError
    }
    
    console.log('✅ Database updated successfully!')
    
    // Verify the update
    const { data: updatedPlan, error: fetchError } = await supabase
      .from('plans')
      .select('*')
      .eq('id', proPlan.id)
      .single()
    
    if (fetchError) {
      console.error('❌ Error fetching updated plan:', fetchError)
    } else {
      console.log('\n✅ Plan updated successfully:')
      console.log('   Name:', updatedPlan.name)
      console.log('   Monthly Price ID:', updatedPlan.stripe_price_id_monthly)
      console.log('   Yearly Price ID:', updatedPlan.stripe_price_id_yearly)
    }
    
    console.log('\n🎉 Stripe setup complete! Your upgrade button should now work.')
    console.log('\n📌 Next steps:')
    console.log('1. Test the upgrade flow by clicking "Upgrade to Pro" on the billing page')
    console.log('2. Use test card: 4242 4242 4242 4242 (any future expiry, any CVC)')
    console.log('3. Check Stripe Dashboard for the test payment')
    
  } catch (error) {
    console.error('❌ Error setting up Stripe prices:', error)
    process.exit(1)
  }
}

// Run the setup
setupStripePrices()