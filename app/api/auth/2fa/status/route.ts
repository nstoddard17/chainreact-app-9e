import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

/**
 * GET /api/auth/2fa/status
 * Gets the current 2FA status for the user
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    // Get all MFA factors for the user
    const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors()

    if (factorsError) {
      logger.error('Error fetching MFA factors:', factorsError)
      return errorResponse('Failed to fetch 2FA status', 500)
    }

    const totpFactors = factors?.totp || []
    const isEnabled = totpFactors.length > 0 && totpFactors.some(f => f.status === 'verified')

    return jsonResponse({
      success: true,
      enabled: isEnabled,
      factors: totpFactors.map(f => ({
        id: f.id,
        friendly_name: f.friendly_name,
        status: f.status,
        created_at: f.created_at,
      })),
    })

  } catch (error) {
    logger.error('Error checking 2FA status:', error)
    return errorResponse('Internal server error', 500)
  }
}
