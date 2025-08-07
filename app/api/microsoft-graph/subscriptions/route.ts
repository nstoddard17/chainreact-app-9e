import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { MicrosoftGraphSubscriptionManager, CreateSubscriptionRequest } from '@/lib/microsoft-graph/subscriptionManager'

const subscriptionManager = new MicrosoftGraphSubscriptionManager()

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { resource, changeType, accessToken, expirationMinutes } = body

    // Validate required fields
    if (!resource || !changeType || !accessToken) {
      return NextResponse.json({ 
        error: 'Missing required fields: resource, changeType, accessToken' 
      }, { status: 400 })
    }

    // Create subscription request
    const subscriptionRequest: CreateSubscriptionRequest = {
      resource,
      changeType,
      userId: user.id,
      accessToken,
      expirationMinutes
    }

    console.log('📤 Creating Microsoft Graph subscription for user:', user.id)

    // Create the subscription
    const subscription = await subscriptionManager.createSubscription(subscriptionRequest)

    return NextResponse.json({
      success: true,
      subscription: {
        id: subscription.id,
        resource: subscription.resource,
        changeType: subscription.changeType,
        expirationDateTime: subscription.expirationDateTime,
        status: subscription.status
      }
    })

  } catch (error: any) {
    console.error('❌ Error creating subscription:', error)
    
    // Handle specific Microsoft Graph errors
    if (error.message.includes('401')) {
      return NextResponse.json({ 
        error: 'Invalid or expired access token. Please re-authenticate with Microsoft.' 
      }, { status: 401 })
    }
    
    if (error.message.includes('403')) {
      return NextResponse.json({ 
        error: 'Insufficient permissions. Please ensure your Microsoft account has the required permissions.' 
      }, { status: 403 })
    }

    return NextResponse.json({ 
      error: 'Failed to create subscription',
      details: error.message 
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = createRouteHandlerClient({ cookies })
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('📋 Fetching Microsoft Graph subscriptions for user:', user.id)

    // Get user's subscriptions
    const subscriptions = await subscriptionManager.getUserSubscriptions(user.id)

    return NextResponse.json({
      success: true,
      subscriptions: subscriptions.map(sub => ({
        id: sub.id,
        resource: sub.resource,
        changeType: sub.changeType,
        expirationDateTime: sub.expirationDateTime,
        status: sub.status,
        createdAt: sub.createdAt
      }))
    })

  } catch (error: any) {
    console.error('❌ Error fetching subscriptions:', error)
    return NextResponse.json({ 
      error: 'Failed to fetch subscriptions',
      details: error.message 
    }, { status: 500 })
  }
}
