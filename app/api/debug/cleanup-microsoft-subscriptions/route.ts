/**
 * Debug endpoint to clean up orphaned Microsoft Graph subscriptions
 *
 * This endpoint:
 * 1. Lists all active subscriptions in Microsoft Graph
 * 2. Compares with subscriptions in trigger_resources
 * 3. Deletes orphaned subscriptions (in Microsoft Graph but not in our DB)
 */

import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { safeDecrypt } from '@/lib/security/encryption'

import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const cleanup = searchParams.get('cleanup') === 'true'

    if (!userId) {
      return errorResponse('userId query parameter required' , 400)
    }

    // Get user's Microsoft integration
    const { data: integrations } = await supabase
      .from('integrations')
      .select('access_token, provider')
      .eq('user_id', userId)
      .or('provider.like.microsoft%,provider.eq.onedrive')

    const integration = integrations?.find(i => i.access_token)

    if (!integration) {
      return errorResponse('No Microsoft integration found for user' , 404)
    }

    const accessToken = typeof integration.access_token === 'string'
      ? safeDecrypt(integration.access_token)
      : null

    if (!accessToken) {
      return errorResponse('Failed to decrypt access token' , 500)
    }

    // Get all subscriptions from Microsoft Graph
    const graphResponse = await fetch('https://graph.microsoft.com/v1.0/subscriptions', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })

    if (!graphResponse.ok) {
      const errorText = await graphResponse.text()
      return jsonResponse({
        error: 'Failed to fetch subscriptions from Microsoft Graph',
        details: errorText
      }, { status: graphResponse.status })
    }

    const graphData = await graphjsonResponse()
    const graphSubscriptions = graphData.value || []

    // Get all subscriptions from our database
    const { data: dbResources } = await supabase
      .from('trigger_resources')
      .select('external_id, workflow_id, status')
      .eq('user_id', userId)
      .eq('resource_type', 'subscription')
      .like('provider_id', 'microsoft%')

    const dbSubscriptionIds = new Set((dbResources || []).map(r => r.external_id))

    // Find orphaned subscriptions (in Microsoft Graph but not in our DB)
    const orphanedSubscriptions = graphSubscriptions.filter(
      (sub: any) => !dbSubscriptionIds.has(sub.id)
    )

    const result: any = {
      totalInMicrosoftGraph: graphSubscriptions.length,
      totalInDatabase: dbResources?.length || 0,
      orphanedSubscriptions: orphanedSubscriptions.map((sub: any) => ({
        id: sub.id,
        resource: sub.resource,
        changeType: sub.changeType,
        expirationDateTime: sub.expirationDateTime
      })),
      orphanedCount: orphanedSubscriptions.length,
      dbSubscriptions: dbResources || []
    }

    // If cleanup requested, delete orphaned subscriptions
    if (cleanup && orphanedSubscriptions.length > 0) {
      const deletedSubscriptions = []
      const failedDeletions = []

      for (const sub of orphanedSubscriptions) {
        try {
          const deleteResponse = await fetch(`https://graph.microsoft.com/v1.0/subscriptions/${sub.id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${accessToken}`
            }
          })

          if (deleteResponse.ok || deleteResponse.status === 404) {
            deletedSubscriptions.push(sub.id)
          } else {
            const errorText = await deleteResponse.text()
            failedDeletions.push({ id: sub.id, error: errorText })
          }
        } catch (error) {
          failedDeletions.push({ id: sub.id, error: String(error) })
        }
      }

      result.cleanupPerformed = true
      result.deletedSubscriptions = deletedSubscriptions
      result.failedDeletions = failedDeletions
    }

    return jsonResponse(result)

  } catch (error: any) {
    logger.error('Error in cleanup endpoint:', error)
    return errorResponse('Internal server error', 500, { details: error.message
     })
  }
}
