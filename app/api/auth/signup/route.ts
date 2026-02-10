import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendWelcomeEmail } from '@/lib/services/resend'
import { logger } from '@/lib/utils/logger'

// Service role client for admin operations
const getServiceClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
)

/**
 * Custom signup endpoint that uses our branded email template via Resend
 * instead of Supabase's default confirmation email.
 */
export async function POST(request: NextRequest) {
  logger.debug('[signup] ===== CUSTOM SIGNUP API CALLED =====')

  try {
    const { email, password, metadata } = await request.json()
    logger.debug('[signup] Processing signup for email:', email?.substring(0, 3) + '***')

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    // Validate password strength
    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      )
    }

    const serviceClient = getServiceClient()
    const baseUrl = request.headers.get('origin') || process.env.NEXT_PUBLIC_SITE_URL || 'https://chainreact.app'

    // Check if user already exists
    const { data: existingUser } = await serviceClient.auth.admin.listUsers()
    const userExists = existingUser?.users?.some(u => u.email === email)

    if (userExists) {
      // Check if email is already confirmed
      const existing = existingUser?.users?.find(u => u.email === email)
      if (existing?.email_confirmed_at) {
        return NextResponse.json(
          { error: 'An account with this email already exists. Please sign in.' },
          { status: 400 }
        )
      }
      // User exists but not confirmed - we'll resend confirmation below
    }

    let userId: string

    if (!userExists) {
      // Create the user
      const { data: createData, error: createError } = await serviceClient.auth.admin.createUser({
        email,
        password,
        user_metadata: metadata || {},
        email_confirm: false, // Don't auto-confirm - we'll send our own email
      })

      if (createError) {
        logger.error('[signup] Error creating user:', createError)
        return NextResponse.json(
          { error: createError.message || 'Failed to create account' },
          { status: 400 }
        )
      }

      userId = createData.user.id

      // Create the user profile
      const profileData = {
        id: userId,
        username: metadata?.username,
        first_name: metadata?.first_name,
        last_name: metadata?.last_name,
        full_name: metadata?.full_name,
        email: email,
        provider: 'email',
        role: 'free',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }

      const { error: profileError } = await serviceClient
        .from('user_profiles')
        .insert(profileData)

      if (profileError) {
        logger.error('[signup] Error creating profile:', profileError)
        // Don't fail the signup - profile can be created later
      }
    } else {
      // User exists but not confirmed - get their ID
      const existing = existingUser?.users?.find(u => u.email === email)
      userId = existing!.id
    }

    // Generate custom confirmation token (not using Supabase's link to avoid auto-sign-in)
    const timestamp = Date.now()
    const tokenData = `${userId}:${timestamp}`
    const confirmationToken = Buffer.from(tokenData).toString('base64')

    // Build confirmation URL that goes directly to our email-confirmed page
    const confirmationUrl = `${baseUrl}/auth/email-confirmed?token=${encodeURIComponent(confirmationToken)}&userId=${userId}`

    logger.debug('[signup] Generated custom confirmation URL (not using Supabase link)')

    // Send our branded confirmation email via Resend
    const username = metadata?.full_name || metadata?.first_name || metadata?.username || email.split('@')[0]

    logger.debug('[signup] Sending branded email via Resend to:', email?.substring(0, 3) + '***')
    logger.debug('[signup] Using confirmation URL:', confirmationUrl?.substring(0, 50) + '...')

    const emailResult = await sendWelcomeEmail(
      {
        to: email,
        subject: 'Confirm your ChainReact account',
      },
      {
        username,
        confirmationUrl,
      }
    )

    if (!emailResult.success) {
      logger.error('[signup] Error sending confirmation email:', emailResult.error)
      // Don't fail the signup - user can resend from waiting page
    } else {
      logger.debug('[signup] ===== BRANDED EMAIL SENT SUCCESSFULLY via Resend =====')
    }

    logger.debug('[signup] User created and confirmation email sent:', {
      userId,
      email: email.substring(0, 3) + '***'
    })

    return NextResponse.json({
      success: true,
      userId,
      message: 'Account created. Please check your email to confirm.'
    })

  } catch (error: any) {
    logger.error('[signup] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'An error occurred during signup' },
      { status: 500 }
    )
  }
}
