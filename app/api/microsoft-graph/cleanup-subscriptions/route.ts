import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createSupabaseRouteHandlerClient } from '@/utils/supabase/server'
import { MicrosoftGraphAuth } from '@/lib/microsoft-graph/auth'

import { logger } from '@/lib/utils/logger'

const graphAuth = new MicrosoftGraphAuth()

/**
 * DELETE /api/microsoft-graph/cleanup-subscriptions
 * Deletes Microsoft Graph subscriptions for the authenticated user
 *
 * Query params:
 * - subscriptionId: Delete only this specific subscription (optional)
 * - orphanedOnly: Only delete subscriptions not tracked in trigger_resources (optional)
 *
 * Examples:
 * - DELETE /api/microsoft-graph/cleanup-subscriptions (delete ALL subscriptions)
 * - DELETE /api/microsoft-graph/cleanup-subscriptions?subscriptionId=abc-123 (delete specific)
 * - DELETE /api/microsoft-graph/cleanup-subscriptions?orphanedOnly=true (delete only orphaned)
 */
export async function DELETE(request: NextRequest) {
  try {
    // Get authenticated user
    const supabase = await createSupabaseRouteHandlerClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return errorResponse('Unauthorized' , 401)
    }

    // Parse query params
    const { searchParams } = new URL(request.url)
    const subscriptionId = searchParams.get('subscriptionId')
    const orphanedOnly = searchParams.get('orphanedOnly') === 'true'

    logger.debug('🧹 Starting Microsoft Graph subscription cleanup for user:', {
      userId: user.id,
      subscriptionId,
      orphanedOnly
    })

    // Get access token for Microsoft Graph (try any Microsoft integration)
    let accessToken: string
    try {
      accessToken = await graphAuth.getValidAccessToken(user.id)
    } catch (error) {
      return errorResponse('No Microsoft integration found. Please connect a Microsoft service first.', 400)
    }

    // Get trigger_resources to identify orphaned subscriptions
    const { data: triggerResources } = await supabase
      .from('trigger_resources')
      .select('id, external_id')
      .eq('user_id', user.id)
      .like('provider_id', 'microsoft%')
      .eq('resource_type', 'subscription')

    const trackedIds = new Set(triggerResources?.map(tr => tr.external_id) || [])

    // If deleting specific subscription
    if (subscriptionId) {
      logger.debug(`🗑️ Deleting specific subscription: ${subscriptionId}`)

      const deleteResponse = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${subscriptionId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      })

      if (deleteResponse.ok || deleteResponse.status === 204) {
        logger.debug(`✅ Deleted subscription: ${subscriptionId}`)
        return jsonResponse({
          success: true,
          message: `Deleted subscription ${subscriptionId}`,
          results: [{ id: subscriptionId, status: 'deleted' }]
        })
      } else if (deleteResponse.status === 404) {
        return jsonResponse({
          success: true,
          message: `Subscription ${subscriptionId} not found (may have already expired)`,
          results: [{ id: subscriptionId, status: 'not_found' }]
        })
      } else {
        const errorText = await deleteResponse.text()
        logger.error(`❌ Failed to delete subscription ${subscriptionId}:`, errorText)
        return jsonResponse({
          success: false,
          error: 'Failed to delete subscription',
          details: errorText
        }, { status: deleteResponse.status })
      }
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
      return jsonResponse({
        error: 'Failed to list subscriptions',
        details: errorText
      }, { status: listResponse.status })
    }

    const listData = await listResponse.json()
    let subscriptions = listData.value || []

    // If orphanedOnly, filter to only orphaned subscriptions
    if (orphanedOnly) {
      subscriptions = subscriptions.filter((sub: any) => !trackedIds.has(sub.id))
      logger.debug(`📊 Found ${subscriptions.length} orphaned subscription(s) to delete`)
    } else {
      logger.debug(`📊 Found ${subscriptions.length} subscription(s) to delete`)
    }

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

    // Clean up orphaned trigger_resources records (only if not orphanedOnly mode)
    let triggerResourcesDeleted = 0
    if (!orphanedOnly && triggerResources && triggerResources.length > 0) {
      logger.debug('🧹 Cleaning up orphaned trigger_resources records...')
      const { error: deleteError } = await supabase
        .from('trigger_resources')
        .delete()
        .eq('user_id', user.id)
        .like('provider_id', 'microsoft%')
        .eq('resource_type', 'subscription')

      if (deleteError) {
        logger.error('❌ Failed to clean up trigger_resources:', deleteError)
      } else {
        triggerResourcesDeleted = triggerResources.length
        logger.debug(`✅ Cleaned up ${triggerResourcesDeleted} trigger_resources record(s)`)
      }
    }

    return jsonResponse({
      success: true,
      message: `Cleaned up ${results.length} Microsoft Graph subscription(s)`,
      results,
      triggerResourcesDeleted
    })

  } catch (error: any) {
    logger.error('❌ Error during cleanup:', error)
    return errorResponse('Failed to cleanup subscriptions', 500, { details: error.message
     })
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
      return errorResponse('Unauthorized' , 401)
    }

    // Get access token for Microsoft Graph (try any Microsoft integration)
    let accessToken: string
    try {
      accessToken = await graphAuth.getValidAccessToken(user.id)
    } catch (error) {
      return errorResponse('No Microsoft integration found. Please connect a Microsoft service first.', 400)
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
      return jsonResponse({
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

    return jsonResponse({
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
    return errorResponse('Failed to list subscriptions', 500, { details: error.message
     })
  }
}
