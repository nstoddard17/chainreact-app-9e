import { errorResponse, jsonResponse } from '@/lib/utils/api-response'
import { requireAdmin } from '@/lib/utils/admin-auth'
import { updateBetaTester } from '@/lib/admin/betaTesterActions'
import { logger } from '@/lib/utils/logger'

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin({ capabilities: ['support_admin'] })
    if (!authResult.isAdmin) return authResult.response

    const body = await request.json()
    const { id, status, notes, max_workflows, max_executions_per_month, expires_at } = body

    if (!id) {
      return errorResponse('Tester ID is required', 400)
    }

    const { data, error } = await updateBetaTester(authResult.userId, id, {
      status,
      notes,
      max_workflows,
      max_executions_per_month,
      expires_at,
    }, request)

    if (error) {
      logger.error('Error updating beta tester:', error)
      return errorResponse((error as any).message || 'Failed to update beta tester', 500)
    }

    if (!data) {
      return errorResponse('Beta tester not found', 404)
    }

    return jsonResponse({
      success: true,
      message: 'Beta tester updated successfully',
      data,
    })
  } catch (error) {
    logger.error('Error in update beta tester API:', error)
    return errorResponse('Internal server error', 500)
  }
}
