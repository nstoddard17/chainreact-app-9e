import { NextRequest } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { requireAdmin } from '@/lib/utils/admin-auth'
import { deleteUser } from '@/lib/admin/userActions'
import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin({ capabilities: ['user_admin'], stepUp: true })
    if (!authResult.isAdmin) return authResult.response

    const body = await request.json()
    const { userId, deleteData = false } = body

    if (!userId) {
      return errorResponse('User ID is required', 400)
    }

    const result = await deleteUser(authResult.userId, userId, deleteData, request)

    if (!result.success) {
      const status = result.message === 'User not found' ? 404 : 400
      return errorResponse(result.message || 'Failed to delete user', status)
    }

    return jsonResponse({
      success: true,
      message: result.message,
      action: result.action,
      tablesProcessed: result.tablesProcessed,
      errors: result.errors,
    })
  } catch (error) {
    logger.error('Error in user deletion API:', error)
    return errorResponse('Internal server error', 500)
  }
}
