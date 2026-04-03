import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { requireAdmin } from '@/lib/utils/admin-auth'
import { listWaitlist } from '@/lib/admin/waitlistActions'
import { logger } from '@/lib/utils/logger'

export async function GET() {
  try {
    const authResult = await requireAdmin({ capabilities: ['support_admin'] })
    if (!authResult.isAdmin) return authResult.response

    const { data, error } = await listWaitlist()

    if (error) {
      logger.error('Error fetching waitlist entries:', error)
      return errorResponse(error.message || 'Failed to fetch waitlist entries', 500)
    }

    return jsonResponse({
      success: true,
      data: data || [],
    })
  } catch (error) {
    logger.error('Error in list waitlist API:', error)
    return errorResponse('Internal server error', 500)
  }
}
