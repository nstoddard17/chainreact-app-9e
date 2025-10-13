import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphClient } from '@/lib/microsoft-graph/client'
import { safeDecrypt } from '@/lib/security/encryption'

import { logger } from '@/lib/utils/logger'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    logger.debug('\n🧹 CLEANING UP DUPLICATE ONEDRIVE SUBSCRIPTIONS')

    // Get all active subscriptions
    const { data: subscriptions } = await supabase
      .from('microsoft_graph_subscriptions')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (!subscriptions || subscriptions.length === 0) {
      return jsonResponse({ message: 'No subscriptions found' })
    }

    logger.debug(`Found ${subscriptions.length} active subscriptions`)

    // Group by user_id to find duplicates
    const userSubscriptions = new Map<string, typeof subscriptions>()
    for (const sub of subscriptions) {
      const userId = sub.user_id
      if (!userSubscriptions.has(userId)) {
        userSubscriptions.set(userId, [])
      }
      userSubscriptions.get(userId)!.push(sub)
    }

    let deletedCount = 0
    const errors: string[] = []

    // For each user, keep only the newest subscription
    for (const [userId, subs] of userSubscriptions.entries()) {
      if (subs.length > 1) {
        logger.debug(`User ${userId.substring(0, 8)}... has ${subs.length} subscriptions`)

        // Keep the first one (newest), delete the rest
        const toKeep = subs[0]
        const toDelete = subs.slice(1)

        logger.debug(`  Keeping subscription: ${toKeep.id.substring(0, 8)}... (created: ${toKeep.created_at})`)

        // Get user's OneDrive token to delete from Microsoft
        const { data: integration } = await supabase
          .from('integrations')
          .select('access_token')
          .eq('user_id', userId)
          .eq('provider', 'onedrive')
          .eq('status', 'connected')
          .single()

        let accessToken: string | null = null
        if (integration?.access_token) {
          try {
            accessToken = safeDecrypt(integration.access_token)
          } catch (e) {
            logger.error('Failed to decrypt token for cleanup')
          }
        }

        for (const sub of toDelete) {
          logger.debug(`  Deleting subscription: ${sub.id.substring(0, 8)}...`)

          // Try to delete from Microsoft Graph
          if (accessToken) {
            try {
              const client = new MicrosoftGraphClient({ accessToken })
              await client.request(`/subscriptions/${sub.id}`, {
                method: 'DELETE'
              })
              logger.debug(`    ✅ Deleted from Microsoft Graph`)
            } catch (e: any) {
              logger.debug(`    ⚠️ Failed to delete from Microsoft: ${e.message}`)
            }
          }

          // Mark as deleted in our database
          const { error } = await supabase
            .from('microsoft_graph_subscriptions')
            .update({ status: 'deleted' })
            .eq('id', sub.id)

          if (error) {
            errors.push(`Failed to update ${sub.id}: ${error.message}`)
          } else {
            deletedCount++
          }
        }
      }
    }

    logger.debug(`\n✅ Cleanup complete: Deleted ${deletedCount} duplicate subscriptions`)

    return jsonResponse({
      success: true,
      totalSubscriptions: subscriptions.length,
      deletedCount,
      remainingCount: subscriptions.length - deletedCount,
      errors
    })

  } catch (error) {
    logger.error('Error cleaning up subscriptions:', error)
    return jsonResponse({ error }, { status: 500 })
  }
}

export async function GET() {
  return jsonResponse({
    message: 'POST to this endpoint to clean up duplicate OneDrive subscriptions'
  })
}