import { NextRequest } from 'next/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { requireAdmin } from '@/lib/utils/admin-auth'
import { updateUser } from '@/lib/admin/userActions'
import { type UserRole, ROLES } from '@/lib/utils/roles'
import { logger } from '@/lib/utils/logger'

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAdmin({ capabilities: ['user_admin'] })
    if (!authResult.isAdmin) return authResult.response

    const body = await request.json()
    const { userId, email, full_name, username, role, password } = body

    if (!userId) {
      return errorResponse('User ID is required', 400)
    }

    if (role && !ROLES[role as UserRole]) {
      return errorResponse('Invalid role specified', 400)
    }

    const { data: updatedProfile, error } = await updateUser(
      authResult.userId,
      userId,
      { email, password, full_name, username, role },
      request
    )

    if (error) {
      logger.error('Error updating user:', error)
      return errorResponse((error as any).message || 'Failed to update user', 400)
    }

    return jsonResponse({
      success: true,
      user: updatedProfile,
      message: 'User updated successfully',
    })
  } catch (error) {
    logger.error('Error in user update API:', error)
    return errorResponse('Internal server error', 500)
  }
}
