import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { requireAdmin } from '@/lib/utils/admin-auth'
import { getOnlineUsers } from '@/lib/admin/userActions'
import { logger } from '@/lib/utils/logger'

export async function GET() {
  const authResult = await requireAdmin({ capabilities: ['support_admin'] })
  if (!authResult.isAdmin) return authResult.response

  try {
    const { data: onlineUsers, error } = await getOnlineUsers()

    if (error) {
      logger.error('Error fetching online users:', error)
      return errorResponse('Failed to fetch online users', 500)
    }

    return jsonResponse({
      success: true,
      users: onlineUsers || [],
    })
  } catch (error) {
    logger.error('Error fetching online users:', error)
    return errorResponse('Failed to fetch online users', 500)
  }
}
