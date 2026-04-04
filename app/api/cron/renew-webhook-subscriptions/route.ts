/**
 * Webhook Subscription Renewal Cron Job (HTTP handler)
 *
 * Scheduled execution goes through the consolidated /api/cron/every-five-minutes endpoint.
 * This route remains available for manual/debug triggers.
 */

import { NextRequest, NextResponse } from 'next/server'
import { renewWebhookSubscriptionsCore } from '@/lib/cron/webhook-renewal-core'

export const maxDuration = 60

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const stats = await renewWebhookSubscriptionsCore()
    return NextResponse.json({ success: true, ...stats })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
