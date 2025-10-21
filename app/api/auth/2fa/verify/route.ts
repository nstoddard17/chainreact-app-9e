import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/2fa/verify
 * Verifies the TOTP code and completes MFA enrollment
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
    const { factor_id, code } = body

    if (!factor_id || !code) {
      return errorResponse('Missing factor_id or code', 400)
    }

    // Verify the TOTP code
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: factor_id,
    })

    if (challengeError) {
      logger.error('MFA challenge error:', challengeError)
      return errorResponse('Failed to create challenge', 500)
    }

    // Verify the code
    const { data: verifyData, error: verifyError } = await supabase.auth.mfa.verify({
      factorId: factor_id,
      challengeId: challengeData.id,
      code: code,
    })

    if (verifyError) {
      logger.error('MFA verification error:', verifyError)
      return errorResponse('Invalid verification code', 400)
    }

    // Log MFA activation
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: '2fa_enabled',
      resource_type: 'user',
      resource_id: user.id,
      created_at: new Date().toISOString()
    })

    return jsonResponse({
      success: true,
      message: 'Two-factor authentication enabled successfully',
    })

  } catch (error) {
    logger.error('Error verifying 2FA:', error)
    return errorResponse('Internal server error', 500)
  }
}
