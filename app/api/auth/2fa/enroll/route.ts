import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/utils/supabase/server'
import { jsonResponse, errorResponse } from '@/lib/utils/api-response'
import { logger } from '@/lib/utils/logger'

export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/2fa/enroll
 * Enrolls user in MFA and returns QR code and secret
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return errorResponse('Unauthorized', 401)
    }

    // Enroll in MFA using TOTP
    const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: user.email || 'ChainReact Account',
    })

    if (enrollError) {
      logger.error('MFA enrollment error:', enrollError)
      return errorResponse('Failed to enroll in 2FA', 500)
    }

    // Parse the QR code URI and add issuer with logo
    const secret = enrollData.totp.secret
    const email = user.email || 'user@chainreact.app'

    // Create custom TOTP URI with logo
    // Format: otpauth://totp/ChainReact:email?secret=XXX&issuer=ChainReact&image=URL
    const logoUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/logo.png`
    const customUri = `otpauth://totp/ChainReact:${encodeURIComponent(email)}?secret=${secret}&issuer=ChainReact&image=${encodeURIComponent(logoUrl)}`

    // Generate QR code from custom URI
    const QRCode = require('qrcode')
    const qrCodeDataUrl = await QRCode.toDataURL(customUri)

    // Return QR code URI and secret for manual entry
    return jsonResponse({
      success: true,
      qr_code: qrCodeDataUrl, // Data URI for QR code with logo
      secret: secret, // Secret for manual entry
      factor_id: enrollData.id, // Save this for verification
      uri: customUri, // Full TOTP URI
    })

  } catch (error) {
    logger.error('Error enrolling in 2FA:', error)
    return errorResponse('Internal server error', 500)
  }
}
