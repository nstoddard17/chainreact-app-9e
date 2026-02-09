import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { logger } from '@/lib/utils/logger'

// Service role client for admin operations (bypasses RLS)
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
 * Generate a one-time sign-in link for a user who confirmed email on another device.
 * This enables seamless cross-device email confirmation flow.
 *
 * Security considerations:
 * - Only works for users with confirmed emails
 * - Requires userId AND email to match (prevents enumeration)
 * - Link expires quickly (1 hour default)
 * - One-time use only
 */
export async function POST(request: NextRequest) {
  try {
    const { userId, email } = await request.json()

    if (!userId || !email) {
      return NextResponse.json(
        { error: 'userId and email are required' },
        { status: 400 }
      )
    }

    const serviceClient = getServiceClient()

    // First verify the user exists and email is confirmed
    const { data: userData, error: userError } = await serviceClient.auth.admin.getUserById(userId)

    if (userError || !userData.user) {
      logger.error('[generate-signin-token] User not found:', userError)
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Security check: email must match
    if (userData.user.email !== email) {
      logger.warn('[generate-signin-token] Email mismatch attempt:', { userId, providedEmail: email })
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      )
    }

    // Security check: email must be confirmed
    if (!userData.user.email_confirmed_at) {
      logger.warn('[generate-signin-token] Email not confirmed:', { userId })
      return NextResponse.json(
        { error: 'Email not confirmed' },
        { status: 400 }
      )
    }

    // Generate a magic link for this user
    // This creates a one-time use link that will sign them in
    const { data: linkData, error: linkError } = await serviceClient.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || 'https://chainreact.app'}/workflows`
      }
    })

    if (linkError) {
      logger.error('[generate-signin-token] Failed to generate link:', linkError)
      return NextResponse.json(
        { error: 'Failed to generate sign-in link' },
        { status: 500 }
      )
    }

    logger.debug('[generate-signin-token] Generated magic link for cross-device sign-in:', {
      userId,
      email: email.substring(0, 3) + '***'
    })

    // Return the hashed token and verification type
    // The client will use this to complete the sign-in
    return NextResponse.json({
      // The properties object contains the token_hash and other details
      token_hash: linkData.properties?.hashed_token,
      verification_type: linkData.properties?.verification_type || 'magiclink',
      // Also return the full action link in case client wants to redirect
      action_link: linkData.properties?.action_link
    })

  } catch (error) {
    logger.error('[generate-signin-token] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
