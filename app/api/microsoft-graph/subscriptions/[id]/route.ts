import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { MicrosoftGraphSubscriptionManager } from '@/lib/microsoft-graph/subscriptionManager'

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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { accessToken } = body

    if (!accessToken) {
      return NextResponse.json({ 
        error: 'Missing required field: accessToken' 
      }, { status: 400 })
    }

    console.log('🔄 Renewing Microsoft Graph subscription:', id)

    // Renew the subscription
    const subscription = await subscriptionManager.renewSubscription(id, accessToken)

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
    console.error('❌ Error renewing subscription:', error)
    
    // Handle specific Microsoft Graph errors
    if (error.message.includes('401')) {
      return NextResponse.json({ 
        error: 'Invalid or expired access token. Please re-authenticate with Microsoft.' 
      }, { status: 401 })
    }
    
    if (error.message.includes('404')) {
      return NextResponse.json({ 
        error: 'Subscription not found or already expired.' 
      }, { status: 404 })
    }

    return NextResponse.json({ 
      error: 'Failed to renew subscription',
      details: error.message 
    }, { status: 500 })
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { accessToken } = body

    if (!accessToken) {
      return NextResponse.json({ 
        error: 'Missing required field: accessToken' 
      }, { status: 400 })
    }

    console.log('🗑️ Deleting Microsoft Graph subscription:', id)

    // Delete the subscription
    await subscriptionManager.deleteSubscription(id, accessToken)

    return NextResponse.json({
      success: true,
      message: 'Subscription deleted successfully'
    })

  } catch (error: any) {
    console.error('❌ Error deleting subscription:', error)
    
    // Handle specific Microsoft Graph errors
    if (error.message.includes('401')) {
      return NextResponse.json({ 
        error: 'Invalid or expired access token. Please re-authenticate with Microsoft.' 
      }, { status: 401 })
    }
    
    if (error.message.includes('404')) {
      return NextResponse.json({ 
        error: 'Subscription not found or already deleted.' 
      }, { status: 404 })
    }

    return NextResponse.json({ 
      error: 'Failed to delete subscription',
      details: error.message 
    }, { status: 500 })
  }
}
