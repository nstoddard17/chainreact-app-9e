import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { requireAdmin } from '@/lib/utils/admin-auth'
import { deleteWaitlistEntry } from '@/lib/admin/waitlistActions'
import { logger } from '@/lib/utils/logger'

export async function DELETE(request: Request) {
  try {
    const authResult = await requireAdmin({ capabilities: ['support_admin'] })
    if (!authResult.isAdmin) return authResult.response

    const url = new URL(request.url)
    const memberId = url.searchParams.get('id')

    if (!memberId) {
      return errorResponse('Member ID is required', 400)
    }

    const { data: member, error } = await deleteWaitlistEntry(authResult.userId, memberId, request)

    if (error) {
      logger.error('Error deleting waitlist member:', error)
      if (!member) return errorResponse('Waitlist member not found', 404)
      return errorResponse((error as any).message || 'Failed to delete waitlist member', 500)
    }

    return jsonResponse({
      success: true,
      message: `Waitlist member ${member?.email} has been deleted`,
      deletedId: memberId,
    })
  } catch (error) {
    logger.error('Error in delete waitlist member API:', error)
    return errorResponse('Internal server error', 500)
  }
}
