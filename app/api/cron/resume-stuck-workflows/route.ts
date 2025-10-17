/**
 * Cron Job: Resume Stuck Workflows
 * Checks for workflows that are ready to resume but haven't been picked up
 * Run this every 1-5 minutes via Vercel Cron
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkAndResumeStuckWorkflows } from '@/lib/workflows/resumeWorkflow'
import { logger } from '@/lib/utils/logger'
import { jsonResponse } from '@/lib/utils/api-response'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * GET /api/cron/resume-stuck-workflows
 * Vercel cron jobs use GET by default
 */
export async function GET(request: NextRequest) {
  try {
    logger.info('Starting stuck workflow resume check')

    const result = await checkAndResumeStuckWorkflows()

    logger.info('Stuck workflow resume check complete', result)

    return jsonResponse({
      success: true,
      ...result,
      timestamp: new Date().toISOString()
    })

  } catch (error: any) {
    logger.error('Error in stuck workflow cron', { error: error.message })

    return NextResponse.json(
      {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

/**
 * POST /api/cron/resume-stuck-workflows
 * For manual triggers
 */
export async function POST(request: NextRequest) {
  return GET(request)
}
