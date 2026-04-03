import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { requireAdmin } from '@/lib/utils/admin-auth'
import { updateUserRole } from '@/lib/admin/userActions'

export async function POST(request: Request) {
  const authResult = await requireAdmin({ capabilities: ['user_admin'], stepUp: true })
  if (!authResult.isAdmin) return authResult.response

  try {
    const { userId, newRole } = await request.json()

    if (!userId || !newRole) {
      return errorResponse('Missing required fields', 400)
    }

    const result = await updateUserRole(authResult.userId, userId, newRole, request)

    if (!result.success) {
      return errorResponse(result.error || 'Failed to update role', result.error === 'Invalid role' ? 400 : 500)
    }

    return jsonResponse({
      success: true,
      message: 'User role updated successfully',
    })
  } catch (error: any) {
    return errorResponse(error.message, 500)
  }
}
