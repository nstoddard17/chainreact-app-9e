import { errorResponse, jsonResponse } from '@/lib/utils/api-response'
import { requireAdmin } from '@/lib/utils/admin-auth'
import { addBetaTester } from '@/lib/admin/betaTesterActions'
import { logger } from '@/lib/utils/logger'

export async function POST(request: Request) {
  try {
    const authResult = await requireAdmin({ capabilities: ['support_admin'] })
    if (!authResult.isAdmin) return authResult.response

    const body = await request.json()
    const { email, notes, expires_at, max_workflows, max_executions_per_month, max_integrations, added_by } = body

    if (!email) {
      return errorResponse('Email is required', 400)
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return errorResponse('Invalid email format', 400)
    }

    const { data, error } = await addBetaTester(authResult.userId, {
      email,
      notes,
      expires_at,
      max_workflows,
      max_executions_per_month,
      max_integrations,
      added_by: added_by || authResult.userId,
    }, request)

    if (error) {
      logger.error('Error adding beta tester:', error)
      if ((error as any).code === '23505') {
        return errorResponse('This email is already registered as a beta tester', 409)
      }
      return errorResponse((error as any).message || 'Failed to add beta tester', 500)
    }

    return jsonResponse({
      success: true,
      message: `Beta tester ${email} added successfully`,
      data,
    })
  } catch (error) {
    logger.error('Error in add beta tester API:', error)
    return errorResponse('Internal server error', 500)
  }
}
