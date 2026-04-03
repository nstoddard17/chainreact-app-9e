import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { requireAdmin } from '@/lib/utils/admin-auth'
import { updateWaitlistEntry } from '@/lib/admin/waitlistActions'
import { logger } from '@/lib/utils/logger'

export async function PATCH(request: Request) {
  try {
    const authResult = await requireAdmin({ capabilities: ['support_admin'] })
    if (!authResult.isAdmin) return authResult.response

    const body = await request.json()
    const {
      id,
      name,
      email,
      status,
      selected_integrations,
      custom_integrations,
      wants_ai_assistant,
      wants_ai_actions,
      ai_actions_importance,
    } = body

    if (!id) {
      return errorResponse('Member ID is required', 400)
    }

    const { data, error } = await updateWaitlistEntry(authResult.userId, id, {
      name,
      email,
      status,
      selected_integrations,
      custom_integrations,
      wants_ai_assistant,
      wants_ai_actions,
      ai_actions_importance,
    }, request)

    if (error) {
      logger.error('Error updating waitlist member:', error)
      return errorResponse((error as any).message || 'Failed to update waitlist member', 500)
    }

    if (!data) {
      return errorResponse('Waitlist member not found', 404)
    }

    return jsonResponse({
      success: true,
      message: 'Waitlist member updated successfully',
      data,
    })
  } catch (error) {
    logger.error('Error in update waitlist member API:', error)
    return errorResponse('Internal server error', 500)
  }
}
