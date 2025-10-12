import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { MicrosoftGraphAuth } from '@/lib/microsoft-graph/auth'

import { logger } from '@/lib/utils/logger'

const graphAuth = new MicrosoftGraphAuth()

/**
 * DELETE /api/microsoft-graph/cleanup-subscriptions
 * Deletes ALL Microsoft Graph subscriptions for the authenticated user
 * This is useful for cleaning up orphaned subscriptions
 */
export async function DELETE(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.debug('🧹 Starting cleanup of all Microsoft Graph subscriptions for user:', user.id)

    // Get access token for Microsoft Graph
    let accessToken: string
    try {
      accessToken = await graphAuth.getValidAccessToken(user.id, 'microsoft-outlook')
    } catch (error) {
      return NextResponse.json({
        error: 'No Microsoft Outlook integration found. Please connect Microsoft Outlook first.'
      }, { status: 400 })
    }

    // List all subscriptions
    logger.debug('📋 Fetching all Microsoft Graph subscriptions...')
    const listResponse = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!listResponse.ok) {
      const errorText = await listResponse.text()
      logger.error('❌ Failed to list subscriptions:', errorText)
      return NextResponse.json({
        error: 'Failed to list subscriptions',
        details: errorText
      }, { status: listResponse.status })
    }

    const listData = await listResponse.json()
    const subscriptions = listData.value || []

    logger.debug(`📊 Found ${subscriptions.length} subscription(s)`)

    // Delete each subscription
    const results = []
    for (const subscription of subscriptions) {
      try {
        logger.debug(`🗑️ Deleting subscription: ${subscription.id}`)

        const deleteResponse = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${subscription.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        })

        if (deleteResponse.ok || deleteResponse.status === 404) {
          logger.debug(`✅ Deleted subscription: ${subscription.id}`)
          results.push({
            id: subscription.id,
            status: 'deleted',
            resource: subscription.resource
          })
        } else {
          const errorText = await deleteResponse.text()
          logger.error(`❌ Failed to delete subscription ${subscription.id}:`, errorText)
          results.push({
            id: subscription.id,
            status: 'failed',
            error: errorText
          })
        }
      } catch (error: any) {
        logger.error(`❌ Error deleting subscription ${subscription.id}:`, error)
        results.push({
          id: subscription.id,
          status: 'error',
          error: error.message
        })
      }
    }

    // Also clean up orphaned records in trigger_resources
    logger.debug('🧹 Cleaning up orphaned trigger_resources records...')
    const { data: triggerResources } = await supabase
      .from('trigger_resources')
      .select('id, external_id')
      .eq('user_id', user.id)
      .like('provider_id', 'microsoft%')
      .eq('resource_type', 'subscription')

    if (triggerResources && triggerResources.length > 0) {
      const { error: deleteError } = await supabase
        .from('trigger_resources')
        .delete()
        .eq('user_id', user.id)
        .like('provider_id', 'microsoft%')
        .eq('resource_type', 'subscription')

      if (deleteError) {
        logger.error('❌ Failed to clean up trigger_resources:', deleteError)
      } else {
        logger.debug(`✅ Cleaned up ${triggerResources.length} trigger_resources record(s)`)
      }
    }

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${results.length} Microsoft Graph subscription(s)`,
      results,
      triggerResourcesDeleted: triggerResources?.length || 0
    })

  } catch (error: any) {
    logger.error('❌ Error during cleanup:', error)
    return NextResponse.json({
      error: 'Failed to cleanup subscriptions',
      details: error.message
    }, { status: 500 })
  }
}

/**
 * GET /api/microsoft-graph/cleanup-subscriptions
 * Lists ALL Microsoft Graph subscriptions for the authenticated user
 */
export async function GET(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get access token for Microsoft Graph
    let accessToken: string
    try {
      accessToken = await graphAuth.getValidAccessToken(user.id, 'microsoft-outlook')
    } catch (error) {
      return NextResponse.json({
        error: 'No Microsoft Outlook integration found. Please connect Microsoft Outlook first.'
      }, { status: 400 })
    }

    // List all subscriptions
    const listResponse = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    })

    if (!listResponse.ok) {
      const errorText = await listResponse.text()
      return NextResponse.json({
        error: 'Failed to list subscriptions',
        details: errorText
      }, { status: listResponse.status })
    }

    const data = await listResponse.json()
    const subscriptions = data.value || []

    // Also get trigger_resources
    const { data: triggerResources } = await supabase
      .from('trigger_resources')
      .select('*')
      .eq('user_id', user.id)
      .like('provider_id', 'microsoft%')
      .eq('resource_type', 'subscription')

    return NextResponse.json({
      success: true,
      microsoftGraphSubscriptions: subscriptions,
      triggerResources: triggerResources || [],
      summary: {
        totalInMicrosoft: subscriptions.length,
        totalInDatabase: triggerResources?.length || 0,
        orphaned: subscriptions.filter(sub =>
          !triggerResources?.some(tr => tr.external_id === sub.id)
        ).map(sub => sub.id)
      }
    })

  } catch (error: any) {
    logger.error('❌ Error listing subscriptions:', error)
    return NextResponse.json({
      error: 'Failed to list subscriptions',
      details: error.message
    }, { status: 500 })
  }
}
