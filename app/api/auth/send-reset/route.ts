import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/utils/supabase/server'
import { sendPasswordResetEmail } from '@/lib/services/resend'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email) {
      return NextResponse.json(
        { error: 'Missing email' },
        { status: 400 }
      )
    }

    const supabase = await createSupabaseServiceClient()

    // Check if user exists
    const { data: existingUser } = await supabase.auth.admin.getUserByEmail(email)

    if (!existingUser.user) {
      // Don't reveal if user exists for security, but still return success
      return NextResponse.json({
        success: true,
        message: 'If an account with that email exists, we sent a password reset link'
      })
    }

    // Get user profile for personalization
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('username, full_name, first_name')
      .eq('id', existingUser.user.id)
      .single()

    // Generate password reset link
    const { data, error } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`,
      },
    })

    if (error) {
      console.error('Error generating reset link:', error)
      return NextResponse.json(
        { error: 'Failed to generate reset link' },
        { status: 500 }
      )
    }

    // Send password reset email
    const result = await sendPasswordResetEmail(
      {
        to: email,
        subject: 'Reset your ChainReact password',
      },
      {
        username: profile?.username || profile?.first_name || profile?.full_name || undefined,
        resetUrl: data.properties?.action_link || '',
      }
    )

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: 'Password reset email sent successfully'
    })

  } catch (error) {
    console.error('Error sending password reset email:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}