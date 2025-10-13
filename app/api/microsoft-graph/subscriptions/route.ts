import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'

import { logger } from '@/lib/utils/logger'

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
      return errorResponse('Missing userId parameter' , 400)
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
    
    return jsonResponse({
      subscriptions: formattedSubscriptions,
      count: formattedSubscriptions.length
    })
  } catch (error: any) {
    logger.error('Error fetching subscriptions:', error)
    return errorResponse(error.message || 'Failed to fetch subscriptions' , 500)
  }
}

// Create a new subscription
export async function POST(req: NextRequest) {
  try {
    const { userId, resource, changeType } = await req.json()
    
    if (!userId || !resource || !changeType) {
      return errorResponse('Missing required parameters: userId, resource, changeType' 
      , 400)
    }
    
    // Get user's Microsoft access token
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', userId)
      .eq('provider', 'microsoft')
      .single()
      
    if (!integration) {
      return errorResponse('Microsoft integration not found' , 404)
    }
    
    // Create the subscription
    const subscription = await subscriptionManager.createSubscription({
      resource,
      changeType,
      userId,
      accessToken: integration.access_token
    })
    
    return jsonResponse({
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
    logger.error('Error creating subscription:', error)
    return errorResponse(error.message || 'Failed to create subscription' , 500)
  }
}

// Delete a subscription by ID
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const pathParts = url.pathname.split('/')
    const subscriptionId = pathParts[pathParts.length - 1]
    
    if (!subscriptionId || subscriptionId === 'subscriptions') {
      return errorResponse('Missing subscription ID' , 400)
    }
    
    // Get subscription details to find user and access token
    const { data: subscription } = await supabase
      .from('microsoft_graph_subscriptions')
      .select('user_id')
      .eq('id', subscriptionId)
      .single()
      
    if (!subscription) {
      return errorResponse('Subscription not found' , 404)
    }
    
    // Get user's Microsoft access token
    const { data: integration } = await supabase
      .from('integrations')
      .select('access_token')
      .eq('user_id', subscription.user_id)
      .eq('provider', 'microsoft')
      .single()
      
    if (!integration) {
      return errorResponse('Microsoft integration not found' , 404)
    }
    
    // Delete the subscription
    await subscriptionManager.deleteSubscription(subscriptionId, integration.access_token)
    
    return jsonResponse({
      success: true,
      message: 'Subscription deleted successfully'
    })
  } catch (error: any) {
    logger.error('Error deleting subscription:', error)
    return errorResponse(error.message || 'Failed to delete subscription' , 500)
  }
}