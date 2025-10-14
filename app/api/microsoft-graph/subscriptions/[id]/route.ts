import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'

import { logger } from '@/lib/utils/logger'

const subscriptionManager = new MicrosoftGraphSubscriptionManager()

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get authenticated user
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    const body = await request.json()
    const { accessToken } = body

    if (!accessToken) {
      return errorResponse('Missing required field: accessToken' 
      , 400)
    }

    logger.debug('🔄 Renewing Microsoft Graph subscription:', id)

    // Renew the subscription
    const subscription = await subscriptionManager.renewSubscription(id, accessToken)

    return jsonResponse({
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
    logger.error('❌ Error renewing subscription:', error)
    
    // Handle specific Microsoft Graph errors
    if (error.message.includes('401')) {
      return errorResponse('Invalid or expired access token. Please re-authenticate with Microsoft.' 
      , 401)
    }
    
    if (error.message.includes('404')) {
      return errorResponse('Subscription not found or already expired.' 
      , 404)
    }

    return errorResponse('Failed to renew subscription', 500, { details: error.message 
     })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get authenticated user
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    const body = await request.json()
    const { accessToken } = body

    if (!accessToken) {
      return errorResponse('Missing required field: accessToken' 
      , 400)
    }

    logger.debug('🗑️ Deleting Microsoft Graph subscription:', id)

    // Delete the subscription
    await subscriptionManager.deleteSubscription(id, accessToken)

    return jsonResponse({
      success: true,
      message: 'Subscription deleted successfully'
    })

  } catch (error: any) {
    logger.error('❌ Error deleting subscription:', error)
    
    // Handle specific Microsoft Graph errors
    if (error.message.includes('401')) {
      return errorResponse('Invalid or expired access token. Please re-authenticate with Microsoft.' 
      , 401)
    }
    
    if (error.message.includes('404')) {
      return errorResponse('Subscription not found or already deleted.' 
      , 404)
    }

    return errorResponse('Failed to delete subscription', 500, { details: error.message 
     })
  }
}
