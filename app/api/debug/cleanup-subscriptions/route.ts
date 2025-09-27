import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { MicrosoftGraphClient } from '@/lib/microsoft-graph/client'
import { safeDecrypt } from '@/lib/security/encryption'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  try {
    console.log('\n🧹 CLEANING UP DUPLICATE ONEDRIVE SUBSCRIPTIONS')

    // Get all active subscriptions
    const { data: subscriptions } = await supabase
      .from('microsoft_graph_subscriptions')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false })

    if (!subscriptions || subscriptions.length === 0) {
      return NextResponse.json({ message: 'No subscriptions found' })
    }

    console.log(`Found ${subscriptions.length} active subscriptions`)

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
        console.log(`User ${userId.substring(0, 8)}... has ${subs.length} subscriptions`)

        // Keep the first one (newest), delete the rest
        const toKeep = subs[0]
        const toDelete = subs.slice(1)

        console.log(`  Keeping subscription: ${toKeep.id.substring(0, 8)}... (created: ${toKeep.created_at})`)

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
            console.error('Failed to decrypt token for cleanup')
          }
        }

        for (const sub of toDelete) {
          console.log(`  Deleting subscription: ${sub.id.substring(0, 8)}...`)

          // Try to delete from Microsoft Graph
          if (accessToken) {
            try {
              const client = new MicrosoftGraphClient({ accessToken })
              await client.request(`/subscriptions/${sub.id}`, {
                method: 'DELETE'
              })
              console.log(`    ✅ Deleted from Microsoft Graph`)
            } catch (e: any) {
              console.log(`    ⚠️ Failed to delete from Microsoft: ${e.message}`)
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

    console.log(`\n✅ Cleanup complete: Deleted ${deletedCount} duplicate subscriptions`)

    return NextResponse.json({
      success: true,
      totalSubscriptions: subscriptions.length,
      deletedCount,
      remainingCount: subscriptions.length - deletedCount,
      errors
    })

  } catch (error) {
    console.error('Error cleaning up subscriptions:', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'POST to this endpoint to clean up duplicate OneDrive subscriptions'
  })
}