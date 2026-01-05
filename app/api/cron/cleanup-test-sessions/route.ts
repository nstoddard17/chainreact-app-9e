import { NextRequest } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { logger } from '@/lib/utils/logger'

const DEFAULT_RETENTION_DAYS = 7

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return errorResponse('Unauthorized', 401)
    }

    const retentionDays = Number(process.env.TEST_SESSION_RETENTION_DAYS || DEFAULT_RETENTION_DAYS)
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString()

    logger.debug('Starting cleanup of workflow_test_sessions...', { retentionDays, cutoff })

    const supabase = await createSupabaseServiceClient()
    const { data: deleted, error } = await supabase
      .from('workflow_test_sessions')
      .delete()
      .lt('expires_at', cutoff)
      .select('id')

    if (error) {
      logger.error('Failed to cleanup workflow_test_sessions:', error)
      return errorResponse('Failed to cleanup test sessions', 500, { details: error.message })
    }

    const deletedCount = deleted?.length || 0
    logger.debug('Cleanup completed', { deletedCount })

    return jsonResponse({
      success: true,
      deletedCount,
      retentionDays,
    })
  } catch (error: any) {
    logger.error('Test session cleanup error:', error)
    return errorResponse('Failed to cleanup test sessions', 500, { details: error.message })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
