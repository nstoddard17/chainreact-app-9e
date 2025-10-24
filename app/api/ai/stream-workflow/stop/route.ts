import { NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

/**
 * Stop/Pause endpoint for workflow building
 *
 * When user clicks "pause" during real-time building,
 * this endpoint is called to signal the server to stop.
 *
 * The SSE stream checks request.signal.aborted to detect this.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()

    // Auth check
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    const body = await request.json()
    const { buildId, reason = 'user_requested' } = body

    logger.info('Workflow build stopped:', { userId: user.id, buildId, reason })

    // In SSE implementation, the client just closes the EventSource
    // This endpoint is for logging/analytics purposes

    return jsonResponse({
      success: true,
      message: 'Build stopped',
      buildId,
      reason
    })

  } catch (error) {
    logger.error('Stop build error:', error)
    return errorResponse('Failed to stop build', 500)
  }
}
