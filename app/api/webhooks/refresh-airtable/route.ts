import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refreshAirtableWebhook } from '@/lib/integrations/airtable/webhooks'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    // Check for API key or cron secret
    const authHeader = req.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get all Airtable webhooks that are expiring within 2 days
    const twoDaysFromNow = new Date()
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2)

    const { data: expiringWebhooks } = await supabase
      .from('airtable_webhooks')
      .select('user_id, base_id, webhook_id, expiration_time')
      .eq('status', 'active')
      .lt('expiration_time', twoDaysFromNow.toISOString())

    if (!expiringWebhooks || expiringWebhooks.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No webhooks need refreshing'
      })
    }

    const refreshResults = []

    for (const webhook of expiringWebhooks) {
      try {
        await refreshAirtableWebhook(webhook.user_id, webhook.base_id)
        refreshResults.push({
          baseId: webhook.base_id,
          status: 'refreshed'
        })
      } catch (error) {
        console.error(`Failed to refresh webhook for base ${webhook.base_id}:`, error)
        refreshResults.push({
          baseId: webhook.base_id,
          status: 'failed',
          error: error instanceof Error ? error.message : 'Unknown error'
        })
      }
    }

    return NextResponse.json({
      success: true,
      refreshed: refreshResults.filter(r => r.status === 'refreshed').length,
      failed: refreshResults.filter(r => r.status === 'failed').length,
      results: refreshResults
    })
  } catch (error) {
    console.error('Error refreshing Airtable webhooks:', error)
    return NextResponse.json(
      { error: 'Failed to refresh webhooks' },
      { status: 500 }
    )
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Airtable webhook refresh endpoint',
    description: 'POST to this endpoint to refresh expiring Airtable webhooks',
    note: 'Requires CRON_SECRET environment variable for authentication'
  })
}