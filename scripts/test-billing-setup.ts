import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

// Load environment variables
dotenv.config({ path: resolve(process.cwd(), '.env.local') })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testBillingSetup() {
  console.log('🔍 Testing billing setup...\n')
  
  try {
    // Check plans in database
    const { data: plans, error: plansError } = await supabase
      .from('plans')
      .select('*')
      .order('price_monthly', { ascending: true })
    
    if (plansError) {
      console.error('❌ Error fetching plans:', plansError)
      return
    }
    
    console.log('📋 Plans in database:')
    console.log('=' .repeat(80))
    
    for (const plan of plans || []) {
      console.log(`\n🎯 ${plan.name} Plan (ID: ${plan.id})`)
      console.log(`   Monthly: $${plan.price_monthly || 0}`)
      console.log(`   Yearly: $${plan.price_yearly || 0}`)
      console.log(`   Stripe Monthly ID: ${plan.stripe_price_id_monthly || 'NOT SET'}`)
      console.log(`   Stripe Yearly ID: ${plan.stripe_price_id_yearly || 'NOT SET'}`)
      
      // Check if Stripe IDs are properly configured
      const hasValidMonthlyId = plan.stripe_price_id_monthly && 
        plan.stripe_price_id_monthly.startsWith('price_') &&
        !plan.stripe_price_id_monthly.includes('XXXXX')
      
      const hasValidYearlyId = plan.stripe_price_id_yearly && 
        plan.stripe_price_id_yearly.startsWith('price_') &&
        !plan.stripe_price_id_yearly.includes('YYYYY')
      
      if (plan.name === 'Free') {
        console.log(`   ✅ Free plan doesn't need Stripe IDs`)
      } else if (hasValidMonthlyId && hasValidYearlyId) {
        console.log(`   ✅ Stripe IDs are properly configured`)
      } else {
        console.log(`   ⚠️  Stripe IDs need configuration`)
      }
    }
    
    console.log('\n' + '=' .repeat(80))
    console.log('\n✅ Billing Setup Check Complete!\n')
    
    // Check if Pro plan is ready
    const proPlan = plans?.find(p => p.name === 'Pro')
    if (proPlan?.stripe_price_id_monthly?.startsWith('price_') && 
        proPlan?.stripe_price_id_yearly?.startsWith('price_')) {
      console.log('🎉 Your "Upgrade to Pro" button should now work!')
      console.log('\n📌 Next steps:')
      console.log('1. Go to your billing settings page')
      console.log('2. Toggle between Monthly and Annual billing')
      console.log('3. Click "Upgrade to Pro"')
      console.log('4. You should be redirected to Stripe checkout')
      console.log('5. Use test card: 4242 4242 4242 4242')
    } else {
      console.log('⚠️  Pro plan needs Stripe configuration')
      console.log('Run: npm run setup-stripe')
    }
    
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

// Run the test
testBillingSetup()