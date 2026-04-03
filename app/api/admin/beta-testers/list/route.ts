import { errorResponse, jsonResponse } from '@/lib/utils/api-response'
import { requireAdmin } from '@/lib/utils/admin-auth'
import { listBetaTesters } from '@/lib/admin/betaTesterActions'
import { logger } from '@/lib/utils/logger'

export async function GET() {
  try {
    const authResult = await requireAdmin({ capabilities: ['support_admin'] })
    if (!authResult.isAdmin) return authResult.response

    const { data, error } = await listBetaTesters()

    if (error) {
      logger.error('Error fetching beta testers:', error)
      return errorResponse(error.message || 'Failed to fetch beta testers', 500)
    }

    return jsonResponse({
      success: true,
      data: data || [],
    })
  } catch (error) {
    logger.error('Error in list beta testers API:', error)
    return errorResponse('Internal server error', 500)
  }
}
