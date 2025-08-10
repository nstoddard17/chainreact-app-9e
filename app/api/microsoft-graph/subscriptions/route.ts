import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const subscriptionManager = new MicrosoftGraphSubscriptionManager()

// Get all subscriptions for the authenticated user
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const userId = url.searchParams.get('userId')
    
    if (!userId) {
      return NextResponse.json({ error: 'Missing userId parameter' }, { status: 400 })
    }
    
    const subscriptions = await subscriptionManager.getUserSubscriptions(userId)
    
    // Format subscriptions for the frontend
    const formattedSubscriptions = subscriptions.map(sub => ({
      id: sub.id,
      resource: sub.resource,
      changeType: sub.changeType,
      expirationDateTime: sub.expirationDateTime,
      status: sub.status,
      createdAt: sub.createdAt
    }))
    
    return NextResponse.json({
      subscriptions: formattedSubscriptions,
      count: formattedSubscriptions.length
    })
  } catch (error: any) {
    console.error('Error fetching subscriptions:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch subscriptions' }, { status: 500 })
  }
}

// Create a new subscription
export async function POST(req: NextRequest) {
  try {
    const { userId, resource, changeType } = await req.json()
    
    if (!userId || !resource || !changeType) {
      return NextResponse.json({ 
        error: 'Missing required parameters: userId, resource, changeType' 
      }, { status: 400 })
    }
    
    // Get user's Microsoft access token
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'microsoft')
      .single()
      
    if (!integration) {
      return NextResponse.json({ error: 'Microsoft integration not found' }, { status: 404 })
    }
    
    // Create the subscription
    const subscription = await subscriptionManager.createSubscription({
      resource,
      changeType,
      userId,
      accessToken: integration.access_token
    })
    
    return NextResponse.json({
      success: true,
      subscription: {
        id: subscription.id,
        resource: subscription.resource,
        changeType: subscription.changeType,
        expirationDateTime: subscription.expirationDateTime,
        status: subscription.status,
        createdAt: subscription.createdAt
      }
    })
  } catch (error: any) {
    console.error('Error creating subscription:', error)
    return NextResponse.json({ error: error.message || 'Failed to create subscription' }, { status: 500 })
  }
}

// Delete a subscription by ID
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/')
    const subscriptionId = pathParts[pathParts.length - 1]
    
    if (!subscriptionId || subscriptionId === 'subscriptions') {
      return NextResponse.json({ error: 'Missing subscription ID' }, { status: 400 })
    }
    
    // Get subscription details to find user and access token
    const { data: subscription } = await supabase
      .from('microsoft_graph_subscriptions')
      .select('user_id')
      .eq('id', subscriptionId)
      .single()
      
    if (!subscription) {
      return NextResponse.json({ error: 'Subscription not found' }, { status: 404 })
    }
    
    // Get user's Microsoft access token
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', subscription.user_id)
      .eq('provider', 'microsoft')
      .single()
      
    if (!integration) {
      return NextResponse.json({ error: 'Microsoft integration not found' }, { status: 404 })
    }
    
    // Delete the subscription
    await subscriptionManager.deleteSubscription(subscriptionId, integration.access_token)
    
    return NextResponse.json({
      success: true,
      message: 'Subscription deleted successfully'
    })
  } catch (error: any) {
    console.error('Error deleting subscription:', error)
    return NextResponse.json({ error: error.message || 'Failed to delete subscription' }, { status: 500 })
  }
}