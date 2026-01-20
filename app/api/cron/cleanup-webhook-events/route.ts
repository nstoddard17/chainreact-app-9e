import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

const getSupabase = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!
)

function getRetentionDays(request: NextRequest): number {
  const fromQuery = request.nextUrl.searchParams.get('retentionDays')
  if (fromQuery) {
    const parsed = Number.parseInt(fromQuery, 10)
    if (!Number.isNaN(parsed) && parsed > 0) return parsed
  }

  const fromEnv = process.env.WEBHOOK_EVENTS_RETENTION_DAYS
  if (fromEnv) {
    const parsed = Number.parseInt(fromEnv, 10)
    if (!Number.isNaN(parsed) && parsed > 0) return parsed
  }

  return 30
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return errorResponse('Unauthorized', 401)
    }

    const retentionDays = getRetentionDays(request)
    logger.debug(`Starting webhook_events cleanup (retentionDays=${retentionDays})...`)

    const supabase = getSupabase()
    const { data, error } = await supabase.rpc('cleanup_old_webhook_events', {
      retention_days: retentionDays
    })

    if (error) {
      logger.error('Webhook events cleanup error:', error)
      return errorResponse('Failed to cleanup webhook events', 500, { details: error.message })
    }

    const deletedCount = typeof data === 'number' ? data : 0
    logger.debug(`Webhook events cleanup completed. Removed ${deletedCount} rows.`)

    return jsonResponse({
      success: true,
      message: `Cleaned up ${deletedCount} webhook events`,
      deletedCount,
      retentionDays
    })
  } catch (error: any) {
    logger.error('Webhook events cleanup error:', error)
    return errorResponse('Failed to cleanup webhook events', 500, { details: error.message })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
