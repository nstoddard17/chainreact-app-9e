import { NextRequest, NextResponse } from 'next/server'
import { renewExpiringGoogleWatches, cleanupExpiredSubscriptions } from '@/lib/webhooks/google-watch-renewal'

export async function POST(request: NextRequest) {
  try {
    // Verify this is an authorized request (e.g., from a cron job service)
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('🔄 Starting Google watch renewal process...')

    // Renew expiring watches
    await renewExpiringGoogleWatches()

    // Clean up old expired subscriptions
    await cleanupExpiredSubscriptions()

    console.log('✅ Google watch renewal process completed')

    return NextResponse.json({
      success: true,
      message: 'Google watches renewed successfully',
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('Failed to renew Google watches:', error)
    return NextResponse.json(
      {
        error: 'Failed to renew watches',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  // Health check endpoint
  return NextResponse.json({
    status: 'healthy',
    service: 'google-watch-renewal',
    description: 'Renews expiring Google API watches for Gmail, Drive, Calendar, and Sheets',
    renewalSchedule: 'Should be called daily to renew watches expiring within 24 hours',
    timestamp: new Date().toISOString()
  })
}