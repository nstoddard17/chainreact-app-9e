/**
 * Debug endpoint to check Stripe account mode and customer data
 * ADMIN ONLY - Shows which Stripe account (test vs live) is connected
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptToken } from '@/lib/integrations/tokenUtils'
import { logger } from '@/lib/utils/logger'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
const supabase = createClient(supabaseUrl, supabaseKey)

export async function GET(req: NextRequest) {
  try {
    // Get user from auth header
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.substring(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get Stripe integration
    const { data: integration, error: integrationError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'stripe')
      .single()

    if (integrationError || !integration) {
      return NextResponse.json({
        error: 'No Stripe integration found',
        hint: 'Please connect your Stripe account first'
      }, { status: 404 })
    }

    // Decrypt access token
    const accessToken = await decryptToken(integration.access_token)
    if (!accessToken) {
      return NextResponse.json({ error: 'Failed to decrypt token' }, { status: 500 })
    }

    // Check account mode by fetching account details
    const accountResponse = await fetch('https://api.stripe.com/v1/account', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    if (!accountResponse.ok) {
      const errorText = await accountResponse.text()
      return NextResponse.json({
        error: 'Failed to fetch Stripe account',
        details: errorText
      }, { status: accountResponse.status })
    }

    const accountData = await accountResponse.json()

    // Fetch first 10 customers to see what's available
    const customersResponse = await fetch('https://api.stripe.com/v1/customers?limit=10', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    })

    let customersData = { data: [], has_more: false }
    if (customersResponse.ok) {
      customersData = await customersResponse.json()
    }

    // Determine if this is a test or live key
    const isTestMode = accessToken.startsWith('sk_test_') || accessToken.startsWith('rk_test_')
    const isLiveMode = accessToken.startsWith('sk_live_') || accessToken.startsWith('rk_live_')

    return NextResponse.json({
      success: true,
      account: {
        id: accountData.id,
        business_name: accountData.business_profile?.name,
        email: accountData.email,
        country: accountData.country,
        default_currency: accountData.default_currency
      },
      mode: {
        isTestMode,
        isLiveMode,
        detected: isTestMode ? 'test' : isLiveMode ? 'live' : 'unknown'
      },
      customers: {
        count: customersData.data.length,
        hasMore: customersData.has_more,
        list: customersData.data.map((c: any) => ({
          id: c.id,
          email: c.email,
          name: c.name,
          created: new Date(c.created * 1000).toISOString(),
          livemode: c.livemode
        }))
      },
      integration: {
        id: integration.id,
        status: integration.status,
        created_at: integration.created_at
      },
      hint: isTestMode
        ? 'You are connected to TEST mode. Customers created in live Stripe dashboard will not appear here.'
        : isLiveMode
        ? 'You are connected to LIVE mode. Test customers will not appear here.'
        : 'Unable to determine account mode'
    })

  } catch (error: any) {
    logger.error('[Debug Stripe Account] Error:', error)
    return NextResponse.json({
      error: error.message || 'Internal server error',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}
