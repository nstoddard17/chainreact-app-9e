import { errorResponse, jsonResponse } from '@/lib/utils/api-response'
import { requireAdmin } from '@/lib/utils/admin-auth'
import { deleteBetaTester } from '@/lib/admin/betaTesterActions'
import { logger } from '@/lib/utils/logger'

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin({ capabilities: ['support_admin'] })
    if (!authResult.isAdmin) return authResult.response

    const url = new URL(request.url)
    const testerId = url.searchParams.get('id')

    if (!testerId) {
      return errorResponse('Tester ID is required', 400)
    }

    const { data: tester, error } = await deleteBetaTester(authResult.userId, testerId, request)

    if (error) {
      logger.error('Error deleting beta tester:', error)
      if (!tester) return errorResponse('Beta tester not found', 404)
      return errorResponse((error as any).message || 'Failed to delete beta tester', 500)
    }

    return jsonResponse({
      success: true,
      message: `Beta tester ${tester?.email} has been deleted`,
      deletedId: testerId,
    })
  } catch (error) {
    logger.error('Error in delete beta tester API:', error)
    return errorResponse('Internal server error', 500)
  }
}
