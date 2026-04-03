import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { requireAdmin } from '@/lib/utils/admin-auth'
import { getUserStats } from '@/lib/admin/userActions'
import { logger } from '@/lib/utils/logger'

export async function GET() {
  const authResult = await requireAdmin({ capabilities: ['support_admin'] })
  if (!authResult.isAdmin) return authResult.response

  try {
    const { data: roleData, error: roleError } = await getUserStats()

    if (roleError) {
      logger.error('Error fetching role data:', roleError)
      return errorResponse('Failed to fetch role data', 500)
    }

    const roleCounts: Record<string, number> = {
      free: 0,
      pro: 0,
      'beta-pro': 0,
      business: 0,
      enterprise: 0,
      admin: 0,
    }

    roleData?.forEach((user) => {
      const role = user.role || 'free'
      if (role in roleCounts) {
        roleCounts[role]++
      }
    })

    const userStats = {
      totalUsers: roleData?.length || 0,
      freeUsers: roleCounts.free,
      proUsers: roleCounts.pro,
      betaUsers: roleCounts['beta-pro'],
      businessUsers: roleCounts.business,
      enterpriseUsers: roleCounts.enterprise,
      adminUsers: roleCounts.admin,
    }

    return jsonResponse({ success: true, data: userStats })
  } catch (error) {
    logger.error('Error fetching user stats:', error)
    return errorResponse('Failed to fetch user statistics', 500)
  }
}
