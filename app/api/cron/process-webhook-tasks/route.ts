import { NextRequest, NextResponse } from 'next/server'
import { jsonResponse, errorResponse, successResponse } from '@/lib/utils/api-response'
import { runWebhookTaskProcessor } from '@/lib/webhooks/task-queue'

import { logger } from '@/lib/utils/logger'

async function processWebhookTasks(authHeader: string | null) {
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    logger.error('Unauthorized cron job request')
    return errorResponse('Unauthorized', 401)
  }

  logger.debug('[Cron] Starting webhook task processing')

  // Process webhook tasks
  await runWebhookTaskProcessor()

  logger.debug('[Cron] Completed webhook task processing')

  return jsonResponse({
    success: true,
    message: 'Webhook tasks processed successfully',
    timestamp: new Date().toISOString()
  })
}

// Vercel crons use GET requests
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    return await processWebhookTasks(authHeader)
  } catch (error) {
    logger.error('[Cron] Error processing webhook tasks:', error)
    return errorResponse('Failed to process webhook tasks', 500, {
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// Keep POST for manual/external triggers
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    return await processWebhookTasks(authHeader)
  } catch (error) {
    logger.error('[Cron] Error processing webhook tasks:', error)
    return errorResponse('Failed to process webhook tasks', 500, {
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
} 