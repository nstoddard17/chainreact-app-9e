import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/2fa/unenroll
 * Disables 2FA for the user
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    const body = await request.json()
    const { factor_id } = body

    if (!factor_id) {
      return errorResponse('Missing factor_id', 400)
    }

    // Unenroll from MFA
    const { error: unenrollError } = await supabase.auth.mfa.unenroll({
      factorId: factor_id,
    })

    if (unenrollError) {
      logger.error('MFA unenroll error:', unenrollError)
      return errorResponse('Failed to disable 2FA', 500)
    }

    // Log MFA deactivation
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: '2fa_disabled',
      resource_type: 'user',
      resource_id: user.id,
      created_at: new Date().toISOString()
    })

    return jsonResponse({
      success: true,
      message: 'Two-factor authentication disabled successfully',
    })

  } catch (error) {
    logger.error('Error unenrolling from 2FA:', error)
    return errorResponse('Internal server error', 500)
  }
}
