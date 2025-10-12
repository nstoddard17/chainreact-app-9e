import { NextRequest, NextResponse } from 'next/server'
import { runWebhookTaskProcessor } from '@/lib/webhooks/task-queue'

import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    // Verify the request is from a legitimate cron job
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      logger.error('Unauthorized cron job request')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    logger.debug('[Cron] Starting webhook task processing')
    
    // Process webhook tasks
    await runWebhookTaskProcessor()
    
    logger.debug('[Cron] Completed webhook task processing')
    
    return NextResponse.json({ 
      success: true, 
      message: 'Webhook tasks processed successfully',
      timestamp: new Date().toISOString()
    })

  } catch (error) {
    logger.error('[Cron] Error processing webhook tasks:', error)
    
    return NextResponse.json({ 
      error: 'Failed to process webhook tasks',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  // Health check endpoint
  return NextResponse.json({ 
    status: 'healthy', 
    service: 'webhook-task-processor',
    timestamp: new Date().toISOString()
  })
} 