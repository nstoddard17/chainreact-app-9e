/**
 * Token Refresh Cron Job (HTTP handler)
 *
 * Available for manual/debug triggers. Scheduled execution goes through
 * the consolidated /api/cron/every-five-minutes endpoint.
 */

import type { NextRequest } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { refreshAllTokensCore } from '@/lib/cron/token-refresh-core'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(request: NextRequest) {
  try {
    const cronHeader = request.headers.get('x-vercel-cron')
    const authHeader = request.headers.get('authorization')
    const url = new URL(request.url)
    const querySecret = url.searchParams.get('secret') || url.searchParams.get('cron_secret')
    const expectedSecret = process.env.CRON_SECRET

    if (!expectedSecret) {
      return errorResponse('CRON_SECRET not configured', 500)
    }

    const providedSecret = authHeader?.replace('Bearer ', '') || querySecret
    const isVercelCron = cronHeader === '1'

    if (!isVercelCron && (!providedSecret || providedSecret !== expectedSecret)) {
      return errorResponse('Unauthorized', 401)
    }

    const searchParams = request.nextUrl.searchParams
    const result = await refreshAllTokensCore({
      provider: searchParams.get('provider') || undefined,
      limit: parseInt(searchParams.get('limit') || '100', 10),
      batchSize: parseInt(searchParams.get('batchSize') || '10', 10),
      offset: parseInt(searchParams.get('offset') || '0', 10),
      verbose: searchParams.get('verbose') === 'true',
    })

    return jsonResponse({
      ...result,
      timestamp: new Date().toISOString(),
    })
  } catch (error: any) {
    logger.error('Critical error in token refresh job:', error)
    return jsonResponse(
      { success: false, error: error.message, timestamp: new Date().toISOString() },
      { status: 500 }
    )
  }
}
